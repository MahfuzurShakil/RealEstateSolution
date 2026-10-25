'use client';

import { CalendarCheck, KeyRound, MapPin, Ruler } from 'lucide-react';
import {
  PUBLIC_SALES_BADGE_LABEL,
  PUBLIC_STAGE_LABEL,
  formatPublicPrice,
} from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { SiteImage } from './SiteImage';
import { COVER_FALLBACK } from './stock-images';

const BADGE_TONE: Record<PublicProjectCard['sales_badge'], string> = {
  on_sale: 'bg-site-primary text-white',
  paused: 'bg-amber-500 text-white',
  sold_out: 'bg-slate-700 text-white',
};

/** League Spartan has no ৳, so the sign is drawn in the Bangla face and the figure stays in the UI one. */
export function Taka({ text }: { text: string }) {
  if (!text.startsWith('৳')) return <>{text}</>;
  return (
    <>
      <span className="font-taka">৳</span>
      {text.slice(1)}
    </>
  );
}

function handoverLabel(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * One project on the home page or the listing (Public Portal v2.0 §3.4).
 * Not a link yet — the detail page arrives in PB3, and a card that opens a
 * 404 is worse than one that does not open.
 */
export function ProjectCard({ card }: { card: PublicProjectCard }) {
  const handover = handoverLabel(card.expected_completion_date);
  const itemWord = (n: number) => (n === 1 ? card.item_label_singular : card.item_label);

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm shadow-slate-200 transition-shadow duration-500 hover:shadow-xl">
      <div className="relative overflow-hidden">
        <SiteImage
          image={card.cover}
          fallback={COVER_FALLBACK[card.project_type]}
          alt={card.name}
          className="aspect-4/3 w-full transition-transform duration-700 group-hover:scale-105"
        />
        <span
          className={cn(
            'absolute top-4 left-4 rounded-full px-3 py-1 text-xs font-medium',
            BADGE_TONE[card.sales_badge],
          )}
        >
          {PUBLIC_SALES_BADGE_LABEL[card.sales_badge]}
        </span>
        <span className="absolute top-4 right-4 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-site-ink">
          {card.type_label}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-xl leading-snug font-medium text-site-ink transition-colors group-hover:text-site-primary">
          {card.name}
        </h3>
        {card.location_summary && (
          <p className="mt-2 flex items-start gap-1.5 text-site-muted">
            <MapPin className="mt-0.5 size-4 shrink-0 text-site-primary" />
            <span className="line-clamp-1">{card.location_summary}</span>
          </p>
        )}

        <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-site-line py-4 text-[15px]">
          {card.size_range && (
            <li className="flex items-center gap-1.5">
              <Ruler className="size-4 text-site-primary" /> {card.size_range}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <KeyRound className="size-4 text-site-primary" />
            {card.total_count === 0
              ? `${card.item_label} coming soon`
              : `${card.available_count} ${itemWord(card.available_count)} left`}
          </li>
          {handover && (
            <li className="flex items-center gap-1.5">
              <CalendarCheck className="size-4 text-site-primary" /> {handover}
            </li>
          )}
        </ul>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <span className="text-sm text-site-muted">{card.price_from ? 'Starting from' : 'Price'}</span>
            <p className="text-xl font-semibold text-site-ink">
              {card.price_from ? <Taka text={formatPublicPrice(card.price_from)} /> : 'On request'}
            </p>
          </div>
          <span className="rounded-full bg-site-primary-soft px-3 py-1 text-sm font-medium text-site-primary-dark">
            {PUBLIC_STAGE_LABEL[card.stage]}
          </span>
        </div>
      </div>
    </article>
  );
}

export function ProjectCardSkeleton() {
  return <div className="h-[28rem] animate-pulse rounded-xl bg-site-soft" />;
}
