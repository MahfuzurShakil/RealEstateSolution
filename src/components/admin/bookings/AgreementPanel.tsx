'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, FileSignature, Pencil } from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { ShareDocumentChecklist } from '@/components/admin/share-sale/ShareDocuments';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import type { Booking } from '@/lib/db/types';
import {
  SALE_PAYMENT_MODE_LABEL,
  expectedLines,
  hasAgreement,
  installmentAmount,
} from '@/lib/domain/booking';
import { bookingRepository, customerRepository, customerUploadRepository, paymentRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';
import {
  AgreementFields,
  agreementFromBooking,
  agreementInput,
  validateAgreement,
  type AgreementForm,
} from './AgreementFields';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/**
 * The Agreement tab (SALES-FLOW-PLAN.md S3): the agreement's terms, what they
 * expect and when, and the signed copy. Recorded with the booking or any time
 * after — the booking's status never waits on it.
 */
export function AgreementPanel({ booking }: { booking: Booking }) {
  const [editing, setEditing] = useState(false);
  const received = useLiveQuery(() => paymentRepository.totalForBooking(booking.id), [booking.id]);
  const today = todayLocal();
  const recorded = hasAgreement(booking);
  const lines = expectedLines(booking);
  const each = booking.payment_mode === 'installment' ? installmentAmount(booking) : 0;
  const cancelled = booking.status === 'cancelled';
  const signing = booking.signing ?? null;
  const customer = useLiveQuery(() => customerRepository.getById(booking.customer_id), [booking.customer_id]);
  const uploads = useLiveQuery(() => customerUploadRepository.forCustomer(booking.customer_id), [booking.customer_id]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Agreement"
          action={
            recorded && !cancelled ? (
              <div className="flex gap-2">
                {!signing && (
                  <Link href={`/admin/bookings/${booking.id}/sign`}>
                    <Button size="sm">
                      <FileSignature className="size-4" /> Sign with papers
                    </Button>
                  </Link>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit terms
                </Button>
              </div>
            ) : undefined
          }
        />
        {!recorded ? (
          <EmptyState
            icon={FileSignature}
            title="No agreement recorded yet"
            description="Sign it step by step — terms, the buyer's details, witnesses and stamp, and the papers on file — the way a share purchase is signed. Or record the terms only, and sign later."
            action={
              !cancelled ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href={`/admin/bookings/${booking.id}/sign`}>
                    <Button>
                      <FileSignature className="size-4" /> Sign agreement
                    </Button>
                  </Link>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    Record terms only
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-x-8 md:grid-cols-2">
            <div>
              <Row label="Signed on" value={formatDate(booking.agreement_date)} />
              <Row label="Agreement no." value={booking.agreement_no} />
              <Row
                label="Payment"
                value={booking.payment_mode ? SALE_PAYMENT_MODE_LABEL[booking.payment_mode] : null}
              />
              {booking.payment_mode === 'full' && (
                <Row label="Full price due by" value={formatDate(booking.full_payment_due_date)} />
              )}
              {booking.payment_mode === 'installment' && (
                <>
                  <Row
                    label="Installments"
                    value={`${booking.installment_count ?? 0} × ${formatBdt(each)} monthly`}
                  />
                  <Row label="First installment" value={formatDate(booking.first_installment_date)} />
                </>
              )}
              <Row label="Handover by" value={formatDate(booking.handover_date)} />
              <Row
                label="Late fee"
                value={
                  booking.late_fee_pct
                    ? `${booking.late_fee_pct}% of an installment, after ${booking.late_fee_grace_days ?? 0} days`
                    : 'None'
                }
              />
            </div>
            <div className="pt-2.5 md:pt-0">
              <p className="mb-1.5 text-sm text-ink-muted">Other terms</p>
              <p className="whitespace-pre-wrap text-sm text-ink">
                {booking.agreement_terms || <span className="text-ink-muted">Nothing else recorded.</span>}
              </p>
            </div>
          </div>
        )}
      </Card>

      {recorded && lines.length > 1 && (
        <Card>
          <CardHeader
            title="When the money is expected"
            action={<Badge tone="neutral">{lines.length} dates</Badge>}
          />
          <p className="mb-3 text-xs text-ink-muted">
            Worked out from the terms above — change them and this changes too. A date is ticked
            once the receipts so far cover it.
          </p>
          <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {lines.map((line, i) => {
              const before = i === 0 ? 0 : lines[i - 1].cumulative;
              const covered = (received ?? 0) + 0.5 >= line.cumulative;
              const late = !covered && line.date < today;
              return (
                <li
                  key={`${line.date}-${line.label}`}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm',
                    late ? 'bg-red-50' : 'odd:bg-canvas/60',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full',
                      covered ? 'bg-emerald-500 text-white' : 'bg-slate-100',
                    )}
                  >
                    {covered && <Check className="size-3" />}
                  </span>
                  <span className="w-28 shrink-0 text-ink-muted">{formatDate(line.date)}</span>
                  <span className="flex-1 text-ink">{line.label}</span>
                  <span className={cn('font-medium', late ? 'text-red-600' : 'text-ink')}>
                    {formatBdt(line.cumulative - before)}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {signing && (
        <Card>
          <CardHeader title="Signing" action={<Badge tone="green">Signed</Badge>} />
          <div className="grid gap-x-8 md:grid-cols-2">
            <div>
              <Row label="Signed at" value={signing.place} />
              <Row label="For the company" value={[signing.company_signatory, signing.company_signatory_title].filter(Boolean).join(', ')} />
              {signing.attorney_name && <Row label="For the buyer, by attorney" value={signing.attorney_name} />}
              <Row label="Witnesses" value={signing.witnesses.map((w) => w.name).join(' and ')} />
            </div>
            <div>
              <Row
                label="Stamp paper"
                value={signing.stamp_value != null ? `${formatBdt(signing.stamp_value)}${signing.stamp_serial ? ` · no. ${signing.stamp_serial}` : ''}` : null}
              />
              <Row label="Notarized" value={signing.notarized_on ? `${formatDate(signing.notarized_on)}${signing.notary_name ? ` · ${signing.notary_name}` : ''}` : null} />
              <Row label="Buyer's NID" value={customer?.nid} />
              <Row label="Nominee" value={customer?.nominee_name ? `${customer.nominee_name}${customer.nominee_relation ? ` (${customer.nominee_relation})` : ''}` : null} />
            </div>
          </div>
        </Card>
      )}

      {/* BUYER-PORTAL-PLAN.md §2.7 — the same papers checklist as a share purchase; the buyer sees these on the portal */}
      {uploads && customer && (
        <Card>
          <CardHeader title="Buyer's papers" />
          <ShareDocumentChecklist
            uploads={uploads}
            sale={{ id: booking.id, code: booking.code, customer_id: booking.customer_id }}
            owner="booking"
            hasNominee={!!customer.nominee_name}
            byAttorney={!!signing?.attorney_name}
            mayEdit={!cancelled}
          />
        </Card>
      )}

      <Card>
        <CardHeader title="Other documents" />
        <DocumentsPanel entityType="booking" entityId={booking.id} />
      </Card>

      {editing && <AgreementModal booking={booking} onClose={() => setEditing(false)} />}
    </div>
  );
}

function AgreementModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const [form, setForm] = useState<AgreementForm>(() => agreementFromBooking(booking, todayLocal()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = validateAgreement(form);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      await bookingRepository.saveAgreement(booking.id, agreementInput(form));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={hasAgreement(booking) ? 'Edit agreement' : 'Record agreement'}
      subtitle={`${booking.code} · final price ${formatBdt(booking.final_price)}`}
      icon={FileSignature}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save agreement'}
          </Button>
        </>
      }
    >
      <AgreementFields
        value={form}
        onChange={setForm}
        errors={errors}
        finalPrice={booking.final_price}
        bookingAmount={booking.booking_amount}
      />
    </Modal>
  );
}
