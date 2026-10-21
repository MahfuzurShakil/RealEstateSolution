'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Check,
  CircleDashed,
  FileCheck2,
  FileImage,
  FilePlus2,
  FileText,
  Loader2,
  MinusCircle,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DocumentViewer } from '@/components/admin/documents/DocumentsPanel';
import { useMockSession } from '@/lib/auth/mock-session';
import type { DdItemStatus, DocumentRecord, Land } from '@/lib/db/types';
import { ACCEPTED_UPLOAD_TYPES, rejectUpload } from '@/lib/domain/file-upload';
import {
  ddChecklistRepository,
  ddItemDocumentType,
  ddItemLabel,
  documentRepository,
  isSettled,
  landDdRepository,
  landPipelineRepository,
  userRepository,
  type LandDdItemWithMaster,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';

const STATUS_META: Record<DdItemStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'blue' },
  submitted: { label: 'Submitted for review', tone: 'blue' },
  passed: { label: 'Verified', tone: 'green' },
  conditionally_approved: { label: 'Verified with condition', tone: 'teal' },
  failed: { label: 'Problem found', tone: 'red' },
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

/*
 * The statuses offered in the update dialog. `submitted` and
 * `conditionally_approved` belong to a review step this office does not run
 * (2026-10-21); they are still shown on a row that already carries one.
 */
const OFFERED_STATUSES: DdItemStatus[] = [
  'pending',
  'in_progress',
  'passed',
  'failed',
  'not_applicable',
  'waived',
];

/** The fields a status change writes — shared by the quick button and the dialog. */
function statusChanges(
  row: LandDdItemWithMaster,
  status: DdItemStatus,
  userId: string | null,
  extra: { finding?: string | null; waiver_reason?: string | null; assigned_to?: string | null } = {},
) {
  const now = new Date().toISOString();
  const wasWaived = row.status === 'waived';
  return {
    status,
    finding: extra.finding !== undefined ? extra.finding : (row.finding ?? null),
    assigned_to: extra.assigned_to !== undefined ? extra.assigned_to : (row.assigned_to ?? null),
    submitted_by: status === 'pending' ? row.submitted_by : userId,
    submitted_at: status === 'pending' ? row.submitted_at : (row.submitted_at ?? now),
    reviewed_by: isSettled(status) ? userId : null,
    reviewed_at: isSettled(status) ? now : null,
    waiver_reason: status === 'waived' ? (extra.waiver_reason ?? row.waiver_reason ?? null) : null,
    /*
     * The waiver's author and date are stamped once and kept while it stands.
     * Re-saving a waived item to fix a typo should not re-date it.
     */
    waived_by: status === 'waived' ? (wasWaived ? row.waived_by : userId) : null,
    waived_at: status === 'waived' ? (wasWaived ? row.waived_at : now) : null,
  };
}

/**
 * The legal papers for one land (BRD DD-001…004).
 *
 * 2026-10-21 — built around the documents rather than a long checklist. A land
 * starts with the six required papers only; anything else (power of attorney,
 * heirs' consent, an NOC) is added when this land needs it, from the master
 * list or by name. Each paper takes its files directly — the document type is
 * already known from the paper, so the upload never asks for it.
 *
 * Only the required ones block registration (gate G2). Uploading a file to a
 * paper nobody has started marks it In progress, which is also what moves the
 * land into Due Diligence.
 */
export function DueDiligencePanel({ land }: { land: Land }) {
  const { userId } = useMockSession();
  const [editing, setEditing] = useState<LandDdItemWithMaster | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<LandDdItemWithMaster | null>(null);

  const rows = useLiveQuery(() => landDdRepository.listForLand(land.id), [land.id]);
  const progress = useLiveQuery(() => landDdRepository.progressForLand(land.id), [land.id]);
  const files = useLiveQuery(() => landDdRepository.documentsForLand(land.id), [land.id]);

  /*
   * Built on open rather than when the land is created, so a land sourced
   * before this list existed gets one too, and a paper made required in
   * Master Data later shows up on lands already in progress.
   */
  useEffect(() => {
    void landDdRepository.ensureForLand(land.id, userId);
  }, [land.id, userId]);

  if (rows === undefined || progress === undefined) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  const required = rows.filter((r) => r.is_mandatory);
  const extra = rows.filter((r) => !r.is_mandatory);
  const done = progress.mandatoryTotal - progress.mandatoryOutstanding;
  const clear = progress.mandatoryOutstanding === 0 && progress.mandatoryTotal > 0;
  const pct = progress.mandatoryTotal ? Math.round((done / progress.mandatoryTotal) * 100) : 0;

  return (
    <>
      {/* the header is gate G2's answer, written out */}
      <div
        className={cn(
          'mb-5 rounded-xl border px-4 py-3',
          clear ? 'border-emerald-200 bg-emerald-50' : 'border-hairline bg-slate-50',
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl',
              clear
                ? 'bg-emerald-100 text-emerald-700'
                : progress.mandatoryFailed
                  ? 'bg-red-100 text-red-700'
                  : 'bg-admin-50 text-admin-600',
            )}
          >
            {clear ? (
              <FileCheck2 className="size-5" />
            ) : progress.mandatoryFailed ? (
              <AlertTriangle className="size-5" />
            ) : (
              <FileText className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-medium', clear ? 'text-emerald-900' : 'text-ink')}>
              {clear
                ? 'All required papers are verified — this land can be registered.'
                : `${done} of ${progress.mandatoryTotal} required papers verified`}
            </p>
            <p className={cn('text-xs', clear ? 'text-emerald-800' : 'text-ink-muted')}>
              {progress.mandatoryFailed > 0
                ? `${progress.mandatoryFailed} with a problem found · `
                : ''}
              {extra.length
                ? `${extra.length} other paper${extra.length === 1 ? '' : 's'} added`
                : 'No other papers added'}
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums text-ink">{pct}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
          <div
            className={cn('h-full rounded-full transition-all', clear ? 'bg-emerald-500' : 'bg-admin-500')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Required papers
        </h4>
        <ul className="space-y-2">
          {required.map((row) => (
            <PaperRow
              key={row.id}
              row={row}
              files={files?.get(row.id) ?? []}
              userId={userId}
              onEdit={() => setEditing(row)}
            />
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Other papers
          </h4>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add paper
          </Button>
        </div>
        {extra.length === 0 ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-hairline bg-white px-4 py-5 text-center transition-colors hover:border-admin-300 hover:bg-admin-50/40"
          >
            <FilePlus2 className="size-5 text-admin-600" />
            <span className="text-sm font-medium text-ink">Add a paper this land needs</span>
            <span className="text-xs text-ink-muted">
              e.g. power of attorney, heirs&rsquo; consent, bank NOC, survey map — or any paper by
              name
            </span>
          </button>
        ) : (
          <ul className="space-y-2">
            {extra.map((row) => (
              <PaperRow
                key={row.id}
                row={row}
                files={files?.get(row.id) ?? []}
                userId={userId}
                onEdit={() => setEditing(row)}
                onRemove={() => setRemoving(row)}
              />
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <UpdateItemDialog row={editing} userId={userId} onClose={() => setEditing(null)} />
      )}

      {adding && (
        <AddPapersDialog
          land={land}
          have={new Set(rows.map((r) => r.item_id))}
          userId={userId}
          onClose={() => setAdding(false)}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this paper"
        message={
          removing
            ? `"${ddItemLabel(removing)}" and any files uploaded to it will be removed from this land.`
            : ''
        }
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await landDdRepository.removeItem(removing.id);
          setRemoving(null);
        }}
      />
    </>
  );
}

/** One paper: its status, its files, and the two things people do to it. */
function PaperRow({
  row,
  files,
  userId,
  onEdit,
  onRemove,
}: {
  row: LandDdItemWithMaster;
  files: DocumentRecord[];
  userId: string | null;
  onEdit: () => void;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState<DocumentRecord | null>(null);
  const [marking, setMarking] = useState(false);

  const Icon = STATUS_ICON[row.status];
  const settled = isSettled(row.status);
  const label = ddItemLabel(row);

  async function upload(picked: FileList | null) {
    if (!picked?.length) return;
    setError('');
    setUploading(true);
    try {
      const type = ddItemDocumentType(row);
      for (const file of Array.from(picked)) {
        const rejected = rejectUpload(file);
        if (rejected) {
          setError(rejected);
          continue;
        }
        await documentRepository.create({
          entity_type: 'land_dd_item',
          entity_id: row.id,
          ...type,
          file_url: file.name,
          file_data: file,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          is_public: false,
          uploaded_by: userId,
          uploaded_at: new Date().toISOString(),
          notes: null,
        });
      }
      // a file on a paper nobody had started means somebody has started it
      if (row.status === 'pending') {
        await landPipelineRepository.updateDdItem(row.id, statusChanges(row, 'in_progress', userId), userId);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <li
      className={cn(
        'rounded-xl border bg-white',
        row.status === 'failed'
          ? 'border-red-200'
          : settled
            ? 'border-emerald-200'
            : 'border-hairline',
      )}
    >
      <div className="flex flex-wrap items-start gap-3 p-3">
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg',
            row.status === 'passed' || row.status === 'conditionally_approved'
              ? 'bg-emerald-50 text-emerald-600'
              : row.status === 'failed'
                ? 'bg-red-50 text-red-600'
                : row.status === 'waived'
                  ? 'bg-amber-50 text-amber-600'
                  : row.status === 'in_progress'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-slate-100 text-slate-400',
          )}
        >
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            {label}
            <Badge tone={STATUS_META[row.status].tone}>{STATUS_META[row.status].label}</Badge>
          </p>
          {row.item?.guidance && (
            <p className="mt-0.5 text-xs text-ink-muted">{row.item.guidance}</p>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload
          </Button>
          {!settled && (
            <Button
              size="sm"
              variant="outline"
              disabled={marking}
              onClick={async () => {
                setMarking(true);
                try {
                  await landPipelineRepository.updateDdItem(row.id, statusChanges(row, 'passed', userId), userId);
                } finally {
                  setMarking(false);
                }
              }}
            >
              <Check className="size-4" /> Mark verified
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit}>
            {settled ? 'Change' : 'More'}
          </Button>
          {onRemove && (
            <Button size="sm" variant="ghost" aria-label={`Remove ${label}`} onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_UPLOAD_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {(files.length > 0 || row.finding || row.waiver_reason || error) && (
        <div className="space-y-2 border-t border-hairline px-3 py-2.5">
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {files.map((doc) => (
                <li
                  key={doc.id}
                  className="flex max-w-full items-center gap-1 rounded-lg border border-hairline bg-slate-50 pl-2 pr-1 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => setViewing(doc)}
                    className="flex min-w-0 items-center gap-1.5 py-1 text-ink hover:text-admin-700"
                  >
                    {doc.mime_type?.startsWith('image/') ? (
                      <FileImage className="size-3.5 shrink-0 text-admin-600" />
                    ) : (
                      <FileText className="size-3.5 shrink-0 text-admin-600" />
                    )}
                    <span className="truncate">{doc.file_name ?? doc.file_url}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${doc.file_name ?? 'file'}`}
                    onClick={() => setDeleting(doc)}
                    className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {row.finding && (
            <p className="whitespace-pre-wrap text-sm text-ink-muted">
              <span className="font-medium text-ink">Note: </span>
              {row.finding}
            </p>
          )}
          {row.waiver_reason && (
            <p className="whitespace-pre-wrap text-sm text-amber-800">
              <span className="font-medium">Waived: </span>
              {row.waiver_reason}
              {row.waived_at && <span className="text-xs"> · {formatDate(row.waived_at)}</span>}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {viewing && (
        <DocumentViewer doc={viewing} documents={files} onSelect={setViewing} onClose={() => setViewing(null)} />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete file"
        message={`${deleting?.file_name ?? 'This file'} will be removed from ${label}. It cannot be undone.`}
        confirmLabel="Delete file"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await documentRepository.remove(deleting.id);
          setDeleting(null);
        }}
      />
    </li>
  );
}

/** Pick papers from the master list, or name one this land needs. */
function AddPapersDialog({
  land,
  have,
  userId,
  onClose,
}: {
  land: Land;
  have: Set<string>;
  userId: string | null;
  onClose: () => void;
}) {
  const master = useLiveQuery(() => ddChecklistRepository.activeItems(), []);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const offered = (master ?? []).filter((m) => !have.has(m.id));
  const count = picked.size + names.length + (name.trim() ? 1 : 0);

  function addName() {
    const n = name.trim();
    if (!n) return;
    if (!names.includes(n)) setNames([...names, n]);
    setName('');
  }

  async function save() {
    setSaving(true);
    try {
      const customLabels = name.trim() ? [...names, name.trim()] : names;
      await landDdRepository.addItems(land.id, { itemIds: [...picked], customLabels }, userId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Add papers"
      subtitle={`${land.code} · ${land.name}`}
      icon={FilePlus2}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || count === 0}>
            {saving ? 'Adding…' : count ? `Add ${count} paper${count === 1 ? '' : 's'}` : 'Add'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {offered.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Common papers</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {offered.map((m) => {
                const on = picked.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = new Set(picked);
                      if (on) next.delete(m.id);
                      else next.add(m.id);
                      setPicked(next);
                    }}
                    className={cn(
                      'flex items-start gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                      on ? 'border-admin-400 bg-admin-50' : 'border-hairline bg-white hover:border-admin-300',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
                        on ? 'border-admin-500 bg-admin-500 text-white' : 'border-slate-300 bg-white',
                      )}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">{m.label}</span>
                      {m.guidance && (
                        <span className="block text-xs text-ink-muted">{m.guidance}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-ink">A paper of your own</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                value={name}
                placeholder="e.g. Pourashava trade permission"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addName();
                  }
                }}
              />
            </div>
            <Button variant="outline" onClick={addName} disabled={!name.trim()}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
          {names.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {names.map((n) => (
                <li
                  key={n}
                  className="flex items-center gap-1 rounded-full border border-admin-200 bg-admin-50 py-0.5 pl-2.5 pr-1 text-xs text-admin-700"
                >
                  {n}
                  <button
                    type="button"
                    aria-label={`Remove ${n}`}
                    onClick={() => setNames(names.filter((x) => x !== n))}
                    className="rounded-full p-0.5 hover:bg-admin-100"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
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
  const options = OFFERED_STATUSES.includes(row.status)
    ? OFFERED_STATUSES
    : [...OFFERED_STATUSES, row.status];

  async function save() {
    /*
     * A problem with no note is the one combination that must never be
     * saved: "problem found" alone tells the next reader nothing.
     */
    if (status === 'failed' && !finding.trim()) {
      setError('Say what the problem is.');
      return;
    }
    if (status === 'waived' && !waiver.trim()) {
      setError('A waiver needs a reason — it is recorded against your name.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      // through the pipeline: the first paper worked on starts due diligence on the land
      await landPipelineRepository.updateDdItem(
        row.id,
        statusChanges(row, status, userId, {
          finding: finding.trim() || null,
          assigned_to: assignee || null,
          waiver_reason: waiver.trim() || null,
        }),
        userId,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={ddItemLabel(row)}
      subtitle={row.is_mandatory ? 'Required — needed before registration' : 'Optional paper'}
      icon={FileCheck2}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={saving}>
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

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Status</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {options.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => {
                  setStatus(s);
                  setError('');
                }}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
                  status === s
                    ? 'border-admin-500 bg-admin-500 font-medium text-white'
                    : 'border-hairline bg-white text-ink-muted hover:border-admin-300',
                )}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        <Field
          label={status === 'failed' ? 'What is the problem?' : 'Note'}
          required={status === 'failed'}
          error={status === 'failed' ? error || undefined : undefined}
          hint="What the search or the papers showed"
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
              A waiver lets this land be registered without this paper. The reason and your name
              are recorded against it permanently.
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

        <Field label="Who is handling it">
          <SelectInput value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Nobody yet</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
    </Modal>
  );
}
