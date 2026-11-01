'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CircleCheck, Info, Wallet, type LucideIcon } from 'lucide-react';
import {
  DUE_STATE_LABEL,
  DUE_WINDOW_DAYS,
  formatDay,
  paymentDueRows,
  type DueState,
  type PaymentDueRow,
  holdingTag,
} from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { Money, PageHeading, ProgressBar } from '../ui';

const checkoutHref = (r: PaymentDueRow) => `/customer/payments/checkout?holding=${r.view.holding.code}`;

const STATE_STYLE: Record<DueState, { cls: string; Icon: LucideIcon }> = {
  overdue: { cls: 'bg-red-50 text-site-danger', Icon: AlertTriangle },
  due: { cls: 'bg-site-booked-soft text-site-booked', Icon: CalendarClock },
  upcoming: { cls: 'bg-site-primary-soft text-site-primary-dark', Icon: CalendarClock },
  paid: { cls: 'bg-site-sold-soft text-site-sold', Icon: CircleCheck },
};

function StatePill({ state }: { state: DueState }) {
  const { cls, Icon } = STATE_STYLE[state];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', cls)}>
      <Icon className="size-3.5" aria-hidden />
      {DUE_STATE_LABEL[state]}
    </span>
  );
}

function inDays(days: number) {
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

const Dash = () => <span className="text-site-faint">—</span>;

function NextCell({ r, align = 'right' }: { r: PaymentDueRow; align?: 'left' | 'right' }) {
  if (!r.next) return <Dash />;
  return (
    <span className={cn('block', align === 'right' && 'text-right')}>
      <Money amount={r.next.remaining} className="block font-semibold" />
      <span className="block text-xs whitespace-nowrap text-site-muted">
        {formatDay(r.next.due_date)}
        {r.state !== 'overdue' && <> · {inDays(r.days)}</>}
      </span>
    </span>
  );
}

function PayButton({ r, compact = false }: { r: PaymentDueRow; compact?: boolean }) {
  if (r.state === 'paid') {
    return (
      <Link
        href={`/customer/investments/${r.view.holding.code}`}
        onClick={(e) => e.stopPropagation()}
        className={cn('inline-flex h-9 items-center justify-center gap-1 rounded-full border border-site-line bg-white px-4 text-sm font-semibold transition-colors hover:border-site-primary hover:text-site-primary', compact && 'w-full')}
      >
        View
      </Link>
    );
  }
  const overdue = r.state === 'overdue';
  return (
    <Link
      href={checkoutHref(r)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.98]',
        overdue ? 'bg-site-danger' : 'bg-site-primary',
        compact && 'h-11 w-full',
      )}
    >
      Pay {compact && <Money amount={r.pay_amount} />}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

/**
 * "Make a payment" landing: every investment in one grid, worst first, with
 * what is late, by how long, the late fee, how many installments are paid
 * and what comes next. A row (or its Pay button) opens that investment's
 * checkout — the stepped flow starts from here.
 */
export function PaymentsPage() {
  const router = useRouter();
  const { snapshot, portfolio } = useCustomerPortal();
  const all = paymentDueRows(portfolio, snapshot.today);
  const [filter, setFilter] = useState<DueState | 'all'>('all');
  const rows = filter === 'all' ? all : all.filter((r) => r.state === filter);

  const late = all.filter((r) => r.state === 'overdue');
  const overdueTotal = late.reduce((t, r) => t + r.due_now, 0);
  const lateFees = late.reduce((t, r) => t + r.late_fee, 0);
  const soon = portfolio.holdings.flatMap((v) => v.schedule.filter((i) => i.status === 'due'));
  const soonTotal = soon.reduce((t, i) => t + i.remaining, 0);
  const open = all.filter((r) => r.state !== 'paid');
  const counts = all.reduce<Record<string, number>>((m, r) => ({ ...m, [r.state]: (m[r.state] ?? 0) + 1 }), {});
  const filters = (['all', 'overdue', 'due', 'upcoming', 'paid'] as const).filter((f) => f === 'all' || counts[f]);

  const tiles: { label: string; value: number; hint: string; Icon: LucideIcon; tone: 'danger' | 'booked' | 'primary' }[] = [
    {
      label: 'Overdue now',
      value: overdueTotal,
      hint: late.length ? `${late.length} project${late.length > 1 ? 's' : ''}${lateFees ? ' · incl. late fees' : ''}` : 'Nothing is late',
      Icon: AlertTriangle,
      tone: 'danger',
    },
    {
      label: `Due in the next ${DUE_WINDOW_DAYS} days`,
      value: soonTotal,
      hint: soon.length ? `${soon.length} installment${soon.length > 1 ? 's' : ''}` : 'Nothing falls due soon',
      Icon: CalendarClock,
      tone: 'booked',
    },
    { label: 'Left to pay in total', value: portfolio.outstanding, hint: `across ${open.length} investment${open.length === 1 ? '' : 's'}`, Icon: Wallet, tone: 'primary' },
  ];

  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Payments" title="Make a payment" description="Choose the investment you want to pay. Overdue payments are listed first." />

      <div className="grid gap-px overflow-hidden rounded-3xl border border-site-line bg-site-line shadow-site-1 sm:grid-cols-3">
        {tiles.map(({ label, value, hint, Icon, tone }) => (
          <div key={label} className="flex items-start gap-3.5 bg-white px-5 py-4 sm:px-6 sm:py-5">
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-xl',
                tone === 'danger' ? 'bg-red-50 text-site-danger' : tone === 'booked' ? 'bg-site-booked-soft text-site-booked' : 'bg-site-primary-soft text-site-primary',
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-site-muted">{label}</p>
              <Money amount={value} className={cn('font-display mt-0.5 block text-2xl font-semibold', tone === 'danger' && value > 0 && 'text-site-danger')} />
              <p className="mt-0.5 text-[13px] text-site-muted">{hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Show">
        {filters.map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                on ? 'border-site-night bg-site-night text-white' : 'border-site-line bg-white text-site-ink hover:border-site-faint',
              )}
            >
              {f === 'all' ? 'All' : DUE_STATE_LABEL[f]}
              <span className={cn('tabular rounded-full px-1.5 text-xs', on ? 'bg-white/15' : 'bg-site-soft text-site-muted')}>{f === 'all' ? all.length : counts[f]}</span>
            </button>
          );
        })}
      </div>

      {/* desktop: one grid of every investment */}
      <div className="hidden overflow-hidden rounded-3xl border border-site-line bg-white shadow-site-1 xl:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-site-line bg-site-ivory/70 text-left text-xs font-semibold tracking-wide text-site-muted uppercase">
                <th className="py-3 pr-3 pl-5 font-semibold">Project</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">Overdue amount</th>
                <th className="px-3 py-3 font-semibold">Was due</th>
                <th className="px-3 py-3 text-right font-semibold">Late fee</th>
                <th className="px-3 py-3 font-semibold">Installments paid</th>
                <th className="px-3 py-3 text-right font-semibold">Next payment</th>
                <th className="py-3 pr-5 pl-3">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-site-line">
              {rows.map((r) => {
                const overdue = r.state === 'overdue';
                const href = r.state === 'paid' ? `/customer/investments/${r.view.holding.code}` : checkoutHref(r);
                return (
                  <tr key={r.view.holding.code} onClick={() => router.push(href)} className={cn('cursor-pointer transition-colors hover:bg-site-ivory', r.state === 'paid' && 'text-site-muted')}>
                    <td className="py-3.5 pr-3 pl-5">
                      <span className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- mock stock photo */}
                        <img src={r.view.project.image} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
                        <span className="min-w-0">
                          <span title={r.view.project.name} className="block max-w-44 truncate font-semibold text-site-ink">{r.view.project.name}</span>
                          <span className="tabular block text-xs text-site-muted">
                            {r.view.holding.code} · {holdingTag(r.view.holding)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <StatePill state={r.state} />
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      {overdue ? (
                        <>
                          <Money amount={r.overdue_amount} className="block font-semibold text-site-danger" />
                          <span className="block text-xs text-site-muted">
                            {r.overdue_count} installment{r.overdue_count > 1 ? 's' : ''}
                            {r.oldest_overdue?.partial ? ' · part paid' : ''}
                          </span>
                        </>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      {overdue ? (
                        <>
                          <span className="block">{formatDay(r.oldest_overdue!.due_date)}</span>
                          <span className="tabular block text-xs font-semibold text-site-danger">{r.days} days late</span>
                        </>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      {r.late_fee > 0 ? (
                        <Money amount={r.late_fee} className="font-semibold" />
                      ) : overdue ? (
                        <span className="text-xs whitespace-nowrap text-site-muted">None yet</span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="tabular block text-[13px] font-semibold text-site-ink">
                        {r.paid_count} of {r.total_count}
                      </span>
                      <ProgressBar pct={(r.paid_count / r.total_count) * 100} className="mt-1.5 h-1.5 w-24" tone={overdue ? 'danger' : 'primary'} />
                    </td>
                    <td className="px-3 py-3.5">
                      <NextCell r={r} />
                    </td>
                    <td className="py-3.5 pr-5 pl-3 text-right">
                      <PayButton r={r} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filter === 'all' && late.length > 0 && (
              <tfoot>
                <tr className="border-t border-site-line bg-site-ivory/70 font-semibold">
                  <td className="py-3 pr-3 pl-5" colSpan={2}>
                    Total overdue
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Money amount={late.reduce((t, r) => t + r.overdue_amount, 0)} className="text-site-danger" />
                  </td>
                  <td />
                  <td className="px-3 py-3 text-right">{lateFees > 0 ? <Money amount={lateFees} /> : <Dash />}</td>
                  <td className="px-3 py-3 text-right" colSpan={3}>
                    <span className="text-site-muted">To clear everything: </span>
                    <Money amount={overdueTotal} className="text-site-danger" />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* phones and tablets: one card per investment */}
      <ul className="grid gap-4 md:grid-cols-2 xl:hidden">
        {rows.map((r) => {
          const overdue = r.state === 'overdue';
          return (
            <li key={r.view.holding.code} className={cn('overflow-hidden rounded-3xl border bg-white shadow-site-1', overdue ? 'border-site-danger/30' : 'border-site-line')}>
              <Link href={r.state === 'paid' ? `/customer/investments/${r.view.holding.code}` : checkoutHref(r)} className="flex items-center gap-3 p-4 pb-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- mock stock photo */}
                <img src={r.view.project.image} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.view.project.name}</span>
                  <span className="tabular block text-xs text-site-muted">
                    {r.paid_count} of {r.total_count} installments paid
                  </span>
                </span>
                <StatePill state={r.state} />
              </Link>
              {r.state !== 'paid' && (
                <div className="px-4 pb-4">
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-site-line bg-site-line text-sm">
                    <div className="bg-white px-3 py-2.5">
                      <dt className="text-xs text-site-muted">Overdue amount</dt>
                      <dd className="mt-0.5 font-semibold">{overdue ? <Money amount={r.overdue_amount} className="text-site-danger" /> : <Dash />}</dd>
                    </div>
                    <div className="bg-white px-3 py-2.5">
                      <dt className="text-xs text-site-muted">Days late</dt>
                      <dd className="mt-0.5 font-semibold">
                        {overdue ? (
                          <span className="text-site-danger">
                            {r.days} days <span className="text-xs font-medium text-site-muted">since {formatDay(r.oldest_overdue!.due_date)}</span>
                          </span>
                        ) : (
                          <Dash />
                        )}
                      </dd>
                    </div>
                    <div className="bg-white px-3 py-2.5">
                      <dt className="text-xs text-site-muted">Late fee</dt>
                      <dd className="mt-0.5 font-semibold">{r.late_fee > 0 ? <Money amount={r.late_fee} /> : <Dash />}</dd>
                    </div>
                    <div className="bg-white px-3 py-2.5">
                      <dt className="text-xs text-site-muted">Next payment</dt>
                      <dd className="mt-0.5">
                        <NextCell r={r} align="left" />
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <PayButton r={r} compact />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="flex gap-2.5 text-[13px] text-site-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-site-primary" aria-hidden />
        <span>
          Choose an investment to continue. On the next step you can pay the overdue amount, the next installment, the full balance or any other amount — payments go to late fees
          first, then the oldest installment.
        </span>
      </p>
    </div>
  );
}
