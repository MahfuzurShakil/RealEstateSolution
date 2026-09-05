'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { AccountPicker } from '@/components/admin/finance/AccountPicker';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  SUPPLIER_PAYMENT_METHODS,
  type Booking,
  type SupplierPaymentMethod,
} from '@/lib/db/types';
import { money } from '@/lib/domain/finance';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import { refundRepository, userRepository } from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/**
 * Return money on a cancelled booking (Section 8.2).
 *
 * The gross `amount` is what leaves the buyer's ledger and the `deduction` is
 * the cancellation charge withheld, so the cheque is the difference. Only the
 * gross is checked against what they actually paid — deducting a charge does
 * not create headroom to refund more than came in.
 */
export function RefundModal({
  open,
  booking,
  onClose,
  onSaved,
}: {
  open: boolean;
  booking: Booking;
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!open) return null;
  return <RefundDialog booking={booking} onClose={onClose} onSaved={onSaved} />;
}

function RefundDialog({
  booking,
  onClose,
  onSaved,
}: {
  booking: Booking;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { userId } = useMockSession();
  const refundable = useLiveQuery(() => refundRepository.refundableFor(booking.id), [booking.id]);
  const financeTeam = useLiveQuery(
    () => userRepository.listByRole(['accounts', 'management', 'super_admin']),
    [],
  );

  const left = refundable?.left ?? 0;
  const [amount, setAmount] = useState('');
  const [deduction, setDeduction] = useState('');
  const [refundDate, setRefundDate] = useState(todayLocal());
  const [method, setMethod] = useState<SupplierPaymentMethod>('bank');
  const [reference, setReference] = useState('');
  const [processedBy, setProcessedBy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // the field starts blank until we know what is refundable, then defaults to
  // all of it — the usual case — without an effect writing into state
  const amountValue = amount === '' ? left : Number(amount) || 0;
  const deductionValue = Number(deduction) || 0;
  const net = money(Math.max(0, amountValue - deductionValue));
  const tooMuch = amountValue > left + 0.009;

  async function save() {
    setBusy(true);
    try {
      await refundRepository.issue(
        {
          booking_id: booking.id,
          amount: amountValue,
          deduction: deductionValue,
          refund_date: refundDate,
          payment_method: method,
          account_id: accountId || null,
          reference_no: reference.trim() || null,
          processed_by: processedBy || userId,
          notes: notes.trim() || null,
        },
        userId,
      );
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The refund could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="Refund the Buyer"
      subtitle={`${booking.code} · cancelled booking`}
      icon={Undo2}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || tooMuch || left <= 0}>
            {busy ? 'Saving…' : 'Record refund'}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl border border-hairline bg-white p-3 text-center">
        <div>
          <p className="text-xs text-ink-muted">Buyer paid</p>
          <p className="text-sm font-semibold text-ink">{formatBdt(refundable?.paid ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Already refunded</p>
          <p className="text-sm font-semibold text-ink">{formatBdt(refundable?.refunded ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Left to refund</p>
          <p className="text-sm font-semibold text-admin-700">{formatBdt(left)}</p>
        </div>
      </div>

      {left <= 0 ? (
        <p className="rounded-xl border border-hairline p-3 text-sm text-ink-muted">
          {refundable?.paid === 0
            ? 'The buyer never paid anything against this booking, so there is nothing to return.'
            : 'Everything the buyer paid has already been refunded.'}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Amount refunded (BDT)"
              required
              error={tooMuch ? `Only ${formatBdt(left)} is left to refund` : undefined}
              hint="The gross amount coming off what the buyer paid"
            >
              <TextInput
                type="number"
                min={0}
                step="any"
                value={amount === '' ? String(left) : amount}
                onChange={(e) => setAmount(e.target.value)}
                invalid={tooMuch}
                autoFocus
              />
            </Field>

            <Field label="Cancellation charge (BDT)" hint="Withheld from the cheque, not from the settlement">
              <TextInput
                type="number"
                min={0}
                step="any"
                value={deduction}
                onChange={(e) => setDeduction(e.target.value)}
                placeholder="0"
              />
            </Field>

            <Field label="Refund date" required>
              <TextInput
                type="date"
                value={refundDate}
                onChange={(e) => setRefundDate(e.target.value)}
              />
            </Field>

            <Field label="Method" required>
              <SelectInput
                value={method}
                onChange={(e) => setMethod(e.target.value as SupplierPaymentMethod)}
              >
                {SUPPLIER_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {SUPPLIER_PAYMENT_METHOD_META[m]}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="Reference no." hint="Cheque number, TrxID, bank reference">
              <TextInput
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. 4471203"
              />
            </Field>

            <Field label="Processed by">
              <SelectInput
                value={processedBy ?? userId}
                onChange={(e) => setProcessedBy(e.target.value)}
              >
                {(financeTeam ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <AccountPicker value={accountId} onChange={setAccountId} label="Paid from" />


            <Field label="Notes" className="sm:col-span-2">
              <TextArea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why the booking fell through, what was agreed on the charge…"
              />
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-hairline bg-white p-3">
            <span className="text-sm text-ink-muted">Cheque to the buyer</span>
            <span className="text-lg font-semibold text-ink">{formatBdt(net)}</span>
          </div>

          {deductionValue > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              {formatBdt(amountValue)} settled, {formatBdt(deductionValue)} kept as the cancellation
              charge.
            </p>
          )}
        </>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
