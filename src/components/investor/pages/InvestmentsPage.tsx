'use client';

import { useCustomerPortal } from '../CustomerPortalProvider';
import { HoldingCard } from '../HoldingCard';
import { Money, PageHeading } from '../ui';

export function InvestmentsPage() {
  const { portfolio } = useCustomerPortal();
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Portfolio"
        title="My investments"
        description="Every project you own shares in, with your ownership and how much of the price is paid."
      />

      <div className="grid gap-px overflow-hidden rounded-3xl border border-site-line bg-site-line shadow-site-1 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Projects', String(portfolio.holdings.length)],
          ['Total investment', <Money key="t" amount={portfolio.total_invested} />],
          ['Paid to date', <Money key="p" amount={portfolio.paid} />],
          ['Outstanding balance', <Money key="o" amount={portfolio.outstanding} />],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-white px-6 py-5">
            <p className="text-sm text-site-muted">{label}</p>
            <p className="font-display tabular mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {portfolio.holdings.map((v) => (
          <HoldingCard key={v.holding.code} view={v} />
        ))}
      </div>
    </div>
  );
}
