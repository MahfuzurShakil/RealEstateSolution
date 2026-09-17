'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  HardHat,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox, Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { useMockSession } from '@/lib/auth/mock-session';
import type { DevelopmentActivityStatus, Land } from '@/lib/db/types';
import { DEVELOPMENT_ACTIVITY_STATUSES } from '@/lib/db/types';
import {
  landDevelopmentRepository,
  landPipelineRepository,
  lookupRepository,
  supplierRepository,
  type DevelopmentActivityWithProgress,
} from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';
import { developmentBlockReason } from '@/lib/domain/land';
import { LockedNotice, TimelineItem, TimelineList } from '@/components/admin/lands/TimelineItem';

const STATUS_META: Record<DevelopmentActivityStatus, { label: string; tone: BadgeTone }> = {
  planned: { label: 'Planned', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
  on_hold: { label: 'On hold', tone: 'amber' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

/**
 * Land development for one plot (BRD DEV-001 to DEV-004).
 *
 * Filling, boundary wall, internal roads, drainage — the work that happens to
 * raw land before anything is designed on it. Until now a plot needing nine
 * feet of fill looked exactly like one ready to build on, which is how a
 * project schedule gets drawn against ground that is not there yet.
 */
export function DevelopmentPanel({ land }: { land: Land }) {
  const { userId } = useMockSession();
  const [editing, setEditing] = useState<DevelopmentActivityWithProgress | 'new' | null>(null);
  const [reporting, setReporting] = useState<DevelopmentActivityWithProgress | null>(null);
  const [deleting, setDeleting] = useState<DevelopmentActivityWithProgress | null>(null);

  const activities = useLiveQuery(() => landDevelopmentRepository.listForLand(land.id), [land.id]);
  const readiness = useLiveQuery(
    () => landDevelopmentRepository.readinessForLand(land.id),
    [land.id],
  );

  if (!activities || !readiness) return <p className="text-sm text-ink-muted">Loading…</p>;

  // L7 — work on land the company does not hold yet is money spent on somebody else's plot
  const locked = developmentBlockReason(land.status);

  const ready = land.no_development_required || (readiness.total > 0 && readiness.outstanding === 0);

  return (
    <>
      {locked && (
        <LockedNotice>
          <strong>Land development is locked.</strong> {locked}
        </LockedNotice>
      )}

      {/* the answer gate G3 reads, written out */}
      <div
        className={
          ready
            ? 'mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3'
            : 'mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-slate-50 px-4 py-3'
        }
      >
        <span
          className={
            ready
              ? 'grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700'
              : 'grid size-9 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600'
          }
        >
          {ready ? <CheckCircle2 className="size-5" /> : <HardHat className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={ready ? 'text-sm font-medium text-emerald-900' : 'text-sm font-medium text-ink'}>
            {land.no_development_required
              ? 'This plot needs no development work'
              : readiness.total === 0
                ? 'No development recorded for this plot'
                : readiness.outstanding === 0
                  ? 'Development complete — this plot can carry a project'
                  : `${readiness.outstanding} of ${readiness.total} activities still unfinished`}
          </p>
          <p className={ready ? 'text-xs text-emerald-800' : 'text-xs text-ink-muted'}>
            {readiness.total > 0
              ? `${formatBdt(readiness.incurredTotal)} spent of ${formatBdt(readiness.budgetTotal)} budgeted${readiness.onHold > 0 ? ` · ${readiness.onHold} on hold` : ''}`
              : 'Add what this plot needs, or mark it as needing none.'}
          </p>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(locked)}
            title={locked ?? undefined}
            onClick={() => setEditing('new')}
          >
            <Plus className="size-4" /> Add activity
          </Button>
        </div>
      </div>

      {/*
        The escape hatch for a ready plot. Per land rather than a setting,
        because a plot in Uttara needs no filling and a paddy field in
        Keraniganj needs nine feet of it.
      */}
      <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/40">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-admin-600"
          checked={Boolean(land.no_development_required)}
          onChange={async (e) => {
            // a ready plot becomes Ready for Project; the pipeline works that out
            await landPipelineRepository.setNoDevelopmentRequired(
              land.id,
              e.target.checked,
              userId,
            );
          }}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">
            This plot needs no development work
          </span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            A ready plot with services already at the boundary. Gate G3 lets it straight through to
            a project.
          </span>
        </span>
      </label>

      {activities.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No development activities yet"
          description="Record what this plot needs before anything is built on it — filling, boundary wall, internal roads, drainage, utilities — with a budget, a contractor and progress against each."
          action={
            locked ? undefined : (
              <Button onClick={() => setEditing('new')}>
                <Plus className="size-4" /> Add activity
              </Button>
            )
          }
        />
      ) : (
        <TimelineList>
          {activities.map((a) => (
            <TimelineItem
              key={a.id}
              marker={a.status === 'completed' ? <CheckCircle2 className="size-3.5" /> : <HardHat className="size-3.5" />}
              markerClassName={a.status === 'completed' ? 'bg-emerald-500 text-white' : undefined}
              muted={a.status === 'cancelled'}
              date={formatDate(a.updates[0]?.progress_date ?? a.start_date ?? a.created_at)}
              title={
                <>
                  {a.activity_type}
                  <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>
                  <span className="text-xs font-normal text-ink-muted">{a.pct_complete}%</span>
                </>
              }
              meta={
                (a.contractor ? a.contractor.name : 'No contractor awarded') +
                (a.target_date ? ` · due ${formatDate(a.target_date)}` : '') +
                (a.updates.length ? ` · ${a.updates.length} report${a.updates.length === 1 ? '' : 's'}` : '')
              }
              aside={
                <>
                  <p className="text-sm font-medium tabular-nums text-ink">{formatBdt(a.budget_amount)}</p>
                  <p
                    className={
                      a.incurred > a.budget_amount
                        ? 'text-xs font-medium tabular-nums text-red-700'
                        : 'text-xs tabular-nums text-ink-muted'
                    }
                  >
                    {a.incurred > 0 ? `${formatBdt(a.incurred)} spent` : 'nothing spent'}
                  </p>
                </>
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-[10rem] flex-1 items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={a.pct_complete >= 100 ? 'h-full bg-emerald-500' : 'h-full bg-admin-500'}
                      style={{ width: `${Math.min(100, Math.max(0, a.pct_complete))}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-ink">{a.pct_complete}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => setEditing(a)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => setDeleting(a)}>
                    <Trash2 className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={a.status === 'cancelled' || Boolean(locked)}
                    onClick={() => setReporting(a)}
                  >
                    <TrendingUp className="size-4" /> Report progress
                  </Button>
                </div>
              </div>

              {a.notes && <p className="mt-2 text-sm text-ink-muted">{a.notes}</p>}

              {/* BRD DEV-003 — every report, newest first */}
              {a.updates.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-hairline pt-3">
                  {a.updates.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                      <span className="w-24 shrink-0 text-xs text-ink-muted">{formatDate(u.progress_date)}</span>
                      <span className="font-medium tabular-nums text-ink">{u.pct_complete}%</span>
                      {u.qty_done != null && (
                        <span className="text-ink-muted">{`${u.qty_done} ${a.unit ?? ''}`.trim()}</span>
                      )}
                      {u.amount_incurred != null && (
                        <span className="tabular-nums text-ink-muted">{formatBdt(u.amount_incurred)} spent</span>
                      )}
                      {u.remarks && <span className="basis-full pl-[6.75rem] text-xs text-ink-muted">{u.remarks}</span>}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 border-t border-hairline pt-3">
                <p className="mb-2 text-xs font-medium text-ink-muted">
                  <Paperclip className="mr-1 inline size-3.5" /> Evidence
                </p>
                <DocumentsPanel entityType="land_development_activity" entityId={a.id} />
              </div>
            </TimelineItem>
          ))}
        </TimelineList>
      )}

      {editing && (
        <ActivityDialog
          land={land}
          activity={editing === 'new' ? undefined : editing}
          userId={userId}
          onClose={() => setEditing(null)}
        />
      )}

      {reporting && (
        <ProgressDialog activity={reporting} userId={userId} onClose={() => setReporting(null)} />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this activity"
        subtitle={deleting?.activity_type}
        tone="danger"
        confirmLabel="Delete activity"
        message="The activity, its progress reports and any photos attached to it are removed. This cannot be undone."
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await landPipelineRepository.removeDevelopmentActivity(deleting.id, userId);
          setDeleting(null);
        }}
      />
    </>
  );
}

function ActivityDialog({
  land,
  activity,
  userId,
  onClose,
}: {
  land: Land;
  activity?: DevelopmentActivityWithProgress;
  userId: string | null;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const types = useLiveQuery(() => lookupRepository.options('land_development_activity'), []);
  /* BRD DEV-003 — contractors already live in the vendor master */
  const contractors = useLiveQuery(
    async () => (await supplierRepository.getAll()).filter((s) => s.type === 'contractor'),
    [],
  );

  const [form, setForm] = useState({
    activity_type: activity?.activity_type ?? '',
    contractor_id: activity?.contractor_id ?? '',
    unit: activity?.unit ?? '',
    planned_qty: activity?.planned_qty != null ? String(activity.planned_qty) : '',
    budget_amount: activity ? String(activity.budget_amount) : '',
    start_date: activity?.start_date ?? '',
    target_date: activity?.target_date ?? '',
    status: (activity?.status ?? 'planned') as DevelopmentActivityStatus,
    notes: activity?.notes ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.activity_type.trim()) {
      setError('Pick what work this is');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = {
        land_id: land.id,
        activity_type: form.activity_type,
        contractor_id: form.contractor_id || null,
        unit: form.unit.trim() || null,
        planned_qty: form.planned_qty.trim() ? Number(form.planned_qty) : null,
        budget_amount: Number(form.budget_amount) || 0,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      // through the pipeline: development work moves a held plot's status
      if (activity) await landPipelineRepository.updateDevelopmentActivity(activity.id, payload, userId);
      else await landPipelineRepository.recordDevelopmentActivity(payload, userId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={activity ? 'Edit activity' : 'Add development activity'}
      subtitle={`${land.code} · ${land.name}`}
      icon={HardHat}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Work" required error={error || undefined}>
            <SelectInput
              value={form.activity_type}
              onChange={(e) => {
                set('activity_type', e.target.value);
                setError('');
              }}
            >
              <option value="">Select the work…</option>
              {types?.map((t) => (
                <option key={t.id} value={t.value}>
                  {t.value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Contractor" hint="From the vendor master — contractors only">
            <SelectInput
              value={form.contractor_id}
              onChange={(e) => set('contractor_id', e.target.value)}
            >
              <option value="">Not awarded yet</option>
              {contractors?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Quantity" hint="How much work">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.planned_qty}
              placeholder="e.g. 24000"
              onChange={(e) => set('planned_qty', e.target.value)}
            />
          </Field>
          <Field label="Unit" hint="cft, rft, sft…">
            <TextInput
              value={form.unit}
              placeholder="e.g. cft"
              onChange={(e) => set('unit', e.target.value)}
            />
          </Field>
          <Field label="Budget">
            <MoneyInput
              value={form.budget_amount}
              placeholder="e.g. 2400000"
              onChange={(e) => set('budget_amount', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Start date">
            <TextInput
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)}
            />
          </Field>
          <Field label="Target date">
            <TextInput
              type="date"
              value={form.target_date}
              onChange={(e) => set('target_date', e.target.value)}
            />
          </Field>
          <Field label="Status" required>
            <SelectInput
              value={form.status}
              onChange={(e) => set('status', e.target.value as DevelopmentActivityStatus)}
            >
              {DEVELOPMENT_ACTIVITY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        <Field label="Notes">
          <TextArea
            value={form.notes}
            placeholder="Scope, access constraints, anything the contractor needs to know"
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function ProgressDialog({
  activity,
  userId,
  onClose,
}: {
  activity: DevelopmentActivityWithProgress;
  userId: string | null;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    progress_date: todayLocal(),
    qty_done: '',
    pct_complete: String(activity.pct_complete || 0),
    amount_incurred: activity.incurred > 0 ? String(activity.incurred) : '',
    remarks: '',
  });
  const [markComplete, setMarkComplete] = useState(false);

  const pct = markComplete ? 100 : Number(form.pct_complete) || 0;

  return (
    <Modal
      open
      title={`Report progress — ${activity.activity_type}`}
      subtitle={`Currently ${activity.pct_complete}% · budget ${formatBdt(activity.budget_amount)}`}
      icon={TrendingUp}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setSaving(true);
              try {
                await landPipelineRepository.recordDevelopmentProgress(
                  {
                    activity_id: activity.id,
                    progress_date: form.progress_date,
                    qty_done: form.qty_done.trim() ? Number(form.qty_done) : null,
                    pct_complete: Math.min(100, Math.max(0, pct)),
                    amount_incurred: form.amount_incurred.trim()
                      ? Number(form.amount_incurred)
                      : null,
                    recorded_by: userId,
                    remarks: form.remarks.trim() || null,
                  },
                  userId,
                );
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save report'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
          Each report states the running totals — how far the work has got and how much has been
          spent so far — not that day&rsquo;s figures. Reporting 100% marks the activity complete.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Report date" required>
            <TextInput
              type="date"
              value={form.progress_date}
              onChange={(e) => setForm((f) => ({ ...f, progress_date: e.target.value }))}
            />
          </Field>
          <Field
            label={`Quantity done${activity.unit ? ` (${activity.unit})` : ''}`}
            hint={
              activity.planned_qty != null ? `of ${activity.planned_qty} planned` : undefined
            }
          >
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.qty_done}
              onChange={(e) => setForm((f) => ({ ...f, qty_done: e.target.value }))}
            />
          </Field>
          <Field label="Percent complete" required>
            <TextInput
              type="number"
              min="0"
              max="100"
              disabled={markComplete}
              value={markComplete ? '100' : form.pct_complete}
              onChange={(e) => setForm((f) => ({ ...f, pct_complete: e.target.value }))}
            />
          </Field>
          <Field label="Spent so far" hint="Running total, not this report's spend">
            <MoneyInput
              value={form.amount_incurred}
              placeholder="e.g. 1800000"
              onChange={(e) => setForm((f) => ({ ...f, amount_incurred: e.target.value }))}
            />
          </Field>
        </div>

        <Checkbox
          label="This activity is finished"
          checked={markComplete}
          onChange={(e) => setMarkComplete(e.target.checked)}
        />

        <Field label="Remarks">
          <TextArea
            value={form.remarks}
            placeholder="e.g. Filling done to 3 ft, rain stopped work for four days"
            onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}
