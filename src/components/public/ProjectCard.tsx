'use client';

import Link from 'next/link';
import { ViewTransition } from 'react';
import { ArrowUpRight, CalendarCheck, Flame, KeyRound, MapPin, Ruler } from 'lucide-react';
import { PUBLIC_STAGE_LABEL, formatMonthYear, formatPublicPrice } from '@/lib/domain/public-portal';
import type { PublicProjectCard } from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { en } from './i18n/en';
import { SiteImage } from './SiteImage';
import { COVER_FALLBACK } from './stock-images';
import { Badge, SalesBadge } from './ui/Badge';

const t = en.card;

/** The Latin faces have no ৳, so the sign is drawn in the Bangla face and the figure stays in the UI one. */
export function Taka({ text }: { text: string }) {
  if (!text.startsWith('৳')) return <>{text}</>;
  return (
    <>
      <span className="font-taka">৳</span>
      {text.slice(1)}
    </>
  );
}

/**
 * One project on the home page or the listing (master plan §7.2): answers
 * where, what, how big, how much, when, and how many left — and opens its
 * detail page. `layout="list"` puts the photo beside the facts.
 */
export function ProjectCard({ card, layout = 'grid' }: { card: PublicProjectCard; layout?: 'grid' | 'list' }) {
  const handover = formatMonthYear(card.expected_completion_date);
  const itemWord = (n: number) => (n === 1 ? card.item_label_singular : card.item_label);
  const fewLeft = card.available_count > 0 && card.available_count <= 3;
  const list = layout === 'list';

  return (
    <Link
      href={`/projects/${encodeURIComponent(card.code)}`}
      className={cn(
        'group flex h-full overflow-hidden rounded-[20px] border border-site-line bg-white shadow-site-1 transition-[transform,box-shadow,border-color] duration-500 ease-site-out hover:-translate-y-1 hover:border-transparent hover:shadow-site-3',
        list ? 'flex-col sm:flex-row' : 'flex-col',
      )}
    >
      <div className={cn('relative shrink-0 overflow-hidden', list && 'sm:w-[42%]')}>
        {/* shares its name with the detail page's first photo: opening the project morphs one into the other */}
        <ViewTransition name={`cover-${card.code}`} share="morph" default="none">
          <SiteImage
            image={card.cover}
            fallback={COVER_FALLBACK[card.project_type]}
            alt={card.name}
            className={cn('w-full transition-transform duration-700 ease-site-out group-hover:scale-105', list ? 'aspect-4/3 sm:h-full sm:aspect-auto' : 'aspect-4/3')}
          />
        </ViewTransition>
        <SalesBadge badge={card.sales_badge} className="absolute top-4 left-4" />
        <Badge tone="light" className="absolute top-4 right-4">
          {card.type_label}
        </Badge>
        {fewLeft && (
          <Badge tone="dark" className="absolute bottom-4 left-4" icon={<Flame className="size-3.5 text-site-brass" aria-hidden />}>
            {t.onlyLeft(card.available_count, itemWord(card.available_count))}
          </Badge>
        )}
      </div>

      <article className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="text-xl leading-snug font-semibold text-site-ink transition-colors group-hover:text-site-primary">{card.name}</h3>
        {card.location_summary && (
          <p className="mt-2 flex items-start gap-1.5 text-site-muted">
            <MapPin className="mt-0.5 size-4 shrink-0 text-site-primary-bright" aria-hidden />
            <span className="line-clamp-1">{card.location_summary}</span>
          </p>
        )}

        <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-site-line py-4 text-[15px]">
          {card.size_range && (
            <li className="flex items-center gap-1.5">
              <Ruler className="size-4 text-site-primary-bright" aria-hidden /> {card.size_range}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <KeyRound className="size-4 text-site-primary-bright" aria-hidden />
            {card.total_count === 0 ? t.comingSoon(card.item_label) : t.left(card.available_count, itemWord(card.available_count))}
          </li>
          {handover && (
            <li className="flex items-center gap-1.5">
              <CalendarCheck className="size-4 text-site-primary-bright" aria-hidden /> {handover}
            </li>
          )}
        </ul>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <span className="text-sm text-site-muted">{card.price_from ? t.from : t.price}</span>
            <p className="tabular text-xl font-bold text-site-ink">{card.price_from ? <Taka text={formatPublicPrice(card.price_from)} /> : t.onRequest}</p>
          </div>
          <span className="flex items-center gap-2">
            <Badge tone="soft">{PUBLIC_STAGE_LABEL[card.stage]}</Badge>
            <span className="grid size-9 place-items-center rounded-full border border-site-line text-site-faint transition-colors group-hover:border-site-primary group-hover:bg-site-primary group-hover:text-white" aria-hidden>
              <ArrowUpRight className="size-4" />
            </span>
          </span>
        </div>
      </article>
    </Link>
  );
}

export function ProjectCardSkeleton() {
  return <div className="h-[28rem] animate-pulse rounded-[20px] bg-site-soft" />;
}
