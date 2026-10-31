'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { PAYMENT_METHOD_LABEL, allocationLabel, formatDay } from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { SiteSelect } from '../SiteSelect';
import { EmptyNote, Money, PageHeading, Panel } from '../ui';

export function HistoryPage() {
  const { snapshot, portfolio } = useCustomerPortal();
  const [project, setProject] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(5);
  const holdingOf = (code: string) => portfolio.holdings.find((v) => v.holding.code === code);
  const rows = snapshot.payments.filter((p) => project === 'all' || p.holding_code === project).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  const total = rows.reduce((t, p) => t + p.total, 0);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * size, current * size);
  const from = rows.length ? (current - 1) * size + 1 : 0;

  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Payments" title="Payment history" description="Every payment received on your account, online or at our office, with its receipt." />

      <SiteSelect
        label="Project"
        className="w-full sm:w-80"
        value={project}
        onChange={(v) => {
          setProject(v);
          setPage(1);
        }}
        options={[
          { value: 'all', label: 'All projects' },
          ...portfolio.holdings.map((v) => ({
            value: v.holding.code,
            label: v.project.name,
          })),
        ]}
      />

      <Panel
        title={`${rows.length} payment${rows.length === 1 ? '' : 's'}`}
        action={
          <span className="text-sm text-site-muted">
            Total <Money amount={total} className="font-semibold text-site-ink" />
          </span>
        }
        padded={false}
      >
        {rows.length ? (
          <>
            <ul className="divide-y divide-site-line sm:hidden">
              {shown.map((p) => (
                <li key={p.receipt_no}>
                  <Link href={`/investor/receipts/${p.receipt_no}`} className="flex items-center gap-3 px-5 py-4 active:bg-site-ivory">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
                      <Receipt className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold">{holdingOf(p.holding_code)?.project.name}</span>
                        <Money amount={p.total} className="shrink-0 font-semibold" />
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-site-muted">
                        {p.allocations.map((a) => allocationLabel(holdingOf(p.holding_code), a)).join(', ')}
                        {p.late_fee > 0 && ' + late fee'}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-site-faint">
                        {formatDay(p.paid_at)} · {p.method_detail} · <span className="tabular">{p.receipt_no}</span>
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-site-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] text-left text-[15px]">
                <thead>
                  <tr className="border-b border-site-line text-xs tracking-wide text-site-muted uppercase">
                    <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Receipt
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Project
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      For
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Method
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-site-line">
                  {shown.map((p) => (
                    <tr key={p.receipt_no} className="transition-colors hover:bg-site-ivory">
                      <td className="tabular px-5 py-3.5 whitespace-nowrap sm:px-6">{formatDay(p.paid_at)}</td>
                      <td className="px-3 py-3.5">
                        <Link href={`/investor/receipts/${p.receipt_no}`} className="tabular inline-flex items-center gap-1.5 font-semibold text-site-primary hover:underline">
                          <Receipt className="size-4" aria-hidden /> {p.receipt_no}
                        </Link>
                      </td>
                      <td className="px-3 py-3.5">{holdingOf(p.holding_code)?.project.name}</td>
                      <td className="px-3 py-3.5 text-site-muted">
                        {p.allocations.map((a) => allocationLabel(holdingOf(p.holding_code), a)).join(', ')}
                        {p.late_fee > 0 && ' + late fee'}
                      </td>
                      <td className="px-3 py-3.5">
                        {PAYMENT_METHOD_LABEL[p.method]}
                        <span className="block text-xs text-site-muted">{p.method_detail}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right sm:px-6">
                        <Money amount={p.total} className="font-semibold" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyNote icon={Receipt} title="No payments yet" />
        )}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-site-line px-5 py-3.5 text-sm sm:px-6">
            <div className="flex items-center gap-3 text-site-muted">
              <span className="tabular">
                Showing {from}–{from + shown.length - 1} of {rows.length}
              </span>
              <SiteSelect
                label="Rows per page"
                size="sm"
                up
                className="w-16"
                value={size}
                onChange={(n) => {
                  setSize(n);
                  setPage(1);
                }}
                options={[5, 10, 20].map((n) => ({
                  value: n,
                  label: String(n),
                }))}
              />
            </div>
            <nav className="flex items-center gap-1" aria-label="Pages">
              <button
                type="button"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
                aria-label="Previous page"
                className="grid size-9 place-items-center rounded-lg border border-site-line bg-white disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-current={n === current ? 'page' : undefined}
                  onClick={() => setPage(n)}
                  className={cn(
                    'tabular grid size-9 place-items-center rounded-lg text-sm font-semibold transition-colors',
                    n === current ? 'bg-site-night text-white' : 'text-site-muted hover:bg-site-soft hover:text-site-ink',
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
                aria-label="Next page"
                className="grid size-9 place-items-center rounded-lg border border-site-line bg-white disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </nav>
          </div>
        )}
      </Panel>
    </div>
  );
}
