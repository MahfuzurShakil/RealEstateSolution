'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, FileSignature, GitBranch, RotateCcw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Lead, LeadStatus } from '@/lib/db/types';
import { LEAD_PIPELINE_STEPS, LEAD_STATUS_META, allowedNextLeadStatuses } from '@/lib/domain/lead';
import { isUnitSellable } from '@/lib/domain/project';
import { LOST_REASONS, leadStage, type LeadStage, type LeadStageField } from '@/lib/domain/lead-stages';
import { leadRepository, projectRepository, unitRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/**
 * Pipeline trail and the one move that matters next (client, 2026-10-22).
 *
 * Like the project status: the main button completes the stage the lead is in
 * ("Mark Site Visit Done") and its popup records what happened there, then the
 * lead moves on. Negotiation is completed by booking a unit; any open lead can
 * be booked straight away or marked lost with a reason.
 */
export function LeadStatusCard({ lead }: { lead: Lead }) {
  const [dialog, setDialog] = useState<'stage' | 'lost' | 'revive' | null>(null);

  const isLost = lead.status === 'lost';
  const isBooked = lead.status === 'booked';
  const currentIndex = LEAD_PIPELINE_STEPS.indexOf(lead.status);
  const stage = leadStage(lead.status);

  return (
    <>
      <Card>
        <CardHeader
          title="Lead Status"
          action={
            <Badge tone={LEAD_STATUS_META[lead.status].tone}>{LEAD_STATUS_META[lead.status].label}</Badge>
          }
        />

        {isLost ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">Lead marked lost</p>
            {lead.lost_reason && (
              <p className="mt-1 whitespace-pre-wrap text-xs text-red-600">{lead.lost_reason}</p>
            )}
            <p className="mt-2 text-xs text-red-600/80">
              Reviving keeps every activity already logged — pick the stage it should come back to.
            </p>
          </div>
        ) : (
          <ol className="mb-4 space-y-2">
            {LEAD_PIPELINE_STEPS.map((step, i) => {
              const done = i < currentIndex || (isBooked && step === 'booked');
              const current = i === currentIndex && !isBooked;
              return (
                <li key={step} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                      done && 'bg-admin-500 text-white',
                      current && 'bg-admin-100 text-admin-700 ring-2 ring-admin-300',
                      !done && !current && 'bg-slate-100 text-slate-400',
                    )}
                  >
                    {done ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      'text-sm',
                      current ? 'font-medium text-ink' : done ? 'text-ink-muted' : 'text-slate-400',
                    )}
                  >
                    {LEAD_STATUS_META[step].label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {isBooked ? (
          <p className="text-xs text-ink-muted">
            Booked — the booking and the customer are listed below. Cancelling the booking puts
            this lead back in Negotiation.
          </p>
        ) : isLost ? (
          <Button size="sm" variant="outline" className="w-full" onClick={() => setDialog('revive')}>
            <RotateCcw className="size-4" /> Revive lead
          </Button>
        ) : (
          <div className="space-y-2">
            {stage ? (
              <>
                <Button size="sm" className="w-full" onClick={() => setDialog('stage')}>
                  <GitBranch className="size-4" /> {stage.button}
                </Button>
                <Link href={`/admin/bookings/new?lead=${lead.id}`} className="block">
                  <Button size="sm" variant="outline" className="w-full">
                    <FileSignature className="size-4" /> Book a unit now
                  </Button>
                </Link>
              </>
            ) : (
              <Link href={`/admin/bookings/new?lead=${lead.id}`} className="block">
                <Button size="sm" className="w-full">
                  <FileSignature className="size-4" /> Book a unit
                </Button>
              </Link>
            )}
            <Button size="sm" variant="dangerGhost" className="w-full" onClick={() => setDialog('lost')}>
              <XCircle className="size-4" /> Mark lost
            </Button>
          </div>
        )}
      </Card>

      {dialog === 'stage' && stage && <StageDialog lead={lead} stage={stage} onClose={() => setDialog(null)} />}
      {dialog === 'lost' && <LostDialog lead={lead} onClose={() => setDialog(null)} />}
      {dialog === 'revive' && <ReviveDialog lead={lead} onClose={() => setDialog(null)} />}
    </>
  );
}

/** Completes the current stage: its date, its own questions, notes and the next follow-up. */
function StageDialog({ lead, stage, onClose }: { lead: Lead; stage: LeadStage; onClose: () => void }) {
  const { userId } = useMockSession();
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({
    project: lead.interested_project_id ?? '',
    unit: lead.interested_unit_id ?? '',
    budget: lead.budget_range ?? '',
  }));
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const units = useLiveQuery(
    () => (answers.project ? unitRepository.listForProject(answers.project) : Promise.resolve([])),
    [answers.project],
  );
  const set = (key: string, value: string) =>
    setAnswers((a) => ({ ...a, [key]: value, ...(key === 'project' ? { unit: '' } : {}) }));

  async function save() {
    const problems: string[] = [];
    if (!date) problems.push(`${stage.dateLabel} is required`);
    else if (date > today) problems.push(`${stage.dateLabel} cannot be in the future`);
    for (const f of stage.fields) {
      const v = answers[f.key]?.trim();
      if (f.required && !v) problems.push(`${f.label} is required`);
      else if (v && f.type === 'date' && !f.future && v > today) problems.push(`${f.label} cannot be in the future`);
      else if (v && f.type === 'date' && f.future && v < today) problems.push(`${f.label} cannot be in the past`);
    }
    if (stage.followUpRequired && !followUp) problems.push('Next follow-up is required');
    if (followUp && followUp < today) problems.push('Next follow-up cannot be in the past');
    setErrors(problems);
    if (problems.length) return;

    // stored as the log will show it: label → readable value
    const details: Record<string, string> = {};
    const updates: Record<string, string | null> = {};
    let next = followUp || null;
    for (const f of stage.fields) {
      const v = answers[f.key]?.trim();
      if (!v) continue;
      details[f.label] =
        f.type === 'project'
          ? (projects?.find((p) => p.id === v)?.name ?? v)
          : f.type === 'unit'
            ? (units?.find((u) => u.id === v)?.code ?? v)
            : f.type === 'money'
              ? formatBdt(Number(v))
              : v;
      if (f.updates) updates[f.updates] = v;
      if (f.followUp) next = v;
    }
    setBusy(true);
    try {
      await leadRepository.completeStage(
        lead.id,
        {
          to: stage.to,
          activity_type: typeof stage.activity === 'function' ? stage.activity(answers) : stage.activity,
          event_date: date,
          title: stage.title,
          details,
          notes,
          next_follow_up_date: next,
          updates,
        },
        userId,
      );
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function input(f: LeadStageField) {
    const value = answers[f.key] ?? '';
    switch (f.type) {
      case 'select':
        return (
          <SelectInput value={value} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">Choose…</option>
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </SelectInput>
        );
      case 'project':
        return (
          <SelectInput value={value} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">Choose a project…</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
        );
      case 'unit':
        return (
          <SelectInput value={value} disabled={!answers.project} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">{answers.project ? 'Choose a unit…' : 'Pick the project first'}</option>
            {(units ?? [])
              // only what can still be sold — plus the one already noted on the lead
              .filter((u) => isUnitSellable(u.status) || u.id === lead.interested_unit_id)
              .map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} · {u.unit_type} · {formatBdt(u.base_price)}
              </option>
            ))}
          </SelectInput>
        );
      case 'money':
        return <MoneyInput value={value} onChange={(e) => set(f.key, e.target.value)} />;
      case 'date':
        return (
          <TextInput
            type="date"
            value={value}
            min={f.future ? today : undefined}
            max={f.future ? undefined : today}
            onChange={(e) => set(f.key, e.target.value)}
          />
        );
      default:
        return <TextInput value={value} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />;
    }
  }

  return (
    <ConfirmDialog
      open
      title={stage.title}
      subtitle={`${lead.code} · ${lead.name}`}
      icon={GitBranch}
      confirmLabel={stage.button}
      message={stage.meaning}
      size="lg"
      busy={busy}
      onCancel={onClose}
      onConfirm={save}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={stage.dateLabel} required>
          <TextInput type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {stage.fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required}>
            {input(f)}
          </Field>
        ))}
        {stage.asksFollowUp && (
          <Field
            label="Next follow-up"
            required={stage.followUpRequired}
            hint="Puts this lead on the team's task list for that day."
          >
            <TextInput type="date" min={today} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </Field>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <TextArea value={notes} placeholder={stage.notesPlaceholder} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {errors.length > 0 && <p className="mt-2 whitespace-pre-line text-xs text-red-600">{errors.join('\n')}</p>}
    </ConfirmDialog>
  );
}

/** The lead drops out — a reason from the list, so it can be reported on later. */
function LostDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { userId } = useMockSession();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!reason) return setError('Pick a reason');
    if (reason === 'Other' && !notes.trim()) return setError('Say what the reason was');
    setBusy(true);
    try {
      await leadRepository.setStatus(
        lead.id,
        'lost',
        { notes: notes.trim() ? `${reason} — ${notes.trim()}` : reason },
        userId,
      );
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      title="Mark as lost"
      subtitle={`${lead.code} · ${lead.name}`}
      tone="danger"
      icon={XCircle}
      confirmLabel="Mark lost"
      message="The lead leaves the pipeline. Its history is kept, and it can be revived later."
      busy={busy}
      onCancel={onClose}
      onConfirm={save}
    >
      <Field label="Reason" required error={error || undefined}>
        <SelectInput value={reason} onChange={(e) => setReason(e.target.value)} invalid={Boolean(error)}>
          <option value="">Choose…</option>
          {LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Notes" className="mt-3">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth knowing next time" />
      </Field>
    </ConfirmDialog>
  );
}

/** A lost lead comes back at the stage that makes sense, history intact (Section 4.6). */
function ReviveDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { userId } = useMockSession();
  const options = allowedNextLeadStatuses(lead.status);
  const [target, setTarget] = useState<LeadStatus>(options[0] ?? 'contacted');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!notes.trim()) return setError('Say why the lead is back');
    setBusy(true);
    try {
      await leadRepository.setStatus(lead.id, target, { notes, next_follow_up_date: followUp || null }, userId);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      title="Revive lead"
      subtitle={`${lead.code} · ${lead.name}`}
      icon={RotateCcw}
      confirmLabel="Revive"
      message="Every activity already logged is kept."
      busy={busy}
      onCancel={onClose}
      onConfirm={save}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Back to stage" required>
          <SelectInput value={target} onChange={(e) => setTarget(e.target.value as LeadStatus)}>
            {options.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_META[s].label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Next follow-up">
          <TextInput type="date" min={todayLocal()} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </Field>
        <Field label="Why it is back" required error={error || undefined} className="sm:col-span-2">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Called back, budget increased" />
        </Field>
      </div>
    </ConfirmDialog>
  );
}
