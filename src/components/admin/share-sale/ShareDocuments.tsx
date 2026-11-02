'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock3, Download, FileCheck2, FilePlus2, FileText, Loader2, Plus, Trash2, Upload, UploadCloud, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { CustomerUpload, CustomerUploadKind, ShareSale } from '@/lib/db/types';
import { SHARE_DOC_KINDS, docMeta, paperChecklist, shareDocScope, type ChecklistItem, type PaperOwner } from '@/lib/domain/share-documents';
import { customerUploadRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { RejectUploadModal, openUpload } from './InboxModals';
import { ErrorNote, useAction } from './ShareSaleModals';

const STATUS: Record<CustomerUpload['status'], { label: string; tone: 'green' | 'amber' | 'red' }> = {
  accepted: { label: 'On file', tone: 'green' },
  under_review: { label: 'To review', tone: 'amber' },
  rejected: { label: 'Sent back', tone: 'red' },
};

/** Files a paper on the customer's record: picked from the checklist, or any kind. */
export function OfficeUploadModal({
  customerId,
  sales,
  bookings = [],
  kind: initialKind,
  saleId: initialSale,
  onClose,
}: {
  customerId: string;
  /** the customer's purchases a purchase paper can go to */
  sales: Pick<ShareSale, 'id' | 'code'>[];
  /** BUYER-PORTAL-PLAN.md §10 F9 — and their bookings */
  bookings?: { id: string; code: string }[];
  kind?: CustomerUploadKind;
  saleId?: string | null;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<CustomerUploadKind>(initialKind ?? 'signed_copy');
  // "sale:<id>" or "booking:<id>" — one list for both kinds of holding
  const [target, setTarget] = useState(
    initialSale ? `sale:${initialSale}` : sales[0] ? `sale:${sales[0].id}` : bookings[0] ? `booking:${bookings[0].id}` : '',
  );
  const [targetKind, targetId] = target.split(':') as ['sale' | 'booking' | '', string];
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { error, busy, run } = useAction();
  const purchase = shareDocScope(kind) === 'purchase';
  const meta = docMeta(kind, targetKind === 'booking' ? 'booking' : 'sale');

  return (
    <Modal
      open
      title="Add a paper to the file"
      subtitle={meta.hint}
      icon={UploadCloud}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !file}
            onClick={() =>
              run(
                () =>
                  customerUploadRepository.officeUpload(
                    {
                      customer_id: customerId,
                      sale_id: purchase && targetKind === 'sale' ? targetId : null,
                      booking_id: purchase && targetKind === 'booking' ? targetId : null,
                      kind,
                      title,
                      note,
                      file: file!,
                      file_name: file!.name,
                    },
                    userId,
                  ),
                onClose,
              )
            }
          >
            <Upload className="size-4" /> Put on file
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paper" required>
          <SelectInput value={kind} onChange={(e) => setKind(e.target.value as CustomerUploadKind)}>
            <optgroup label="Customer papers (every purchase)">
              {SHARE_DOC_KINDS.filter((k) => shareDocScope(k) === 'customer').map((k) => (
                <option key={k} value={k}>
                  {docMeta(k, targetKind === 'booking' ? 'booking' : 'sale').label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Purchase / booking papers">
              {SHARE_DOC_KINDS.filter((k) => shareDocScope(k) === 'purchase').map((k) => (
                <option key={k} value={k}>
                  {docMeta(k, targetKind === 'booking' ? 'booking' : 'sale').label}
                </option>
              ))}
            </optgroup>
          </SelectInput>
        </Field>
        {purchase ? (
          <Field label="For" required>
            <SelectInput value={target} onChange={(e) => setTarget(e.target.value)}>
              {sales.length > 0 && (
                <optgroup label="Share purchases">
                  {sales.map((s) => (
                    <option key={s.id} value={`sale:${s.id}`}>
                      {s.code}
                    </option>
                  ))}
                </optgroup>
              )}
              {bookings.length > 0 && (
                <optgroup label="Bookings">
                  {bookings.map((b) => (
                    <option key={b.id} value={`booking:${b.id}`}>
                      {b.code}
                    </option>
                  ))}
                </optgroup>
              )}
            </SelectInput>
          </Field>
        ) : (
          <p className="self-end pb-2 text-xs text-ink-muted">Kept on the customer and used for every purchase.</p>
        )}
        <Field label="Title" hint="optional" className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={meta.label} />
        </Field>
        <Field label="File" required hint="PDF, JPG, PNG or WEBP, up to 10 MB" className="sm:col-span-2">
          {file ? (
            <div className="flex items-center gap-2 rounded-xl border border-hairline bg-slate-50 px-3 py-2 text-sm">
              <FileText className="size-4 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="text-ink-muted hover:text-red-600">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-hairline px-3 py-5 text-sm text-ink-muted hover:border-admin-300 hover:text-admin-700"
            >
              <UploadCloud className="size-5" /> Choose the scanned file
            </button>
          )}
          <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Note" hint="optional" className="sm:col-span-2">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Original kept in the customer's file, cabinet 3" />
        </Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

function FileRow({ u, mayEdit, onReject }: { u: CustomerUpload; mayEdit: boolean; onReject: (u: CustomerUpload) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
      <FileText className="size-3.5 shrink-0 text-ink-muted" />
      <button type="button" onClick={() => openUpload(u.id)} className="min-w-0 truncate font-medium text-admin-700 hover:underline">
        {u.file_name}
      </button>
      <span className="text-ink-muted">
        {u.source === 'office' ? 'office' : 'customer'} · {formatDate(u.uploaded_at)}
      </span>
      <Badge tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Badge>
      {u.review_note && <span className="text-red-600">{u.review_note}</span>}
      {mayEdit && (
        <span className="ml-auto flex gap-1">
          <button type="button" title="Open" onClick={() => openUpload(u.id)} className="rounded p-1 text-ink-muted hover:bg-slate-100">
            <Download className="size-3.5" />
          </button>
          {u.status === 'under_review' && (
            <>
              <button type="button" onClick={() => customerUploadRepository.accept(u.id)} className="rounded px-1.5 py-0.5 font-medium text-admin-700 hover:bg-admin-50">
                Accept
              </button>
              <button type="button" onClick={() => onReject(u)} className="rounded px-1.5 py-0.5 font-medium text-red-600 hover:bg-red-50">
                Send back
              </button>
            </>
          )}
          {u.source === 'office' && (
            <button type="button" title="Remove from the file" onClick={() => customerUploadRepository.removeOfficeUpload(u.id)} className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-600">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      )}
    </li>
  );
}

/** What one paper's row says about it. */
function paperState(i: ChecklistItem): { label: string; tone: 'green' | 'amber' | 'red' | 'neutral'; icon: typeof CheckCircle2; box: string } {
  if (i.files.some((f) => f.status === 'accepted')) return { label: 'On file', tone: 'green', icon: FileCheck2, box: 'bg-emerald-50 text-emerald-600' };
  if (i.files.some((f) => f.status === 'under_review')) return { label: 'To review', tone: 'amber', icon: Clock3, box: 'bg-blue-50 text-blue-600' };
  if (i.files.length) return { label: 'Sent back', tone: 'red', icon: AlertTriangle, box: 'bg-red-50 text-red-600' };
  return { label: 'Missing', tone: 'neutral', icon: FileText, box: 'bg-slate-100 text-slate-400' };
}

/** One paper, the way the land Legal DD list shows a paper: status, guidance, files, upload. */
function PaperCard({ item, sale, owner = 'sale', mayEdit, onReject }: { item: ChecklistItem; sale: Pick<ShareSale, 'id' | 'customer_id'>; owner?: PaperOwner['kind']; mayEdit: boolean; onReject: (u: CustomerUpload) => void }) {
  const { userId } = useMockSession();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const state = paperState(item);
  const Icon = state.icon;
  const toReview = item.files.find((f) => f.status === 'under_review');

  async function upload(picked: FileList | null) {
    if (!picked?.length) return;
    setError('');
    setUploading(true);
    try {
      for (const file of Array.from(picked)) {
        await customerUploadRepository.officeUpload(
          { customer_id: sale.customer_id, sale_id: owner === 'sale' ? sale.id : null, booking_id: owner === 'booking' ? sale.id : null, kind: item.kind, file, file_name: file.name },
          userId,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload did not go through.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <li className={cn('rounded-xl border bg-white', state.label === 'On file' ? 'border-emerald-200' : state.label === 'Sent back' ? 'border-red-200' : 'border-hairline')}>
      <div className="flex flex-wrap items-start gap-3 p-3">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', state.box)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            {item.meta.label}
            <Badge tone={state.tone}>{state.label}</Badge>
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{item.meta.hint}</p>
        </div>
        {mayEdit && (
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => input.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload
            </Button>
            {toReview && (
              <>
                <Button size="sm" variant="outline" onClick={() => customerUploadRepository.accept(toReview.id)}>
                  <Check className="size-4" /> Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onReject(toReview)}>
                  Send back
                </Button>
              </>
            )}
          </div>
        )}
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {(item.files.length > 0 || error) && (
        <div className="space-y-2 border-t border-hairline px-3 py-2.5">
          {item.files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {item.files.map((f) => (
                <li key={f.id} className={cn('flex max-w-full items-center gap-1 rounded-lg border pr-1 pl-2 text-xs', f.status === 'rejected' ? 'border-red-200 bg-red-50' : 'border-hairline bg-slate-50')}>
                  <button type="button" onClick={() => openUpload(f.id)} className="flex min-w-0 items-center gap-1.5 py-1 text-ink hover:text-admin-700">
                    <FileText className="size-3.5 shrink-0 text-admin-600" />
                    <span className="truncate">{f.file_name}</span>
                    <span className="shrink-0 text-ink-muted">
                      · {f.source === 'office' ? 'office' : 'customer'} · {formatDate(f.uploaded_at)}
                    </span>
                  </button>
                  {mayEdit && f.source === 'office' && (
                    <button type="button" aria-label={`Remove ${f.file_name}`} onClick={() => customerUploadRepository.removeOfficeUpload(f.id)} className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {item.files
            .filter((f) => f.status === 'rejected' && f.review_note)
            .map((f) => (
              <p key={f.id} className="text-sm text-red-700">
                <span className="font-medium">Sent back: </span>
                {f.review_note}
              </p>
            ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </li>
  );
}

/** Picks optional papers to add to the list, like "Add paper" on the land Legal DD list. */
function AddPapersDialog({ kinds, onAdd, onClose }: { kinds: ChecklistItem[]; onAdd: (k: CustomerUploadKind[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<CustomerUploadKind[]>([]);
  const toggle = (k: CustomerUploadKind) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <Modal
      open
      title="Add papers"
      subtitle="Papers this purchase also needs; each one gets its own row to upload into."
      icon={FilePlus2}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!picked.length}
            onClick={() => {
              onAdd(picked);
              onClose();
            }}
          >
            <Plus className="size-4" /> Add {picked.length || ''} paper{picked.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="grid gap-1.5 sm:grid-cols-2">
        {kinds.map((i) => {
          const on = picked.includes(i.kind);
          return (
            <button
              key={i.kind}
              type="button"
              onClick={() => toggle(i.kind)}
              className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors', on ? 'border-admin-300 bg-admin-50' : 'border-hairline bg-white hover:border-admin-200')}
            >
              <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded border', on ? 'border-admin-500 bg-admin-500 text-white' : 'border-slate-300')}>{on && <Check className="size-3" />}</span>
              <span className="min-w-0">
                <span className="block text-sm text-ink">{i.meta.label}</span>
                <span className="block text-xs text-ink-muted">{i.meta.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/**
 * One purchase's papers, laid out like the land Legal DD list: a progress
 * header, the papers required to sign, then other papers added as needed.
 * Customer papers (NID, photo …) serve every purchase of the customer.
 */
export function ShareDocumentChecklist({
  uploads,
  sale,
  owner = 'sale',
  hasNominee,
  byAttorney,
  mayEdit,
}: {
  uploads: CustomerUpload[];
  /** the purchase, or with `owner="booking"` the booking, the papers belong to */
  sale: Pick<ShareSale, 'id' | 'code' | 'customer_id'>;
  owner?: PaperOwner['kind'];
  hasNominee: boolean;
  byAttorney: boolean;
  mayEdit: boolean;
  /** kept for callers; papers go to this purchase or the customer */
  sales?: Pick<ShareSale, 'id' | 'code'>[];
}) {
  const [added, setAdded] = useState<CustomerUploadKind[]>([]);
  const [adding, setAdding] = useState(false);
  const [reject, setReject] = useState<CustomerUpload | null>(null);
  const all = paperChecklist(uploads, { kind: owner, id: sale.id }, { has_nominee: hasNominee, by_attorney: byAttorney });
  const required = all.filter((i) => i.required);
  const extra = all.filter((i) => !i.required && (i.files.length > 0 || added.includes(i.kind)));
  const addable = all.filter((i) => !i.required && !extra.includes(i));
  const done = required.filter((i) => i.done).length;
  const clear = done === required.length;
  const pct = required.length ? Math.round((done / required.length) * 100) : 100;
  const others = uploads.filter((u) => u.kind === 'other' && (owner === 'sale' ? u.sale_id === sale.id : u.booking_id === sale.id));

  return (
    <>
      <div className={cn('mb-5 rounded-xl border px-4 py-3', clear ? 'border-emerald-200 bg-emerald-50' : 'border-hairline bg-slate-50')}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', clear ? 'bg-emerald-100 text-emerald-700' : 'bg-admin-50 text-admin-600')}>
            {clear ? <FileCheck2 className="size-5" /> : <FileText className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-medium', clear ? 'text-emerald-900' : 'text-ink')}>
              {clear ? 'All required papers are on file — the agreement can be signed.' : `${done} of ${required.length} required papers on file`}
            </p>
            <p className={cn('text-xs', clear ? 'text-emerald-800' : 'text-ink-muted')}>
              {extra.length ? `${extra.length} other paper${extra.length === 1 ? '' : 's'} on the list` : 'No other papers added'} · {sale.code}
            </p>
          </div>
          <span className="text-sm font-semibold text-ink tabular-nums">{pct}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
          <div className={cn('h-full rounded-full transition-all', clear ? 'bg-emerald-500' : 'bg-admin-500')} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <section>
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Required papers</h4>
        <ul className="space-y-2">
          {required.map((i) => (
            <PaperCard key={i.kind} item={i} sale={sale} owner={owner} mayEdit={mayEdit} onReject={setReject} />
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Other papers</h4>
          {mayEdit && addable.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add paper
            </Button>
          )}
        </div>
        {extra.length === 0 && others.length === 0 ? (
          <button
            type="button"
            disabled={!mayEdit}
            onClick={() => setAdding(true)}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-hairline bg-white px-4 py-5 text-center transition-colors hover:border-admin-300 hover:bg-admin-50/40"
          >
            <FilePlus2 className="size-5 text-admin-600" />
            <span className="text-sm font-medium text-ink">Add a paper this {owner === 'sale' ? 'purchase' : 'booking'} needs</span>
            <span className="text-xs text-ink-muted">
              {owner === 'sale'
                ? 'e.g. allotment letter, deed of share ownership, e-TIN, post-dated cheques, source of funds declaration'
                : 'e.g. allotment letter, post-dated cheques, registered sale deed, e-TIN'}
            </span>
          </button>
        ) : (
          <ul className="space-y-2">
            {extra.map((i) => (
              <PaperCard key={i.kind} item={i} sale={sale} owner={owner} mayEdit={mayEdit} onReject={setReject} />
            ))}
            {others.length > 0 && (
              <PaperCard
                item={{ kind: 'other', meta: docMeta('other', owner), required: false, files: others, done: others.some((f) => f.status !== 'rejected') }}
                sale={sale}
                owner={owner}
                mayEdit={mayEdit}
                onReject={setReject}
              />
            )}
          </ul>
        )}
      </section>

      {adding && <AddPapersDialog kinds={addable} onAdd={(k) => setAdded((a) => [...a, ...k])} onClose={() => setAdding(false)} />}
      {reject && <RejectUploadModal upload={reject} onClose={() => setReject(null)} />}
    </>
  );
}

/** A customer's whole file, grouped: their own papers, each share purchase's, then each booking's (BUYER-PORTAL-PLAN.md §4). */
export function CustomerShareFile({
  customerId,
  uploads,
  sales,
  bookings = [],
  mayEdit,
}: {
  customerId: string;
  uploads: CustomerUpload[];
  sales: Pick<ShareSale, 'id' | 'code'>[];
  bookings?: { id: string; code: string }[];
  mayEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [reject, setReject] = useState<CustomerUpload | null>(null);
  const own = uploads.filter((u) => shareDocScope(u.kind) === 'customer');
  const block = (title: string, rows: CustomerUpload[]) => (
    <div key={title}>
      <p className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</p>
      {rows.length ? (
        <ul className="divide-y divide-hairline">
          {rows.map((u) => (
            <li key={u.id} className="py-1.5">
              <p className="text-sm font-medium text-ink">{u.title}</p>
              <ul>
                <FileRow u={u} mayEdit={mayEdit} onReject={setReject} />
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-1.5 text-sm text-ink-muted">Nothing on file.</p>
      )}
    </div>
  );
  return (
    <div className="space-y-5">
      {mayEdit && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Upload className="size-4" /> Add a paper
          </Button>
        </div>
      )}
      {block('Customer papers', own)}
      {sales.map((s) => block(`Purchase ${s.code}`, uploads.filter((u) => u.sale_id === s.id && shareDocScope(u.kind) === 'purchase')))}
      {bookings.map((b) => block(`Booking ${b.code}`, uploads.filter((u) => u.booking_id === b.id && shareDocScope(u.kind) === 'purchase')))}
      {adding && (
        <OfficeUploadModal
          customerId={customerId}
          sales={sales}
          bookings={bookings}
          kind={sales.length || bookings.length ? 'signed_copy' : 'id_document'}
          onClose={() => setAdding(false)}
        />
      )}
      {reject && <RejectUploadModal upload={reject} onClose={() => setReject(null)} />}
    </div>
  );
}
