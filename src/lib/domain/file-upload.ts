/**
 * What the app accepts as an uploaded file, in one place.
 *
 * These limits used to live inside `DocumentsPanel`. A second uploader now
 * exists — the one in a pipeline-step dialog (client feedback, 2026-09-14) —
 * and two components each holding their own idea of "5 MB, PDF or image" is
 * how one of them quietly starts accepting something the other rejects.
 *
 * Phase A keeps the file itself in IndexedDB as a Blob so the demo can preview
 * it, which is the real reason for the ceiling: a browser database is not a
 * document store. Phase B moves files to S3-compatible storage and the limit
 * becomes a policy decision rather than a technical one.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_UPLOAD_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const ACCEPTED_UPLOAD_LABEL = 'PDF, PNG, JPG or WEBP up to 5 MB';

export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `null` when the file is fine, otherwise the sentence to show the user. */
export function rejectUpload(file: File): string | null {
  if (!(ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}" is not a PDF or an image — only PDF, PNG, JPG and WEBP can be uploaded`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `"${file.name}" is ${formatFileSize(file.size)} — the limit is 5 MB`;
  }
  return null;
}
