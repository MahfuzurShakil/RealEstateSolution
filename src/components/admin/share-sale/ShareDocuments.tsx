'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Circle, Download, FileText, Trash2, Upload, UploadCloud, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { CustomerUpload, CustomerUploadKind, ShareSale } from '@/lib/db/types';
import { SHARE_DOC_KINDS, SHARE_DOC_META, shareDocChecklist, shareDocScope, type ChecklistItem } from '@/lib/domain/share-documents';
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
  kind: initialKind,
  saleId: initialSale,
  onClose,
}: {
  customerId: string;
  /** the customer's purchases a purchase paper can go to */
  sales: Pick<ShareSale, 'id' | 'code'>[];
  kind?: CustomerUploadKind;
  saleId?: string | null;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<CustomerUploadKind>(initialKind ?? 'signed_copy');
  const [saleId, setSaleId] = useState(initialSale ?? sales[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { error, busy, run } = useAction();
  const purchase = shareDocScope(kind) === 'purchase';

  return (
    <Modal
      open
      title="Add a paper to the file"
      subtitle={SHARE_DOC_META[kind].hint}
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
                () => customerUploadRepository.officeUpload({ customer_id: customerId, sale_id: purchase ? saleId : null, kind, title, note, file: file!, file_name: file!.name }, userId),
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
                  {SHARE_DOC_META[k].label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Purchase papers">
              {SHARE_DOC_KINDS.filter((k) => shareDocScope(k) === 'purchase').map((k) => (
                <option key={k} value={k}>
                  {SHARE_DOC_META[k].label}
                </option>
              ))}
            </optgroup>
          </SelectInput>
        </Field>
        {purchase ? (
          <Field label="Purchase" required>
            <SelectInput value={saleId} onChange={(e) => setSaleId(e.target.value)}>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : (
          <p className="self-end pb-2 text-xs text-ink-muted">Kept on the customer and used for every purchase.</p>
        )}
        <Field label="Title" hint="optional" className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={SHARE_DOC_META[kind].label} />
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

/**
 * One purchase's paper checklist: every paper a share buyer's file holds,
 * what is on file (from the office or the customer), and what is still
 * needed to sign. Each row can take an upload.
 */
export function ShareDocumentChecklist({
  uploads,
  sale,
  hasNominee,
  byAttorney,
  mayEdit,
  sales,
  compact = false,
}: {
  uploads: CustomerUpload[];
  sale: Pick<ShareSale, 'id' | 'code' | 'customer_id'>;
  hasNominee: boolean;
  byAttorney: boolean;
  mayEdit: boolean;
  sales: Pick<ShareSale, 'id' | 'code'>[];
  /** only the required and the filed rows */
  compact?: boolean;
}) {
  const [upload, setUpload] = useState<CustomerUploadKind | null>(null);
  const [reject, setReject] = useState<CustomerUpload | null>(null);
  const all = shareDocChecklist(uploads, sale.id, { has_nominee: hasNominee, by_attorney: byAttorney });
  const others = uploads.filter((u) => u.kind === 'other' && u.sale_id === sale.id);
  const list = compact ? all.filter((i) => i.required || i.files.length) : all;

  const group = (title: string, items: ChecklistItem[]) => (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</p>
      <ul className="divide-y divide-hairline">
        {items.map((i) => (
          <li key={i.kind} className="py-2.5">
            <div className="flex items-start gap-2.5">
              {i.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-admin-600" /> : <Circle className={cn('mt-0.5 size-4 shrink-0', i.required ? 'text-red-400' : 'text-slate-300')} />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {i.meta.label}
                  {i.required && <span className={cn('ml-1.5 text-xs font-normal', i.done ? 'text-ink-muted' : 'text-red-600')}>required</span>}
                </p>
                <p className="text-xs text-ink-muted">{i.meta.hint}</p>
                {i.files.length > 0 && (
                  <ul>
                    {i.files.map((u) => (
                      <FileRow key={u.id} u={u} mayEdit={mayEdit} onReject={setReject} />
                    ))}
                  </ul>
                )}
              </div>
              {mayEdit && (
                <Button size="sm" variant={i.required && !i.done ? 'primary' : 'outline'} onClick={() => setUpload(i.kind)}>
                  <Upload className="size-3.5" /> {i.files.length ? 'Add' : 'Upload'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="space-y-5">
      {group('Customer papers — kept once, used for every purchase', list.filter((i) => i.meta.scope === 'customer'))}
      {group(`Purchase papers — ${sale.code}`, list.filter((i) => i.meta.scope === 'purchase'))}
      {others.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">Other</p>
          <ul>
            {others.map((u) => (
              <FileRow key={u.id} u={u} mayEdit={mayEdit} onReject={setReject} />
            ))}
          </ul>
        </div>
      )}
      {upload && <OfficeUploadModal customerId={sale.customer_id} sales={sales} kind={upload} saleId={sale.id} onClose={() => setUpload(null)} />}
      {reject && <RejectUploadModal upload={reject} onClose={() => setReject(null)} />}
    </div>
  );
}

/** A customer's whole investor file, grouped: their own papers, then each purchase's. */
export function CustomerShareFile({ customerId, uploads, sales, mayEdit }: { customerId: string; uploads: CustomerUpload[]; sales: Pick<ShareSale, 'id' | 'code'>[]; mayEdit: boolean }) {
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
      {adding && <OfficeUploadModal customerId={customerId} sales={sales} kind={sales.length ? 'signed_copy' : 'id_document'} onClose={() => setAdding(false)} />}
      {reject && <RejectUploadModal upload={reject} onClose={() => setReject(null)} />}
    </div>
  );
}
