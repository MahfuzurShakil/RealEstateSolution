'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Check,
  CircleDashed,
  FileCheck2,
  MinusCircle,
  Paperclip,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { useMockSession } from '@/lib/auth/mock-session';
import type { DdCategory, DdItemStatus, Land } from '@/lib/db/types';
import { DD_CATEGORY_LABEL, DD_ITEM_STATUSES } from '@/lib/db/types';
import {
  isSettled,
  landDdRepository,
  landPipelineRepository,
  userRepository,
  type LandDdItemWithMaster,
} from '@/lib/repositories';
import { formatDate } from '@/lib/utils/format';

const STATUS_META: Record<DdItemStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'blue' },
  submitted: { label: 'Submitted for review', tone: 'blue' },
  passed: { label: 'Passed', tone: 'green' },
  conditionally_approved: { label: 'Approved with condition', tone: 'teal' },
  failed: { label: 'Failed', tone: 'red' },
  waived: { label: 'Waived', tone: 'amber' },
  not_applicable: { label: 'Not applicable', tone: 'neutral' },
};

const STATUS_ICON: Record<DdItemStatus, typeof Check> = {
  pending: CircleDashed,
  in_progress: CircleDashed,
  submitted: Send,
  passed: Check,
  conditionally_approved: Check,
  failed: X,
  waived: ShieldAlert,
  not_applicable: MinusCircle,
};

/**
 * The legal due-diligence checklist for one land (BRD DD-001…004).
 *
 * The checklist is built from the active master items the first time the tab
 * is opened, and topped up on every later open — so an item added to the
 * master shows up on lands already in progress, without disturbing findings
 * already recorded.
 *
 * Only mandatory items block gate G2. That is why the header counts them
 * separately: "9 of 12 passed" is reassuring and largely irrelevant, and
 * "2 mandatory outstanding" is the number that decides whether this land can
 * be bought.
 */
export function DueDiligencePanel({ land }: { land: Land }) {
  const { userId } = useMockSession();
  const [editing, setEditing] = useState<LandDdItemWithMaster | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);

  const rows = useLiveQuery(() => landDdRepository.listForLand(land.id), [land.id]);
  const progress = useLiveQuery(() => landDdRepository.progressForLand(land.id), [land.id]);

  /*
   * Built on open rather than when the land is created. A land sourced before
   * the checklist existed would otherwise never get one, and a checklist
   * created at land-creation time would freeze the master list as it stood
   * that day.
   */
  useEffect(() => {
    void landDdRepository.ensureForLand(land.id, userId);
  }, [land.id, userId]);

  if (rows === undefined || progress === undefined) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  const grouped = new Map<DdCategory, LandDdItemWithMaster[]>();
  for (const row of rows) {
    const key = (row.item?.category ?? 'ownership') as DdCategory;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  const clear = progress.mandatoryOutstanding === 0 && progress.mandatoryTotal > 0;

  return (
    <>
      {/* the header is the gate's answer, written out */}
      <div
        className={
          clear
            ? 'mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3'
            : 'mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3'
        }
      >
        <span
          className={
            clear
              ? 'grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700'
              : 'grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700'
          }
        >
          {clear ? <FileCheck2 className="size-5" /> : <AlertTriangle className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={clear ? 'text-sm font-medium text-emerald-900' : 'text-sm font-medium text-amber-900'}>
            {clear
              ? 'Every mandatory check is settled — this land can complete acquisition.'
              : `${progress.mandatoryOutstanding} mandatory check${progress.mandatoryOutstanding === 1 ? '' : 's'} outstanding`}
          </p>
          <p className={clear ? 'text-xs text-emerald-800' : 'text-xs text-amber-800'}>
            {progress.settled} of {progress.total} items settled · {progress.mandatoryTotal}{' '}
            mandatory
            {progress.mandatoryFailed > 0 && ` · ${progress.mandatoryFailed} failed`}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {[...grouped.entries()].map(([category, items]) => (
          <section key={category}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {DD_CATEGORY_LABEL[category] ?? category}
            </h4>
            <ul className="space-y-2">
              {items.map((row) => {
                const Icon = STATUS_ICON[row.status];
                const blocking = row.is_mandatory && !isSettled(row.status);
                return (
                  <li
                    key={row.id}
                    className={
                      blocking
                        ? 'rounded-xl border border-amber-200 bg-white'
                        : 'rounded-xl border border-hairline bg-white'
                    }
                  >
                    <div className="flex flex-wrap items-start gap-3 p-3">
                      <span
                        className={
                          row.status === 'passed'
                            ? 'grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600'
                            : row.status === 'failed'
                              ? 'grid size-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600'
                              : row.status === 'waived'
                                ? 'grid size-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600'
                                : 'grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400'
                        }
                      >
                        <Icon className="size-4" />
                      </span>

                      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                        <p className="text-sm font-medium text-ink">
                          {row.item?.label ?? 'Retired checklist item'}
                          {row.is_mandatory && (
                            <span className="ml-1.5 text-xs font-normal text-amber-700">
                              mandatory
                            </span>
                          )}
                        </p>
                        {row.item?.guidance && (
                          <p className="mt-0.5 text-xs text-ink-muted">{row.item.guidance}</p>
                        )}
                      </div>

                      <Badge tone={STATUS_META[row.status].tone}>
                        {STATUS_META[row.status].label}
                      </Badge>

                      <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setEvidenceFor(evidenceFor === row.id ? null : row.id)
                          }
                          aria-label="Evidence"
                        >
                          <Paperclip className="size-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditing(row)}>
                          Update
                        </Button>
                      </div>
                    </div>

                    {(row.finding || row.waiver_reason) && (
                      <div className="border-t border-hairline px-3 py-2.5">
                        {row.finding && (
                          <p className="whitespace-pre-wrap text-sm text-ink-muted">
                            <span className="font-medium text-ink">Finding: </span>
                            {row.finding}
                          </p>
                        )}
                        {row.waiver_reason && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-800">
                            <span className="font-medium">Waived: </span>
                            {row.waiver_reason}
                            {row.waived_at && (
                              <span className="text-xs"> · {formatDate(row.waived_at)}</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    {evidenceFor === row.id && (
                      <div className="border-t border-hairline px-3 py-3">
                        <DocumentsPanel entityType="land_dd_item" entityId={row.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {editing && (
        <UpdateItemDialog row={editing} userId={userId} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function UpdateItemDialog({
  row,
  userId,
  onClose,
}: {
  row: LandDdItemWithMaster;
  userId: string | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<DdItemStatus>(row.status);
  const [finding, setFinding] = useState(row.finding ?? '');
  const [waiver, setWaiver] = useState(row.waiver_reason ?? '');
  const [assignee, setAssignee] = useState(row.assigned_to ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const users = useLiveQuery(() => userRepository.getAll(), []);

  async function save() {
    /*
     * A failed check with no finding is the one combination that must never be
     * saved: "failed" alone tells the next reader nothing, and this record is
     * what an auditor reads a year later.
     */
    if (status === 'failed' && !finding.trim()) {
      setError('Say what the check found — a failure with no finding is not a record.');
      return;
    }
    if (status === 'conditionally_approved' && !finding.trim()) {
      setError('State the condition — an approval on a condition nobody wrote down is a pass.');
      return;
    }
    if (status === 'submitted' && !finding.trim()) {
      setError('Submit the finding for review — there is nothing to review without it.');
      return;
    }
    if (status === 'waived' && !waiver.trim()) {
      setError('A waiver needs a reason. This is the authorisation BR-001 asks for.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const wasWaived = row.status === 'waived';
      // through the pipeline: the first item worked on starts due diligence on the land
      await landPipelineRepository.updateDdItem(row.id, {
        status,
        finding: finding.trim() || null,
        assigned_to: assignee || null,
        submitted_by: status === 'pending' ? row.submitted_by : userId,
        submitted_at: status === 'pending' ? row.submitted_at : (row.submitted_at ?? now),
        reviewed_by: isSettled(status) ? userId : null,
        reviewed_at: isSettled(status) ? now : null,
        waiver_reason: status === 'waived' ? waiver.trim() : null,
        /*
         * The waiver's author and date are stamped once and kept while it
         * stands. Re-saving a waived item to fix a typo in the reason should
         * not re-date the authorisation.
         */
        waived_by: status === 'waived' ? (wasWaived ? row.waived_by : userId) : null,
        waived_at: status === 'waived' ? (wasWaived ? row.waived_at : now) : null,
      }, userId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={row.item?.label ?? 'Checklist item'}
      subtitle={row.is_mandatory ? 'Mandatory — this item blocks acquisition' : 'Optional item'}
      icon={FileCheck2}
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
        {row.item?.guidance && (
          <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-sm text-ink-muted">
            {row.item.guidance}
          </p>
        )}

        <Field label="Status" required>
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value as DdItemStatus)}>
            {DD_ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Assigned to" hint="Who is doing this check">
          <SelectInput value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Nobody yet</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          label={status === 'conditionally_approved' ? 'Condition' : 'Finding'}
          required={status === 'failed' || status === 'submitted' || status === 'conditionally_approved'}
          error={
            status === 'failed' || status === 'submitted' || status === 'conditionally_approved'
              ? error || undefined
              : undefined
          }
          hint="What the search or the papers actually showed"
        >
          <TextArea
            value={finding}
            placeholder="e.g. Search certificate clear 1998–2026. Mutation DCR attached."
            onChange={(e) => {
              setFinding(e.target.value);
              setError('');
            }}
          />
        </Field>

        {status === 'waived' && (
          <>
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              A waiver lets this land complete acquisition with the check unfinished. The reason
              and your name are recorded against it permanently.
            </p>
            <Field label="Waiver reason" required error={error || undefined}>
              <TextArea
                value={waiver}
                placeholder="e.g. Holding tax dues are the seller's under clause 7; deed withholds BDT 200,000 against it."
                onChange={(e) => {
                  setWaiver(e.target.value);
                  setError('');
                }}
              />
            </Field>
          </>
        )}

        {status === 'not_applicable' && (
          <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
            Not applicable is not the same as passed — it says the check does not arise on this
            land, which is what an auditor asking &ldquo;was this verified?&rdquo; needs to read.
          </p>
        )}

        {status === 'conditionally_approved' && (
          <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
            Approved on a condition settles the check for acquisition. The condition is kept as
            the finding, so the deed and the settlement can be held to it.
          </p>
        )}

        {error &&
          !['failed', 'waived', 'submitted', 'conditionally_approved'].includes(status) && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    </Modal>
  );
}
