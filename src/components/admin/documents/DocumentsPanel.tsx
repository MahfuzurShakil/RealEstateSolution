'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, FileText, Trash2, Upload, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox, Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DocRow, FileDropZone, FileViewer, type ViewerFile } from './DocumentParts';
import { WEBSITE_ENTITIES, WebsiteToggle } from './WebsiteToggle';
import { useMockSession } from '@/lib/auth/mock-session';
import type { DocumentRecord, EntityType } from '@/lib/db/types';
import { documentRepository, lookupRepository } from '@/lib/repositories';
import { rejectUpload, formatFileSize } from '@/lib/domain/file-upload';
import { formatDate, humanize } from '@/lib/utils/format';

/*
 * PDF or image, up to 5 MB (feedback #5). The limits live in
 * `lib/domain/file-upload.ts`, and the row, drop zone and viewer in
 * DocumentParts, shared with the share and booking papers (feedback D3).
 */
const formatSize = formatFileSize;

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
  share_offering: 'Upload the valuation report, the board resolution approving the offer, or the offer document shown to customers.',
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
            <DocRow
              key={doc.id}
              title={doc.file_name ?? doc.file_url}
              mime={doc.mime_type}
              meta={`${documentLabel(doc)} · ${formatSize(doc.file_size)} · ${formatDate(doc.uploaded_at)}${doc.notes ? ` · ${doc.notes}` : ''}`}
              actions={
                <>
                  {WEBSITE_ENTITIES.includes(entityType) && <WebsiteToggle id={doc.id} isPublic={doc.is_public} />}
                  <Button variant="ghost" size="sm" aria-label="View document" viewSafe onClick={() => setViewing(doc)}>
                    <Eye className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Delete document" onClick={() => setDeleteId(doc.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              }
            />
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

  const typeOptions = useLiveQuery(
    () => lookupRepository.options('document_type', entityType),
    [entityType],
  );

  function pickFile(picked: File | undefined) {
    if (!picked) return;
    const rejected = rejectUpload(picked);
    if (rejected) {
      setError(rejected);
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
          <Button variant="outline" onClick={onClose} viewSafe disabled={saving}>
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

        <FileDropZone file={file} onPick={pickFile} />

        {WEBSITE_ENTITIES.includes(entityType) && (
          <Checkbox
            label="Visible on the public website"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
        )}

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

/** A stored document as the shared viewer reads it. */
function viewerFile(doc: DocumentRecord): ViewerFile {
  return {
    id: doc.id,
    name: doc.file_name ?? doc.file_url,
    mime: doc.mime_type,
    subtitle: `${documentLabel(doc)} · ${formatSize(doc.file_size)} · uploaded ${formatDate(doc.uploaded_at)}`,
    load: async () => doc.file_data ?? null,
  };
}

/** Large preview with a sidebar to flip between the record's documents (the shared FileViewer). */
export function DocumentViewer({
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
  const files = documents.map(viewerFile);
  return (
    <FileViewer
      file={viewerFile(doc)}
      // a single document still shows the list, as it always has
      files={files.length ? files : [viewerFile(doc)]}
      onSelect={(f) => {
        const next = documents.find((d) => d.id === f.id);
        if (next) onSelect(next);
      }}
      onClose={onClose}
    />
  );
}
