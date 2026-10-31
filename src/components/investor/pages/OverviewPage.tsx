'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Briefcase, CalendarClock, Check, Landmark, Loader2, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/public/ui/Button';
import { formatDay, formatPct, formatTaka, PAYMENT_METHOD_LABEL } from '@/lib/domain/investor-portal';
import { investorRepository } from '@/lib/repositories/investor/investor.mock.repository';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { HoldingCard } from '../HoldingCard';
import { NextPaymentCard } from '../NextPaymentCard';
import { Money, PageHeading, Panel, StatCard, StatusPill } from '../ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function OverviewPage() {
  const { snapshot, portfolio } = useCustomerPortal();
  const [busyRound, setBusyRound] = useState<string | null>(null);
  const c = snapshot.customer;
  const shares = portfolio.holdings.reduce((t, v) => t + v.holding.shares, 0);
  const gain = portfolio.current_value - portfolio.total_invested;
  const upcoming = portfolio.holdings
    .flatMap((view) => view.schedule.filter((i) => i.status !== 'paid').slice(0, 3).map((i) => ({ view, i })))
    .sort((a, b) => a.i.due_date.localeCompare(b.i.due_date))
    .slice(0, 5);
  const recent = snapshot.payments
    .slice()
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    .slice(0, 4);
  const projectOf = (holdingCode: string) => portfolio.holdings.find((v) => v.holding.code === holdingCode)?.project;

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow={new Date(`${snapshot.today}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        title={`${greeting()}, ${c.full_name.split(' ')[0]}`}
        description="Here is where your investments and payments stand today."
      />

      <NextPaymentCard portfolio={portfolio} today={snapshot.today} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Briefcase} label="Total investment" value={<Money amount={portfolio.total_invested} />} hint={`${portfolio.holdings.length} projects · ${shares} shares`} tone="primary" />
        <StatCard
          icon={TrendingUp}
          label="Current value"
          value={<Money amount={portfolio.current_value} />}
          hint={
            <span className={gain >= 0 ? 'font-semibold text-site-primary-dark' : 'font-semibold text-site-danger'}>
              {gain >= 0 ? '+' : '−'}
              {formatTaka(Math.abs(gain))} at latest valuations
            </span>
          }
        />
        <StatCard icon={Wallet} label="Paid to date" value={<Money amount={portfolio.paid} />} hint={`${Math.round((portfolio.paid / portfolio.total_invested) * 100)}% of total price`} />
        <StatCard icon={CalendarClock} label="Outstanding balance" value={<Money amount={portfolio.outstanding} />} hint="Still to pay across all investments" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">My portfolio</h2>
            <Link href="/investor/investments" className="text-sm font-semibold text-site-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {portfolio.holdings.map((v) => (
              <HoldingCard key={v.holding.code} view={v} />
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <Panel title="Upcoming payments" action={<Link href="/investor/payments" className="text-sm font-semibold text-site-primary hover:underline">Pay</Link>} padded={false}>
            <ul className="divide-y divide-site-line">
              {upcoming.map(({ view, i }) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{view.project.name}</span>
                    <span className="block text-xs text-site-muted">
                      {i.label} · {formatDay(i.due_date)}
                    </span>
                  </span>
                  <span className="text-right">
                    <Money amount={i.remaining + i.late_fee_due} className="block text-sm font-semibold" />
                    <StatusPill status={i.status} className="mt-1" />
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent payments" action={<Link href="/investor/history" className="text-sm font-semibold text-site-primary hover:underline">History</Link>} padded={false}>
            <ul className="divide-y divide-site-line">
              {recent.map((p) => (
                <li key={p.receipt_no}>
                  <Link href={`/investor/receipts/${p.receipt_no}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-site-ivory sm:px-6">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
                      <Receipt className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{projectOf(p.holding_code)?.name}</span>
                      <span className="block text-xs text-site-muted">
                        {formatDay(p.paid_at)} · {PAYMENT_METHOD_LABEL[p.method]}
                      </span>
                    </span>
                    <Money amount={p.total} className="text-sm font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {portfolio.open_rounds.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Open share offerings</h2>
            <p className="mt-1 text-[15px] text-site-muted">New shares the owner is offering now. Register your interest and our team will contact you.</p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
            {portfolio.open_rounds.map(({ round, project }) => {
              const interested = snapshot.interested_round_codes.includes(round.code);
              const soldPct = Math.round(((round.total_shares - round.shares_available) / round.total_shares) * 100);
              return (
                <article key={round.code} className="flex flex-col gap-5 rounded-3xl border border-site-line bg-white p-5 shadow-site-1 sm:flex-row">
                  {/* eslint-disable-next-line @next/next/no-img-element -- mock stock photo */}
                  <img src={project.image} alt="" loading="lazy" className="h-36 w-full shrink-0 rounded-2xl object-cover sm:h-auto sm:w-40" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-xs font-semibold tracking-[0.14em] text-site-brass-dark uppercase">Round {round.round_no} · open</p>
                    <p className="font-display mt-1 text-lg font-semibold">{project.name}</p>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <span className="text-site-muted">Price per share</span>
                      <Money amount={round.price_per_share} className="text-right font-semibold" />
                      <span className="text-site-muted">Ownership per share</span>
                      <span className="tabular text-right font-semibold">{formatPct(round.share_pct)}</span>
                      <span className="text-site-muted">Available</span>
                      <span className="tabular text-right font-semibold">
                        {round.shares_available} of {round.total_shares}
                      </span>
                      <span className="text-site-muted">Closes</span>
                      <span className="text-right font-semibold">{formatDay(round.closes_on)}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-site-soft">
                      <div className="h-full rounded-full bg-site-brass" style={{ width: `${soldPct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-site-muted">{soldPct}% subscribed</p>
                    <div className="mt-4">
                      {interested ? (
                        <p className="inline-flex items-center gap-1.5 rounded-full bg-site-primary-soft px-4 py-2 text-sm font-semibold text-site-primary-dark">
                          <Check className="size-4" aria-hidden /> Interest registered — we will call you
                        </p>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyRound === round.code}
                          icon={busyRound === round.code ? <Loader2 className="size-4 animate-spin" /> : <Landmark className="size-4" />}
                          onClick={async () => {
                            setBusyRound(round.code);
                            await investorRepository.registerInterest(round.code);
                            setBusyRound(null);
                          }}
                        >
                          Register interest
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
