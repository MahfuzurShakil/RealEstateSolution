'use client';

import Link from 'next/link';
import { Briefcase, CalendarClock, Home, Receipt, Sparkles, Wallet } from 'lucide-react';
import { formatDay, PAYMENT_METHOD_LABEL } from '@/lib/domain/investor-portal';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { NextPaymentCard } from '../NextPaymentCard';
import { OpportunityCard } from '../OpportunityCard';
import { EmptyNote, Money, PageHeading, Panel, StatCard, StatusPill } from '../ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function OverviewPage() {
  const { snapshot, portfolio } = useCustomerPortal();
  const c = snapshot.customer;
  const shares = portfolio.holdings.reduce((t, v) => t + v.holding.shares, 0);
  const paidPct = portfolio.total_invested ? Math.round((portfolio.paid / portfolio.total_invested) * 100) : 0;
  const buyerOnly = portfolio.shares.length === 0 && portfolio.homes.length > 0;
  const overdue = portfolio.holdings.reduce((t, v) => t + v.overdue_amount, 0);
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
        description={buyerOnly ? 'Here is where your home and its payments stand today.' : portfolio.homes.length ? 'Here is where your homes, investments and payments stand today.' : 'Here is where your investments and payments stand today.'}
      />

      <NextPaymentCard portfolio={portfolio} today={snapshot.today} />

      <div className="grid gap-4 sm:grid-cols-3">
        {portfolio.homes.length > 0 && portfolio.shares.length === 0 ? (
          <StatCard
            icon={Home}
            label="Total price"
            value={<Money amount={portfolio.total_invested} />}
            hint={`${portfolio.homes.length} home${portfolio.homes.length === 1 ? '' : 's'} · ${portfolio.homes.map((v) => v.holding.home?.unit_code).join(', ')}`}
            tone="primary"
            href="/customer/homes"
            linkLabel="View my homes"
          />
        ) : (
          <StatCard
            icon={Briefcase}
            label={portfolio.homes.length ? 'Total value' : 'Total investment'}
            value={<Money amount={portfolio.total_invested} />}
            hint={
              portfolio.homes.length
                ? `${portfolio.homes.length} home${portfolio.homes.length === 1 ? '' : 's'} · ${portfolio.shares.length} project${portfolio.shares.length === 1 ? '' : 's'} · ${shares} shares`
                : `${portfolio.holdings.length} projects · ${shares} shares`
            }
            tone="primary"
            href="/customer/investments"
            linkLabel="View my investments"
          />
        )}
        <StatCard icon={Wallet} label="Paid so far" value={<Money amount={portfolio.paid} />} hint={`${paidPct}% of the total price is paid`} />
        <StatCard
          icon={CalendarClock}
          label="Left to pay"
          value={<Money amount={portfolio.outstanding} />}
          hint={
            overdue > 0 ? (
              <>
                Includes <Money amount={overdue} className="font-semibold text-site-danger" /> overdue
              </>
            ) : (
              'Still to pay on your installment plans'
            )
          }
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {portfolio.open_rounds.length > 0 ? (
          <section id="opportunities" className="scroll-mt-24">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">New opportunities</h2>
              <p className="mt-1 text-[15px] text-site-muted">
                {buyerOnly
                  ? 'Own a part of a project as well as your home — shares on offer now. Choose how many you want and our team will prepare the agreement.'
                  : 'Projects you may like — shares on offer now. Choose how many you want and our team will prepare the agreement.'}
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {portfolio.open_rounds.map(({ round, project }) => (
                <OpportunityCard
                  key={round.code}
                  round={round}
                  project={project}
                  owned={portfolio.holdings.some((v) => v.project.code === project.code)}
                  request={snapshot.share_requests.find((r) => r.round_code === round.code)}
                />
              ))}
            </div>
          </section>
        ) : (
          <section>
            <h2 className="mb-4 text-xl font-semibold">New opportunities</h2>
            <Panel>
              <EmptyNote icon={Sparkles} title="No new shares on offer right now" body="When a project opens a new share round, it will appear here and we will let you know." />
            </Panel>
          </section>
        )}

        <div className="space-y-6">
          <Panel title="Upcoming payments" action={<Link href="/customer/payments" className="text-sm font-semibold text-site-primary hover:underline">Pay</Link>} padded={false}>
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

          <Panel title="Recent payments" action={<Link href="/customer/history" className="text-sm font-semibold text-site-primary hover:underline">History</Link>} padded={false}>
            <ul className="divide-y divide-site-line">
              {recent.map((p) => (
                <li key={p.receipt_no}>
                  <Link href={`/customer/receipts/${p.receipt_no}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-site-ivory sm:px-6">
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

    </div>
  );
}
