'use client';

import { useState } from 'react';
import { Check, GitBranch, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Lead, LeadStatus } from '@/lib/db/types';
import {
  LEAD_PIPELINE_STEPS,
  LEAD_STATUS_META,
  LEAD_STEP_CONFIG,
  allowedNextLeadStatuses,
} from '@/lib/domain/lead';
import { leadRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { todayLocal } from '@/lib/utils/format';

/**
 * Pipeline trail + the transitions valid from the current status (Section 4.2).
 * Every move is confirmed and logged as a `status_change` activity, so a lost
 * lead keeps its whole history and a revive needs no separate flag (4.6).
 */
export function LeadStatusCard({ lead }: { lead: Lead }) {
  const { userId } = useMockSession();
  const [target, setTarget] = useState<LeadStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isLost = lead.status === 'lost';
  const currentIndex = LEAD_PIPELINE_STEPS.indexOf(lead.status);
  const nextStatuses = allowedNextLeadStatuses(lead.status);
  const config = target ? LEAD_STEP_CONFIG[target] : null;

  function open(status: LeadStatus) {
    setTarget(status);
    setNotes('');
    setFollowUp('');
    setError('');
  }

  async function confirm() {
    if (!target || !config) return;
    if (config.notesRequired && !notes.trim()) {
      setError('A note is required for this step');
      return;
    }
    setBusy(true);
    try {
      await leadRepository.setStatus(
        lead.id,
        target,
        { notes, next_follow_up_date: config.asksFollowUp ? followUp : null },
        userId,
      );
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Lead Status"
          action={
            <Badge tone={LEAD_STATUS_META[lead.status].tone}>
              {LEAD_STATUS_META[lead.status].label}
            </Badge>
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
              const done = i < currentIndex;
              const current = i === currentIndex;
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

        {nextStatuses.length === 0 ? (
          <p className="text-xs text-ink-muted">
            Booked — the Booking &amp; Customer module takes over from here.
          </p>
        ) : (
          <div className="space-y-2">
            {nextStatuses.map((status) => (
              <Button
                key={status}
                variant={status === 'lost' ? 'danger' : 'primary'}
                size="sm"
                className="w-full"
                onClick={() => open(status)}
              >
                {isLost ? <RotateCcw className="size-4" /> : <GitBranch className="size-4" />}
                {isLost ? 'Revive as' : 'Move to'} {LEAD_STATUS_META[status].label}
              </Button>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={target !== null && config !== null}
        title={config?.title ?? ''}
        subtitle={`${lead.code} · ${lead.name}`}
        tone={config?.tone ?? 'default'}
        icon={isLost ? RotateCcw : GitBranch}
        confirmLabel={config?.confirmLabel ?? 'Confirm'}
        message={config?.question}
        busy={busy}
        onCancel={() => setTarget(null)}
        onConfirm={confirm}
      >
        <Field
          label={config?.notesRequired ? 'Note (required)' : 'Note'}
          error={error || undefined}
        >
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={config?.notesPlaceholder}
            invalid={Boolean(error)}
          />
        </Field>
        {config?.asksFollowUp && (
          <Field
            label="Next follow-up"
            className="mt-3"
            hint="Puts this lead on the team's daily task list."
          >
            <TextInput
              type="date"
              min={todayLocal()}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </Field>
        )}
      </ConfirmDialog>
    </>
  );
}
