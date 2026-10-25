'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import type { PublicImage } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { SiteImage } from '../SiteImage';

/**
 * Cover first, then the public gallery pictures; a stock photo when there are
 * none. Click any picture for a full-screen viewer (← → and Esc work).
 */
export function ProjectGallery({
  images,
  fallback,
  name,
}: {
  images: PublicImage[];
  fallback: string;
  name: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const list: (PublicImage | null)[] = images.length ? images : [null];
  const count = list.length;

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % count));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + count) % count));
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, count]);

  const [first, ...rest] = list;
  const side = rest.slice(0, 4);

  return (
    <>
      <div className={cn('grid gap-3', side.length > 0 && 'md:grid-cols-[2fr_1fr]')}>
        <button type="button" onClick={() => setOpen(0)} className="group relative overflow-hidden rounded-2xl">
          <SiteImage
            image={first}
            fallback={fallback}
            alt={name}
            className="aspect-16/10 w-full transition-transform duration-700 group-hover:scale-[1.03] md:aspect-auto md:h-[460px]"
          />
          {count > 1 && (
            <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-site-ink shadow">
              <Images className="size-4" /> {count} photos
            </span>
          )}
        </button>
        {side.length > 0 && (
          <div className="hidden grid-cols-2 gap-3 md:grid">
            {side.map((img, i) => (
              <button
                key={img?.kind === 'blob' ? img.id : i}
                type="button"
                onClick={() => setOpen(i + 1)}
                className={cn('group relative overflow-hidden rounded-2xl', side.length < 3 && 'col-span-2')}
              >
                <SiteImage
                  image={img}
                  fallback={fallback}
                  alt={name}
                  className="size-full min-h-[110px] transition-transform duration-700 group-hover:scale-105"
                />
                {i === side.length - 1 && rest.length > side.length && (
                  <span className="absolute inset-0 grid place-items-center bg-slate-950/55 text-lg font-medium text-white">
                    +{rest.length - side.length} more
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {open !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label={`${name} photos`}>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(null)}
            className="absolute top-5 right-5 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
          {count > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => setOpen((open - 1 + count) % count)}
                className="absolute left-4 grid size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => setOpen((open + 1) % count)}
                className="absolute right-4 grid size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
          <SiteImage
            key={open}
            image={list[open]}
            fallback={fallback}
            alt={name}
            className="h-[80vh] w-full max-w-5xl rounded-xl bg-transparent [&_img]:object-contain"
          />
          <p className="absolute bottom-5 text-sm text-white/70 tabular-nums">
            {open + 1} / {count}
          </p>
        </div>
      )}
    </>
  );
}
