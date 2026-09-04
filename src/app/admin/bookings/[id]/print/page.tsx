'use client';

import { use } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PrintField, PrintSheet, SignatureRow } from '@/components/print/PrintSheet';
import { amountInWords } from '@/lib/domain/document';
import { printRepository } from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone, humanize } from '@/lib/utils/format';

/**
 * Booking form (Tier 3.6) — the sheet the buyer signs.
 *
 * The price breakdown is printed from the booking's own snapshot columns
 * (Section 5.6), not recomputed from the unit: the unit can be repriced after
 * the booking, and a form that quietly followed the new price would contradict
 * the copy the buyer already signed.
 */
export default function BookingFormPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const data = useLiveQuery(() => printRepository.getBookingForm(id), [id]);

  if (data === undefined) return <p className="p-6 text-sm text-ink-muted">Loading booking form…</p>;
  if (data === null) return <p className="p-6 text-sm text-ink-muted">That booking no longer exists.</p>;

  const { company, booking, allocated_owner_name } = data;
  const currency = company?.default_currency ?? 'BDT';

  const priceLines: { label: string; amount: number; negative?: boolean }[] = [
    { label: 'Base price', amount: booking.base_price },
    { label: 'Floor premium', amount: booking.floor_premium },
    { label: 'Facing premium', amount: booking.facing_premium },
    { label: 'Parking charge', amount: booking.parking_charge },
    { label: 'Other charges', amount: booking.other_charges },
    { label: 'Less: discount', amount: booking.discount_amount, negative: true },
  ];

  return (
    <PrintSheet
      company={company}
      title="Booking Form"
      subtitle={booking.code}
      footnote="This form records the agreed terms at the time of booking. It is not a deed of sale."
    >
      <section className="print-nobreak">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Applicant
        </h2>
        <div className="grid grid-cols-2 gap-4 border-b border-hairline pb-4">
          <PrintField label="Name" value={booking.customer?.name ?? '—'} />
          <PrintField label="Customer code" value={booking.customer?.code ?? '—'} />
          <PrintField label="Phone" value={formatPhone(booking.customer?.phone)} />
          <PrintField label="NID" value={booking.customer?.nid || '—'} />
          <PrintField label="Address" value={booking.customer?.address || '—'} className="col-span-2" />
        </div>
      </section>

      <section className="print-nobreak">
        <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Unit
        </h2>
        <div className="grid grid-cols-3 gap-4 border-b border-hairline pb-4">
          <PrintField label="Project" value={booking.project?.name ?? '—'} />
          <PrintField label="Tower" value={booking.tower?.name ?? '—'} />
          <PrintField label="Unit" value={booking.unit?.code ?? '—'} />
          <PrintField label="Floor" value={booking.unit ? String(booking.unit.floor) : '—'} />
          <PrintField label="Size" value={booking.unit ? `${booking.unit.size_sqft} sqft` : '—'} />
          <PrintField label="Facing" value={humanize(booking.unit?.facing) } />
          <PrintField label="Type" value={humanize(booking.unit?.unit_type)} />
          <PrintField
            label="Parking"
            value={booking.unit ? String(booking.unit.parking_allocated) : '—'}
          />
          <PrintField label="Booking date" value={formatDate(booking.booking_date)} />
        </div>
        {/*
          A landowner-share unit is sold on the owner's behalf under the JV
          (Section 2.4). The buyer's form has to say so — it is the reason the
          counterparty on the deed is not the developer alone.
        */}
        {allocated_owner_name ? (
          <p className="mt-2 text-xs text-ink-muted">
            Landowner share unit — allocated to {allocated_owner_name}.
          </p>
        ) : null}
      </section>

      <section className="print-nobreak">
        <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Price
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {priceLines.map((line) => (
              <tr key={line.label} className="border-b border-hairline">
                <td className="py-1.5 text-ink-muted">{line.label}</td>
                <td className="py-1.5 text-right">
                  {line.negative && line.amount > 0
                    ? `(${formatBdt(line.amount)})`
                    : formatBdt(line.amount)}
                </td>
              </tr>
            ))}
            <tr className="border-b-2 border-ink">
              <td className="py-1.5 font-medium">Total payable</td>
              <td className="py-1.5 text-right font-semibold">{formatBdt(booking.final_price)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1.5 text-sm italic text-ink">
          {amountInWords(booking.final_price, currency === 'BDT' ? 'Taka' : currency)}
        </p>
      </section>

      <section className="print-nobreak">
        <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Payment terms
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <PrintField label="Booking money" value={formatBdt(booking.booking_amount)} />
          <PrintField
            label="Instalment tenure"
            value={
              booking.installment_tenure_months
                ? `${booking.installment_tenure_months} months`
                : 'As per project plan'
            }
          />
          <PrintField label="Received to date" value={formatBdt(booking.amount_received)} />
        </div>
      </section>

      <SignatureRow
        left={booking.seller ? `For the developer — ${booking.seller.name}` : 'For the developer'}
        right="Applicant signature"
      />
    </PrintSheet>
  );
}
