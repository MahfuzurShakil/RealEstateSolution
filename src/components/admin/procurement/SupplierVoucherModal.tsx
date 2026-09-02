'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { SUPPLIER_PAYMENT_METHODS, type SupplierPaymentMethod } from '@/lib/db/types';
import { SUPPLIER_PAYMENT_METHOD_META, paymentSummary } from '@/lib/domain/procurement';
import type { PurchaseOrderWithRelations } from '@/lib/repositories';
import { supplierVoucherRepository, userRepository } from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/**
 * Pay a supplier against a purchase order (Section 7.9) — direct, with no
 * approval step, which is what the scope specifies for procurement payments.
 *
 * The amount defaults to what is still due rather than to the order value, so
 * a second payment on a part-paid order does not quietly double it.
 */
export function SupplierVoucherModal({
  open,
  order,
  onClose,
  onSaved,
}: {
  open: boolean;
  order: PurchaseOrderWithRelations;
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!open) return null;
  return <VoucherDialog order={order} onClose={onClose} onSaved={onSaved} />;
}

function VoucherDialog({
  order,
  onClose,
  onSaved,
}: {
  order: PurchaseOrderWithRelations;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { userId } = useMockSession();
  const summary = paymentSummary(order.totals.value, order.vouchers);

  const [amount, setAmount] = useState(summary.due > 0 ? String(summary.due) : '');
  const [paymentDate, setPaymentDate] = useState(todayLocal());
  const [method, setMethod] = useState<SupplierPaymentMethod>('bank');
  const [reference, setReference] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const financeTeam = useLiveQuery(
    () => userRepository.listByRole(['accounts', 'procurement', 'management', 'super_admin']),
    [],
  );

  const value = Number(amount) || 0;
  const willOverpay = value > summary.due + 0.009;

  async function save() {
    if (value <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    setBusy(true);
    try {
      await supplierVoucherRepository.pay(
        {
          po_id: order.id,
          amount: value,
          payment_date: paymentDate,
          payment_method: method,
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
      title="Pay Supplier"
      subtitle={`${order.code} · ${order.supplier?.name ?? 'Supplier removed'}`}
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
          <p className="text-xs text-ink-muted">Order value</p>
          <p className="text-sm font-semibold text-ink">{formatBdt(summary.po_value)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Already paid</p>
          <p className="text-sm font-semibold text-ink">{formatBdt(summary.paid)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Still due</p>
          <p className="text-sm font-semibold text-admin-700">{formatBdt(summary.due)}</p>
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

        <Field label="Notes" className="sm:col-span-2">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Advance against delivery, part payment, retention released…"
          />
        </Field>
      </div>

      {willOverpay && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          This pays {formatBdt(value - summary.due)} more than the order is worth. That is usually a
          duplicate voucher — check the payments already recorded before saving.
        </p>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        The project is taken from the order, not chosen here (Section 7.11) — that is what keeps the
        cost rolling up to the right project, including for central-store purchases, which carry no
        project at all.
      </p>
    </Modal>
  );
}
