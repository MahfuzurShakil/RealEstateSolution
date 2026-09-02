'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  COST_CATEGORIES,
  SUPPLIER_PAYMENT_METHODS,
  type CostCategory,
  type Expense,
  type SupplierPaymentMethod,
} from '@/lib/db/types';
import { COST_CATEGORY_META } from '@/lib/domain/finance';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import {
  expenseRepository,
  landRepository,
  projectRepository,
  userRepository,
} from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';

/**
 * Add or edit a cost (Section 8.3).
 *
 * This one form covers land payments, contractor bills, marketing, admin and
 * any irregular one-off — which is the whole point of the generic ledger:
 * a cost nobody built a module for still lands against the right project
 * instead of going unrecorded. `cost_reason` is required for exactly that
 * reason, especially when the category is "Other".
 */
export function ExpenseFormModal({
  open,
  expense,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  expense?: Expense;
  defaults?: { project_id?: string; land_id?: string; cost_category?: CostCategory };
  onClose: () => void;
  onSaved: (expense: Expense) => void;
}) {
  if (!open) return null;
  return (
    <ExpenseDialog
      key={expense?.id ?? 'new'}
      expense={expense}
      defaults={defaults}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function ExpenseDialog({
  expense,
  defaults,
  onClose,
  onSaved,
}: {
  expense?: Expense;
  defaults?: { project_id?: string; land_id?: string; cost_category?: CostCategory };
  onClose: () => void;
  onSaved: (expense: Expense) => void;
}) {
  const { userId } = useMockSession();
  const [form, setForm] = useState({
    project_id: expense?.project_id ?? defaults?.project_id ?? '',
    land_id: expense?.land_id ?? defaults?.land_id ?? '',
    cost_category: (expense?.cost_category ?? defaults?.cost_category ?? 'other') as CostCategory,
    cost_reason: expense?.cost_reason ?? '',
    amount: expense ? String(expense.amount) : '',
    expense_date: expense?.expense_date ?? todayLocal(),
    paid_to: expense?.paid_to ?? '',
    payment_method: (expense?.payment_method ?? 'bank') as SupplierPaymentMethod,
    reference_no: expense?.reference_no ?? '',
    notes: expense?.notes ?? '',
  });
  const [errors, setErrors] = useState<{ amount?: string; cost_reason?: string; paid_to?: string }>({});
  const [saving, setSaving] = useState(false);

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const lands = useLiveQuery(() => landRepository.list(), []);
  const financeTeam = useLiveQuery(
    () => userRepository.listByRole(['accounts', 'management', 'super_admin', 'land_team']),
    [],
  );

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const isLandCost =
    form.cost_category === 'land_payment' || form.cost_category === 'land_extra_cost';

  async function save() {
    const next: typeof errors = {};
    if (!(Number(form.amount) > 0)) next.amount = 'Enter an amount greater than zero';
    if (!form.cost_reason.trim()) next.cost_reason = 'Say what the cost was for';
    if (!form.paid_to.trim()) next.paid_to = 'Who was paid?';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        project_id: form.project_id || null,
        land_id: form.land_id || null,
        cost_category: form.cost_category,
        cost_reason: form.cost_reason,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        paid_to: form.paid_to,
        payment_method: form.payment_method,
        reference_no: form.reference_no.trim() || null,
        paid_by: userId,
        notes: form.notes.trim() || null,
      };
      const saved = expense
        ? ((await expenseRepository.update(expense.id, payload)) as Expense)
        : await expenseRepository.createExpense(payload, userId);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={expense ? `Edit ${expense.code}` : 'Record a Cost'}
      subtitle="Land payment, contractor bill, marketing, admin — or any one-off no module owns"
      icon={ReceiptText}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : expense ? 'Save changes' : 'Record cost'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" required>
          <SelectInput
            value={form.cost_category}
            onChange={(e) => set('cost_category', e.target.value)}
          >
            {COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {COST_CATEGORY_META[c].label}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Amount (BDT)" required error={errors.amount}>
          <TextInput
            type="number"
            min={0}
            step="any"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            invalid={Boolean(errors.amount)}
            placeholder="0"
          />
        </Field>

        <Field
          label="What was it for"
          required
          error={errors.cost_reason}
          className="sm:col-span-2"
          hint="A short, plain line — this is what makes an 'Other' cost readable a year later"
        >
          <TextInput
            value={form.cost_reason}
            onChange={(e) => set('cost_reason', e.target.value)}
            placeholder="e.g. Emergency generator repair, Legal consultancy fee"
            invalid={Boolean(errors.cost_reason)}
          />
        </Field>

        <Field
          label="Project"
          hint="Leave blank for a company-level cost that is not chargeable to one project"
        >
          <SelectInput value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">Company-level</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          label="Land"
          hint={isLandCost ? 'Which plot this payment is against' : 'Only for land-related costs'}
        >
          <SelectInput value={form.land_id} onChange={(e) => set('land_id', e.target.value)}>
            <option value="">Not land-related</option>
            {(lands ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Paid to" required error={errors.paid_to}>
          <TextInput
            value={form.paid_to}
            onChange={(e) => set('paid_to', e.target.value)}
            placeholder="Landowner, contractor, vendor or person"
            invalid={Boolean(errors.paid_to)}
          />
        </Field>

        <Field label="Date" required>
          <TextInput
            type="date"
            value={form.expense_date}
            onChange={(e) => set('expense_date', e.target.value)}
          />
        </Field>

        <Field label="Method" required>
          <SelectInput
            value={form.payment_method}
            onChange={(e) => set('payment_method', e.target.value)}
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
            value={form.reference_no}
            onChange={(e) => set('reference_no', e.target.value)}
            placeholder="e.g. 4471203 / TrxID BKX9F2K"
          />
        </Field>

        <Field label="Notes" className="sm:col-span-2">
          <TextArea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Anything worth recording — instalment number, agreement clause, who approved it"
          />
        </Field>
      </div>

      {(financeTeam ?? []).length > 0 && (
        <p className="mt-4 text-xs text-ink-muted">
          Recorded against the person acting now. Attach the receipt or voucher on the cost&apos;s
          own page once it is saved.
        </p>
      )}
    </Modal>
  );
}
