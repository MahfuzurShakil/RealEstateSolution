'use client';

import { useRef, useState } from 'react';
import { CircleAlert, Clock3, Download, FileImage, FileText, Loader2, ShieldCheck, Trash2, Upload, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/public/ui/Button';
import {
  UPLOAD_ACCEPT,
  UPLOAD_KIND_LABEL,
  UPLOAD_MAX_MB,
  formatDay,
  type CustomerUpload,
  type HoldingView,
  type UploadKind,
} from '@/lib/domain/investor-portal';
import { SHARE_DOC_KINDS, SHARE_DOC_META, shareDocScope, type ShareDocScope } from '@/lib/domain/share-documents';
import { investorRepository } from '@/lib/repositories/investor/investor.repository';
import { cn } from '@/lib/utils/cn';
import { PortalDialog } from './PortalDialog';

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const fieldCls = 'h-12 w-full rounded-2xl border border-site-line bg-white px-4 text-[15px] focus:border-site-primary focus:outline-none';
const labelCls = 'mb-2 block text-xs font-semibold tracking-[0.12em] text-site-muted uppercase';

/** The papers a customer may send for this part of their file. */
const kindsFor = (scope: ShareDocScope) => SHARE_DOC_KINDS.filter((k) => shareDocScope(k) === scope && SHARE_DOC_META[k].customer_may_upload);

/**
 * Sends a file to the office: a personal paper (NID, photo, TIN …) for the
 * customer's file, or a paper for one investment.
 */
export function UploadDialog({
  open,
  onClose,
  holdings,
  holdingCode,
  scope = 'purchase',
  initialKind,
}: {
  open: boolean;
  onClose: () => void;
  holdings: HoldingView[];
  holdingCode?: string;
  scope?: ShareDocScope;
  initialKind?: UploadKind;
}) {
  const input = useRef<HTMLInputElement>(null);
  const kinds = kindsFor(scope);
  const personal = scope === 'customer';
  const [holding, setHolding] = useState(holdingCode ?? holdings[0]?.holding.code ?? '');
  const [kind, setKind] = useState<UploadKind>(initialKind ?? (personal ? 'id_document' : 'payment_proof'));
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const okType = /\.(pdf|jpe?g|png|webp)$/i.test(f.name);
    if (!okType) return setError('Please choose a PDF, JPG, PNG or WEBP file.');
    if (f.size > UPLOAD_MAX_MB * 1024 * 1024) return setError(`That file is ${fileSize(f.size)}. The largest file we accept is ${UPLOAD_MAX_MB} MB.`);
    setError(null);
    setFile(f);
  };

  const send = async () => {
    if (!file || (!personal && !holding)) return;
    setBusy(true);
    try {
      await investorRepository.uploadDocument({ holding_code: personal ? null : holding, kind, title: title || UPLOAD_KIND_LABEL[kind], note, file });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload did not go through. Please try again.');
      setBusy(false);
    }
  };

  const FileIcon = file?.type.startsWith('image/') ? FileImage : FileText;

  return (
    <PortalDialog
      open={open}
      onClose={onClose}
      title={personal ? 'Upload a personal paper' : 'Upload a document'}
      description={
        personal
          ? 'Kept on your customer file and used for all your investments. Our office checks every upload.'
          : holdingCode
            ? `For ${holdings.find((v) => v.holding.code === holdingCode)?.project.name ?? holdingCode}. Our office checks every upload.`
            : 'Send us a copy for your investment file. Our office checks every upload.'
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!file || (!personal && !holding) || busy} icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {!personal && !holdingCode && holdings.length > 1 && (
          <div>
            <label htmlFor="up-holding" className={labelCls}>
              Investment
            </label>
            <select id="up-holding" value={holding} onChange={(e) => setHolding(e.target.value)} className={fieldCls}>
              {holdings.map((v) => (
                <option key={v.holding.code} value={v.holding.code}>
                  {v.project.name} · {v.holding.code}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="up-kind" className={labelCls}>
            Document type
          </label>
          <select id="up-kind" value={kind} onChange={(e) => setKind(e.target.value as UploadKind)} className={fieldCls}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {UPLOAD_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-site-muted">{SHARE_DOC_META[kind].hint}</p>
        </div>
        <div>
          <label htmlFor="up-title" className={labelCls}>
            Title <span className="font-normal tracking-normal normal-case">(optional)</span>
          </label>
          <input id="up-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={UPLOAD_KIND_LABEL[kind]} className={cn(fieldCls, 'placeholder:text-site-faint')} />
        </div>

        <div>
          <p className={labelCls}>File</p>
          {file ? (
            <div className="flex items-center gap-3 rounded-2xl border border-site-line bg-site-ivory p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
                <FileIcon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{file.name}</span>
                <span className="block text-xs text-site-muted">{fileSize(file.size)}</span>
              </span>
              <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="grid size-9 place-items-center rounded-full text-site-muted hover:bg-white hover:text-site-danger">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pick(e.dataTransfer.files[0]);
              }}
              className={cn(
                'flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors',
                drag ? 'border-site-primary bg-site-primary-soft/40' : 'border-site-line hover:border-site-primary/60 hover:bg-site-ivory',
              )}
            >
              <UploadCloud className="size-8 text-site-primary" aria-hidden />
              <span className="mt-2 text-sm font-semibold">Choose a file or drop it here</span>
              <span className="mt-0.5 text-xs text-site-muted">PDF, JPG, PNG or WEBP · up to {UPLOAD_MAX_MB} MB</span>
            </button>
          )}
          <input ref={input} type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          {error && <p className="mt-2 text-[13px] font-medium text-site-danger">{error}</p>}
        </div>

        <div>
          <label htmlFor="up-note" className={labelCls}>
            Note <span className="font-normal tracking-normal normal-case">(optional)</span>
          </label>
          <textarea
            id="up-note"
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: deposit slip for installment 5"
            className="w-full resize-none rounded-2xl border border-site-line px-4 py-3 text-[15px] placeholder:text-site-faint focus:border-site-primary focus:outline-none"
          />
        </div>
      </div>
    </PortalDialog>
  );
}

/** Files the customer uploaded for one investment, with their review status. */
export function UploadList({ uploads }: { uploads: CustomerUpload[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (u: CustomerUpload) => {
    const blob = await investorRepository.uploadFile(u.id);
    if (!blob) return window.alert('This file is no longer stored in this browser.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    if (!/^(application\/pdf|image\/)/.test(u.file_type)) a.download = u.file_name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (!uploads.length) return null;
  return (
    <ul className="divide-y divide-site-line">
      {uploads.map((u) => {
        const Icon = u.file_type.startsWith('image/') ? FileImage : FileText;
        return (
          <li key={u.id} className="flex items-center gap-4 px-5 py-4 sm:px-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-site-brass/15 text-site-brass-dark">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{u.title}</span>
              <span className="block truncate text-sm text-site-muted">
                {u.title !== UPLOAD_KIND_LABEL[u.kind] && `${UPLOAD_KIND_LABEL[u.kind]} · `}
                {u.file_name} · {fileSize(u.file_size)} · {formatDay(u.uploaded_at)}
              </span>
              {u.source === 'office' && <span className="block text-xs font-semibold text-site-primary-dark">Filed by our office</span>}
              {u.note && <span className="block truncate text-xs text-site-muted italic">“{u.note}”</span>}
              {u.status === 'rejected' && (
                <span className="mt-0.5 block text-xs font-medium text-site-danger">
                  Not accepted{u.review_note ? `: ${u.review_note}` : ''} — please upload a new copy.
                </span>
              )}
            </span>
            <span
              className={cn(
                'hidden items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap sm:inline-flex',
                u.status === 'accepted' ? 'bg-site-primary-soft text-site-primary-dark' : u.status === 'rejected' ? 'bg-red-50 text-site-danger' : 'bg-site-booked-soft text-site-booked',
              )}
            >
              {u.status === 'accepted' ? <ShieldCheck className="size-3.5" aria-hidden /> : u.status === 'rejected' ? <CircleAlert className="size-3.5" aria-hidden /> : <Clock3 className="size-3.5" aria-hidden />}
              {u.status === 'accepted' ? (u.source === 'office' ? 'On file' : 'Accepted') : u.status === 'rejected' ? 'Not accepted' : 'Under review'}
            </span>
            <span className="flex shrink-0 items-center">
              <button type="button" aria-label={`Open ${u.file_name}`} onClick={() => open(u)} className="grid size-9 place-items-center rounded-full text-site-primary hover:bg-site-primary-soft">
                <Download className="size-4" />
              </button>
              {u.status === 'under_review' && u.source === 'customer' && (
                <button
                  type="button"
                  aria-label={`Delete ${u.file_name}`}
                  disabled={busy === u.id}
                  onClick={async () => {
                    if (!window.confirm(`Delete “${u.title}”? Our office will no longer see it.`)) return;
                    setBusy(u.id);
                    await investorRepository.deleteUpload(u.id);
                    setBusy(null);
                  }}
                  className="grid size-9 place-items-center rounded-full text-site-muted hover:bg-red-50 hover:text-site-danger disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The "Upload a document" button and its dialog, for a page heading or a panel. */
export function UploadButton({
  holdings,
  holdingCode,
  size = 'md',
  scope = 'purchase',
  label = 'Upload a document',
}: {
  holdings: HoldingView[];
  holdingCode?: string;
  size?: 'sm' | 'md';
  scope?: ShareDocScope;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant="outline" onClick={() => setOpen(true)} icon={<Upload className="size-4" />}>
        {label}
      </Button>
      {open && <UploadDialog open onClose={() => setOpen(false)} holdings={holdings} holdingCode={holdingCode} scope={scope} />}
    </>
  );
}
