'use client';

import { use } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PrintField, PrintSheet, SignatureRow } from '@/components/print/PrintSheet';
import { amountInWords } from '@/lib/domain/document';
import { SUPPLIER_PAYMENT_METHOD_META, lineTotal } from '@/lib/domain/procurement';
import { printRepository } from '@/lib/repositories';
import { formatBdt, formatBdtRate, formatDate } from '@/lib/utils/format';

/**
 * Supplier payment voucher (Tier 3.6) — what accounts files against the money
 * that left the account.
 *
 * The order's lines are printed so the voucher answers "paid for what" without
 * pulling the purchase order out of the file. Line rates use `formatBdtRate`,
 * not `formatBdt`: a rate rounded to whole taka stops multiplying out against
 * its own line total, which is exactly the discrepancy a clerk reconciling a
 * supplier's bill would then go hunting for.
 */
export default function SupplierVoucherPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const data = useLiveQuery(() => printRepository.getVoucher(id), [id]);

  if (data === undefined) return <p className="p-6 text-sm text-ink-muted">Loading voucher…</p>;
  if (data === null) return <p className="p-6 text-sm text-ink-muted">That voucher no longer exists.</p>;

  const { company, voucher, items, paid_against_order } = data;
  const currency = company?.default_currency ?? 'BDT';
  const orderValue = items.reduce((sum, item) => sum + lineTotal(item), 0);

  return (
    <PrintSheet
      company={company}
      title="Payment Voucher"
      subtitle={voucher.code}
      footnote="Supplier payment voucher. Attach the supplier's bill and, where applicable, the cheque counterfoil."
    >
      <div className="grid grid-cols-2 gap-4 border-b border-hairline pb-4">
        <PrintField label="Paid to" value={voucher.supplier?.name ?? '—'} />
        <PrintField label="Date" value={formatDate(voucher.payment_date)} />
        <PrintField label="Against order" value={voucher.order?.code ?? '—'} />
        {/*
          A voucher with no project is a central-store purchase, not missing
          data — Section 7.11's cost chain takes the project off the order, and
          a central purchase legitimately has none.
        */}
        <PrintField label="Project" value={voucher.project?.name ?? 'Central store'} />
        <PrintField
          label="Payment method"
          value={SUPPLIER_PAYMENT_METHOD_META[voucher.payment_method]}
        />
        <PrintField label="Reference" value={voucher.reference_no || '—'} />
      </div>

      <div className="print-nobreak my-4 rounded-lg border-2 border-ink px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-muted">Amount paid</p>
        <p className="text-2xl font-semibold text-ink">{formatBdt(voucher.amount)}</p>
        <p className="mt-1 text-sm italic text-ink">
          {amountInWords(voucher.amount, currency === 'BDT' ? 'Taka' : currency)}
        </p>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Order lines
      </h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="py-1.5 pr-2">Item</th>
            <th className="py-1.5 pr-2 text-right">Ordered</th>
            <th className="py-1.5 pr-2 text-right">Rate</th>
            <th className="py-1.5 text-right">Line total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="print-nobreak border-b border-hairline">
              <td className="py-1.5 pr-2">{item.item_name}</td>
              <td className="py-1.5 pr-2 text-right">
                {item.quantity_ordered} {item.unit}
              </td>
              <td className="py-1.5 pr-2 text-right">{formatBdtRate(item.unit_price)}</td>
              <td className="py-1.5 text-right">{formatBdt(lineTotal(item))}</td>
            </tr>
          ))}
          <tr className="border-b-2 border-ink">
            <td colSpan={3} className="py-1.5 font-medium">
              Order value
            </td>
            <td className="py-1.5 text-right font-semibold">{formatBdt(orderValue)}</td>
          </tr>
        </tbody>
      </table>

      {/*
        The running position against the order, so whoever signs can see
        whether this payment settles it or is one of several.
      */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <PrintField label="Paid against this order to date" value={formatBdt(paid_against_order)} />
        <PrintField label="Order value still unpaid" value={formatBdt(orderValue - paid_against_order)} />
      </div>

      <SignatureRow
        left={voucher.paid_by_name ? `Prepared by — ${voucher.paid_by_name}` : 'Prepared by'}
        right="Authorised signature"
      />
    </PrintSheet>
  );
}
