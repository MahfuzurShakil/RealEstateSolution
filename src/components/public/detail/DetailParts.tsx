'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Baby,
  Building2,
  Camera,
  CheckCircle2,
  Dumbbell,
  Flame,
  Leaf,
  Navigation,
  ParkingCircle,
  ShieldCheck,
  Users,
  Zap,
  ArrowUpDown,
  Moon,
  Cable,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  type LucideIcon,
} from 'lucide-react';
import { formatPublicPrice } from '@/lib/domain/public-portal';
import type { PublicPaymentStep } from '@/lib/repositories/public/project.public.repository';
import type { PublicSitePhoto } from '@/lib/repositories/public/progress.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from '../i18n/en';
import { useInView } from '../motion';
import { Taka } from '../ProjectCard';
import { SiteImage } from '../SiteImage';

const t = en.detail;

/** Sticky section menu: the link for the section in view is underlined (scrollspy). */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-160px 0px -55% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <div className="sticky top-18 z-30 mt-8 border-y border-site-line bg-site-ivory/90 backdrop-blur-md lg:top-20">
      <nav aria-label="On this page" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6">
        {items.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            aria-current={active === n.id ? 'location' : undefined}
            className={cn(
              'relative shrink-0 px-4 py-4 text-[15px] font-medium transition-colors',
              active === n.id ? 'text-site-ink' : 'text-site-muted hover:text-site-ink',
            )}
          >
            {n.label}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-3 bottom-0 h-0.5 origin-left rounded-full bg-site-primary transition-transform duration-300 ease-site-out',
                active === n.id ? 'scale-x-100' : 'scale-x-0',
              )}
            />
          </a>
        ))}
      </nav>
    </div>
  );
}

const AMENITY_ICON: Record<string, LucideIcon> = {
  lift: ArrowUpDown,
  generator: Zap,
  parking: ParkingCircle,
  security: ShieldCheck,
  cctv: Camera,
  'community space': Users,
  'rooftop garden': Leaf,
  gymnasium: Dumbbell,
  'prayer room': Moon,
  'children play area': Baby,
  substation: Cable,
  'fire fighting system': Flame,
};

/** Facilities as an icon grid; unknown names (Admin can add any) get a tick. */
export function Amenities({ items }: { items: string[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((a) => {
        const Icon = AMENITY_ICON[a.trim().toLowerCase()] ?? CheckCircle2;
        return (
          <li key={a} className="flex items-center gap-3 rounded-2xl border border-site-line bg-white p-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="text-[15px] font-medium">{a}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Apollo Hospital 1.5km" → name + distance badge; lines without a distance keep just the name. */
export function Nearby({ lines }: { lines: string[] }) {
  const items = lines
    .flatMap((s) => s.split(/,\s*/))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)[\s—–-]*(\d+(?:\.\d+)?\s*(?:km|m))\s*$/i);
      return m ? { name: m[1].trim(), distance: m[2].replace(/\s+/g, '') } : { name: s, distance: null };
    });
  return (
    <ul className="divide-y divide-site-line rounded-2xl border border-site-line bg-white">
      {items.map((it) => (
        <li key={it.name + it.distance} className="flex items-center gap-3 px-4 py-3">
          <Navigation className="size-4.5 shrink-0 text-site-primary-bright" aria-hidden />
          <span className="flex-1">{it.name}</span>
          {it.distance && <span className="tabular rounded-full bg-site-soft px-2.5 py-0.5 text-sm font-semibold">{it.distance}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Admin's standard plan, in % and ৳ on the starting price, as a stacked bar + list. */
export function PaymentPlan({ steps, price }: { steps: PublicPaymentStep[]; price: number }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const shades = ['bg-site-primary', 'bg-site-primary-bright', 'bg-site-brass', 'bg-site-night'];
  return (
    <div ref={ref} className="rounded-[20px] border border-site-line bg-white p-5 md:p-6">
      <p className="text-lg font-semibold">{t.plan.title}</p>
      <p className="mt-1 text-sm text-site-muted">{t.plan.lead(formatPublicPrice(price))}</p>
      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-site-soft" aria-hidden>
        {steps.map((s, i) => (
          <span
            key={s.label}
            style={{ width: seen ? `${s.percentage}%` : '0%', transitionDelay: `${i * 120}ms` }}
            className={cn('h-full transition-[width] duration-700 ease-site-out', shades[i % shades.length])}
          />
        ))}
      </div>
      <ul className="mt-5 divide-y divide-site-line">
        {steps.map((s, i) => {
          const amount = Math.round((price * s.percentage) / 100);
          return (
            <li key={s.label} className="flex items-center gap-3 py-3">
              <span className={cn('size-3 shrink-0 rounded-full', shades[i % shades.length])} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.label}</span>
                <span className="block text-sm text-site-muted">
                  {t.plan.schedule[s.schedule]}
                  {s.schedule === 'monthly' && ` · ${t.plan.monthly(s.month_count)}`}
                </span>
              </span>
              <span className="text-right">
                <span className="tabular block font-semibold">
                  <Taka text={formatPublicPrice(amount)} />
                </span>
                <span className="tabular block text-sm text-site-muted">
                  {s.percentage}%
                  {s.schedule === 'monthly' && s.month_count ? (
                    <>
                      {' · '}
                      <Taka text={formatPublicPrice(Math.round(amount / s.month_count))} /> {t.plan.perMonth}
                    </>
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A tower's bar: fills from 0 when it scrolls into view. */
export function ProgressBar({ pct, delay = 0 }: { pct: number; delay?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="mt-2 h-2.5 overflow-hidden rounded-full bg-site-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="h-full rounded-full bg-site-primary transition-[width] duration-[1000ms] ease-site-out"
        style={{ width: seen ? `${pct}%` : '0%', transitionDelay: `${delay}ms` }}
      />
    </div>
  );
}

const PLOT_STEPS = ['Planning & approvals', 'Under development', 'Possession', 'Completed'] as const;
const PLOT_STEP_OF = { upcoming: 0, ongoing: 1, ready: 2, completed: 3 } as const;

/**
 * Plot schemes have no tower %, so the public sees where the scheme stands
 * (Public Portal v2 §4). Land-development % stays internal.
 */
export function PlotStepper({ stage }: { stage: keyof typeof PLOT_STEP_OF }) {
  const at = PLOT_STEP_OF[stage];
  return (
    <ol className="grid gap-4 rounded-[20px] border border-site-line bg-white p-6 sm:grid-cols-4">
      {PLOT_STEPS.map((label, i) => {
        const done = i < at;
        const now = i === at;
        return (
          <li key={label} className="flex items-center gap-3 sm:flex-col sm:text-center" aria-current={now ? 'step' : undefined}>
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-full border-2 font-semibold',
                done && 'border-site-primary bg-site-primary text-white',
                now && 'border-site-primary bg-site-primary-soft text-site-primary-dark',
                !done && !now && 'border-site-line text-site-faint',
              )}
            >
              {done ? <Check className="size-5" aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-[15px]', now ? 'font-semibold' : done ? '' : 'text-site-muted')}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const photoDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Dated public site photos for this project, newest first; any photo opens a full-screen viewer. */
export function SitePhotos({ photos }: { photos: PublicSitePhoto[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const n = photos.length;
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % n));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + n) % n));
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open === null, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = open === null ? null : photos[open];
  return (
    <div>
      <p className="font-semibold">{t.progressPhotos}</p>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(i)} className="group block w-full overflow-hidden rounded-2xl border border-site-line bg-white text-left">
              <SiteImage image={p.image} fallback="" alt={p.image.alt} className="aspect-4/3 transition-transform duration-500 ease-site-out group-hover:scale-105" />
              <p className="px-3 py-2 text-sm">
                <span className="font-medium">{p.tower_name ?? ''}</span> <span className="text-site-muted">· {photoDate(p.taken_on)}</span>
              </p>
            </button>
          </li>
        ))}
      </ul>
      {shown &&
        createPortal(
          <div className="site fixed inset-0 z-[70] flex flex-col bg-site-night-deep/95 font-site text-white motion-safe:animate-[site-fade-in_.2s_ease-out]" role="dialog" aria-modal="true" aria-label={t.progressPhotos}>
            <div className="flex items-center justify-between p-4">
              <p className="text-sm text-white/80">
                {shown.tower_name ? `${shown.tower_name} · ` : ''}
                {photoDate(shown.taken_on)}
              </p>
              <button ref={closeBtn} type="button" aria-label="Close photo" onClick={() => setOpen(null)} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                <X className="size-5" />
              </button>
            </div>
            <div className="relative flex flex-1 items-center justify-center px-4 pb-8">
              {n > 1 && (
                <button type="button" aria-label="Previous photo" onClick={() => setOpen((open! - 1 + n) % n)} className="absolute left-4 grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                  <ChevronLeft className="size-6" />
                </button>
              )}
              <SiteImage key={shown.id} image={shown.image} fallback="" alt={shown.image.alt} className="h-[75vh] w-full max-w-5xl bg-transparent motion-safe:animate-[site-fade-in_.3s_ease-out] [&_img]:object-contain" />
              {n > 1 && (
                <button type="button" aria-label="Next photo" onClick={() => setOpen((open! + 1) % n)} className="absolute right-4 grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                  <ChevronRight className="size-6" />
                </button>
              )}
            </div>
          </div>,
          document.getElementById('site-root') ?? document.body,
        )}
    </div>
  );
}

/** The land papers a buyer can ask to see, by project shape. */
export function Papers({ kind }: { kind: 'tower' | 'block' | 'none' }) {
  return (
    <div className="rounded-[20px] bg-site-soft p-6">
      <div className="flex items-start gap-3">
        <Building2 className="mt-0.5 size-6 shrink-0 text-site-primary" aria-hidden />
        <div>
          <p className="text-lg font-semibold">{t.papers.title}</p>
          <p className="text-sm text-site-muted">{t.papers.lead}</p>
        </div>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {t.papers[kind].map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-site-primary" aria-hidden /> {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
