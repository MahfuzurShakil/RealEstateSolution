import Link from 'next/link';
import { formatDay, type InstallmentView } from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { Money, StatusPill } from './ui';

/** The agreed payment schedule: one row per installment, part payments and late fees shown where they apply. */
export function ScheduleTable({ rows }: { rows: InstallmentView[] }) {
  const total = rows.reduce((t, r) => t + r.amount, 0);
  const paid = rows.reduce((t, r) => t + r.paid_amount, 0);
  return (
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
          {rows.map((r) => (
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
                      <Link key={p.receipt_no} href={`/investor/receipts/${p.receipt_no}`} className="tabular text-sm font-semibold text-site-primary hover:underline">
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
  );
}
