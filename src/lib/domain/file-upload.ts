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

/*
 * Video joined in L7 for BRD SITE-001 ("photos, video and GPS"). A walk of the
 * boundary on a phone says more than twenty photos, and it is larger, so video
 * has its own ceiling.
 */
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export const ACCEPTED_UPLOAD_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  ...ACCEPTED_VIDEO_TYPES,
] as const;

export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_UPLOAD_LABEL = 'PDF or image up to 5 MB, video (MP4, WEBM, MOV) up to 25 MB';

export function isVideoType(type?: string | null): boolean {
  return Boolean(type?.startsWith('video/'));
}

/** The size ceiling for a file of this type. */
export function maxBytesFor(type: string): number {
  return isVideoType(type) ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `null` when the file is fine, otherwise the sentence to show the user. */
export function rejectUpload(file: File): string | null {
  if (!(ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}" cannot be uploaded — only PDF, PNG, JPG, WEBP, MP4, WEBM and MOV are accepted`;
  }
  if (file.size > maxBytesFor(file.type)) {
    return `"${file.name}" is ${formatFileSize(file.size)} — the limit is ${formatFileSize(maxBytesFor(file.type))}`;
  }
  return null;
}
