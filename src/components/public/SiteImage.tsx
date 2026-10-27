'use client';

import { useBlobUrl } from '@/components/ui/useBlobUrl';
import { cn } from '@/lib/utils/cn';
import type { PublicImage } from '@/lib/repositories/public/project.public.repository';

/**
 * A project picture from the public repository. When the project has none
 * yet, `fallback` (a stock photo for its type) stands in, so a card is never
 * an empty box. Lazy by default (master plan §9: lazy below the fold); pass
 * `eager` for the one picture a page opens on, so it is not held back.
 */
export function SiteImage({
  image,
  fallback,
  alt,
  className,
  eager = false,
}: {
  image: PublicImage | null;
  fallback: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const blobUrl = useBlobUrl(image?.kind === 'blob' ? image.blob : null);
  const src = image?.kind === 'url' ? image.url : image?.kind === 'blob' ? blobUrl : fallback;

  return (
    <div className={cn('overflow-hidden bg-site-line', className)}>
      {src && (
        // a data: URL from IndexedDB or a hosted image; next/image cannot optimise either
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={image?.alt ?? alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : undefined}
          className="size-full object-cover"
        />
      )}
    </div>
  );
}
