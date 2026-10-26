'use client';

import { useEffect, useRef, useState, ViewTransition } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import type { PublicImage } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';
import { SiteImage } from '../SiteImage';

const t = en.detail.gallery;

/**
 * Mosaic of the cover and public gallery photos (master plan §7.3 #1) and a
 * full-screen viewer: ← → Esc, swipe on phones, a thumbnail strip, focus on the
 * close button. The first photo carries the card's view-transition name, so
 * opening a project from a card morphs its photo into this one.
 */
export function ProjectGallery({ images, fallback, name, code }: { images: PublicImage[]; fallback: string; name: string; code: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const list: (PublicImage | null)[] = images.length ? images : [null];
  const count = list.length;
  const step = (d: number) => setOpen((i) => (i === null ? i : (i + d + count) % count));

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step only closes over count
  }, [open === null, count]);

  const [first, ...rest] = list;
  const side = rest.slice(0, 4);

  return (
    <>
      <div className={cn('grid gap-3', side.length > 0 && 'md:grid-cols-[2fr_1fr]')}>
        <button type="button" onClick={() => setOpen(0)} className="group relative overflow-hidden rounded-[20px]" aria-label={t.open(count)}>
          <ViewTransition name={`cover-${code}`} share="morph" default="none">
            <SiteImage
              image={first}
              fallback={fallback}
              alt={name}
              className="aspect-16/10 w-full transition-transform duration-700 ease-site-out group-hover:scale-[1.03] md:aspect-auto md:h-[480px]"
            />
          </ViewTransition>
          {count > 1 && (
            <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-site-ink shadow-site-2">
              <Images className="size-4" aria-hidden /> {t.photos(count)}
            </span>
          )}
        </button>
        {side.length > 0 && (
          <div className={cn('hidden gap-3 md:grid', side.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
            {side.map((img, i) => (
              <button
                key={img?.kind === 'blob' ? img.id : img?.kind === 'url' ? img.url : i}
                type="button"
                onClick={() => setOpen(i + 1)}
                aria-label={t.openAt(i + 2)}
                className={cn('group relative overflow-hidden rounded-[20px]', side.length === 3 && i === 0 && 'col-span-2')}
              >
                <SiteImage image={img} fallback={fallback} alt="" className="size-full min-h-[110px] transition-transform duration-700 ease-site-out group-hover:scale-105" />
                {i === side.length - 1 && rest.length > side.length && (
                  <span className="absolute inset-0 grid place-items-center bg-site-night/55 text-lg font-semibold text-white">+{rest.length - side.length}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {open !== null &&
        createPortal(
          <div
            className="site fixed inset-0 z-[70] flex flex-col bg-site-night-deep/95 font-site motion-safe:animate-[site-fade-in_.2s_ease-out]"
            role="dialog"
            aria-modal="true"
            aria-label={t.viewer(name)}
            onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchX.current == null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
              touchX.current = null;
            }}
          >
            <div className="flex items-center justify-between p-4 text-white">
              <p className="tabular text-sm text-white/70">
                {open + 1} / {count}
              </p>
              <button ref={closeBtn} type="button" aria-label={t.close} onClick={() => setOpen(null)} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                <X className="size-5" />
              </button>
            </div>
            <div className="relative flex flex-1 items-center justify-center px-4">
              {count > 1 && (
                <button type="button" aria-label={t.prev} onClick={() => step(-1)} className="absolute left-4 z-10 hidden size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid">
                  <ChevronLeft className="size-6" />
                </button>
              )}
              <SiteImage
                key={open}
                image={list[open]}
                fallback={fallback}
                alt={list[open]?.alt ?? name}
                className="h-[70vh] w-full max-w-5xl bg-transparent motion-safe:animate-[site-fade-in_.3s_ease-out] [&_img]:object-contain"
              />
              {count > 1 && (
                <button type="button" aria-label={t.next} onClick={() => step(1)} className="absolute right-4 z-10 hidden size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid">
                  <ChevronRight className="size-6" />
                </button>
              )}
            </div>
            {count > 1 && (
              <div className="flex justify-center gap-2 overflow-x-auto p-4">
                {list.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={t.openAt(i + 1)}
                    aria-current={i === open}
                    onClick={() => setOpen(i)}
                    className={cn('shrink-0 overflow-hidden rounded-lg ring-2 transition-[opacity,box-shadow]', i === open ? 'opacity-100 ring-site-brass' : 'opacity-50 ring-transparent hover:opacity-80')}
                  >
                    <SiteImage image={img} fallback={fallback} alt="" className="h-14 w-20" />
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.getElementById('site-root') ?? document.body,
        )}
    </>
  );
}
