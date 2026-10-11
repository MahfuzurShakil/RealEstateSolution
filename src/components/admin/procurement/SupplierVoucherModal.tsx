'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { AccountPicker } from '@/components/admin/finance/AccountPicker';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { SUPPLIER_PAYMENT_METHODS, type SupplierPaymentMethod } from '@/lib/db/types';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import type { SupplierBillWithRelations } from '@/lib/repositories';
import { supplierVoucherRepository, userRepository } from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/**
 * Finance pays a supplier against an approved bill — the final billable
 * voucher (Phase 2 step 4). The amount defaults to the voucher's balance, and
 * part-payments are allowed; paying more than the balance is refused by the
 * repository, because that is the same bill paid twice.
 */
export function SupplierVoucherModal({
  open,
  bill,
  onClose,
  onSaved,
}: {
  open: boolean;
  bill: SupplierBillWithRelations | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!open || !bill) return null;
  return <VoucherDialog bill={bill} onClose={onClose} onSaved={onSaved} />;
}

function VoucherDialog({
  bill,
  onClose,
  onSaved,
}: {
  bill: SupplierBillWithRelations;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { userId } = useMockSession();

  const [amount, setAmount] = useState(bill.balance > 0 ? String(bill.balance) : '');
  const [paymentDate, setPaymentDate] = useState(todayLocal());
  const [method, setMethod] = useState<SupplierPaymentMethod>('cheque');
  const [reference, setReference] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState('');
  const [vat, setVat] = useState(bill.vat_amount ? String(bill.vat_amount) : '');
  const [ait, setAit] = useState(bill.ait_amount ? String(bill.ait_amount) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const financeTeam = useLiveQuery(
    () => userRepository.listByRole(['accounts', 'management', 'super_admin']),
    [],
  );

  const value = Number(amount) || 0;

  async function save() {
    if (value <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    setBusy(true);
    try {
      await supplierVoucherRepository.pay(
        {
          bill_id: bill.id,
          amount: value,
          payment_date: paymentDate,
          payment_method: method,
          account_id: accountId || null,
          vat_amount: Number(vat) || null,
          ait_amount: Number(ait) || null,
          reference_no: reference.trim() || null,
          paid_by: paidBy || userId,
          notes: notes.trim() || null,
        },
        userId,
      );
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The payment could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="Pay against voucher"
      subtitle={`${bill.code} · ${bill.supplier?.name ?? 'Supplier removed'} · bill ${bill.bill_no}`}
      icon={Receipt}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Record payment'}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl border border-hairline bg-white p-3 text-center">
        <div>
          <p className="text-xs text-ink-muted">Payable</p>
          <p className="text-sm font-semibold text-ink">{formatBdt(bill.payable_amount)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Already paid</p>
          <p className="text-sm font-semibold text-ink">{formatBdt(bill.paid)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Balance</p>
          <p className="text-sm font-semibold text-admin-700">{formatBdt(bill.balance)}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (BDT)" required error={error || undefined}>
          <TextInput
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            invalid={Boolean(error)}
            autoFocus
          />
        </Field>

        <Field label="Payment date" required>
          <TextInput
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
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
            placeholder="e.g. 4471203 / TrxID BKX9F2K"
          />
        </Field>

        <Field label="Paid by" className="sm:col-span-2">
          <SelectInput value={paidBy ?? userId} onChange={(e) => setPaidBy(e.target.value)}>
            {(financeTeam ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <AccountPicker value={accountId} onChange={setAccountId} label="Paid from" />

        {/* Memo only — the amount above is what actually leaves the account. */}
        <Field label="VAT withheld" hint="Optional, for the return">
          <TextInput type="number" min={0} step="any" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="0" />
        </Field>
        <Field label="AIT withheld" hint="Optional, for the return">
          <TextInput type="number" min={0} step="any" value={ait} onChange={(e) => setAit(e.target.value)} placeholder="0" />
        </Field>

        <Field label="Notes" className="sm:col-span-2">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Part payment, final payment, retention released…"
          />
        </Field>
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        Order, supplier and project come from the voucher, not chosen here, so the payment rolls up
        to the right project.
      </p>
    </Modal>
  );
}
