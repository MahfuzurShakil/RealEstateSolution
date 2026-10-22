'use client';

import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, FileSignature, Pencil } from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
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
  kistiAmount,
} from '@/lib/domain/booking';
import { bookingRepository, paymentRepository } from '@/lib/repositories';
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
 * The Agreement tab (SALES-FLOW-PLAN.md S3): the চুক্তি's terms, what they
 * expect and when, and the signed copy. Recorded with the booking or any time
 * after — the booking's status never waits on it.
 */
export function AgreementPanel({ booking }: { booking: Booking }) {
  const [editing, setEditing] = useState(false);
  const received = useLiveQuery(() => paymentRepository.totalForBooking(booking.id), [booking.id]);
  const today = todayLocal();
  const recorded = hasAgreement(booking);
  const lines = expectedLines(booking);
  const kisti = booking.payment_mode === 'installment' ? kistiAmount(booking) : 0;
  const cancelled = booking.status === 'cancelled';

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Agreement (চুক্তি)"
          action={
            recorded && !cancelled ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            ) : undefined
          }
        />
        {!recorded ? (
          <EmptyState
            icon={FileSignature}
            title="No agreement recorded yet"
            description="Record the agreement's date, how the buyer pays (full or in kisti), the handover date and anything else it says. Attach the signed copy below."
            action={
              !cancelled ? (
                <Button onClick={() => setEditing(true)}>
                  <FileSignature className="size-4" /> Record agreement
                </Button>
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
                    label="Kisti"
                    value={`${booking.installment_count ?? 0} × ${formatBdt(kisti)} monthly`}
                  />
                  <Row label="First kisti" value={formatDate(booking.first_installment_date)} />
                </>
              )}
              <Row label="Handover by" value={formatDate(booking.handover_date)} />
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

      <Card>
        <CardHeader title="Signed copy & documents" />
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
