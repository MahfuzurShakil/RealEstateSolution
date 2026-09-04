'use client';

import { use } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PrintField, PrintSheet, SignatureRow } from '@/components/print/PrintSheet';
import { PAYMENT_METHOD_LABEL } from '@/lib/domain/booking';
import { amountInWords } from '@/lib/domain/document';
import { printRepository } from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

/**
 * Money receipt (Tier 3.6) — what the buyer walks out with.
 *
 * Everything on it is already stored: the payment, the booking it was taken
 * against, and the company block from Settings. Nothing is computed here that
 * is not computed the same way on the booking's Payments tab, so a receipt and
 * the screen behind it cannot disagree.
 */
export default function MoneyReceiptPrintPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = use(params);
  const data = useLiveQuery(() => printRepository.getReceipt(paymentId), [paymentId]);

  if (data === undefined) return <p className="p-6 text-sm text-ink-muted">Loading receipt…</p>;
  if (data === null) {
    return <p className="p-6 text-sm text-ink-muted">That payment no longer exists.</p>;
  }

  const { company, payment, booking, received_by_name, paid_to_date, balance } = data;
  const currency = company?.default_currency ?? 'BDT';
  const unitLabel = [booking.project?.name, booking.tower?.name, booking.unit?.code]
    .filter(Boolean)
    .join(' · ');

  return (
    <PrintSheet
      company={company}
      title="Money Receipt"
      subtitle={`No. ${payment.reference_no?.trim() || payment.id.slice(0, 8).toUpperCase()}`}
      footnote="Computer-generated receipt. A cheque or online payment is subject to realisation."
    >
      <div className="grid grid-cols-2 gap-4 border-b border-hairline pb-4">
        <PrintField label="Received from" value={booking.customer?.name ?? '—'} />
        <PrintField label="Date" value={formatDate(payment.payment_date)} />
        <PrintField label="Phone" value={formatPhone(booking.customer?.phone)} />
        <PrintField label="Booking" value={booking.code} />
        <PrintField label="Address" value={booking.customer?.address || '—'} className="col-span-2" />
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-hairline py-4">
        <PrintField label="Against unit" value={unitLabel || '—'} className="col-span-2" />
        <PrintField label="Payment method" value={PAYMENT_METHOD_LABEL[payment.payment_method]} />
        <PrintField label="Reference" value={payment.reference_no || '—'} />
      </div>

      {/*
        The amount is the point of the document, so it is set apart from the
        detail rather than sitting in the grid with everything else. The words
        beneath it are the traditional guard against a figure being altered by
        a pen stroke after the receipt leaves the counter.
      */}
      <div className="print-nobreak my-4 rounded-lg border-2 border-ink px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-muted">Amount received</p>
        <p className="text-2xl font-semibold text-ink">{formatBdt(payment.amount)}</p>
        <p className="mt-1 text-sm italic text-ink">
          {amountInWords(payment.amount, currency === 'BDT' ? 'Taka' : currency)}
        </p>
      </div>

      {/*
        A buyer paying in instalments asks the same question at the counter
        every time — how much is left. The figures come off the booking's own
        snapshot price, so they match the Payments tab exactly.
      */}
      <table className="print-nobreak w-full border-collapse text-sm">
        <tbody>
          <tr className="border-b border-hairline">
            <td className="py-1.5 text-ink-muted">Agreed unit price</td>
            <td className="py-1.5 text-right">{formatBdt(booking.final_price)}</td>
          </tr>
          <tr className="border-b border-hairline">
            <td className="py-1.5 text-ink-muted">Total received to date</td>
            <td className="py-1.5 text-right">{formatBdt(paid_to_date)}</td>
          </tr>
          <tr className="border-b-2 border-ink">
            <td className="py-1.5 font-medium">Balance outstanding</td>
            <td className="py-1.5 text-right font-semibold">{formatBdt(balance)}</td>
          </tr>
        </tbody>
      </table>

      <SignatureRow
        left={received_by_name ? `Received by — ${received_by_name}` : 'Received by'}
        right="Customer signature"
      />
    </PrintSheet>
  );
}
