'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, ChevronRight, CircleCheck } from 'lucide-react';
import { formatDay, paymentDueRows, type PaymentDueRow, type PortfolioView } from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { Money } from './ui';

/** rows listed under the headline before "and N more" takes over */
const MAX_ROWS = 3;

const checkoutHref = (r: PaymentDueRow) => `/customer/payments/checkout?holding=${r.view.holding.code}`;

function dueIn(days: number) {
  return days <= 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
}

/** One project under the headline: what it owes and how late, linking straight to its checkout. */
function ProjectRow({ r, overdue }: { r: PaymentDueRow; overdue: boolean }) {
  const inst = overdue ? r.oldest_overdue! : r.next!;
  return (
    <li>
      <Link href={checkoutHref(r)} className="group flex items-center gap-3 py-2.5 pr-3.5 pl-5 transition-colors hover:bg-site-ivory sm:pr-4 sm:pl-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- mock stock photo */}
        <img src={r.view.project.image} alt="" className="hidden size-9 shrink-0 rounded-lg object-cover sm:block" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{r.view.project.name}</span>
          <span className="block truncate text-xs text-site-muted">
            {overdue ? (
              <>
                <span className="font-semibold text-site-danger">{r.days} days late</span>
                {' · '}
                {r.overdue_count > 1 ? `${r.overdue_count} installments` : inst.label}
                {r.late_fee > 0 && (
                  <>
                    {' · incl. '}
                    <Money amount={r.late_fee} /> late fee
                  </>
                )}
              </>
            ) : (
              <>
                <span className="font-semibold text-site-ink">{dueIn(r.days)}</span> · {inst.label} · {formatDay(inst.due_date)}
              </>
            )}
          </span>
        </span>
        <Money amount={overdue ? r.due_now : r.pay_amount} className={cn('shrink-0 text-sm font-semibold', overdue && 'text-site-danger')} />
        <ChevronRight className="size-4 shrink-0 text-site-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * The overview's payment prompt, for one project or many.
 *
 * The headline is the total across every project — overdue (late fees
 * included) when anything is late, otherwise the next installment — with one
 * line saying how many projects and installments it covers. Under it, when
 * more than one project is involved, each project gets a row of its own that
 * opens its checkout directly; Pay goes to the payment landing grid.
 */
export function NextPaymentCard({ portfolio, today }: { portfolio: PortfolioView; today: string }) {
  const rows = paymentDueRows(portfolio, today);
  const late = rows.filter((r) => r.state === 'overdue');
  const coming = rows.filter((r) => r.state === 'due' || r.state === 'upcoming').sort((a, b) => a.days - b.days);

  if (!late.length && !coming.length) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-site-line bg-white px-4 py-3.5 shadow-site-1 sm:px-5">
        <CircleCheck className="size-5 shrink-0 text-site-primary" aria-hidden />
        <p className="text-[15px]">
          <span className="font-semibold">All installments are paid.</span> <span className="text-site-muted">Nothing is due right now.</span>
        </p>
      </div>
    );
  }

  const overdue = late.length > 0;
  const listed = overdue ? late : coming;
  const amount = overdue ? late.reduce((t, r) => t + r.due_now, 0) : coming[0].pay_amount;
  const lateFees = late.reduce((t, r) => t + r.late_fee, 0);
  const installments = late.reduce((t, r) => t + r.overdue_count, 0);
  const Icon = overdue ? AlertTriangle : CalendarClock;
  const single = listed.length === 1;
  const first = listed[0];
  // after the overdue list, the next installment that is not late yet, on any project
  const thenNext = overdue
    ? (rows.filter((r) => r.next).sort((a, b) => a.next!.due_date.localeCompare(b.next!.due_date))[0] ?? null)
    : null;

  return (
    <section
      aria-label={overdue ? 'Payments overdue' : 'Next payment'}
      className={cn('relative overflow-hidden rounded-2xl border bg-white shadow-site-1', overdue ? 'border-site-danger/30' : 'border-site-line')}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', overdue ? 'bg-site-danger' : 'bg-site-primary')} />
      <div className="flex items-center gap-3 py-3.5 pr-3.5 pl-5 sm:gap-4 sm:py-4 sm:pr-4 sm:pl-6">
        <span className={cn('hidden size-10 shrink-0 place-items-center rounded-xl sm:grid', overdue ? 'bg-red-50 text-site-danger' : 'bg-site-primary-soft text-site-primary')}>
          <Icon className="size-5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase', overdue ? 'text-site-danger' : 'text-site-muted')}>
              <Icon className="size-3.5 sm:hidden" aria-hidden />
              {overdue ? (single ? 'Overdue' : 'Total overdue') : 'Next payment'}
            </span>
            <Money amount={amount} className="font-display text-xl leading-tight font-semibold sm:text-[22px]" />
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-site-muted sm:line-clamp-1 sm:text-sm">
            {overdue ? (
              single ? (
                <>
                  <span className="font-semibold text-site-danger">{first.days} days late</span>
                  {' · '}
                  {first.view.project.name} · {first.overdue_count > 1 ? `${first.overdue_count} installments` : first.oldest_overdue!.label}
                  <span className="hidden md:inline"> · was due {formatDay(first.oldest_overdue!.due_date)}</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-site-danger">
                    {late.length} projects · {installments} installments
                  </span>
                  {' · oldest '}
                  {Math.max(...late.map((r) => r.days))} days late
                </>
              )
            ) : (
              <>
                <span className="font-semibold text-site-ink">{dueIn(first.days)}</span>
                {' · '}
                {first.view.project.name} · {first.next!.label}
                <span className="hidden md:inline"> · {formatDay(first.next!.due_date)}</span>
              </>
            )}
            {overdue && lateFees > 0 && (
              <span className="hidden lg:inline">
                {' · incl. '}
                <Money amount={lateFees} /> late fee
              </span>
            )}
          </p>
        </div>

        <Link
          href="/customer/payments"
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.98] sm:px-5',
            overdue ? 'bg-site-danger' : 'bg-site-primary',
          )}
        >
          Pay <span className="hidden sm:inline">now</span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {(!single || thenNext) && (
        <div className="border-t border-site-line">
          {!single && (
            <ul className="divide-y divide-site-line" aria-label={overdue ? 'Overdue by project' : 'Next payment by project'}>
              {listed.slice(0, MAX_ROWS).map((r) => (
                <ProjectRow key={r.view.holding.code} r={r} overdue={overdue} />
              ))}
            </ul>
          )}
          <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-site-ivory/70 py-2.5 pr-4 pl-5 text-[13px] sm:pl-6', !single && 'border-t border-site-line')}>
            {thenNext ? (
              <span className="min-w-0 text-site-muted">
                Then next: <Money amount={thenNext.next!.remaining} className="font-semibold text-site-ink" /> · {thenNext.view.project.name} ·{' '}
                {formatDay(thenNext.next!.due_date)}
              </span>
            ) : (
              <span className="text-site-muted">
                {listed.length} projects have installments coming up
              </span>
            )}
            <Link href="/customer/payments" className="font-semibold text-site-primary hover:underline">
              {listed.length > MAX_ROWS ? `See all ${listed.length}` : 'All payments'}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
