'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleDollarSign, Receipt, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { PAYMENT_METHODS, type Booking, type Payment, type PaymentMethod } from '@/lib/db/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/domain/booking';
import { bookingRepository, paymentRepository, userRepository } from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

/**
 * Receipts taken against a booking (Section 8.2 `payments`).
 *
 * The booking's "amount received" flag is derived from what is listed here, so
 * money can never be ticked off without saying when it came in, how, and
 * against which reference — which is what a receipt or an audit later needs.
 */
export function PaymentPanel({ booking }: { booking: Booking }) {
  const { userId } = useMockSession();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const payments = useLiveQuery(() => paymentRepository.listForBooking(booking.id), [booking.id]);
  const users = useLiveQuery(() => userRepository.getAll(), []);
  const received = (payments ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const outstanding = booking.final_price - received;

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  function openDialog() {
    // default to whatever still covers the booking money, the usual first receipt
    const due = Math.max(booking.booking_amount - received, 0);
    setAmount(due > 0 ? String(due) : '');
    setDate(todayLocal());
    setMethod('bank');
    setReference('');
    setNotes('');
    setError('');
    setOpen(true);
  }

  async function save() {
    const value = Number(amount);
    if (!value || value <= 0) return setError('Enter the amount received');
    if (value > outstanding + 0.01) return setError('That is more than the outstanding balance');

    setBusy(true);
    try {
      await bookingRepository.recordPayment(
        booking.id,
        {
          amount: value,
          payment_date: date,
          payment_method: method,
          reference_no: reference,
          notes,
          received_by: userId,
        },
        userId,
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const userName = (id?: string | null) =>
    users?.find((u) => u.id === id)?.name ?? '—';

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline p-3">
          <p className="text-xs text-ink-muted">Received</p>
          <p className="mt-1 text-lg font-semibold text-emerald-700">{formatBdt(received)}</p>
        </div>
        <div className="rounded-xl border border-hairline p-3">
          <p className="text-xs text-ink-muted">Outstanding</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatBdt(outstanding)}</p>
        </div>
        <div className="rounded-xl border border-hairline p-3">
          <p className="text-xs text-ink-muted">Booking money</p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {formatBdt(booking.booking_amount)}
          </p>
          <Badge tone={booking.booking_amount_received ? 'green' : 'amber'}>
            {booking.booking_amount_received ? 'Covered' : 'Not covered yet'}
          </Badge>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {payments === undefined
            ? 'Loading…'
            : `${payments.length} receipt${payments.length === 1 ? '' : 's'}`}
        </p>
        <Button size="sm" onClick={openDialog} disabled={outstanding <= 0}>
          <CircleDollarSign className="size-4" /> Record payment
        </Button>
      </div>

      {payments === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No money received yet"
          description="Record the booking money here — the date, how it was paid and the reference. The booking confirms itself once the full booking amount is in."
          action={
            <Button onClick={openDialog}>
              <CircleDollarSign className="size-4" /> Record payment
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Reference</th>
                <th className="py-2 pr-3">Received by</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-hairline last:border-0">
                  <td className="py-2.5 pr-3 text-ink">{formatDate(payment.payment_date)}</td>
                  <td className="py-2.5 pr-3 font-medium text-ink">{formatBdt(payment.amount)}</td>
                  <td className="py-2.5 pr-3">
                    <Badge>{PAYMENT_METHOD_LABEL[payment.payment_method]}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-ink-muted">{payment.reference_no || '—'}</td>
                  <td className="py-2.5 pr-3 text-ink-muted">{userName(payment.received_by)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete receipt"
                      onClick={() => setDeleteTarget(payment)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        The full instalment schedule — monthly dues, milestones, overdue tracking — is raised in
        the Finance module. These receipts feed straight into it.
      </p>

      <Modal
        open={open}
        title="Record payment"
        subtitle={`${booking.code} · outstanding ${formatBdt(outstanding)}`}
        icon={CircleDollarSign}
        size="md"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Record payment'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (BDT)" required error={error || undefined}>
            <TextInput
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              invalid={Boolean(error)}
            />
          </Field>
          <Field label="Received on" required>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Method" required>
            <SelectInput
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field
            label="Reference"
            hint="Cheque no., bank slip, bKash TrxID — whatever proves it."
          >
            <TextInput
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. TRX8H2K91LM"
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering about this payment"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this receipt"
        subtitle={deleteTarget ? formatBdt(deleteTarget.amount) : ''}
        confirmLabel="Delete receipt"
        message="Only delete a receipt entered by mistake. The booking status is recalculated from what is left, so it may drop back out of Confirmed."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await bookingRepository.removePayment(booking.id, deleteTarget.id, userId);
          }
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
