'use client';

import { useRef } from 'react';
import { FileImage, FileText, Paperclip, X } from 'lucide-react';
import {
  ACCEPTED_UPLOAD_LABEL,
  ACCEPTED_UPLOAD_TYPES,
  formatFileSize,
  rejectUpload,
} from '@/lib/domain/file-upload';

/**
 * Attach evidence at the moment a workflow step is confirmed (client feedback,
 * 2026-09-14).
 *
 * The Documents tab is the vault and stays exactly as it is. What it could not
 * do is catch paperwork at the moment it turns up: the surveyor comes back from
 * the plot with twenty photos and the only way to store them was to close the
 * step dialog, find the Documents tab and upload them one at a time, choosing
 * the type each time. So they stayed on the phone.
 *
 * This takes several files at once and files them under a type the step already
 * knows, which is why there is no Document Type dropdown here. It is deliberately
 * generic — it holds `File` objects and nothing else, so the land pipeline, the
 * project pipeline and the material-request pipeline can all mount it and each
 * decide what to do on save.
 */
export function StepAttachments({
  files,
  onChange,
  prompt,
  error,
  onError,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  /** what this step invites the user to attach */
  prompt: string;
  error?: string;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function add(picked: FileList | null) {
    if (!picked?.length) return;
    const accepted: File[] = [];
    for (const file of Array.from(picked)) {
      const rejection = rejectUpload(file);
      if (rejection) {
        onError(rejection);
        continue;
      }
      /*
       * Picking the same file twice is a misclick, not an instruction to store
       * it twice — and the browser file dialog makes it easy, because it
       * reopens showing the folder you just picked from.
       */
      const duplicate = files.some((f) => f.name === file.name && f.size === file.size);
      if (!duplicate) accepted.push(file);
    }
    if (accepted.length) {
      onError('');
      onChange([...files, ...accepted]);
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">Attachments</span>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
        className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-hairline bg-white px-4 py-5 text-center transition-colors hover:border-admin-300 hover:bg-admin-50/40"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-admin-50 text-admin-600">
          <Paperclip className="size-4" />
        </span>
        <span className="text-sm font-medium text-ink">
          {files.length ? 'Add more files' : 'Drop files here, or click to browse'}
        </span>
        <span className="text-xs text-ink-muted">{prompt}</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_UPLOAD_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          // so picking the same file again after removing it still fires onChange
          e.target.value = '';
        }}
      />

      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2"
            >
              {file.type.startsWith('image/') ? (
                <FileImage className="size-4 shrink-0 text-admin-600" />
              ) : (
                <FileText className="size-4 shrink-0 text-admin-600" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{file.name}</span>
              <span className="shrink-0 text-xs text-ink-muted">{formatFileSize(file.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, index) => index !== i))}
                className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-xs text-ink-muted">
        {files.length
          ? `${files.length} file${files.length === 1 ? '' : 's'} will be uploaded when you confirm · ${ACCEPTED_UPLOAD_LABEL}`
          : `Optional · ${ACCEPTED_UPLOAD_LABEL}`}
      </p>

      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}
