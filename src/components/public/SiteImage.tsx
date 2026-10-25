'use client';

import { Building2 } from 'lucide-react';
import { useBlobUrl } from '@/components/ui/useBlobUrl';
import { cn } from '@/lib/utils/cn';
import type { PublicImage } from '@/lib/repositories/public/project.public.repository';

/**
 * A project picture from the public repository, or a drawn placeholder when
 * the project has none yet. The placeholder is deliberate rather than a stock
 * photo: a stranger's building on a real project's card would be a claim.
 */
export function SiteImage({ image, className }: { image: PublicImage | null; className?: string }) {
  const blobUrl = useBlobUrl(image?.kind === 'blob' ? image.blob : null);
  const src = image?.kind === 'url' ? image.url : blobUrl;

  if (!image) {
    return (
      <div
        className={cn(
          'grid place-items-center bg-linear-to-br from-site-moss via-site-forest to-site-forest-deep',
          className,
        )}
        aria-hidden
      >
        <Building2 className="size-10 text-site-brass-light/60" strokeWidth={1.25} />
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden bg-site-stone', className)}>
      {src && (
        // a data: URL from IndexedDB or a hosted image the admin typed in; next/image cannot optimise either
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={image.alt} className="size-full object-cover" />
      )}
    </div>
  );
}
