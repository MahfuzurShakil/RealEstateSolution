'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, FileImage, FileText, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ACCEPTED_UPLOAD_TYPES, formatFileSize, isVideoType } from '@/lib/domain/file-upload';
import { cn } from '@/lib/utils/cn';

/*
 * The one way a paper is shown, uploaded and opened across the admin
 * (SHARE-SALE-FEEDBACK-PLAN.md D3): the Documents tab of a land, project or
 * supplier, a share purchase's papers, a booking's papers and the customer
 * file all use these pieces, so uploading and viewing work the same
 * everywhere.
 */

export const isImageType = (mime?: string | null) => Boolean(mime?.startsWith('image/'));

/** One paper in a list: a file icon, its name and details, then its actions on the right. */
export function DocRow({
  title,
  meta,
  mime,
  missing,
  badge,
  actions,
  footer,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  mime?: string | null;
  /** nothing on file yet: a grey icon */
  missing?: boolean;
  badge?: ReactNode;
  actions?: ReactNode;
  /** a line under the row, e.g. why a file was sent back */
  footer?: ReactNode;
  className?: string;
}) {
  const image = isImageType(mime);
  return (
    <li className={cn('rounded-xl border border-hairline bg-white p-3', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl',
            missing ? 'bg-slate-100 text-slate-400' : image ? 'bg-blue-50 text-blue-600' : 'bg-admin-50 text-admin-600',
          )}
        >
          {image ? <FileImage className="size-5" /> : <FileText className="size-5" />}
        </span>
        <div className="min-w-[12rem] flex-1 basis-48">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            <span className="min-w-0 truncate">{title}</span>
            {badge && <span className="shrink-0 whitespace-nowrap">{badge}</span>}
          </p>
          {meta && <p className="mt-0.5 truncate text-xs text-ink-muted">{meta}</p>}
        </div>
        {/* wraps under the name when the row is narrow, instead of squeezing it */}
        {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-1">{actions}</div>}
      </div>
      {footer && <div className="mt-2 border-t border-hairline pt-2 text-sm">{footer}</div>}
    </li>
  );
}

/** The drop area of every upload dialog. */
export function FileDropZone({ file, onPick, hint = 'PDF, PNG, JPG, WEBP · max 5 MB' }: { file: File | null; onPick: (file: File | undefined) => void; hint?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
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
          onPick(e.dataTransfer.files[0]);
        }}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-hairline bg-white px-4 py-8 text-center transition-colors hover:border-admin-300 hover:bg-admin-50/40"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-admin-50 text-admin-600">
          <UploadCloud className="size-5" />
        </span>
        {file ? (
          <>
            <span className="text-sm font-medium text-ink">{file.name}</span>
            <span className="text-xs text-ink-muted">{formatFileSize(file.size)} · click to choose a different file</span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-ink">Drop a file here, or click to browse</span>
            <span className="text-xs text-ink-muted">{hint}</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_UPLOAD_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** A file the viewer can show: whatever table it lives in, it is read the same way. */
export interface ViewerFile {
  id: string;
  name: string;
  mime?: string | null;
  subtitle?: string;
  load: () => Promise<Blob | null | undefined>;
}

/** Large preview with a sidebar to flip between the files of one record. */
export function FileViewer({ file, files, onSelect, onClose }: { file: ViewerFile; files: ViewerFile[]; onSelect: (f: ViewerFile) => void; onClose: () => void }) {
  // what was read, and for which file — a stale read never shows under another file's name
  const [read, setRead] = useState<{ id: string; url: string | null; mime: string | null } | null>(null);
  const current = read?.id === file.id ? read : null;
  const url = current?.url ?? null;
  const mime = current?.mime ?? file.mime ?? null;
  const missing = !!current && !current.url;

  // Read the stored blob into a data URL. An object URL would be simpler, but
  // it gets revoked by React's double-invoked effects in development and the
  // preview then shows a broken file.
  useEffect(() => {
    let cancelled = false;
    const reader = new FileReader();
    void file.load().then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setRead({ id: file.id, url: null, mime: null });
        return;
      }
      reader.onload = () => {
        if (!cancelled) setRead({ id: file.id, url: typeof reader.result === 'string' ? reader.result : null, mime: file.mime || blob.type || null });
      };
      reader.readAsDataURL(blob);
    });
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [file]);

  return (
    <Modal
      open
      title={file.name}
      subtitle={file.subtitle}
      icon={isImageType(mime) ? FileImage : FileText}
      size="xl"
      onClose={onClose}
      footer={
        <>
          {url && (
            <a href={url} download={file.name}>
              <Button variant="outline" viewSafe>
                <Download className="size-4" /> Download
              </Button>
            </a>
          )}
          <Button onClick={onClose} viewSafe>
            Close
          </Button>
        </>
      }
    >
      <div className={cn('grid gap-4', files.length > 1 && 'lg:grid-cols-[220px_1fr]')}>
        {files.length > 1 && (
          <ul className="order-2 space-y-1.5 lg:order-1">
            {files.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSelect(f)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                    f.id === file.id ? 'border-admin-300 bg-admin-50 text-admin-700' : 'border-hairline bg-white text-ink-muted hover:bg-admin-50/50',
                  )}
                >
                  {isImageType(f.mime) ? <FileImage className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
                  <span className="truncate">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="order-1 min-h-[60vh] overflow-hidden rounded-xl border border-hairline bg-white lg:order-2">
          {!url ? (
            <div className="grid h-full min-h-[60vh] place-items-center p-8 text-center text-sm text-ink-muted">{missing ? 'No file stored for this document.' : 'Loading the file…'}</div>
          ) : isImageType(mime) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="mx-auto max-h-[60vh]" />
          ) : isVideoType(mime) ? (
            <video src={url} controls className="mx-auto max-h-[60vh] w-full bg-black" />
          ) : (
            <iframe src={url} title={file.name} className="h-[60vh] w-full" />
          )}
        </div>
      </div>
    </Modal>
  );
}
