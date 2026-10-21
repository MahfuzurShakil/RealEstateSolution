'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  HardHat,
  PauseCircle,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { StepAttachments } from '@/components/admin/documents/StepAttachments';
import { PaymentDialog } from '@/components/admin/lands/LandCostPanel';
import { useMockSession } from '@/lib/auth/mock-session';
import type { DevelopmentActivityStatus } from '@/lib/db/types';
import type { ReactNode } from 'react';
import { DEVELOPMENT_ACTIVITY_STATUSES } from '@/lib/db/types';
import {
  documentRepository,
  landDevelopmentRepository,
  landPipelineRepository,
  lookupRepository,
  supplierRepository,
  type DevelopmentActivityWithProgress,
  type LandWithRelations,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';
import { developmentBlockReason } from '@/lib/domain/land';
import {
  specsFromQuantity,
  workKind,
  workSpecSummary,
  type WorkSpecs,
} from '@/lib/domain/land-development';
import { LockedNotice } from '@/components/admin/lands/TimelineItem';

const STATUS_META: Record<
  DevelopmentActivityStatus,
  { label: string; tone: BadgeTone; icon: typeof HardHat; dot: string }
> = {
  planned: { label: 'Planned', tone: 'neutral', icon: CircleDashed, dot: 'bg-slate-100 text-slate-500' },
  in_progress: { label: 'In progress', tone: 'blue', icon: HardHat, dot: 'bg-blue-50 text-blue-600' },
  completed: { label: 'Completed', tone: 'green', icon: CheckCircle2, dot: 'bg-emerald-50 text-emerald-600' },
  on_hold: { label: 'On hold', tone: 'amber', icon: PauseCircle, dot: 'bg-amber-50 text-amber-600' },
  cancelled: { label: 'Cancelled', tone: 'red', icon: XCircle, dot: 'bg-red-50 text-red-500' },
};

/**
 * Land development for one plot (BRD DEV-001 to DEV-004).
 *
 * Filling, boundary wall, internal roads, drainage — the work that happens to
 * raw land before anything is designed on it.
 *
 * 2026-10-21 — reworked around how the work is actually run: each activity
 * is a card with its progress and its money side by side (budget, contract,
 * paid, pending). Progress reports say how far the work has got, with photos;
 * money is never typed into a report any more — it is paid from the Land Cost
 * tab (or the Pay button here, which opens the same form), so the paid figure
 * is the payments themselves.
 */
export function DevelopmentPanel({ land }: { land: LandWithRelations }) {
  const { userId } = useMockSession();
  const [editing, setEditing] = useState<DevelopmentActivityWithProgress | { type: string } | null>(null);
  const [reporting, setReporting] = useState<DevelopmentActivityWithProgress | null>(null);
  const [paying, setPaying] = useState<DevelopmentActivityWithProgress | null>(null);
  const [deleting, setDeleting] = useState<DevelopmentActivityWithProgress | null>(null);

  const activities = useLiveQuery(() => landDevelopmentRepository.listForLand(land.id), [land.id]);
  const types = useLiveQuery(() => lookupRepository.options('land_development_activity'), []);

  if (!activities) return <p className="text-sm text-ink-muted">Loading…</p>;

  // L7 — work on land the company does not hold yet is money spent on somebody else's plot
  const locked = developmentBlockReason(land.status);

  const live = activities.filter((a) => a.status !== 'cancelled');
  const done = live.filter((a) => a.status === 'completed').length;
  const budget = live.reduce((s, a) => s + (Number(a.budget_amount) || 0), 0);
  const committed = live.reduce((s, a) => s + a.committed, 0);
  const paid = activities.reduce((s, a) => s + a.incurred, 0);
  const pending = live.reduce((s, a) => s + a.pending, 0);
  /* overall progress weighted by what each piece of work is worth */
  const weight = live.reduce((s, a) => s + (a.committed || 1), 0);
  const overall = live.length
    ? Math.round(live.reduce((s, a) => s + a.pct_complete * (a.committed || 1), 0) / weight)
    : 0;
  const usedTypes = new Set(activities.map((a) => a.activity_type));
  const suggestions = (types ?? []).filter((t) => !usedTypes.has(t.value)).slice(0, 8);

  if (land.no_development_required) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="size-5 text-emerald-600" />
        <p className="min-w-0 flex-1 text-sm text-emerald-900">
          <strong>This plot needs no development work.</strong> It can go straight to a project.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => landPipelineRepository.setNoDevelopmentRequired(land.id, false, userId)}
        >
          It does need work
        </Button>
      </div>
    );
  }

  return (
    <>
      {locked && (
        <LockedNotice>
          <strong>Land development is locked.</strong> {locked}
        </LockedNotice>
      )}

      {/*
        2026-10-21 — a light summary card above a table of activities: the two
        are different shapes, so they no longer read as the same thing.
      */}
      {activities.length > 0 && (
        <div className="mb-6 rounded-xl border border-hairline bg-slate-50 p-5">
          <div className="flex items-center gap-4">
            <ProgressRing pct={overall} />
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted">Development progress</p>
              <p className="mt-0.5 text-lg font-semibold text-ink">
                {done === live.length && live.length > 0
                  ? 'All work complete'
                  : `${done} of ${live.length} done`}
              </p>
              {done === live.length && live.length > 0 && (
                <p className="text-xs text-emerald-700">This plot can carry a project</p>
              )}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-hairline pt-4 sm:grid-cols-4">
            <BannerFigure label="Budget" value={budget} />
            <BannerFigure label="Contract" value={committed} hint="budget where not awarded" />
            <BannerFigure label="Paid" value={paid} />
            <BannerFigure label="Pending" value={pending} highlight={pending > 0} />
          </dl>
        </div>
      )}

      {activities.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-ink">
            Activities <span className="font-normal text-ink-muted">· {activities.length}</span>
            <span className="ml-2 text-xs font-normal text-ink-muted">amounts in BDT · click a row for updates & photos</span>
          </h4>
          <Button
            size="sm"
            disabled={Boolean(locked)}
            title={locked ?? undefined}
            onClick={() => setEditing({ type: '' })}
          >
            <Plus className="size-4" /> Add activity
          </Button>
        </div>
      )}

      {activities.length === 0 && (
        <div className="mb-5 rounded-xl border-2 border-dashed border-hairline bg-white px-4 py-6 text-center">
          <HardHat className="mx-auto size-6 text-admin-600" />
          <p className="mt-2 text-sm font-medium text-ink">What does this plot need before building?</p>
          <p className="mt-1 text-xs text-ink-muted">
            Pick a piece of work to plan it — budget, contractor and dates — then track progress and pay
            for it here.
          </p>
          {!locked && (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {(types ?? []).slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditing({ type: t.value })}
                  className="rounded-full border border-hairline bg-white px-3 py-1.5 text-sm text-ink transition-colors hover:border-admin-300 hover:bg-admin-50"
                >
                  + {t.value}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => landPipelineRepository.setNoDevelopmentRequired(land.id, true, userId)}
            className="mt-4 text-xs font-medium text-admin-700 hover:underline"
          >
            This plot needs no development work
          </button>
        </div>
      )}

      {activities.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                <th className="min-w-[210px] px-3 py-2.5 text-left">Work</th>
                <th className="w-28 px-3 py-2.5 text-left">Progress</th>
                <th className="px-3 py-2.5 text-right" title="Contract amount, or the budget before a contractor is awarded">
                  Cost
                </th>
                <th className="px-3 py-2.5 text-right">Paid</th>
                <th className="px-3 py-2.5 text-right">Pending</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <ActivityRow
                  key={a.id}
                  activity={a}
                  locked={Boolean(locked)}
                  onReport={() => setReporting(a)}
                  onPay={() => setPaying(a)}
                  onEdit={() => setEditing(a)}
                  onDelete={() => setDeleting(a)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activities.length > 0 && suggestions.length > 0 && !locked && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-ink-muted">Add more:</span>
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setEditing({ type: t.value })}
              className="rounded-full border border-hairline bg-white px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-admin-300 hover:text-admin-700"
            >
              + {t.value}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <ActivityDialog
          land={land}
          activity={'id' in editing ? editing : undefined}
          initialType={'id' in editing ? undefined : editing.type}
          userId={userId}
          onClose={() => setEditing(null)}
        />
      )}

      {reporting && (
        <ProgressDialog activity={reporting} userId={userId} onClose={() => setReporting(null)} />
      )}

      {paying && (
        <PaymentDialog
          land={land}
          target={{ kind: 'activity', id: paying.id }}
          onClose={() => setPaying(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this activity"
        subtitle={deleting?.activity_type}
        tone="danger"
        confirmLabel="Delete activity"
        message={
          deleting && deleting.incurred > 0
            ? `The activity, its progress reports and photos are removed. The ${formatBdt(deleting.incurred)} already paid stays in Land Cost as an unclassified payment.`
            : 'The activity, its progress reports and any photos attached to it are removed. This cannot be undone.'
        }
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await landPipelineRepository.removeDevelopmentActivity(deleting.id, userId);
          setDeleting(null);
        }}
      />
    </>
  );
}

/** A total on the summary card. */
function BannerFigure({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: number;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'text-base font-semibold tabular-nums',
          value > 0 ? (highlight ? 'text-amber-700' : 'text-ink') : 'text-slate-300',
        )}
      >
        {value > 0 ? formatBdt(value) : '—'}
      </dd>
      {hint && <dd className="text-[11px] text-ink-muted">{hint}</dd>}
    </div>
  );
}

/** The overall percentage as a ring — the summary's one big number. */
function ProgressRing({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-200" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
          className={cn('transition-all', pct >= 100 ? 'text-emerald-500' : 'text-admin-500')}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold tabular-nums text-ink">{pct}%</span>
    </div>
  );
}

/**
 * One activity as a table row; the update history and photos open in a row
 * underneath (2026-10-21).
 */
function ActivityRow({
  activity: a,
  locked,
  onReport,
  onPay,
  onEdit,
  onDelete,
}: {
  activity: DevelopmentActivityWithProgress;
  locked: boolean;
  onReport: () => void;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[a.status];
  const Icon = meta.icon;
  const closed = a.status === 'completed' || a.status === 'cancelled';
  const overdue = !closed && a.target_date != null && a.target_date < todayLocal();
  const qtyDone = a.updates.find((u) => u.qty_done != null)?.qty_done;
  const specs = workSpecSummary(a.activity_type, a.specs);
  // the app's grouping (260,000), not the lakh grouping en-IN gives (2,60,000)
  const amount = (n: number) => n.toLocaleString('en-BD');
  const contract = Number(a.contract_amount) || 0;
  const budget = Number(a.budget_amount) || 0;

  return (
    <>
      {/* the row opens its updates and photos — the buttons inside stop that */}
      <tr
        onClick={() => setOpen(!open)}
        className={cn(
          'cursor-pointer border-t border-hairline align-top transition-colors hover:bg-slate-50/70',
          open && 'bg-slate-50/70',
          a.status === 'cancelled' && 'opacity-60',
        )}
      >
        <td className="px-3 py-3">
          <div className="flex items-start gap-2.5">
            <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', meta.dot)}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 font-medium text-ink">
                {a.activity_type}
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <ChevronDown className={cn('size-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
              </p>
              {specs && <p className="mt-0.5 text-xs text-ink">{specs}</p>}
              <p className="mt-0.5 text-xs text-ink-muted">
                {a.contractor ? a.contractor.name : 'No contractor yet'}
                {(a.start_date || a.target_date) && (
                  <span className={cn(overdue && 'font-medium text-red-600')}>
                    {' · '}
                    {a.start_date ? formatDate(a.start_date) : '—'} → {a.target_date ? formatDate(a.target_date) : 'no target'}
                    {overdue && ' (overdue)'}
                  </span>
                )}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn('h-full rounded-full', a.pct_complete >= 100 ? 'bg-emerald-500' : 'bg-admin-500')}
                style={{ width: `${Math.min(100, Math.max(0, a.pct_complete))}%` }}
              />
            </div>
            <span className="w-9 text-right text-xs font-semibold tabular-nums text-ink">{a.pct_complete}%</span>
          </div>
          {a.planned_qty != null && (
            <p className="mt-1 text-[11px] text-ink-muted">
              {amount(qtyDone ?? 0)} / {amount(a.planned_qty)} {a.unit ?? ''}
            </p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
          {contract || budget ? (
            <>
              <span className="text-ink">{amount(contract || budget)}</span>
              <span className="block text-[11px] text-ink-muted">
                {contract ? (budget ? `budget ${amount(budget)}` : 'contract') : 'budget'}
              </span>
            </>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
          {a.incurred > 0 ? <span className="text-ink">{amount(a.incurred)}</span> : <span className="text-slate-300">—</span>}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
          {a.status !== 'cancelled' && a.pending > 0 ? (
            <span className="font-medium text-amber-700">{amount(a.pending)}</span>
          ) : a.incurred > 0 ? (
            <span className="text-xs font-medium text-emerald-700">Paid</span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
          {/* stacked, so the action column stays narrow and the table fits */}
          <div className="flex flex-col items-stretch gap-1.5">
            {!closed && (
              <Button size="sm" variant="outline" disabled={locked} onClick={onReport} className="h-8 px-2.5 text-xs">
                <TrendingUp className="size-3.5" /> Update
              </Button>
            )}
            {a.status !== 'cancelled' && a.pending > 0 && (
              <Button size="sm" variant="outline" disabled={locked} onClick={onPay} className="h-8 px-2.5 text-xs">
                <Wallet className="size-3.5" /> Pay
              </Button>
            )}
          </div>
        </td>
      </tr>

      {open && (
        <tr className="bg-slate-50/60">
          <td colSpan={6} className="px-4 py-4">
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onEdit} className="h-8 text-xs">
                <Pencil className="size-3.5" /> Edit activity
              </Button>
              <Button size="sm" variant="dangerGhost" onClick={onDelete} className="h-8 text-xs">
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Updates</p>
                {a.notes && <p className="mb-3 text-sm text-ink-muted">{a.notes}</p>}
                {a.updates.length > 0 ? (
                  <ol className="relative space-y-3 border-l border-hairline pl-4">
                    {a.updates.map((u) => (
                      <li key={u.id} className="relative">
                        <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-white bg-admin-500" />
                        <p className="text-sm">
                          <span className="font-semibold tabular-nums text-ink">{u.pct_complete}%</span>
                          <span className="text-ink-muted"> · {formatDate(u.progress_date)}</span>
                          {u.qty_done != null && (
                            <span className="text-ink-muted">{` · ${amount(u.qty_done)} ${a.unit ?? ''}`.trimEnd()}</span>
                          )}
                        </p>
                        {u.remarks && <p className="text-xs text-ink-muted">{u.remarks}</p>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-ink-muted">No progress reported yet.</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Photos & files</p>
                <DocumentsPanel entityType="land_development_activity" entityId={a.id} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ActivityDialog({
  land,
  activity,
  initialType,
  userId,
  onClose,
}: {
  land: LandWithRelations;
  activity?: DevelopmentActivityWithProgress;
  initialType?: string;
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
    activity_type: activity?.activity_type ?? initialType ?? '',
    contractor_id: activity?.contractor_id ?? '',
    unit: activity?.unit ?? '',
    planned_qty: activity?.planned_qty != null ? String(activity.planned_qty) : '',
    budget_amount: activity ? String(activity.budget_amount || '') : '',
    contract_amount: activity?.contract_amount != null ? String(activity.contract_amount) : '',
    start_date: activity?.start_date ?? '',
    target_date: activity?.target_date ?? '',
    status: (activity?.status ?? 'planned') as DevelopmentActivityStatus,
    notes: activity?.notes ?? '',
  });
  // an activity saved before kinds had fields gets what can be recovered
  const [specs, setSpecs] = useState<WorkSpecs>(
    activity?.specs ??
      (activity ? specsFromQuantity(activity.activity_type, activity.planned_qty, activity.unit) : {}),
  );

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  /* the fields follow the kind of work; quantity and unit are worked out */
  const kind = workKind(form.activity_type);
  const planned = kind?.quantity?.(specs) ?? null;

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
        // a known kind measures itself; anything else keeps the plain pair
        specs: kind ? specs : null,
        // measurements not filled in yet keep the quantity the activity had
        unit: kind ? (planned?.unit ?? activity?.unit ?? null) : form.unit.trim() || null,
        planned_qty: kind
          ? (planned?.qty ?? activity?.planned_qty ?? null)
          : form.planned_qty.trim()
            ? Number(form.planned_qty)
            : null,
        budget_amount: Number(form.budget_amount) || 0,
        contract_amount: form.contract_amount.trim() ? Number(form.contract_amount) : null,
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
      title={activity ? `Edit ${activity.activity_type}` : 'Plan development work'}
      subtitle={`${land.code} · ${land.name}`}
      icon={HardHat}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : activity ? 'Save' : 'Add activity'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormSection title="The work" hint={kind?.hint}>
          <div className="grid gap-4 sm:grid-cols-3">
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

            {kind
              ? kind.fields.map((f) => (
                  <Field key={f.key} label={f.unit ? `${f.label} (${f.unit})` : f.label} hint={f.hint}>
                    {f.type === 'select' ? (
                      <SelectInput
                        value={String(specs[f.key] ?? '')}
                        onChange={(e) => setSpecs((x) => ({ ...x, [f.key]: e.target.value || null }))}
                      >
                        <option value="">Select…</option>
                        {f.options?.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </SelectInput>
                    ) : (
                      <TextInput
                        type={f.type === 'number' ? 'number' : 'text'}
                        min={f.type === 'number' ? '0' : undefined}
                        step={f.type === 'number' ? 'any' : undefined}
                        value={String(specs[f.key] ?? '')}
                        placeholder={f.placeholder}
                        onChange={(e) =>
                          setSpecs((x) => ({
                            ...x,
                            [f.key]:
                              e.target.value === ''
                                ? null
                                : f.type === 'number'
                                  ? Number(e.target.value)
                                  : e.target.value,
                          }))
                        }
                      />
                    )}
                  </Field>
                ))
              : form.activity_type && (
                  <>
                    <Field label="Quantity">
                      <TextInput
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.planned_qty}
                        placeholder="e.g. 24000"
                        onChange={(e) => set('planned_qty', e.target.value)}
                      />
                    </Field>
                    <Field label="Unit">
                      <TextInput
                        value={form.unit}
                        placeholder="cft, rft, sft"
                        onChange={(e) => set('unit', e.target.value)}
                      />
                    </Field>
                  </>
                )}
          </div>

          {kind?.quantity && (
            <p className="mt-3 rounded-lg bg-admin-50 px-3 py-2 text-sm text-admin-800">
              {planned
                ? (
                    <>
                      Progress will be tracked against{' '}
                      <strong className="tabular-nums">
                        {planned.qty.toLocaleString('en-BD')} {planned.unit}
                      </strong>
                      .
                    </>
                  )
                : 'Fill the measurements to set what progress is tracked against.'}
            </p>
          )}
        </FormSection>

        <FormSection title="Money">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Budget" hint="What you expect it to cost">
              <MoneyInput
                value={form.budget_amount}
                placeholder="e.g. 2400000"
                onChange={(e) => set('budget_amount', e.target.value)}
              />
            </Field>
            <Field label="Contract amount" hint="What the contractor agreed — leave blank until awarded">
              <MoneyInput
                value={form.contract_amount}
                placeholder="after award"
                onChange={(e) => set('contract_amount', e.target.value)}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Payments are recorded with the Pay button or on the Land Cost tab, against this activity.
          </p>
        </FormSection>

        <FormSection title="Who and when">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Contractor">
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
          </div>
        </FormSection>

        {/* a new activity starts Planned; progress moves it on by itself */}
        {activity && (
          <Field label="Status" hint="Progress moves it on by itself; use this to hold or cancel">
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
        )}

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
  const [pct, setPct] = useState(activity.pct_complete || 0);
  const [form, setForm] = useState({ progress_date: todayLocal(), qty_done: '', remarks: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');

  async function save() {
    setSaving(true);
    try {
      await landPipelineRepository.recordDevelopmentProgress(
        {
          activity_id: activity.id,
          progress_date: form.progress_date,
          qty_done: form.qty_done.trim() ? Number(form.qty_done) : null,
          pct_complete: Math.min(100, Math.max(0, pct)),
          amount_incurred: null,
          recorded_by: userId,
          remarks: form.remarks.trim() || null,
        },
        userId,
      );
      const uploadedAt = new Date().toISOString();
      for (const file of files) {
        await documentRepository.create(
          {
            entity_type: 'land_development_activity',
            entity_id: activity.id,
            document_type: 'progress_photo',
            custom_type_name: null,
            file_url: file.name,
            file_data: file,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            is_public: false,
            uploaded_by: userId,
            uploaded_at: uploadedAt,
            notes: `Progress ${pct}% · ${form.progress_date}`,
          },
          userId,
        );
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`Update progress — ${activity.activity_type}`}
      subtitle={`Last reported ${activity.pct_complete}%`}
      icon={TrendingUp}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : pct >= 100 ? 'Mark complete' : 'Save update'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-ink">How far has the work got?</span>
            <span className="text-2xl font-semibold tabular-nums text-admin-700">{pct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="w-full accent-admin-600"
            aria-label="Percent complete"
          />
          <div className="mt-2 flex gap-1.5">
            {[25, 50, 75, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPct(n)}
                className={cn(
                  'flex-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors',
                  pct === n
                    ? 'border-admin-500 bg-admin-500 text-white'
                    : 'border-hairline bg-white text-ink-muted hover:border-admin-300',
                )}
              >
                {n === 100 ? 'Done' : `${n}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <TextInput
              type="date"
              value={form.progress_date}
              onChange={(e) => setForm((f) => ({ ...f, progress_date: e.target.value }))}
            />
          </Field>
          {activity.planned_qty != null && (
          <Field
            label={`Quantity done${activity.unit ? ` (${activity.unit})` : ''}`}
            hint={activity.planned_qty != null ? `of ${activity.planned_qty} planned` : undefined}
          >
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.qty_done}
              onChange={(e) => setForm((f) => ({ ...f, qty_done: e.target.value }))}
            />
          </Field>
          )}
        </div>

        <StepAttachments
          files={files}
          onChange={setFiles}
          prompt="Site photos, measurement sheet"
          error={fileError}
          onError={setFileError}
        />

        <Field label="Note">
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

/** A white card inside a popup body — groups a form into readable parts. */
function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-4">
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
