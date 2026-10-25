'use client';

import { MapPin } from 'lucide-react';
import {
  PUBLIC_SALES_BADGE_LABEL,
  PUBLIC_STAGE_LABEL,
  formatPublicPrice,
} from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { SiteImage } from './SiteImage';

const BADGE_TONE: Record<PublicProjectCard['sales_badge'], string> = {
  on_sale: 'bg-emerald-600 text-white',
  paused: 'bg-amber-500 text-white',
  sold_out: 'bg-stone-600 text-white',
};

function completionLabel(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? null
    : `Handover ${d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
}

/**
 * One project on the home page or the listing (Public Portal v2.0 §3.4).
 * Not a link yet — the detail page arrives in PB3, and a card that opens a
 * 404 is worse than one that does not open.
 */
export function ProjectCard({ card }: { card: PublicProjectCard }) {
  const handover = completionLabel(card.expected_completion_date);
  const itemWord = (n: number) => (n === 1 ? card.item_label_singular : card.item_label);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-site-stone/60">
      <div className="relative overflow-hidden">
        <SiteImage
          image={card.cover}
          className="aspect-4/3 w-full transition-transform duration-500 group-hover:scale-[1.02]"
        />
        <span
          className={cn(
            'absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-medium',
            BADGE_TONE[card.sales_badge],
          )}
        >
          {PUBLIC_SALES_BADGE_LABEL[card.sales_badge]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-x-2 text-xs tracking-wide text-site-muted uppercase">
          <span>{card.type_label}</span>
          <span aria-hidden>·</span>
          <span>{PUBLIC_STAGE_LABEL[card.stage]}</span>
          {handover && (
            <>
              <span aria-hidden>·</span>
              <span className="normal-case">{handover}</span>
            </>
          )}
        </div>
        <h3 className="font-display text-xl leading-snug text-site-ink">{card.name}</h3>
        {card.location_summary && (
          <p className="flex items-start gap-1.5 text-sm text-site-muted">
            <MapPin className="mt-0.5 size-4 shrink-0 text-site-brass" /> {card.location_summary}
          </p>
        )}
        {card.size_range && <p className="text-sm text-site-ink/80">{card.size_range}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-site-stone/60 pt-3">
          <div>
            <p className="text-xs text-site-muted">{card.price_from ? 'Starting from' : 'Price'}</p>
            <p className="font-display text-lg text-site-forest">
              {card.price_from ? formatPublicPrice(card.price_from) : 'On request'}
            </p>
          </div>
          <p className="text-right text-xs text-site-muted">
            {card.total_count === 0
              ? `${card.item_label} coming soon`
              : card.available_count > 0
                ? `${card.available_count} of ${card.total_count} ${itemWord(card.total_count)} available`
                : `All ${card.total_count} ${itemWord(card.total_count)} booked`}
          </p>
        </div>
      </div>
    </article>
  );
}

export function ProjectCardSkeleton() {
  return <div className="h-[26rem] animate-pulse rounded-2xl bg-site-stone/50" />;
}
