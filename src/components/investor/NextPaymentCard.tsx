'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, CircleCheck } from 'lucide-react';
import { daysBetween, formatDay, type PortfolioView } from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { Money } from './ui';

/**
 * The overview's payment prompt: what to pay next, by when, and a Pay button.
 *
 * Deliberately an alert row, not a hero — a white card with a coloured edge,
 * the amount at heading size and one line of detail — so it is easy to find
 * without outweighing the rest of the page. Overdue switches the edge, icon
 * and button to red and asks for the amount that clears it, late fee included.
 */
export function NextPaymentCard({ portfolio, today }: { portfolio: PortfolioView; today: string }) {
  const overdueViews = portfolio.holdings.filter((v) => v.due_now > 0);
  const next = portfolio.next;

  if (!next) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-site-line bg-white px-4 py-3.5 shadow-site-1 sm:px-5">
        <CircleCheck className="size-5 shrink-0 text-site-primary" aria-hidden />
        <p className="text-[15px]">
          <span className="font-semibold">All installments are paid.</span> <span className="text-site-muted">Nothing is due right now.</span>
        </p>
      </div>
    );
  }

  const overdue = overdueViews.length > 0;
  const first = overdue ? overdueViews.flatMap((v) => v.schedule.filter((i) => i.status === 'overdue').map((i) => ({ v, i })))[0] : { v: next.view, i: next.installment };
  const amount = overdue ? portfolio.due_now : next.installment.remaining + next.installment.late_fee_due;
  const lateFees = overdueViews.reduce((t, v) => t + v.late_fees, 0);
  const days = daysBetween(today, first.i.due_date);
  const when = overdue ? `${first.i.days_late} days late` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
  const where = overdueViews.length > 1 ? `${overdueViews.length} investments` : first.v.project.name;
  const href = overdueViews.length > 1 ? '/investor/payments' : `/investor/payments?holding=${first.v.holding.code}`;
  const Icon = overdue ? AlertTriangle : CalendarClock;

  return (
    <section
      aria-label={overdue ? 'Payment overdue' : 'Next payment'}
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
              {overdue ? 'Overdue' : 'Next payment'}
            </span>
            <Money amount={amount} className="font-display text-xl leading-tight font-semibold sm:text-[22px]" />
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-site-muted sm:line-clamp-1 sm:text-sm">
            <span className={cn('font-semibold', overdue ? 'text-site-danger' : 'text-site-ink')}>{when}</span>
            {' · '}
            {where} · {first.i.label}
            <span className="hidden md:inline">
              {' · '}
              {overdue ? `was due ${formatDay(first.i.due_date)}` : formatDay(first.i.due_date)}
            </span>
            {overdue && lateFees > 0 && (
              <span className="hidden lg:inline">
                {' · incl. '}
                <Money amount={lateFees} /> late fee
              </span>
            )}
          </p>
        </div>

        <Link
          href={href}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.98] sm:px-5',
            overdue ? 'bg-site-danger' : 'bg-site-primary',
          )}
        >
          Pay <span className="hidden sm:inline">now</span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
