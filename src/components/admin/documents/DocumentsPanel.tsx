'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Download,
  Eye,
  FileImage,
  FileText,
  Trash2,
  Upload,
  UploadCloud,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox, Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { DocumentRecord, EntityType } from '@/lib/db/types';
import { documentRepository, lookupRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate, humanize } from '@/lib/utils/format';

/** PDF or image, up to 5 MB (feedback #5). */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

function formatSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(doc: DocumentRecord): boolean {
  return Boolean(doc.mime_type?.startsWith('image/'));
}

function documentLabel(doc: DocumentRecord): string {
  return doc.document_type === 'other' && doc.custom_type_name
    ? doc.custom_type_name
    : humanize(doc.document_type);
}

/**
 * What to upload, per entity.
 *
 * This panel is shared by every module, so a single line about khatian copies
 * and deeds followed a site progress update and a booking around, telling
 * people to upload land paperwork against a photo of a slab. The Document Type
 * dropdown is already scoped by entity; the hint should be too.
 */
const EMPTY_HINT: Partial<Record<EntityType, string>> & { default: string } = {
  land: 'Upload khatian copies, deeds, mutation certificates or site photos for this land.',
  project: 'Upload approved drawings, the RAJUK memo, clearances or the brochure for this project.',
  lead: 'Upload the NID copy or anything else this enquiry sent in.',
  customer: 'Upload the NID copy, photo or any identity paperwork for this customer.',
  booking: 'Upload the signed booking form or the money receipt for this booking.',
  payment: 'Upload the money receipt or a copy of the cheque.',
  site_progress_update: 'Upload photos or a video of the work reported in this update.',
  supplier: 'Upload the trade licence, rate schedule or agreement for this supplier.',
  purchase_order: 'Upload the supplier quotation or the invoice against this order.',
  supplier_voucher: 'Upload the payment receipt or a copy of the cheque.',
  expense: 'Upload the receipt, voucher or invoice this cost was paid against.',
  refund: 'Upload the signed refund voucher.',
  default: 'Upload the paperwork that belongs to this record.',
};

/**
 * Generic "Documents" tab (Section 1.1) — reused by every entity's detail page.
 * Document Type options come from `lookup_values` scoped to this entity_type.
 *
 * Phase A stores the file itself as a Blob in IndexedDB so the demo can preview
 * and download it; Phase B swaps that for S3-compatible storage behind file_url.
 */
export function DocumentsPanel({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: string;
}) {
  const { userId } = useMockSession();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewing, setViewing] = useState<DocumentRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const documents = useLiveQuery(
    () => documentRepository.listForEntity(entityType, entityId),
    [entityType, entityId],
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">
          {documents?.length ?? 0} document{documents?.length === 1 ? '' : 's'} · PDF, PNG, JPG or
          WEBP up to 5 MB
        </p>
        <Button
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => setUploadOpen(true)}
        >
          <Upload className="size-4" /> Upload document
        </Button>
      </div>

      {documents && documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description={EMPTY_HINT[entityType] ?? EMPTY_HINT.default}
          action={
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="size-4" /> Upload document
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {documents?.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-hairline bg-white p-3"
            >
              <span
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-xl',
                  isImage(doc) ? 'bg-blue-50 text-blue-600' : 'bg-admin-50 text-admin-600',
                )}
              >
                {isImage(doc) ? <FileImage className="size-5" /> : <FileText className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {doc.file_name ?? doc.file_url}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {documentLabel(doc)} · {formatSize(doc.file_size)} ·{' '}
                  {formatDate(doc.uploaded_at)}
                  {doc.notes ? ` · ${doc.notes}` : ''}
                </p>
              </div>
              {/* full width on a phone, so it wraps under the name instead of
                  squeezing it down to a few characters */}
              <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                {doc.is_public && <Badge tone="green">Public</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="View document"
                  onClick={() => setViewing(doc)}
                >
                  <Eye className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete document"
                  onClick={() => setDeleteId(doc.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {uploadOpen && (
        <UploadDialog
          entityType={entityType}
          entityId={entityId}
          uploadedBy={userId}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {viewing && (
        <DocumentViewer
          doc={viewing}
          documents={documents ?? []}
          onSelect={setViewing}
          onClose={() => setViewing(null)}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete document"
        message="This removes the document and its uploaded file from this record. It cannot be undone."
        confirmLabel="Delete document"
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) await documentRepository.remove(deleteId);
          setDeleteId(null);
        }}
      />
    </>
  );
}

function UploadDialog({
  entityType,
  entityId,
  uploadedBy,
  onClose,
}: {
  entityType: EntityType;
  entityId: string;
  uploadedBy: string;
  onClose: () => void;
}) {
  const [documentType, setDocumentType] = useState('');
  const [customName, setCustomName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const typeOptions = useLiveQuery(
    () => lookupRepository.options('document_type', entityType),
    [entityType],
  );

  function pickFile(picked: File | undefined) {
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      setError('Only PDF, PNG, JPG or WEBP files are accepted');
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError(`"${picked.name}" is ${formatSize(picked.size)} — the limit is 5 MB`);
      return;
    }
    setError('');
    setFile(picked);
  }

  async function save() {
    if (!documentType) {
      setError('Pick a document type');
      return;
    }
    if (documentType === 'other' && !customName.trim()) {
      setError('Give this document a name');
      return;
    }
    if (!file) {
      setError('Choose a file to upload');
      return;
    }

    setSaving(true);
    try {
      await documentRepository.create({
        entity_type: entityType,
        entity_id: entityId,
        document_type: documentType,
        custom_type_name: documentType === 'other' ? customName.trim() : null,
        file_url: file.name,
        file_data: file,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        is_public: isPublic,
        uploaded_by: uploadedBy,
        uploaded_at: new Date().toISOString(),
        notes: notes.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Upload Document"
      subtitle="Stored in this browser for the demo — Phase B moves files to real storage."
      icon={UploadCloud}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Uploading…' : 'Upload'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Document Type" required>
          <SelectInput value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            <option value="">Select document type…</option>
            {typeOptions?.map((o) => (
              <option key={o.id} value={o.value}>
                {humanize(o.value)}
              </option>
            ))}
          </SelectInput>
        </Field>

        {/* "Other" needs a name, otherwise the list shows a row of identical entries */}
        {documentType === 'other' && (
          <Field label="Document Name" required>
            <TextInput
              value={customName}
              placeholder="e.g. Boundary survey report"
              onChange={(e) => setCustomName(e.target.value)}
            />
          </Field>
        )}

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">
            File<span className="ml-0.5 text-red-500">*</span>
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files[0]);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-hairline bg-white px-4 py-8 text-center transition-colors hover:border-admin-300 hover:bg-admin-50/40"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-admin-50 text-admin-600">
              <UploadCloud className="size-5" />
            </span>
            {file ? (
              <>
                <span className="text-sm font-medium text-ink">{file.name}</span>
                <span className="text-xs text-ink-muted">
                  {formatSize(file.size)} · click to choose a different file
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-ink">
                  Drop a file here, or click to browse
                </span>
                <span className="text-xs text-ink-muted">PDF, PNG, JPG, WEBP · max 5 MB</span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        <Checkbox
          label="Visible on the public website"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />

        <Field label="Notes">
          <TextArea
            value={notes}
            placeholder="e.g. Certified copy collected from the sub-registry office"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Large preview with a sidebar to flip between the record's documents. */
function DocumentViewer({
  doc,
  documents,
  onSelect,
  onClose,
}: {
  doc: DocumentRecord;
  documents: DocumentRecord[];
  onSelect: (doc: DocumentRecord) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  // Read the stored blob into a data URL. An object URL would be simpler, but
  // it gets revoked by React's double-invoked effects in development and the
  // preview then shows a broken file.
  useEffect(() => {
    if (!doc.file_data) return;
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled) setUrl(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(doc.file_data);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [doc]);

  return (
    <Modal
      open
      title={doc.file_name ?? doc.file_url}
      subtitle={`${documentLabel(doc)} · ${formatSize(doc.file_size)} · uploaded ${formatDate(doc.uploaded_at)}`}
      icon={isImage(doc) ? FileImage : FileText}
      size="xl"
      onClose={onClose}
      footer={
        <>
          {url && (
            <a href={url} download={doc.file_name ?? doc.file_url}>
              <Button variant="outline">
                <Download className="size-4" /> Download
              </Button>
            </a>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <ul className="order-2 space-y-1.5 lg:order-1">
          {documents.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                  d.id === doc.id
                    ? 'border-admin-300 bg-admin-50 text-admin-700'
                    : 'border-hairline bg-white text-ink-muted hover:bg-admin-50/50',
                )}
              >
                {isImage(d) ? (
                  <FileImage className="size-4 shrink-0" />
                ) : (
                  <FileText className="size-4 shrink-0" />
                )}
                <span className="truncate">{d.file_name ?? d.file_url}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="order-1 min-h-[60vh] overflow-hidden rounded-xl border border-hairline bg-white lg:order-2">
          {!url ? (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-ink-muted">
              No file stored for this document.
            </div>
          ) : isImage(doc) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={doc.file_name ?? 'Document'} className="mx-auto max-h-[60vh]" />
          ) : (
            <iframe src={url} title={doc.file_name ?? 'Document'} className="h-[60vh] w-full" />
          )}
        </div>
      </div>
    </Modal>
  );
}
