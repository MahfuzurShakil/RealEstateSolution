'use client';

import { use } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PrintField, PrintSheet, SignatureRow } from '@/components/print/PrintSheet';
import { amountInWords } from '@/lib/domain/document';
import {
  PREMIUM_FIELD,
  PREMIUM_LABEL,
  projectShape,
  shapeUses,
  unitSizeLabel,
  type PremiumKind,
} from '@/lib/domain/project';
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

  /*
   * v27 — the form names what was actually sold.
   *
   * A buyer of Plot C-14 should not be handed a sheet headed "Unit" listing a
   * floor and a size in sqft. The shape supplies the words; the *amounts*
   * still come from the booking's own snapshot columns, so a repricing of the
   * plot after the fact cannot contradict the copy the buyer signed.
   *
   * A premium the shape no longer uses is still printed when it carries money,
   * because the lines have to add up to the total payable underneath them.
   */
  const shape = projectShape(booking.project?.project_type ?? 'apartment');
  const premiumLines = (['floor', 'facing', 'parking', 'road', 'corner'] as PremiumKind[])
    .filter((kind) => shape.premiums.includes(kind) || Number(booking[PREMIUM_FIELD[kind]]) > 0)
    .map((kind) => ({
      label: PREMIUM_LABEL[kind],
      amount: Number(booking[PREMIUM_FIELD[kind]]) || 0,
    }));

  const priceLines: { label: string; amount: number; negative?: boolean }[] = [
    { label: 'Base price', amount: booking.base_price },
    ...premiumLines,
    { label: 'Other charges', amount: booking.other_charges },
    { label: 'Less: discount', amount: booking.discount_amount, negative: true },
  ];

  return (
    <PrintSheet
      company={company}
      title="Booking Form"
      subtitle={booking.code}
      footnote={
        shape.item === 'share'
          ? 'This form records the agreed terms at the time of booking. Title passes only on registration of the share deed.'
          : 'This form records the agreed terms at the time of booking. It is not a deed of sale.'
      }
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
          {shape.labels.item}
        </h2>
        <div className="grid grid-cols-3 gap-4 border-b border-hairline pb-4">
          <PrintField label="Project" value={booking.project?.name ?? '—'} />
          {shape.container !== 'none' && (
            <PrintField label={shape.labels.container} value={booking.tower?.name ?? '—'} />
          )}
          <PrintField label={shape.labels.item} value={booking.unit?.code ?? '—'} />
          {shapeUses(shape, 'floor') && (
            <PrintField
              label="Floor"
              value={booking.unit?.floor != null ? String(booking.unit.floor) : '—'}
            />
          )}
          <PrintField
            label={shape.labels.size}
            value={booking.unit ? unitSizeLabel(booking.unit, shape) : '—'}
          />
          {shapeUses(shape, 'road_width') && (
            <PrintField
              label="Road width"
              value={booking.unit?.road_width_ft ? `${booking.unit.road_width_ft} ft` : '—'}
            />
          )}
          {shapeUses(shape, 'corner') && (
            <PrintField label="Corner" value={booking.unit?.is_corner ? 'Yes' : 'No'} />
          )}
          {shapeUses(shape, 'facing') && (
            <PrintField label="Facing" value={humanize(booking.unit?.facing)} />
          )}
          <PrintField label="Type" value={humanize(booking.unit?.unit_type)} />
          {shapeUses(shape, 'parking') && (
            <PrintField
              label="Parking"
              value={booking.unit ? String(booking.unit.parking_allocated) : '—'}
            />
          )}
          <PrintField label="Booking date" value={formatDate(booking.booking_date)} />
        </div>
        {/*
          A landowner-share unit is sold on the owner's behalf under the JV
          (Section 2.4). The buyer's form has to say so — it is the reason the
          counterparty on the deed is not the developer alone.
        */}
        {allocated_owner_name ? (
          <p className="mt-2 text-xs text-ink-muted">
            Landowner share {shape.labels.item.toLowerCase()} — allocated to{' '}
            {allocated_owner_name}.
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
