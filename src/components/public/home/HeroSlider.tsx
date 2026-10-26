'use client';

import { SalesBadge } from '@/components/public/ui/Badge';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarCheck, ChevronLeft, ChevronRight, KeyRound, MapPin, PhoneCall, Ruler } from 'lucide-react';
import { PUBLIC_STAGE_LABEL, formatPublicPrice } from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { Taka } from '../ProjectCard';
import { SiteImage } from '../SiteImage';
import { COVER_FALLBACK, HERO_IMAGE } from '../stock-images';

const INTERVAL_MS = 7000;

function handover(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Shown when nothing is published yet, so the page still opens on a picture. */
function BrandSlide({ companyName }: { companyName: string }) {
  return (
    <div className="relative z-10 max-w-2xl">
      <span className="inline-flex rounded-full bg-white/15 px-4 py-1.5 text-sm text-white backdrop-blur">
        {companyName}
      </span>
      <h1 className="mt-5 text-4xl leading-[1.1] font-bold text-white md:text-6xl">
        Find your next home <span className="text-site-primary">in Dhaka</span>
      </h1>
      <p className="mt-5 text-lg text-white/80 md:text-xl">
        Apartments, plots and land shares with clear papers, honest prices and progress you can follow.
      </p>
    </div>
  );
}

/**
 * The home page hero: one slide per project on sale, straight from the public
 * repository, so the banner changes the day a project is published. Featured
 * projects come first (the listing's own order).
 */
export function HeroSlider({
  cards,
  companyName,
  tel,
}: {
  cards: PublicProjectCard[];
  companyName: string;
  tel: string | null;
}) {
  const slides = cards.slice(0, 5);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const current = count ? Math.min(index, count - 1) : 0;

  const go = useCallback((to: number) => setIndex(((to % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = window.setTimeout(() => go(current + 1), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [current, count, paused, go]);

  const slide = slides[current];

  return (
    <section className="px-2 pt-2 md:px-4">
      <div
        className="relative isolate flex min-h-[620px] items-center overflow-hidden rounded-3xl bg-site-night pt-16 pb-64 md:min-h-[700px] md:pb-52"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(current + 1);
          if (e.key === 'ArrowLeft') go(current - 1);
        }}
        tabIndex={count > 1 ? 0 : undefined}
        aria-roledescription="carousel"
        aria-label="Projects on sale"
      >
        {/* backgrounds: every slide stays mounted and cross-fades, the showing one zooms slowly */}
        <div className="absolute inset-0 -z-10">
          {count === 0 ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote stock photo
            <img src={HERO_IMAGE} alt="" className="size-full object-cover" />
          ) : (
            slides.map((s, i) => (
              <div
                key={s.code}
                aria-hidden={i !== current}
                className={cn(
                  'absolute inset-0 transition-opacity duration-1000',
                  i === current ? 'opacity-100' : 'opacity-0',
                )}
              >
                <SiteImage
                  image={s.cover}
                  fallback={COVER_FALLBACK[s.project_type]}
                  alt={s.name}
                  className={cn(
                    'size-full',
                    i === current && 'motion-safe:animate-[site-kenburns_9s_ease-out_forwards]',
                  )}
                />
              </div>
            ))
          )}
          <div className="absolute inset-0 bg-linear-to-r from-slate-950/90 via-slate-950/60 to-slate-950/20" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-slate-950/70 to-transparent" />
        </div>

        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_300px]">
          {!slide ? (
            <BrandSlide companyName={companyName} />
          ) : (
            <div key={slide.code} className="relative z-10 max-w-2xl motion-safe:animate-[fade-up_.7s_ease-out]">
              <div className="flex flex-wrap items-center gap-2">
                <SalesBadge badge={slide.sales_badge} className="px-3.5 text-sm" />
                <span className="rounded-full bg-white/15 px-3.5 py-1 text-sm text-white backdrop-blur">
                  {slide.type_label} · {PUBLIC_STAGE_LABEL[slide.stage]}
                </span>
              </div>
              <h1 className="mt-5 text-4xl leading-[1.08] font-bold text-white md:text-6xl">{slide.name}</h1>
              {slide.location_summary && (
                <p className="mt-4 flex items-start gap-2 text-lg text-white/85">
                  <MapPin className="mt-1 size-5 shrink-0 text-site-primary" /> {slide.location_summary}
                </p>
              )}

              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-white/85">
                {slide.size_range && (
                  <li className="flex items-center gap-2">
                    <Ruler className="size-4.5 text-site-primary" /> {slide.size_range}
                  </li>
                )}
                {slide.total_count > 0 && (
                  <li className="flex items-center gap-2">
                    <KeyRound className="size-4.5 text-site-primary" /> {slide.available_count}{' '}
                    {slide.available_count === 1 ? slide.item_label_singular : slide.item_label} available
                  </li>
                )}
                {handover(slide.expected_completion_date) && (
                  <li className="flex items-center gap-2">
                    <CalendarCheck className="size-4.5 text-site-primary" /> Handover{' '}
                    {handover(slide.expected_completion_date)}
                  </li>
                )}
              </ul>

              <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-6">
                {slide.price_from && (
                  <div>
                    <p className="text-sm tracking-wide text-white/60 uppercase">Starting from</p>
                    <p className="text-3xl font-bold text-white md:text-4xl">
                      <Taka text={formatPublicPrice(slide.price_from)} />
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/projects/${encodeURIComponent(slide.code)}`}
                    className="flex items-center gap-2 rounded-full bg-site-primary px-6 py-3 font-medium text-white shadow-lg shadow-site-primary/30 transition-colors hover:bg-site-primary-dark"
                  >
                    Explore project <ArrowRight className="size-4.5" />
                  </Link>
                  {tel && (
                    <a
                      href={tel}
                      className="flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
                    >
                      <PhoneCall className="size-4.5" /> Book a site visit
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* side rail: the other projects, so a visitor sees there is more than one */}
          {count > 1 && (
            <ul className="hidden space-y-3 lg:block">
              {slides.map((s, i) => (
                <li key={s.code}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={i === current}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl p-2.5 text-left backdrop-blur transition-all',
                      i === current ? 'bg-white text-site-ink shadow-xl' : 'bg-white/10 text-white hover:bg-white/20',
                    )}
                  >
                    <SiteImage
                      image={s.cover}
                      fallback={COVER_FALLBACK[s.project_type]}
                      alt=""
                      className="size-14 shrink-0 rounded-xl"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className={cn('block truncate text-sm', i === current ? 'text-site-muted' : 'text-white/70')}>
                        {s.type_label}
                        {s.price_from ? ' · from ' : ''}
                        {s.price_from ? <Taka text={formatPublicPrice(s.price_from)} /> : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {count > 1 && (
          <div className="absolute inset-x-0 bottom-40 mx-auto flex max-w-7xl items-center gap-4 px-5 sm:px-8 md:bottom-44">
            <button
              type="button"
              onClick={() => go(current - 1)}
              aria-label="Previous project"
              className="grid size-11 place-items-center rounded-full border border-white/30 text-white transition-colors hover:bg-white hover:text-site-ink"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(current + 1)}
              aria-label="Next project"
              className="grid size-11 place-items-center rounded-full border border-white/30 text-white transition-colors hover:bg-white hover:text-site-ink"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="ml-2 flex items-center gap-2">
              {slides.map((s, i) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show ${s.name}`}
                  className={cn(
                    'relative h-1.5 overflow-hidden rounded-full bg-white/30 transition-all',
                    i === current ? 'w-12' : 'w-6 hover:bg-white/50',
                  )}
                >
                  {i === current && (
                    <span
                      key={`${current}-${paused}`}
                      className={cn(
                        'absolute inset-0 origin-left rounded-full bg-site-primary',
                        !paused && 'motion-safe:animate-[site-progress_7s_linear_forwards]',
                      )}
                    />
                  )}
                </button>
              ))}
            </div>
            {/* the side rail already marks the current slide on wide screens */}
            <span className="ml-auto text-sm text-white/70 tabular-nums lg:hidden">
              {String(current + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
