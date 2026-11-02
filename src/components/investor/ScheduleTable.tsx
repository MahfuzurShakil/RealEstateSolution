'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDay, type InstallmentView } from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { Money, StatusPill } from './ui';

type Filter = 'open' | 'overdue' | 'paid' | 'all';
const FILTERS: { key: Filter; label: string; match: (r: InstallmentView) => boolean }[] = [
  { key: 'open', label: 'Due & upcoming', match: (r) => r.status !== 'paid' || r.late_fee_due > 0 },
  { key: 'overdue', label: 'Overdue', match: (r) => r.status === 'overdue' },
  { key: 'paid', label: 'Paid', match: (r) => r.status === 'paid' },
  { key: 'all', label: 'All', match: () => true },
];
const PAGE = 12;

/**
 * The agreed payment schedule: one row per installment, part payments and late
 * fees shown where they apply. A long plan (100 installments) is filtered and
 * paged 12 at a time, starting at what is due (SHARE-SALE-FEEDBACK-PLAN.md D4).
 */
export function ScheduleTable({ rows }: { rows: InstallmentView[] }) {
  const [filter, setFilter] = useState<Filter>(() => (rows.some((r) => r.status !== 'paid') ? 'open' : 'all'));
  const [page, setPage] = useState(0);
  const total = rows.reduce((t, r) => t + r.amount, 0);
  const paid = rows.reduce((t, r) => t + r.paid_amount, 0);
  const shown = rows.filter(FILTERS.find((f) => f.key === filter)!.match);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  const pageRows = shown.slice(at * PAGE, at * PAGE + PAGE);
  return (
    <div>
      <div className="flex flex-wrap gap-2 px-5 pb-3 sm:px-6" role="tablist" aria-label="Show">
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setFilter(f.key);
                setPage(0);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors',
                on ? 'border-site-primary bg-site-primary text-white' : 'border-site-line bg-white text-site-muted hover:border-site-primary hover:text-site-primary',
              )}
            >
              {f.label} <span className="tabular opacity-75">{rows.filter(f.match).length}</span>
            </button>
          );
        })}
      </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[15px]">
        <thead>
          <tr className="border-b border-site-line text-xs tracking-wide text-site-muted uppercase">
            <th scope="col" className="px-5 py-3 font-semibold sm:px-6">#</th>
            <th scope="col" className="px-3 py-3 font-semibold">Due date</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Paid</th>
            <th scope="col" className="px-3 py-3 font-semibold">Status</th>
            <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">Receipt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-site-line">
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-5 py-6 text-center text-site-muted sm:px-6">
                Nothing here.
              </td>
            </tr>
          )}
          {pageRows.map((r) => (
            <tr key={r.id} className={cn(r.status === 'overdue' && 'bg-red-50/60')}>
              <td className="px-5 py-3.5 font-medium sm:px-6">{r.label}</td>
              <td className="tabular px-3 py-3.5">{formatDay(r.due_date)}</td>
              <td className="px-3 py-3.5 text-right">
                <Money amount={r.amount} className="font-semibold" />
                {r.late_fee_due > 0 && (
                  <span className="block text-xs font-medium text-site-danger">
                    + <Money amount={r.late_fee_due} /> late fee
                  </span>
                )}
              </td>
              <td className="px-3 py-3.5 text-right">
                {r.paid_amount > 0 ? <Money amount={r.paid_amount} /> : <span className="text-site-faint">—</span>}
                {r.partial && (
                  <span className="block text-xs font-medium text-site-booked">
                    <Money amount={r.remaining} /> left
                  </span>
                )}
              </td>
              <td className="px-3 py-3.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusPill status={r.status} />
                  {r.partial && <span className="rounded-full bg-site-soft px-2 py-0.5 text-[11px] font-semibold text-site-muted">Part paid</span>}
                </span>
                {r.status === 'overdue' && <span className="tabular mt-1 block text-xs text-site-danger">{r.days_late} days late</span>}
              </td>
              <td className="px-5 py-3.5 text-right sm:px-6">
                {r.payments.length ? (
                  <span className="flex flex-col items-end gap-0.5">
                    {r.payments.map((p) => (
                      <Link key={p.receipt_no} href={`/customer/receipts/${p.receipt_no}`} className="tabular text-sm font-semibold text-site-primary hover:underline">
                        {p.receipt_no}
                      </Link>
                    ))}
                  </span>
                ) : (
                  <span className="text-site-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-site-line">
            <td className="px-5 py-3.5 font-semibold sm:px-6" colSpan={2}>
              Total
            </td>
            <td className="px-3 py-3.5 text-right">
              <Money amount={total} className="font-semibold" />
            </td>
            <td className="px-3 py-3.5 text-right">
              <Money amount={paid} className="font-semibold" />
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-site-line px-5 py-3 text-sm sm:px-6">
          <span className="tabular text-site-muted">
            {at * PAGE + 1}–{Math.min(at * PAGE + PAGE, shown.length)} of {shown.length}
          </span>
          <span className="flex gap-2">
            <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)} className="rounded-lg border border-site-line px-3 py-1.5 font-semibold disabled:opacity-40">
              Previous
            </button>
            <button type="button" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} className="rounded-lg border border-site-line px-3 py-1.5 font-semibold disabled:opacity-40">
              Next
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
