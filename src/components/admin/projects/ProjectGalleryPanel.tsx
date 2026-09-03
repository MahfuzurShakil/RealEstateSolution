'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Globe, ImageIcon, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBlobUrl } from '@/components/ui/useBlobUrl';
import type { DocumentRecord, Project } from '@/lib/db/types';
import { documentRepository, projectRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';

/**
 * The project's pictures, and which one the website leads with.
 *
 * The pieces were already here and not joined up: `gallery_image` is a project
 * document type (Section 3.7), `documents.is_public` is what puts a file on the
 * Public Portal (P2), and uploads already accept images. What was missing is
 * that the only way to set a display picture was to paste a URL into the
 * project form — so a developer who had uploaded ten photos of the site still
 * had no way to say "this one goes on the website first", and could not see
 * any of them without opening the Documents tab one file at a time.
 *
 * Upload stays in the Documents tab, which is where every module puts files.
 * This is the view over the subset that is pictures.
 */
export function ProjectGalleryPanel({ project }: { project: Project }) {
  const documents = useLiveQuery(
    () => documentRepository.listForEntity('project', project.id),
    [project.id],
  );

  const pictures = (documents ?? []).filter(
    (doc) => doc.document_type === 'gallery_image' || doc.mime_type?.startsWith('image/'),
  );

  if (documents === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  if (pictures.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No pictures yet"
        description="Upload photos on the Documents tab with the type “Gallery Image”. Mark the ones the public website may show, then pick which one it leads with."
      />
    );
  }

  const publicCount = pictures.filter((p) => p.is_public).length;

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {pictures.map((picture) => (
          <PictureTile
            key={picture.id}
            picture={picture}
            isDisplay={project.cover_image_document_id === picture.id}
            onUseAsDisplay={() =>
              projectRepository.update(project.id, {
                cover_image_document_id: picture.id,
                // the uploaded picture wins, so a stale pasted URL cannot
                // quietly keep being the one the website shows
                cover_image_url: null,
              })
            }
          />
        ))}
      </div>

      <p className="text-xs text-ink-muted">
        {publicCount === 0
          ? 'None of these are marked public yet, so the website will show none of them. Tick “Show on the public website” on the Documents tab.'
          : `${publicCount} of ${pictures.length} may be shown on the public website. The display picture is the one it leads with; the rest form the gallery.`}
        {project.cover_image_url && !project.cover_image_document_id && (
          <>
            {' '}
            The display picture is currently an external link set on the project form — choosing one
            here replaces it.
          </>
        )}
      </p>
    </div>
  );
}

function PictureTile({
  picture,
  isDisplay,
  onUseAsDisplay,
}: {
  picture: DocumentRecord;
  isDisplay: boolean;
  onUseAsDisplay: () => void;
}) {
  const url = useBlobUrl(picture.file_data);

  return (
    <figure
      className={cn(
        'overflow-hidden rounded-xl border bg-white',
        isDisplay ? 'border-admin-400 ring-2 ring-admin-100' : 'border-hairline',
      )}
    >
      <div className="grid h-32 place-items-center bg-canvas">
        {url ? (
          // the blob is local to this browser; next/image adds nothing here
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={picture.file_name ?? 'Project picture'}
            className="h-32 w-full object-cover"
          />
        ) : (
          <ImageIcon className="size-6 text-slate-300" />
        )}
      </div>

      <figcaption className="space-y-2 p-3">
        <p className="truncate text-xs text-ink" title={picture.file_name ?? undefined}>
          {picture.file_name ?? 'Untitled'}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {isDisplay ? (
            <Badge tone="teal">
              <Star className="size-3.5" /> Display picture
            </Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={onUseAsDisplay}>
              Use as display
            </Button>
          )}
          {picture.is_public ? (
            <Badge tone="green">
              <Globe className="size-3.5" /> Public
            </Badge>
          ) : (
            <Badge tone="neutral">Internal</Badge>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
