'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, CircleCheck, FileSearch, Printer } from 'lucide-react';
import { BrandMark } from '@/components/public/BrandMark';
import { Button } from '@/components/public/ui/Button';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import { CUSTOMER_TYPE_LABEL, allocationLabel, formatDay, formatPct, takaInWords } from '@/lib/domain/investor-portal';
import { formatPhone } from '@/lib/utils/format';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { EmptyNote, Money, Panel } from '../ui';

function Label({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold tracking-[0.14em] text-site-muted uppercase">{children}</p>;
}

/** Money receipt: on screen inside the portal, and a clean A4 page when printed or saved as PDF. */
export function ReceiptPage({ receiptNo }: { receiptNo: string }) {
  const company = useCompanyInfo();
  const { snapshot, portfolio } = useCustomerPortal();
  const p = snapshot.payments.find((x) => x.receipt_no === receiptNo);
  const v = p && portfolio.holdings.find((h) => h.holding.code === p.holding_code);

  if (!p || !v) {
    return (
      <Panel>
        <EmptyNote icon={FileSearch} title="Receipt not found" body="This receipt is not on your account." />
      </Panel>
    );
  }
  const c = snapshot.customer;
  const rows = p.allocations.map((a) => ({ a, inst: v.schedule.find((i) => i.id === a.installment_id)! }));
  const paidAt = new Date(p.paid_at);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/investor/history" className="inline-flex items-center gap-1.5 text-sm font-medium text-site-muted hover:text-site-primary">
          <ArrowLeft className="size-4" aria-hidden /> Payment history
        </Link>
        <Button onClick={() => window.print()} icon={<Printer className="size-4" />}>
          Print or save as PDF
        </Button>
      </div>

      <article className="overflow-hidden rounded-3xl border border-site-line bg-white shadow-site-2 print:rounded-none print:border-0 print:shadow-none">
        {/* letterhead */}
        <header className="flex flex-col gap-6 px-6 pt-8 pb-6 sm:flex-row sm:items-start sm:justify-between sm:px-12 sm:pt-12 print:px-0">
          <div>
            <BrandMark company={company} />
            <div className="mt-3 space-y-0.5 text-[13px] leading-relaxed text-site-muted">
              {company?.address && <p>{company.address}</p>}
              <p>{[company?.phone, company?.email].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <h1 className="text-xl font-semibold tracking-tight">Money receipt</h1>
            <p className="tabular mt-1 text-sm text-site-muted">No. {p.receipt_no}</p>
          </div>
        </header>

        {/* amount */}
        <section className="mx-6 rounded-2xl bg-site-ivory px-6 py-10 text-center sm:mx-12 print:mx-0 print:border print:border-site-line print:bg-transparent">
          <Label>Amount received</Label>
          <p className="font-display mt-3 text-5xl font-semibold tracking-tight sm:text-6xl">
            <Money amount={p.total} />
          </p>
          <p className="mt-3 text-sm text-site-muted italic">{takaInWords(p.total)}</p>
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-site-primary-soft px-4 py-1.5 text-sm font-semibold text-site-primary-dark">
            <CircleCheck className="size-4" aria-hidden /> Received on {formatDay(p.paid_at)}
          </span>
        </section>

        {/* key facts */}
        <section className="grid gap-6 px-6 py-8 sm:grid-cols-3 sm:px-12 print:px-0">
          <div>
            <Label>Date paid</Label>
            <p className="mt-1.5 font-semibold">{formatDay(p.paid_at)}</p>
            <p className="tabular text-sm text-site-muted">{paidAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <div>
            <Label>Payment method</Label>
            <p className="mt-1.5 font-semibold">{p.method_detail}</p>
            <p className="text-sm text-site-muted">{p.channel === 'online' ? 'Online payment gateway' : 'Recorded by our office'}</p>
          </div>
          <div className="min-w-0">
            <Label>{p.channel === 'online' ? 'Transaction ID' : 'Deposit reference'}</Label>
            <p className="mt-1.5 font-mono font-semibold break-all">{p.reference}</p>
          </div>
        </section>

        <div className="mx-6 border-t border-site-line sm:mx-12 print:mx-0" />

        {/* parties */}
        <section className="grid gap-8 px-6 py-8 sm:grid-cols-2 sm:px-12 print:px-0">
          <div>
            <Label>Received from</Label>
            <p className="mt-2 font-semibold">{c.full_name}</p>
            <p className="mt-0.5 text-sm text-site-muted">
              Customer {c.code} · {CUSTOMER_TYPE_LABEL[c.customer_type]}
            </p>
            <p className="text-sm break-words text-site-muted">
              <span className="tabular">{formatPhone(c.phone)}</span> · {c.email}
            </p>
          </div>
          <div>
            <Label>Towards</Label>
            <p className="mt-2 font-semibold">{v.project.name}</p>
            <p className="mt-0.5 text-sm text-site-muted">
              {v.holding.shares} shares ({formatPct(v.holding.share_pct)}) · Holding <span className="tabular">{v.holding.code}</span>
            </p>
            <p className="text-sm text-site-muted">
              Agreement <span className="tabular">{v.holding.agreement_no}</span>
            </p>
          </div>
        </section>

        {/* lines */}
        <section className="px-6 sm:px-12 print:px-0">
          <Label>Summary</Label>
          <table className="mt-3 w-full text-left text-sm sm:text-[15px]">
            <thead>
              <tr className="border-b border-site-line text-site-muted">
                <th scope="col" className="py-3 pr-3 font-medium">Description</th>
                <th scope="col" className="hidden px-3 py-3 font-medium sm:table-cell">Due date</th>
                <th scope="col" className="py-3 pl-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-site-line">
              {rows
                .filter(({ a }) => a.principal > 0)
                .map(({ a, inst }) => (
                  <tr key={a.installment_id}>
                    <td className="py-4 pr-3">
                      <span className="font-medium">{allocationLabel(v, a)}</span>
                      {a.principal < inst.amount && (
                        <span className="block text-xs text-site-muted">
                          Toward the <Money amount={inst.amount} /> installment
                        </span>
                      )}
                      <span className="block text-xs text-site-muted sm:hidden">Due {formatDay(inst.due_date)}</span>
                    </td>
                    <td className="tabular hidden px-3 py-4 text-site-muted sm:table-cell">{formatDay(inst.due_date)}</td>
                    <td className="py-4 pl-3 text-right">
                      <Money amount={a.principal} />
                    </td>
                  </tr>
                ))}
              {p.late_fee > 0 && (
                <tr>
                  <td className="py-4 pr-3 font-medium">Late fee</td>
                  <td className="hidden px-3 py-4 sm:table-cell" />
                  <td className="py-4 pl-3 text-right">
                    <Money amount={p.late_fee} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <dl className="mt-2 space-y-2 border-t-2 border-site-ink pt-4 text-[15px] sm:ml-auto sm:max-w-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-site-muted">Toward installments</dt>
              <dd><Money amount={p.principal} /></dd>
            </div>
            {p.late_fee > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-site-muted">Late fee</dt>
                <dd><Money amount={p.late_fee} /></dd>
              </div>
            )}
            <div className="flex items-end justify-between gap-4 pt-1">
              <dt className="font-semibold">Total received</dt>
              <dd><Money amount={p.total} className="font-display text-xl font-semibold" /></dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-site-line pt-3 text-sm">
              <dt className="text-site-muted">Outstanding on this investment today</dt>
              <dd><Money amount={v.outstanding} className="font-semibold" /></dd>
            </div>
          </dl>
        </section>

        <footer className="mt-10 border-t border-site-line bg-site-ivory px-6 py-6 text-center text-xs leading-relaxed text-site-muted sm:px-12 print:bg-transparent print:px-0">
          <p>This is a computer-generated receipt and needs no signature.</p>
          <p className="mt-1">
            Questions about this payment? Contact {company?.company_name ?? 'us'}
            {company?.phone ? ` at ${company.phone}` : ''} and quote receipt <span className="tabular font-semibold">{p.receipt_no}</span>.
          </p>
        </footer>
      </article>
    </div>
  );
}
