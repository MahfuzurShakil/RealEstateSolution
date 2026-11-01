'use client';

import { Home } from 'lucide-react';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { HoldingCard } from '../HoldingCard';
import { EmptyNote, Money, PageHeading, Panel } from '../ui';

/** A buyer's flats and plots (BUYER-PORTAL-PLAN.md §5), laid out like My investments. */
export function HomesPage() {
  const { portfolio } = useCustomerPortal();
  const homes = portfolio.homes;
  const sum = (pick: (v: (typeof homes)[number]) => number) => homes.reduce((t, v) => t + pick(v), 0);
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Homes"
        title="My homes"
        description="Every flat or plot you have booked with us, how much of the price is paid, and how far the building and the handover have come."
      />

      <div className="grid gap-px overflow-hidden rounded-3xl border border-site-line bg-site-line shadow-site-1 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Homes', String(homes.length)],
          ['Total price', <Money key="t" amount={sum((v) => v.holding.total_price)} />],
          ['Paid to date', <Money key="p" amount={sum((v) => v.paid)} />],
          ['Left to pay', <Money key="o" amount={sum((v) => v.outstanding)} />],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-white px-6 py-5">
            <p className="text-sm text-site-muted">{label}</p>
            <p className="font-display tabular mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {homes.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {homes.map((v) => (
            <HoldingCard key={v.holding.code} view={v} />
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyNote icon={Home} title="No home on your account" body="When you book a flat or plot with us, it appears here." />
        </Panel>
      )}
    </div>
  );
}
