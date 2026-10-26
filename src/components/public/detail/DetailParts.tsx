'use client';

import { useEffect, useState } from 'react';
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

/** Dated public site photos for this project; opens the full image in a new tab-less viewer via onOpen. */
export function SitePhotos({ photos }: { photos: PublicSitePhoto[] }) {
  return (
    <div>
      <p className="font-semibold">{t.progressPhotos}</p>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <li key={p.id} className="overflow-hidden rounded-2xl border border-site-line bg-white">
            <SiteImage image={p.image} fallback="" alt={p.image.alt} className="aspect-4/3" />
            <p className="px-3 py-2 text-sm">
              <span className="font-medium">{p.tower_name ?? ''}</span>{' '}
              <span className="text-site-muted">· {new Date(`${p.taken_on.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </p>
          </li>
        ))}
      </ul>
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
