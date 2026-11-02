'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, PieChart } from 'lucide-react';
import { formatPct, formatTaka } from '@/lib/domain/investor-portal';
import { publicShareOfferRepository } from '@/lib/repositories/public/share-offer.public.repository';
import { ButtonLink } from '../ui/Button';

/**
 * "Invest in this project" (BUYER-PORTAL-PLAN.md §10, F1): when the project
 * has a share offering open and the website shows share offerings, a strip
 * on its page leads to the request on /invest. Renders nothing otherwise.
 */
export function ShareOfferStrip({ projectCode }: { projectCode: string }) {
  const offer = useLiveQuery(() => publicShareOfferRepository.offerForProject(projectCode), [projectCode]);
  if (!offer) return null;
  const { round } = offer;
  return (
    <section className="rounded-[20px] border border-site-brass/40 bg-site-brass/10 p-6 md:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-site-night text-site-brass">
            <PieChart className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-site-brass-dark uppercase">Invest in this project</p>
            <p className="mt-1 text-xl font-semibold">Round {round.round_no} is open — own a share</p>
            <p className="mt-1 text-site-muted">
              <span className="font-taka tabular">{formatTaka(round.price_per_share)}</span> a share, {formatPct(round.share_pct)} ownership each ·{' '}
              {round.down_payment_pct}% down, the rest in up to {round.max_installments} {round.frequency === 'monthly' ? 'months' : 'quarters'} ·{' '}
              {round.shares_available} shares left
            </p>
          </div>
        </div>
        <ButtonLink href={`/invest#${round.code}`} iconRight={<ArrowRight className="size-4.5" />}>
          Request shares
        </ButtonLink>
      </div>
    </section>
  );
}
