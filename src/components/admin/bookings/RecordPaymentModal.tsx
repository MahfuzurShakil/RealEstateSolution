'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { AccountPicker } from '@/components/admin/finance/AccountPicker';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { PAYMENT_METHODS, type Booking, type PaymentMethod } from '@/lib/db/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/domain/booking';
import { allocatePayment } from '@/lib/domain/installment-ledger';
import { bookingLedgerRepository, bookingRepository, paymentRepository } from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

/**
 * The "record payment" dialog, on its own so more than one screen can open it.
 *
 * It lived inside `PaymentPanel`, which meant taking a receipt was only
 * possible from the booking's Payments tab — four steps from the collections
 * queue, the screen built for exactly that job. The rules are unchanged and
 * still enforced by `bookingRepository.recordPayment`; this is only the form.
 *
 * `defaultAmount` lets the caller suggest a figure (the collections queue
 * suggests what that installment still needs). Receipts are allocated
 * by the booking ledger (late fees, then oldest row first), so the money lands where the
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
  const ledger = useLiveQuery(() => bookingLedgerRepository.view(booking.id), [booking.id]);
  // late fees ride on top of the price; the ledger takes them first
  const lateFees = ledger?.late_fees ?? 0;
  const outstanding = booking.final_price - (received ?? 0) + lateFees;

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
  const [accountError, setAccountError] = useState('');
  const [busy, setBusy] = useState(false);
  const typed = Math.round(Number(amount) || 0);
  const alloc = ledger && typed > 0 && typed <= outstanding + 0.01 ? allocatePayment(ledger.schedule, typed) : [];

  async function save() {
    const value = Number(amount);
    /*
     * "Enter the amount received" reads as "you left it blank", which is wrong
     * advice when the field holds -5000. Separate the two states.
     */
    if (!amount.trim() || Number.isNaN(value)) return setError('Enter the amount received');
    if (value <= 0) return setError('Amount must be greater than zero');
    if (received === undefined) return;
    if (value > outstanding + 0.01) {
      return setError(`That is more than is owed (${formatBdt(outstanding)}${lateFees ? ' incl. late fees' : ''})`);
    }
    setError('');
    if (!accountId) return setAccountError('Pick the account it went into');

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
          <Button variant="outline" onClick={onClose} viewSafe disabled={busy}>
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
          <MoneyInput
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
        {/* SALES-FLOW-PLAN.md S4 — every receipt is money into a bank or cash account */}
        <AccountPicker
          value={accountId}
          onChange={(id) => {
            setAccountId(id);
            setAccountError('');
          }}
          label="Received into"
          required
          error={accountError || undefined}
        />

        <Field label="Notes" className="sm:col-span-2">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this payment"
          />
        </Field>
      </div>
      {/* the same preview Share Sale shows: late fees first, then the oldest row */}
      {alloc.length > 0 && ledger && (
        <div className="mt-4 rounded-xl border border-hairline bg-white text-sm">
          <p className="border-b border-hairline px-4 py-2.5 font-semibold text-ink">How it is applied</p>
          <ul className="divide-y divide-hairline">
            {alloc.map((a) => {
              const row = ledger.schedule.find((r) => r.id === a.installment_id)!;
              return (
                <li key={a.installment_id} className="flex justify-between gap-3 px-4 py-2">
                  <span>
                    {row.label} <span className="text-xs text-ink-muted">due {formatDate(row.due_date)}</span>
                    {a.late_fee > 0 && (
                      <span className="text-xs text-ink-muted"> · incl. {formatBdt(a.late_fee)} late fee</span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatBdt(a.principal + a.late_fee)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
