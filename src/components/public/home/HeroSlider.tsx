'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarCheck, ChevronLeft, ChevronRight, KeyRound, MapPin, Pause, Play, Ruler } from 'lucide-react';
import { PUBLIC_STAGE_LABEL, formatMonthYear, formatPublicPrice } from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';
import { Taka } from '../ProjectCard';
import { SiteImage } from '../SiteImage';
import { COVER_FALLBACK, HERO_IMAGE } from '../stock-images';
import { SalesBadge } from '../ui/Badge';
import { Button, ButtonLink } from '../ui/Button';
import { useEnquiry } from '../enquiry/EnquiryProvider';

const t = en.home.hero;
const INTERVAL_MS = 7000;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/** Shown when nothing is published yet, so the page still opens on a picture. */
function BrandSlide() {
  return (
    <div className="relative z-10 max-w-2xl">
      <h1 className="text-[40px] leading-[1.05] font-semibold text-white md:text-6xl">
        {t.brandTitle} <em className="font-accent font-normal tracking-normal text-site-brass italic">{t.brandAccent}</em>
      </h1>
      <p className="mt-5 text-lg text-white/80 md:text-xl">{t.brandBody}</p>
    </div>
  );
}

/**
 * The home page hero (master plan §7.1): one slide per project on sale,
 * straight from the public repository. Desktop: text over the photo with a
 * forest overlay and a rail of the other projects. Phone: the photo on top and
 * the text on solid dark below, so nothing is read over a busy image.
 * Autoplay pauses on hover, focus, a hidden tab, the pause button, and never
 * starts for people who asked their system for less motion (WCAG 2.2.2).
 */
export function HeroSlider({ cards }: { cards: PublicProjectCard[] }) {
  const enquiry = useEnquiry();
  const slides = cards.slice(0, 5);
  const count = slides.length;
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false); // the pause button
  const [hidden, setHidden] = useState(false);
  const touchX = useRef<number | null>(null);
  const current = count ? Math.min(index, count - 1) : 0;
  const playing = count > 1 && !reduced && !stopped && !hovered && !focused && !hidden;

  const go = useCallback((to: number) => setIndex(((to % count) + count) % count), [count]);

  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => go(current + 1), INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [current, playing, go]);

  const slide = slides[current];
  const handover = slide ? formatMonthYear(slide.expected_completion_date) : null;

  return (
    <section className="px-2 pt-2 md:px-4" aria-roledescription="carousel" aria-label={t.label}>
      <div
        className="relative isolate overflow-hidden rounded-[28px] bg-site-night md:flex md:min-h-[700px] md:items-center md:pt-16 md:pb-52"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(current + 1);
          if (e.key === 'ArrowLeft') go(current - 1);
        }}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null || count < 2) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
          touchX.current = null;
        }}
      >
        {/* photos: on phones a 4:3 band on top; from md the full background */}
        <div className="relative aspect-[4/3] md:absolute md:inset-0 md:-z-10 md:aspect-auto">
          {count === 0 ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote stock photo
            <img src={HERO_IMAGE} alt="" className="size-full object-cover" />
          ) : (
            slides.map((s, i) => (
              <div
                key={s.code}
                aria-hidden={i !== current}
                className={cn('absolute inset-0 transition-opacity duration-1000 ease-site-in-out', i === current ? 'opacity-100' : 'opacity-0')}
              >
                {/* the showing photo eases from 1.06 to 1; the others ease back, so nothing snaps */}
                <SiteImage
                  image={s.cover}
                  fallback={COVER_FALLBACK[s.project_type]}
                  alt={s.name}
                  eager={i === 0}
                  className={cn('size-full transition-transform duration-[7000ms] ease-out', i === current ? 'scale-100' : 'scale-[1.06]')}
                />
              </div>
            ))
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-site-night to-transparent md:hidden" />
          <div className="absolute inset-0 hidden bg-linear-to-r from-site-night/95 via-site-night/70 to-site-night/10 md:block" />
          <div className="absolute inset-x-0 bottom-0 hidden h-56 bg-linear-to-t from-site-night/80 to-transparent md:block" />
        </div>

        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 pt-2 pb-56 sm:px-8 md:pt-0 md:pb-0 lg:grid-cols-[1fr_300px]">
          {!slide ? (
            <BrandSlide />
          ) : (
            <div key={slide.code} className="relative z-10 max-w-2xl motion-safe:animate-[fade-up_.6s_var(--ease-site-out)]" aria-live={playing ? 'off' : 'polite'}>
              <div className="flex flex-wrap items-center gap-2">
                <SalesBadge badge={slide.sales_badge} className="px-3.5 text-sm" />
                <span className="rounded-full bg-white/12 px-3.5 py-1 text-sm text-white backdrop-blur">
                  {slide.type_label} · {PUBLIC_STAGE_LABEL[slide.stage]}
                </span>
              </div>
              <h1 className="mt-4 text-[34px] leading-[1.05] font-semibold text-white md:mt-5 md:text-6xl">{slide.name}</h1>
              {slide.location_summary && (
                <p className="mt-3 flex items-start gap-2 text-base text-white/85 md:mt-4 md:text-lg">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-site-brass" aria-hidden /> {slide.location_summary}
                </p>
              )}

              <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85 md:mt-6 md:text-base">
                {slide.size_range && (
                  <li className="flex items-center gap-2">
                    <Ruler className="size-4.5 text-site-brass" aria-hidden /> {slide.size_range}
                  </li>
                )}
                {slide.total_count > 0 && (
                  <li className="flex items-center gap-2">
                    <KeyRound className="size-4.5 text-site-brass" aria-hidden /> {slide.available_count}{' '}
                    {slide.available_count === 1 ? slide.item_label_singular : slide.item_label} {t.available}
                  </li>
                )}
                {handover && (
                  <li className="flex items-center gap-2">
                    <CalendarCheck className="size-4.5 text-site-brass" aria-hidden /> {t.handover} {handover}
                  </li>
                )}
              </ul>

              <div className="mt-7 flex flex-wrap items-end gap-x-10 gap-y-5 md:mt-8">
                {slide.price_from && (
                  <div>
                    <p className="text-xs font-semibold tracking-[0.16em] text-white/60 uppercase">{t.startingFrom}</p>
                    <p className="tabular mt-1 text-3xl font-bold text-white md:text-4xl">
                      <Taka text={formatPublicPrice(slide.price_from)} />
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <ButtonLink
                    href={`/projects/${encodeURIComponent(slide.code)}`}
                    iconRight={<ArrowRight className="size-4.5" />}
                    className="group"
                  >
                    {t.explore}
                  </ButtonLink>
                  <Button
                    variant="onDark"
                    icon={<CalendarCheck className="size-4.5" />}
                    onClick={() => enquiry.open('visit', { project: { name: slide.name, code: slide.code } })}
                  >
                    {t.bookVisit}
                  </Button>
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
                    aria-label={t.show(s.name)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl p-2.5 text-left backdrop-blur transition-[background-color,box-shadow,transform] duration-300 ease-site-out',
                      i === current ? 'bg-white text-site-ink shadow-site-3' : 'bg-white/10 text-white hover:-translate-x-1 hover:bg-white/20',
                    )}
                  >
                    <SiteImage image={s.cover} fallback={COVER_FALLBACK[s.project_type]} alt="" className="size-14 shrink-0 rounded-xl" />
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
          <div className="absolute inset-x-0 bottom-36 mx-auto flex max-w-7xl items-center gap-3 px-5 sm:px-8 md:bottom-44">
            {[
              { label: t.prev, Icon: ChevronLeft, to: current - 1 },
              { label: t.next, Icon: ChevronRight, to: current + 1 },
            ].map(({ label, Icon, to }) => (
              <button
                key={label}
                type="button"
                onClick={() => go(to)}
                aria-label={label}
                className="grid size-10 place-items-center rounded-full border border-white/30 text-white transition-colors hover:bg-white hover:text-site-ink"
              >
                <Icon className="size-5" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStopped((s) => !s)}
              aria-label={stopped ? t.play : t.pause}
              aria-pressed={stopped}
              className={cn(
                'grid size-10 place-items-center rounded-full border border-white/30 text-white transition-colors hover:bg-white hover:text-site-ink',
                reduced && 'hidden',
              )}
            >
              {stopped ? <Play className="size-4" /> : <Pause className="size-4" />}
            </button>
            <div className="ml-1 flex items-center gap-2">
              {slides.map((s, i) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={t.show(s.name)}
                  aria-current={i === current}
                  className={cn(
                    'relative h-1.5 overflow-hidden rounded-full bg-white/30 transition-[width,background-color] duration-300',
                    i === current ? 'w-12' : 'w-6 hover:bg-white/50',
                  )}
                >
                  {i === current && (
                    <span
                      key={`${current}-${playing}`}
                      className={cn(
                        'absolute inset-0 origin-left rounded-full bg-site-brass',
                        playing ? 'animate-[site-progress_7s_linear_forwards]' : 'scale-x-100',
                      )}
                    />
                  )}
                </button>
              ))}
            </div>
            <span className="tabular ml-auto text-sm text-white/70 lg:hidden">
              {String(current + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
