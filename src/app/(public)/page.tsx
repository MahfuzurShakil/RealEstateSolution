'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin } from 'lucide-react';
import { SiteImage } from '@/components/public/SiteImage';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import {
  PUBLIC_SALES_BADGE_LABEL,
  PUBLIC_STAGE_LABEL,
  formatPublicPrice,
} from '@/lib/domain/public-portal';
import {
  publicProjectRepository,
  type PublicProjectCard,
} from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';

/*
 * PB1 home: hero, counts and featured projects straight from the public
 * repository. PB2 adds the listing page, filters and the full home sections
 * (Public Portal v2.0 §2.1, §7); the card here becomes the shared one then.
 */

const BADGE_TONE: Record<PublicProjectCard['sales_badge'], string> = {
  on_sale: 'bg-emerald-600 text-white',
  paused: 'bg-amber-500 text-white',
  sold_out: 'bg-stone-600 text-white',
};

function FeaturedCard({ card }: { card: PublicProjectCard }) {
  return (
    <article className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-site-stone/60">
      <div className="relative">
        <SiteImage image={card.cover} className="aspect-4/3 w-full transition-transform duration-500 group-hover:scale-[1.02]" />
        <span className={cn('absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-medium', BADGE_TONE[card.sales_badge])}>
          {PUBLIC_SALES_BADGE_LABEL[card.sales_badge]}
        </span>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-xs tracking-wide text-site-muted uppercase">
          <span>{card.type_label}</span>
          <span aria-hidden>·</span>
          <span>{PUBLIC_STAGE_LABEL[card.stage]}</span>
        </div>
        <h3 className="font-display text-xl leading-snug text-site-ink">{card.name}</h3>
        {card.location_summary && (
          <p className="flex items-center gap-1.5 text-sm text-site-muted">
            <MapPin className="size-4 shrink-0 text-site-brass" /> {card.location_summary}
          </p>
        )}
        <div className="flex items-end justify-between border-t border-site-stone/60 pt-3">
          <div>
            <p className="text-xs text-site-muted">{card.price_from ? 'Starting from' : card.item_label}</p>
            <p className="font-display text-lg text-site-forest">
              {card.price_from ? formatPublicPrice(card.price_from) : (card.size_range ?? '—')}
            </p>
          </div>
          <p className="text-right text-xs text-site-muted">
            {card.available_count > 0
              ? `${card.available_count} ${card.available_count === 1 ? card.item_label_singular : card.item_label} available`
              : 'None available'}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const company = useCompanyInfo();
  const featured = useLiveQuery(() => publicProjectRepository.featured(), []);
  const stats = useLiveQuery(() => publicProjectRepository.stats(), []);

  return (
    <>
      <section className="relative overflow-hidden bg-site-forest text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20 [background:radial-gradient(60rem_30rem_at_80%_-10%,var(--color-site-brass),transparent)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="mb-4 text-xs tracking-[0.3em] text-site-brass-light uppercase">
            {company?.company_name}
          </p>
          <h1 className="max-w-2xl font-display text-4xl leading-[1.1] sm:text-6xl">
            A home you can see being built.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-site-stone/90 sm:text-lg">
            Apartments, plots and land shares with clear prices, live availability and construction
            progress you can follow.
          </p>
          {stats && (
            <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-4">
              <div>
                <dt className="text-xs tracking-wide text-site-stone/70 uppercase">On sale now</dt>
                <dd className="font-display text-3xl text-site-brass-light">{stats.on_sale}</dd>
              </div>
              {stats.completed > 0 && (
                <div>
                  <dt className="text-xs tracking-wide text-site-stone/70 uppercase">Completed</dt>
                  <dd className="font-display text-3xl text-site-brass-light">{stats.completed}</dd>
                </div>
              )}
              {stats.types.length > 0 && (
                <div>
                  <dt className="text-xs tracking-wide text-site-stone/70 uppercase">Kinds of project</dt>
                  <dd className="mt-1.5 text-sm text-white">{stats.types.map((t) => t.label).join(' · ')}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8">
          <p className="text-xs tracking-[0.3em] text-site-brass uppercase">Featured</p>
          <h2 className="mt-2 font-display text-3xl text-site-ink">Projects on sale</h2>
        </div>

        {featured === undefined ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl bg-site-stone/50" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-site-stone bg-white/60 px-6 py-14 text-center">
            <p className="font-display text-xl text-site-ink">No projects on sale yet</p>
            <p className="mt-2 text-sm text-site-muted">
              New projects appear here as soon as they open for booking. Call or message us to hear first.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((card) => (
              <FeaturedCard key={card.code} card={card} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
