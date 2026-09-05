'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { AccountPicker } from '@/components/admin/finance/AccountPicker';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { PAYMENT_METHODS, type Booking, type PaymentMethod } from '@/lib/db/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/domain/booking';
import { bookingRepository, paymentRepository } from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/**
 * The "record payment" dialog, on its own so more than one screen can open it.
 *
 * It lived inside `PaymentPanel`, which meant taking a receipt was only
 * possible from the booking's Payments tab — four steps from the collections
 * queue, the screen built for exactly that job. The rules are unchanged and
 * still enforced by `bookingRepository.recordPayment`; this is only the form.
 *
 * `defaultAmount` lets the caller suggest a figure (the collections queue
 * suggests what that instalment still needs). Receipts are allocated
 * oldest-first by the finance repository, so the money still lands where the
 * schedule says it should, not necessarily on the row that was clicked.
 */
export function RecordPaymentModal({
  open,
  booking,
  defaultAmount,
  subtitle,
  onClose,
  onSaved,
}: {
  open: boolean;
  booking: Booking;
  defaultAmount?: number;
  /** replaces the default "<code> · outstanding <x>" line */
  subtitle?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!open) return null;
  return (
    <PaymentDialog
      booking={booking}
      defaultAmount={defaultAmount}
      subtitle={subtitle}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

/*
 * Split so the hooks below only run while the dialog is open — the amount is
 * seeded from what is outstanding at the moment it opens, and remounting is
 * what makes that a plain `useState` rather than an effect writing into state.
 */
function PaymentDialog({
  booking,
  defaultAmount,
  subtitle,
  onClose,
  onSaved,
}: {
  booking: Booking;
  defaultAmount?: number;
  subtitle?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { userId } = useMockSession();
  const received = useLiveQuery(() => paymentRepository.totalForBooking(booking.id), [booking.id]);
  const outstanding = booking.final_price - (received ?? 0);

  const suggested =
    defaultAmount !== undefined
      ? defaultAmount
      : Math.max(booking.booking_amount - (received ?? 0), 0);

  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : '');
  const [date, setDate] = useState(todayLocal());
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const value = Number(amount);
    /*
     * "Enter the amount received" reads as "you left it blank", which is wrong
     * advice when the field holds -5000. Separate the two states.
     */
    if (!amount.trim() || Number.isNaN(value)) return setError('Enter the amount received');
    if (value <= 0) return setError('Amount must be greater than zero');
    if (received === undefined) return;
    if (value > outstanding + 0.01) return setError('That is more than the outstanding balance');

    setBusy(true);
    try {
      await bookingRepository.recordPayment(
        booking.id,
        {
          amount: value,
          payment_date: date,
          payment_method: method,
          account_id: accountId || null,
          reference_no: reference,
          notes,
          received_by: userId,
        },
        userId,
      );
      onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="Record payment"
      subtitle={subtitle ?? `${booking.code} · outstanding ${formatBdt(outstanding)}`}
      icon={CircleDollarSign}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || received === undefined}>
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
          <SelectInput value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Reference" hint="Cheque no., bank slip, bKash TrxID — whatever proves it.">
          <TextInput
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. TRX8H2K91LM"
          />
        </Field>
        <AccountPicker value={accountId} onChange={setAccountId} label="Received into" />

        <Field label="Notes" className="sm:col-span-2">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this payment"
          />
        </Field>
      </div>
    </Modal>
  );
}
