'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { AccountPicker } from './AccountPicker';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  LAND_LINKED_COST_CATEGORIES,
  SUPPLIER_PAYMENT_METHODS,
  type CostCategory,
  type Expense,
  type SupplierPaymentMethod,
} from '@/lib/db/types';
import { costCategoryLabel, installmentStatus, outstandingOn } from '@/lib/domain/finance';
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
import { cn } from '@/lib/utils/cn';
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
    account_id: expense?.account_id ?? '',
    installment_id: expense?.installment_id ?? '',
    vat_amount: expense?.vat_amount ? String(expense.vat_amount) : '',
    ait_amount: expense?.ait_amount ? String(expense.ait_amount) : '',
    notes: expense?.notes ?? '',
  });
  const [errors, setErrors] = useState<{
    amount?: string;
    cost_reason?: string;
    paid_to?: string;
    land_id?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  /* open from the start when the cost already withholds something */
  const [taxOpen, setTaxOpen] = useState(
    Boolean(expense?.vat_amount || expense?.ait_amount),
  );

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
      // the plan belongs to the plot: changing either one strands the choice
      if (key === 'cost_category' && value !== 'land_payment') next.installment_id = '';
      if (key === 'land_id') next.installment_id = '';
      return next;
    });

  const landLinked = isLandCost(form.cost_category);

  async function save() {
    const next: typeof errors = {};
    if (!(Number(form.amount) > 0)) next.amount = 'Enter an amount greater than zero';
    if (!form.cost_reason.trim()) next.cost_reason = 'Say what the cost was for';
    if (!form.paid_to.trim()) next.paid_to = 'Who was paid?';
    // see the note on the Land field: a land cost with no plot is money that
    // the plot's own plan can never account for
    if (landLinked && !form.land_id) next.land_id = 'Pick the plot this is against';
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
        account_id: form.account_id || null,
        // only a land payment can settle an instalment; anything else would be
        // carrying a pointer no screen would ever read
        installment_id: settlesPlan ? form.installment_id || null : null,
        vat_amount: Number(form.vat_amount) || null,
        ait_amount: Number(form.ait_amount) || null,
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
          installmentId={form.installment_id || null}
          onPick={(line) => {
            setForm((f) => ({
              ...f,
              amount: String(line.amount),
              installment_id: line.id ?? '',
            }));
          }}
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

        {/*
          Shown only where it applies, rather than always shown and disabled.
          A permanently visible control reading "—" is a field the eye has to
          skip on every cost, and this form is used far more often for a
          contractor bill than for a plot.

          It is also *required* here now. A land payment saved without a plot is
          a cost that no plot's payment plan can ever see: `landPaymentSummary`
          and the schedule both find their money through `land_id`, so the
          money is recorded, counted in the company total, and invisible on the
          one screen anybody would look for it on.
        */}
        {landLinked && (
          <Field
            label="Land"
            required
            error={errors.land_id}
            hint="Which plot this payment is against"
          >
            <SelectInput
              value={form.land_id}
              invalid={Boolean(errors.land_id)}
              onChange={(e) => set('land_id', e.target.value)}
            >
              <option value="">Select the plot…</option>
              {(lands ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

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

        <AccountPicker

          value={form.account_id}

          onChange={(v) => set('account_id', v)}

        />


        {/*
          Memo only: `amount` above is what actually left the account, so the
          cash position is right whether or not these are filled in. VAT and AIT
          are deducted from a contractor bill by law, and without somewhere to
          record them the return is prepared by hand from the vouchers.

          Behind a toggle because they apply to a minority of costs — a salary
          or a plot payment withholds neither — and two number boxes that are
          blank on most entries train people to scroll past the fields that are
          not. It opens by itself when the cost being edited already carries a
          figure, so nothing saved can hide.
        */}
        <div className="sm:col-span-2">
          {taxOpen ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="VAT withheld"
                hint="For the return — not deducted from the amount above"
              >
                <TextInput
                  type="number"
                  min={0}
                  step="any"
                  value={form.vat_amount}
                  onChange={(e) => set('vat_amount', e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field
                label="AIT withheld"
                hint="For the return — not deducted from the amount above"
              >
                <TextInput
                  type="number"
                  min={0}
                  step="any"
                  value={form.ait_amount}
                  onChange={(e) => set('ait_amount', e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setTaxOpen(true)}
              className="text-sm text-admin-700 underline-offset-2 hover:underline"
            >
              + Add VAT / AIT withheld
            </button>
          )}
        </div>

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
  installmentId,
  onPick,
}: {
  due: LandDue;
  amount: number;
  installmentId: string | null;
  /** `id: null` fills the amount without aiming it at a line */
  onPick: (line: { amount: number; id: string | null }) => void;
}) {
  const next = due.next_unsettled;
  const today = todayLocal();
  const effect = amount > 0 ? previewLandPayment(due.lines, amount, installmentId) : null;

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
            onClick={() => onPick({ amount: next.outstanding, id: null })}
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
        The whole plan, not only the next line.
        
        "Which instalment am I paying" is the question somebody has in front of
        them when they open this form, and it was answerable only by leaving it
        and opening the land's plan tab. Each row fills the amount with what is
        left on it, so a part-paid instalment offers its remainder rather than
        its original figure — which is the number that gets typed wrong.

        Picking a row now aims the payment at it (v17): the expense carries
        `installment_id`, and `allocatePayments` settles targeted money against
        its own line before the oldest-first waterfall runs. A landowner will
        accept a cheque against a named milestone while an earlier instalment
        is short, and the plan should then read as arrears plus a settled
        milestone rather than silently moving the money forward.

        The default is still the waterfall — most payments are not aimed at
        anything — and clicking the chosen row again lets go of it.
      */}
      {due.lines.length > 0 && (
        <div className="mt-3 max-h-44 overflow-auto rounded-lg border border-admin-200 bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-ink-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Instalment</th>
                <th className="px-2 py-1.5 text-left font-medium">Due</th>
                <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">Amount</th>
                <th className="px-2 py-1.5 text-right font-medium">Left</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {due.lines.map((line) => {
                const left = outstandingOn(line);
                const state = installmentStatus(line, today);
                return (
                  <tr key={line.id} className="border-t border-hairline">
                    <td className="px-2 py-1.5 text-ink">{line.label}</td>
                    <td className="px-2 py-1.5 text-ink-muted">
                      {line.due_date ? formatDate(line.due_date) : '—'}
                    </td>
                    {/* the agreed figure is the least useful of the four when
                        space is short — what is left is what the decision needs */}
                    <td className="hidden px-2 py-1.5 text-right text-ink-muted sm:table-cell">
                      {formatBdt(line.amount_due)}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-1.5 text-right font-medium',
                        state === 'overdue' ? 'text-red-600' : 'text-ink',
                      )}
                    >
                      {left > 0.009 ? formatBdt(left) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {left > 0.009 ? (
                        /*
                          Picking a row now *aims* the payment at it, not only
                          fills the amount. Clicking the chosen row again lets
                          go of it and the money rejoins the waterfall, so the
                          default is always one click away.
                        */
                        <button
                          type="button"
                          aria-pressed={installmentId === line.id}
                          className={cn(
                            'rounded-md px-1.5 py-0.5 underline-offset-2 transition-colors',
                            installmentId === line.id
                              ? 'bg-admin-600 text-white'
                              : 'text-admin-700 hover:bg-admin-50 hover:underline',
                          )}
                          onClick={() =>
                            onPick(
                              installmentId === line.id
                                ? { amount: left, id: null }
                                : { amount: left, id: line.id },
                            )
                          }
                        >
                          {installmentId === line.id ? 'Paying this' : 'Pay this'}
                        </button>
                      ) : (
                        <span className="text-emerald-700">Paid</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/*
        Said before the money is recorded rather than discovered afterwards on
        the land's plan tab. Paying part of an instalment is normal here — the
        shortfall stays on that instalment rather than moving to the end of the
        plan, so it keeps reading as arrears.
      */}
      {installmentId && (
        <p className="mt-2 text-xs text-admin-700">
          Recorded against{' '}
          <span className="font-medium">
            {due.lines.find((l) => l.id === installmentId)?.label ?? 'an instalment'}
          </span>{' '}
          — it settles that line first, whatever is still open before it.
        </p>
      )}

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
