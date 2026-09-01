'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Eye, EyeOff, ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { useBlobUrl } from '@/components/ui/useBlobUrl';
import type { DocumentRecord } from '@/lib/db/types';
import { projectProgressRepository } from '@/lib/repositories';
import { formatDate } from '@/lib/utils/format';

function Thumb({
  doc,
  onOpen,
}: {
  doc: DocumentRecord;
  onOpen: () => void;
}) {
  const url = useBlobUrl(doc.file_data);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-4/3 w-full overflow-hidden rounded-xl border border-hairline bg-slate-100"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: URL from IndexedDB, not a remote asset next/image can optimise
        <img
          src={url}
          alt={doc.file_name ?? 'Site photo'}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <span className="grid size-full place-items-center text-slate-400">
          <ImageIcon className="size-6" />
        </span>
      )}

      {/* internal photos must be obvious at a glance — one of these is going
          on the public website and the other is not (Section 6.7) */}
      <span className="absolute left-2 top-2">
        <Badge tone={doc.is_public ? 'green' : 'neutral'}>
          {doc.is_public ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
          {doc.is_public ? 'Public' : 'Internal'}
        </Badge>
      </span>
    </button>
  );
}

/** Full-size viewer for one photo. */
function Viewer({
  entry,
  onClose,
}: {
  entry: { document: DocumentRecord; update?: { id: string; update_date: string; remarks?: string | null }; label: string };
  onClose: () => void;
}) {
  const url = useBlobUrl(entry.document.file_data);

  return (
    <Modal
      open
      title={entry.label}
      subtitle={
        entry.update
          ? `${formatDate(entry.update.update_date)}${entry.update.remarks ? ` · ${entry.update.remarks}` : ''}`
          : formatDate(entry.document.uploaded_at)
      }
      icon={Camera}
      size="xl"
      onClose={onClose}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- see Thumb
        <img
          src={url}
          alt={entry.document.file_name ?? 'Site photo'}
          className="mx-auto max-h-[70vh] w-auto rounded-xl"
        />
      ) : (
        <p className="text-sm text-ink-muted">Loading photo…</p>
      )}

      {entry.update && (
        <Link
          href={`/admin/site-progress/updates/${entry.update.id}`}
          className="mt-4 inline-block text-sm text-admin-700 hover:underline"
        >
          Open the progress update this photo belongs to →
        </Link>
      )}
    </Modal>
  );
}

/**
 * Every site photo of a project, newest month first.
 *
 * Photos are what management and buyers actually look at, and one-per-reading
 * they were effectively unfindable — you had to already know which day
 * something was photographed. Grouping by month is how site photography is
 * filed on a real project.
 */
export function ProgressPhotoGallery({ projectId }: { projectId: string }) {
  const [viewing, setViewing] = useState<number | null>(null);

  const photos = useLiveQuery(() => projectProgressRepository.photos(projectId), [projectId]);

  const months = useMemo(() => {
    const map = new Map<string, Array<NonNullable<typeof photos>[number]>>();
    for (const entry of photos ?? []) {
      const month = (entry.update?.update_date ?? entry.document.uploaded_at).slice(0, 7);
      const list = map.get(month) ?? [];
      list.push(entry);
      map.set(month, list);
    }
    return [...map.entries()];
  }, [photos]);

  if (photos === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        title="No site photo yet"
        description="Photos attached to a progress update land here. Mark one public and it becomes the picture the project's page on the website shows."
      />
    );
  }

  const publicCount = photos.filter((p) => p.document.is_public).length;
  const flat = photos;

  return (
    <>
      <p className="mb-5 text-sm text-ink-muted">
        {photos.length} photo{photos.length === 1 ? '' : 's'} · {publicCount} visible on the public
        website
      </p>

      <div className="space-y-6">
        {months.map(([month, entries]) => (
          <section key={month}>
            <h3 className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', {
                month: 'long',
                year: 'numeric',
              })}
              <span className="h-px flex-1 bg-hairline" />
              <span className="font-normal normal-case tracking-normal">{entries.length}</span>
            </h3>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {entries.map((entry) => (
                <figure key={entry.document.id} className="min-w-0">
                  <Thumb
                    doc={entry.document}
                    onOpen={() => setViewing(flat.indexOf(entry))}
                  />
                  <figcaption className="mt-2 min-w-0">
                    <p className="truncate text-xs font-medium text-ink">
                      {entry.work_item?.name ?? 'Site photo'}
                    </p>
                    <p className="truncate text-[11px] text-ink-muted">
                      {entry.tower?.name}
                      {entry.update && ` · ${formatDate(entry.update.update_date)}`}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>

      {viewing !== null && flat[viewing] && (
        <Viewer
          entry={{
            document: flat[viewing].document,
            update: flat[viewing].update,
            label: `${flat[viewing].tower?.name ?? ''} ${flat[viewing].work_item?.name ?? 'Site photo'}`.trim(),
          }}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
