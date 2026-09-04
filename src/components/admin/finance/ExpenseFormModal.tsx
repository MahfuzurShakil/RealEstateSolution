'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  LAND_LINKED_COST_CATEGORIES,
  SUPPLIER_PAYMENT_METHODS,
  type CostCategory,
  type Expense,
  type SupplierPaymentMethod,
} from '@/lib/db/types';
import { costCategoryLabel } from '@/lib/domain/finance';
import { previewLandPayment } from '@/lib/domain/land-schedule';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import {
  expenseRepository,
  landRepository,
  lookupRepository,
  paymentScheduleRepository,
  projectRepository,
  userRepository,
} from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

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

  const categories = useLiveQuery(() => lookupRepository.costCategories(), []);
  const categoryOptions = categories ?? [];
  const activeCategories = categoryOptions.filter((c) => c.is_active);
  /*
   * The category on the row being edited, when it is no longer in the active
   * list. Without this the select would fall back to its first option and a
   * quiet re-save would move the cost into a category nobody chose.
   */
  const retiredCategory =
    categoryOptions.length > 0 &&
    form.cost_category &&
    !activeCategories.some((c) => (c.code ?? c.value) === form.cost_category)
      ? form.cost_category
      : null;

  /*
   * What this plot still owes, so the person paying is not typing blind. Only
   * `land_payment` settles instalments — `land_extra_cost` is a fee on the
   * land, not money to the owner, so it attaches to the plot without touching
   * the plan (`recalculateForLand` reads land-payment rows only).
   */
  const settlesPlan = form.cost_category === 'land_payment';
  const due = useLiveQuery(
    () =>
      settlesPlan && form.land_id
        ? paymentScheduleRepository.landDueSummary(form.land_id)
        : Promise.resolve(null),
    [settlesPlan, form.land_id],
  );

  const isLandCost = (categoryCode: string) =>
    (LAND_LINKED_COST_CATEGORIES as readonly string[]).includes(categoryCode);

  /*
   * Changing the category away from a land one clears the plot with it.
   *
   * The Land field used to be offered for every category and only its *hint*
   * changed, which meant picking a plot under Land Payment and then switching
   * to Marketing saved a marketing cost carrying a `land_id`.
   * `landPaymentSummary` counts every expense against a land, so that cost
   * turned up in the plot's "fees and extras" — money the land never cost,
   * with nothing on screen to suggest anything was wrong.
   *
   * Land fees are not stranded by this: `land_extra_cost` is the seeded
   * category for registration, mutation and legal fees, and it keeps the
   * picker.
   */
  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'cost_category' && !isLandCost(value)) next.land_id = '';
      return next;
    });

  const landLinked = isLandCost(form.cost_category);

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
        ? ((await expenseRepository.updateExpense(expense.id, payload, userId)) as Expense)
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
      {/*
        Above the fields, not below them: the whole point is to be read while
        the amount is being typed, and the modal body scrolls — at the bottom it
        sat off-screen behind the very field it exists to inform.
      */}
      {due && (
        <LandPlanPanel
          due={due}
          amount={Number(form.amount) || 0}
          onUseAmount={(v) => set('amount', String(v))}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" required>
          <SelectInput
            value={form.cost_category}
            onChange={(e) => set('cost_category', e.target.value)}
          >
            {/* The list is Master Data now, not an ENUM (Tier 3.3). A cost
                being edited under a category that has since been retired keeps
                that category as an option, so re-saving the row cannot silently
                move it into another one. */}
            {activeCategories.map((c) => (
              <option key={c.id} value={c.code ?? c.value}>
                {c.value}
              </option>
            ))}
            {retiredCategory ? (
              <option value={retiredCategory}>
                {costCategoryLabel(retiredCategory, categoryOptions)} (retired)
              </option>
            ) : null}
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
          hint={
            landLinked
              ? 'Which plot this payment is against'
              : 'Only Land Payment and Land Extra Cost attach to a plot'
          }
        >
          <SelectInput
            value={form.land_id}
            disabled={!landLinked}
            onChange={(e) => set('land_id', e.target.value)}
          >
            <option value="">{landLinked ? 'Not land-related' : '—'}</option>
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

type LandDue = NonNullable<Awaited<ReturnType<typeof paymentScheduleRepository.landDueSummary>>>;

/**
 * What the plot owes, and what the amount being typed would do about it.
 *
 * The effect is computed by `previewLandPayment`, which runs the same allocator
 * the ledger runs when the cost is saved — so what this says will happen is
 * what happens. A preview derived separately would eventually disagree, and it
 * is the half a person makes the decision on.
 */
function LandPlanPanel({
  due,
  amount,
  onUseAmount,
}: {
  due: LandDue;
  amount: number;
  onUseAmount: (value: number) => void;
}) {
  const next = due.next_unsettled;
  const effect = amount > 0 ? previewLandPayment(due.lines, amount) : null;

  return (
    <div className="mb-4 rounded-xl border border-admin-200 bg-admin-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          {next ? (
            <>
              Next unsettled: {next.label} —{' '}
              <span className="font-semibold">{formatBdt(next.outstanding)}</span> outstanding
            </>
          ) : (
            'This plan is fully paid.'
          )}
        </p>
        {next && next.outstanding > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onUseAmount(next.outstanding)}
          >
            Use this amount
          </Button>
        )}
      </div>

      {next && (
        <p className="mt-0.5 text-xs text-ink-muted">
          {next.due_date ? `Due ${formatDate(next.due_date)}` : 'No due date set'}
          {next.days_late > 0 && (
            <span className="text-red-600">
              {' '}
              · {next.days_late} day{next.days_late === 1 ? '' : 's'} late
            </span>
          )}
          {' · '}
          {formatBdt(due.outstanding)} still owed on the plan
          {due.overdue_count > 0 && ` · ${due.overdue_count} instalment${due.overdue_count === 1 ? '' : 's'} overdue`}
        </p>
      )}

      {/*
        Said before the money is recorded rather than discovered afterwards on
        the land's plan tab. Paying part of an instalment is normal here — the
        shortfall stays on that instalment rather than moving to the end of the
        plan, so it keeps reading as arrears.
      */}
      {effect && (
        <p className="mt-2 border-t border-admin-200 pt-2 text-xs text-ink">
          {formatBdt(amount)} would{' '}
          {effect.settles.length > 0 && (
            <>
              settle <span className="font-medium">{effect.settles.join(', ')}</span>
              {effect.partial ? ', and ' : '. '}
            </>
          )}
          {effect.partial && (
            <>
              leave{' '}
              <span className="font-medium">{formatBdt(effect.partial.remaining)}</span> outstanding
              on {effect.partial.label}.{' '}
            </>
          )}
          {effect.settles.length === 0 && !effect.partial && effect.excess <= 0.009 && (
            <>change nothing on the plan. </>
          )}
          {effect.excess > 0.009 && (
            <span className="text-amber-700">
              {formatBdt(effect.excess)} is more than the plan still accounts for — it will be
              recorded, and shown as unallocated on the plan.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
