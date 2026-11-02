'use client';

import { useState } from 'react';
import { Check, Eye, FileCheck2, FileText, Replace, Trash2, Upload, UploadCloud } from 'lucide-react';
import { DocRow, FileDropZone, FileViewer, type ViewerFile } from '@/components/admin/documents/DocumentParts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { CustomerUpload, CustomerUploadKind, ShareSale } from '@/lib/db/types';
import { SHARE_DOC_KINDS, docMeta, paperChecklist, shareDocScope, type ChecklistItem, type PaperOwner } from '@/lib/domain/share-documents';
import { formatFileSize } from '@/lib/domain/file-upload';
import { customerUploadRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { RejectUploadModal } from './InboxModals';
import { ErrorNote, useAction } from './ShareSaleModals';

/*
 * A customer's papers — on a share purchase, on a booking, and on the
 * customer page — in the same rows, upload dialog and viewer as every other
 * Documents tab (SHARE-SALE-FEEDBACK-PLAN.md B3, D3). What these papers add:
 * a required mark, and the review of papers the customer sent from the
 * portal (accept, or send back with a reason).
 */

const STATUS: Record<CustomerUpload['status'], { label: string; tone: 'green' | 'amber' | 'red' }> = {
  accepted: { label: 'On file', tone: 'green' },
  under_review: { label: 'To review', tone: 'amber' },
  rejected: { label: 'Sent back', tone: 'red' },
};

/** A paper as the shared viewer reads it. */
function viewerFile(u: CustomerUpload): ViewerFile {
  return {
    id: u.id,
    name: u.file_name,
    mime: u.file_type,
    subtitle: `${u.title} · ${u.source === 'office' ? 'filed by the office' : 'sent by the customer'} · ${formatDate(u.uploaded_at)}`,
    load: () => customerUploadRepository.file(u.id),
  };
}

/** The file a paper's row shows: the one on file, else the one waiting, else the last sent back. */
function shownFile(files: CustomerUpload[]): CustomerUpload | undefined {
  return files.find((f) => f.status === 'accepted') ?? files.find((f) => f.status === 'under_review') ?? files[0];
}

/**
 * The upload dialog for a customer paper — the same dialog shape as the
 * Documents tab: what the paper is, which purchase it is for, the file, a
 * note. Opened from a paper's row the paper is fixed; "Replace" files the
 * new one and takes the old office copy off.
 */
export function OfficeUploadModal({
  customerId,
  sales,
  bookings = [],
  kind: initialKind,
  saleId: initialSale,
  bookingId: initialBooking,
  lockKind,
  kinds,
  replace,
  onClose,
}: {
  customerId: string;
  /** the customer's purchases a purchase paper can go to */
  sales: Pick<ShareSale, 'id' | 'code'>[];
  /** BUYER-PORTAL-PLAN.md §10 F9 — and their bookings */
  bookings?: { id: string; code: string }[];
  kind?: CustomerUploadKind;
  saleId?: string | null;
  bookingId?: string | null;
  /** opened from a paper's row: the paper cannot change */
  lockKind?: boolean;
  /** the papers the select offers; every kind when missing */
  kinds?: CustomerUploadKind[];
  /** the file this one takes the place of */
  replace?: CustomerUpload;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const [kind, setKind] = useState<CustomerUploadKind>(initialKind ?? kinds?.[0] ?? 'signed_copy');
  // "sale:<id>" or "booking:<id>" — one list for both kinds of holding
  const [target, setTarget] = useState(
    initialSale ? `sale:${initialSale}` : initialBooking ? `booking:${initialBooking}` : sales[0] ? `sale:${sales[0].id}` : bookings[0] ? `booking:${bookings[0].id}` : '',
  );
  const [targetKind, targetId] = target.split(':') as ['sale' | 'booking' | '', string];
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pickError, setPickError] = useState('');
  const { error, busy, run } = useAction();
  const purchase = shareDocScope(kind) === 'purchase';
  const owner = targetKind === 'booking' ? 'booking' : 'sale';
  const meta = docMeta(kind, owner);
  const offered = kinds ?? SHARE_DOC_KINDS;
  const label = (k: CustomerUploadKind) => docMeta(k, owner).label;

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return setPickError('The file is larger than 10 MB.');
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(f.name)) return setPickError('Upload a PDF, JPG, PNG or WEBP file.');
    setPickError('');
    setFile(f);
  }

  return (
    <Modal
      open
      title={replace ? `Replace ${meta.label.toLowerCase()}` : 'Upload document'}
      subtitle={replace ? `Takes the place of ${replace.file_name}.` : meta.hint}
      icon={UploadCloud}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !file}
            onClick={() =>
              run(async () => {
                await customerUploadRepository.officeUpload(
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
                );
                // the office's own wrong copy goes; a customer's file stays on record, sent back or not
                if (replace?.source === 'office') await customerUploadRepository.removeOfficeUpload(replace.id);
              }, onClose)
            }
          >
            <Upload className="size-4" /> {busy ? 'Uploading…' : 'Upload'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Document type" required>
            {lockKind ? (
              <TextInput value={meta.label} disabled />
            ) : (
              <SelectInput value={kind} onChange={(e) => setKind(e.target.value as CustomerUploadKind)}>
                {offered.some((k) => shareDocScope(k) === 'customer') && (
                  <optgroup label="Customer papers (every purchase)">
                    {offered
                      .filter((k) => shareDocScope(k) === 'customer')
                      .map((k) => (
                        <option key={k} value={k}>
                          {label(k)}
                        </option>
                      ))}
                  </optgroup>
                )}
                {offered.some((k) => shareDocScope(k) === 'purchase') && (
                  <optgroup label="Purchase / booking papers">
                    {offered
                      .filter((k) => shareDocScope(k) === 'purchase')
                      .map((k) => (
                        <option key={k} value={k}>
                          {label(k)}
                        </option>
                      ))}
                  </optgroup>
                )}
              </SelectInput>
            )}
          </Field>
          {purchase ? (
            <Field label="For" required>
              <SelectInput value={target} onChange={(e) => setTarget(e.target.value)} disabled={lockKind}>
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
        </div>
        {kind === 'other' && (
          <Field label="Document name" required>
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Board resolution" />
          </Field>
        )}
        <FileDropZone file={file} onPick={pick} hint="PDF, PNG, JPG, WEBP · max 10 MB" />
        <Field label="Notes">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Original kept in the customer's file, cabinet 3" />
        </Field>
        {pickError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pickError}</p>}
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

type Viewing = { file: ViewerFile; files: ViewerFile[] } | null;

/** The actions on one file: view it, and — for the office — review, replace or remove it. */
function FileActions({
  file,
  mayEdit,
  onView,
  onReplace,
  onRemove,
  onReject,
}: {
  file: CustomerUpload;
  mayEdit: boolean;
  onView: () => void;
  onReplace?: () => void;
  onRemove: (u: CustomerUpload) => void;
  onReject: (u: CustomerUpload) => void;
}) {
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onView} viewSafe>
        <Eye className="size-4" /> View
      </Button>
      {mayEdit && file.status === 'under_review' && (
        <>
          <Button variant="outline" size="sm" onClick={() => customerUploadRepository.accept(file.id)}>
            <Check className="size-4" /> Accept
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onReject(file)}>
            Send back
          </Button>
        </>
      )}
      {mayEdit && onReplace && (
        <Button variant="ghost" size="sm" onClick={onReplace}>
          <Replace className="size-4" /> Replace
        </Button>
      )}
      {/* a customer's own file is never deleted by the office — it is sent back, which keeps the record */}
      {mayEdit && file.source === 'office' && (
        <Button variant="ghost" size="sm" aria-label={`Remove ${file.file_name}`} onClick={() => onRemove(file)}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </>
  );
}

/** One paper of a checklist: its status, the file on record and what can be done with it. */
function PaperRow({
  item,
  mayEdit,
  onUpload,
  onView,
  onRemove,
  onReject,
}: {
  item: ChecklistItem;
  mayEdit: boolean;
  onUpload: (kind: CustomerUploadKind, replace?: CustomerUpload) => void;
  onView: (v: Viewing) => void;
  onRemove: (u: CustomerUpload) => void;
  onReject: (u: CustomerUpload) => void;
}) {
  const shown = shownFile(item.files);
  const status = shown ? STATUS[shown.status] : null;
  const more = item.files.length - 1;
  const files = item.files.map(viewerFile);
  return (
    <DocRow
      missing={!shown}
      mime={shown?.file_type}
      className={cn(shown?.status === 'accepted' && 'border-emerald-200', shown?.status === 'rejected' && 'border-red-200')}
      title={
        <>
          {item.meta.label}
          {item.required && <span className="ml-0.5 text-red-500">*</span>}
        </>
      }
      badge={status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge tone="neutral">Missing</Badge>}
      meta={
        shown
          ? `${shown.file_name} · ${formatFileSize(shown.file_size)} · ${shown.source === 'office' ? 'office' : 'customer'} · ${formatDate(shown.uploaded_at)}${more > 0 ? ` · ${more} more file${more === 1 ? '' : 's'}` : ''}`
          : item.meta.hint
      }
      actions={
        shown ? (
          <FileActions
            file={shown}
            mayEdit={mayEdit}
            onView={() => onView({ file: viewerFile(shown), files })}
            onReplace={() => onUpload(item.kind, shown)}
            onRemove={onRemove}
            onReject={onReject}
          />
        ) : (
          mayEdit && (
            <Button variant="outline" size="sm" onClick={() => onUpload(item.kind)}>
              <Upload className="size-4" /> Upload
            </Button>
          )
        )
      }
      footer={
        shown?.status === 'rejected' && shown.review_note ? (
          <p className="text-red-700">
            <span className="font-medium">Sent back: </span>
            {shown.review_note}
          </p>
        ) : undefined
      }
    />
  );
}

/** The dialogs a paper list opens: upload / replace, view, remove, send back. */
function usePaperDialogs() {
  const [upload, setUpload] = useState<{ kind?: CustomerUploadKind; replace?: CustomerUpload; lock: boolean } | null>(null);
  const [viewing, setViewing] = useState<Viewing>(null);
  const [removing, setRemoving] = useState<CustomerUpload | null>(null);
  const [reject, setReject] = useState<CustomerUpload | null>(null);
  const dialogs = (
    <>
      {viewing && <FileViewer file={viewing.file} files={viewing.files} onSelect={(f) => setViewing({ ...viewing, file: f })} onClose={() => setViewing(null)} />}
      <ConfirmDialog
        open={removing !== null}
        title="Remove this file?"
        message={removing ? `${removing.file_name} is taken off the record. The paper shows as missing until another file is uploaded.` : ''}
        confirmLabel="Remove file"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await customerUploadRepository.removeOfficeUpload(removing.id);
          setRemoving(null);
        }}
      />
      {reject && <RejectUploadModal upload={reject} onClose={() => setReject(null)} />}
    </>
  );
  return { upload, setUpload, setViewing, setRemoving, setReject, dialogs };
}

/**
 * One purchase's (or booking's) papers: a progress header, the papers
 * required to sign — each with a red mark — then any other papers. Customer
 * papers (NID, photo …) serve every purchase of the customer.
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
  const { upload, setUpload, setViewing, setRemoving, setReject, dialogs } = usePaperDialogs();
  const all = paperChecklist(uploads, { kind: owner, id: sale.id }, { has_nominee: hasNominee, by_attorney: byAttorney });
  const required = all.filter((i) => i.required);
  const others = uploads.filter((u) => u.kind === 'other' && (owner === 'sale' ? u.sale_id === sale.id : u.booking_id === sale.id));
  const extra: ChecklistItem[] = [
    ...all.filter((i) => !i.required && i.files.length > 0),
    ...others.map((u) => ({ kind: 'other' as const, meta: { ...docMeta('other', owner), label: u.title || docMeta('other', owner).label }, required: false, files: [u], done: u.status !== 'rejected' })),
  ];
  const optional = [...all.filter((i) => !i.required).map((i) => i.kind), 'other' as const];
  const done = required.filter((i) => i.done).length;
  const clear = done === required.length;
  const pct = required.length ? Math.round((done / required.length) * 100) : 100;
  const rowProps = { mayEdit, onUpload: (kind: CustomerUploadKind, replace?: CustomerUpload) => setUpload({ kind, replace, lock: true }), onView: setViewing, onRemove: setRemoving, onReject: setReject };

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
              PDF, PNG, JPG or WEBP up to 10 MB · {sale.code}
            </p>
          </div>
          <span className="text-sm font-semibold text-ink tabular-nums">{pct}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
          <div className={cn('h-full rounded-full transition-all', clear ? 'bg-emerald-500' : 'bg-admin-500')} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-ink">
          Required papers <span className="text-red-500">*</span>
        </h4>
        <ul className="space-y-2">
          {required.map((i) => (
            <PaperRow key={i.kind} item={i} {...rowProps} />
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-ink">Other papers</h4>
          {mayEdit && (
            <Button size="sm" onClick={() => setUpload({ kind: optional[0], lock: false })}>
              <Upload className="size-4" /> Upload document
            </Button>
          )}
        </div>
        {extra.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline bg-white px-4 py-5 text-center text-sm text-ink-muted">
            No other papers yet —{' '}
            {owner === 'sale' ? 'e.g. allotment letter, deed of share ownership, e-TIN, post-dated cheques, source of funds declaration.' : 'e.g. allotment letter, post-dated cheques, registered sale deed, e-TIN.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {extra.map((i) => (
              <PaperRow key={i.kind === 'other' ? i.files[0].id : i.kind} item={i} {...rowProps} />
            ))}
          </ul>
        )}
      </section>

      {upload && (
        <OfficeUploadModal
          customerId={sale.customer_id}
          sales={owner === 'sale' ? [sale] : []}
          bookings={owner === 'booking' ? [sale] : []}
          saleId={owner === 'sale' ? sale.id : null}
          bookingId={owner === 'booking' ? sale.id : null}
          kind={upload.kind}
          lockKind={upload.lock}
          kinds={upload.lock ? undefined : optional}
          replace={upload.replace}
          onClose={() => setUpload(null)}
        />
      )}
      {dialogs}
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
  const { upload, setUpload, setViewing, setRemoving, setReject, dialogs } = usePaperDialogs();
  const own = uploads.filter((u) => shareDocScope(u.kind) === 'customer');
  const block = (title: string, rows: CustomerUpload[]) => {
    const files = rows.map(viewerFile);
    return (
      <section key={title}>
        <h4 className="mb-2 text-sm font-semibold text-ink">{title}</h4>
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((u) => (
              <DocRow
                key={u.id}
                mime={u.file_type}
                title={u.title}
                badge={<Badge tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Badge>}
                meta={`${u.file_name} · ${formatFileSize(u.file_size)} · ${u.source === 'office' ? 'office' : 'customer'} · ${formatDate(u.uploaded_at)}`}
                actions={
                  <FileActions
                    file={u}
                    mayEdit={mayEdit}
                    onView={() => setViewing({ file: viewerFile(u), files })}
                    onReplace={() => setUpload({ kind: u.kind, replace: u, lock: true })}
                    onRemove={setRemoving}
                    onReject={setReject}
                  />
                }
                footer={
                  u.status === 'rejected' && u.review_note ? (
                    <p className="text-red-700">
                      <span className="font-medium">Sent back: </span>
                      {u.review_note}
                    </p>
                  ) : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-hairline bg-white px-4 py-3 text-sm text-ink-muted">Nothing on file.</p>
        )}
      </section>
    );
  };
  const replaceOf = upload?.replace;
  return (
    <div className="space-y-5">
      {mayEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setUpload({ lock: false })}>
            <Upload className="size-4" /> Upload document
          </Button>
        </div>
      )}
      {block('Customer papers', own)}
      {sales.map((s) => block(`Purchase ${s.code}`, uploads.filter((u) => u.sale_id === s.id && shareDocScope(u.kind) === 'purchase')))}
      {bookings.map((b) => block(`Booking ${b.code}`, uploads.filter((u) => u.booking_id === b.id && shareDocScope(u.kind) === 'purchase')))}
      {upload && (
        <OfficeUploadModal
          customerId={customerId}
          sales={sales}
          bookings={bookings}
          kind={upload.kind ?? (sales.length || bookings.length ? 'signed_copy' : 'id_document')}
          saleId={replaceOf?.sale_id ?? null}
          bookingId={replaceOf?.booking_id ?? null}
          lockKind={upload.lock}
          replace={replaceOf}
          onClose={() => setUpload(null)}
        />
      )}
      {dialogs}
    </div>
  );
}
