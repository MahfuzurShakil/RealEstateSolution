'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Eye, Printer, ReceiptText } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { INSTALLMENT_STATUS_META, type InstallmentStatus } from '@/lib/domain/installment-ledger';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

/*
 * A payment schedule that stays readable at 100 installments
 * (SHARE-SALE-FEEDBACK-PLAN.md D4): a summary strip, filters with counts,
 * 12 rows a page starting at what is due, and each row's payments one click
 * away in a popup — instead of a second "Payments received" table to match
 * up by eye. Shared by share purchases and bookings.
 */

export interface ScheduleRowView {
  id: string;
  label: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  remaining: number;
  late_fee_due: number;
  late_fee_paid: number;
  status: InstallmentStatus;
  days_late: number;
}

export interface ReceiptView {
  id: string;
  /** receipt number, e.g. SRC-2026-014 */
  code: string;
  date: string;
  amount: number;
  method: string;
  reference?: string | null;
  /** "Customer Portal", "Office" … */
  channel?: string | null;
  allocations: { installment_id: string; principal: number; late_fee: number }[];
  /** a printable receipt, when the module has one */
  printHref?: string | null;
}

type Filter = 'open' | 'overdue' | 'paid' | 'all';
const FILTERS: { key: Filter; label: string; match: (r: ScheduleRowView) => boolean }[] = [
  { key: 'open', label: 'Due & upcoming', match: (r) => r.status !== 'paid' || r.late_fee_due > 0 },
  { key: 'overdue', label: 'Overdue', match: (r) => r.status === 'overdue' },
  { key: 'paid', label: 'Paid', match: (r) => r.status === 'paid' },
  { key: 'all', label: 'All', match: () => true },
];

/*
 * No totals strip here: the page around it already shows paid, still to pay,
 * overdue and next due (the purchase's Money card, the booking's tiles), and
 * a figure is shown in one place only.
 */
export function InstallmentSchedule({
  rows,
  receipts,
  title = 'Payment schedule',
  subtitle,
  action,
  footer,
}: {
  rows: ScheduleRowView[];
  receipts: ReceiptView[];
  title?: string;
  subtitle?: string;
  /** e.g. Record payment */
  action?: ReactNode;
  /** a note under the table */
  footer?: ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>(() => (rows.some((r) => r.status !== 'paid') ? 'open' : 'all'));
  const [detail, setDetail] = useState<ScheduleRowView | null>(null);
  const [showReceipts, setShowReceipts] = useState(false);
  const shown = rows.filter(FILTERS.find((f) => f.key === filter)!.match);
  const paging = usePagination(shown, 12);

  const receiptsFor = (rowId: string) => receipts.filter((p) => p.allocations.some((a) => a.installment_id === rowId));
  const label = (rowId: string) => rows.find((r) => r.id === rowId)?.label ?? 'Earlier row';

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {receipts.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowReceipts(true)}>
              <ReceiptText className="size-4" /> Receipts ({receipts.length})
            </Button>
          )}
          {action}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Show">
        {FILTERS.map((f) => {
          const count = rows.filter(f.match).length;
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                on ? 'border-admin-500 bg-admin-500 text-white' : 'border-hairline bg-white text-ink-muted hover:border-admin-300 hover:text-admin-700',
              )}
            >
              {f.label} <span className={cn('ml-0.5 tabular-nums', on ? 'text-white/80' : 'text-ink-muted')}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-hairline bg-canvas/60 text-left text-xs text-ink-muted">
              <th className="px-4 py-2 font-medium">Payment</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">Paid</th>
              <th className="px-3 py-2 text-right font-medium">Late fee</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {paging.pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ink-muted">
                  Nothing here.
                </td>
              </tr>
            )}
            {paging.pageRows.map((r) => {
              const has = r.paid_amount > 0 || r.late_fee_paid > 0;
              return (
                <tr key={r.id} className={r.status === 'overdue' ? 'bg-red-50/40' : ''}>
                  <td className="px-4 py-2 text-ink">{r.label}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatDate(r.due_date)}
                    {r.days_late > 0 && <span className="block text-xs text-red-600">{r.days_late} days late</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBdt(r.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.paid_amount ? formatBdt(r.paid_amount) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.late_fee_due ? <span className="text-red-600">{formatBdt(r.late_fee_due)} due</span> : r.late_fee_paid ? <span className="text-ink-muted">{formatBdt(r.late_fee_paid)} paid</span> : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={INSTALLMENT_STATUS_META[r.status].tone}>{r.paid_amount > 0 && r.remaining > 0 ? 'Part paid' : INSTALLMENT_STATUS_META[r.status].label}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {has ? (
                      <Button variant="ghost" size="sm" onClick={() => setDetail(r)}>
                        <Eye className="size-4" /> View
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={paging.page}
        pageCount={paging.pageCount}
        pageSize={paging.pageSize}
        total={paging.total}
        from={paging.from}
        to={paging.to}
        onPageChange={paging.setPage}
        onPageSizeChange={paging.setPageSize}
        pageSizes={[12, 24, 48]}
        label="payments"
        className="mt-3"
      />
      {footer}

      {detail && (
        <Modal open title={`${detail.label} · payment details`} subtitle={`Due ${formatDate(detail.due_date)} · ${formatBdt(detail.amount)}`} icon={ReceiptText} size="md" onClose={() => setDetail(null)}>
          <dl className="mb-4 grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-4">
            {(
              [
                ['Amount', formatBdt(detail.amount)],
                ['Paid', formatBdt(detail.paid_amount)],
                ['Still owed', formatBdt(detail.remaining)],
                ['Late fee', detail.late_fee_due ? `${formatBdt(detail.late_fee_due)} due` : detail.late_fee_paid ? `${formatBdt(detail.late_fee_paid)} paid` : '—'],
              ] as [string, string][]
            ).map(([k, val]) => (
              <div key={k} className="border-b border-hairline py-2">
                <dt className="text-xs text-ink-muted">{k}</dt>
                <dd className="font-medium tabular-nums">{val}</dd>
              </div>
            ))}
          </dl>
          <p className="mb-2 text-sm font-semibold text-ink">Receipts applied to it</p>
          <ul className="space-y-2">
            {receiptsFor(detail.id).map((p) => {
              const mine = p.allocations.find((a) => a.installment_id === detail.id)!;
              const others = p.allocations.filter((a) => a.installment_id !== detail.id).map((a) => label(a.installment_id));
              return (
                <li key={p.id} className="rounded-xl border border-hairline p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      {p.code}
                      {p.channel && <Badge tone="teal">{p.channel}</Badge>}
                    </span>
                    <span className="font-semibold tabular-nums">{formatBdt(p.amount)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatDate(p.date)} · {p.method}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-ink">
                    {formatBdt(mine.principal)} to this payment{mine.late_fee ? ` + ${formatBdt(mine.late_fee)} late fee` : ''}
                    {others.length > 0 && <span className="text-ink-muted"> · the same receipt also paid {others.join(', ')}</span>}
                  </p>
                  {p.printHref && (
                    <Link href={p.printHref} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-admin-700 hover:underline">
                      <Printer className="size-3.5" /> Print receipt
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Modal>
      )}

      {showReceipts && (
        <Modal open title="Receipts" subtitle={`${receipts.length} receipt${receipts.length === 1 ? '' : 's'} · ${formatBdt(receipts.reduce((t, p) => t + p.amount, 0))}`} icon={ReceiptText} size="lg" onClose={() => setShowReceipts(false)}>
          <ul className="divide-y divide-hairline">
            {receipts.map((p) => (
              <li key={p.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    {p.code}
                    {p.channel && <Badge tone="teal">{p.channel}</Badge>}
                  </span>
                  <span className="font-semibold tabular-nums">{formatBdt(p.amount)}</span>
                </div>
                <p className="text-xs text-ink-muted">
                  {formatDate(p.date)} · {p.method}
                  {p.reference ? ` · ${p.reference}` : ''} · {p.allocations.map((a) => label(a.installment_id)).join(', ') || 'Advance'}
                </p>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  );
}
