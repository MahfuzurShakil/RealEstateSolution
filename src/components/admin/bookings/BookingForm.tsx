'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Info, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, MoneyInput, SelectInput, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  PAYMENT_METHODS,
  type Customer,
  type PaymentMethod,
  type Project,
  type Unit,
  type User,
} from '@/lib/db/types';
import {
  PAYMENT_METHOD_LABEL,
  discountPct,
  finalPrice,
  needsDiscountApproval,
} from '@/lib/domain/booking';
import { isUnitSellable, UNIT_STATUS_META } from '@/lib/domain/project';
import {
  bookingRepository,
  customerRepository,
  discountApprovalRuleRepository,
  installmentPlanTemplateRepository,
  projectRepository,
  unitRepository,
  userRepository,
  type BookingWithRelations,
} from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

interface FormState {
  customer_id: string;
  project_id: string;
  unit_id: string;
  booking_date: string;
  base_price: string;
  floor_premium: string;
  facing_premium: string;
  parking_charge: string;
  other_charges: string;
  discount_amount: string;
  booking_amount: string;
  booking_amount_received: boolean;
  booked_by: string;
  installment_tenure_months: string;
  payment_date: string;
  payment_method: PaymentMethod;
  payment_reference: string;
}

const EMPTY: FormState = {
  customer_id: '',
  project_id: '',
  unit_id: '',
  booking_date: todayLocal(),
  base_price: '',
  floor_premium: '0',
  facing_premium: '0',
  parking_charge: '0',
  other_charges: '0',
  discount_amount: '0',
  booking_amount: '',
  booking_amount_received: false,
  booked_by: '',
  installment_tenure_months: '',
  payment_date: todayLocal(),
  payment_method: 'bank',
  payment_reference: '',
};

const n = (v: string) => Number(v) || 0;

/**
 * Add / Edit form for Module 4 (Design Reference A.9).
 *
 * The booking's status is never picked here — it is derived from the two
 * gating facts (Section 5.2), and the form shows in advance what the discount
 * will trigger, so nobody is surprised by a `pending_approval` after saving.
 */
export function BookingForm({ booking }: { booking?: BookingWithRelations }) {
  const router = useRouter();
  const params = useSearchParams();
  const { userId } = useMockSession();
  const isEdit = Boolean(booking);

  // a customer can be handed in from the customer page ("Book a unit")
  const [form, setForm] = useState<FormState>(() =>
    booking ? toFormState(booking) : { ...EMPTY, customer_id: params.get('customer') ?? '' },
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [salesTeam, setSalesTeam] = useState<User[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    customerRepository.list().then(setCustomers);
    projectRepository.list().then(setProjects);
    userRepository.salesTeam().then(setSalesTeam);
  }, []);

  const loadedUnits = useLiveQuery<Unit[]>(
    () =>
      form.project_id
        ? unitRepository.listForProject(form.project_id)
        : Promise.resolve<Unit[]>([]),
    [form.project_id],
  );
  const projectUnits = useMemo(() => loadedUnits ?? [], [loadedUnits]);

  /** Only free units can be booked — plus whichever this booking already holds. */
  const selectableUnits = useMemo(
    () =>
      projectUnits.filter((u) => isUnitSellable(u.status) || u.id === booking?.unit_id),
    [projectUnits, booking?.unit_id],
  );

  const selectedUnit = projectUnits.find((u) => u.id === form.unit_id);

  /** the project plan template - drives the tenure default and the preview */
  const plan = useLiveQuery(
    () =>
      form.project_id
        ? installmentPlanTemplateRepository.listForProject(form.project_id)
        : Promise.resolve([]),
    [form.project_id],
  );

  const seller = salesTeam.find((u) => u.id === form.booked_by);
  const ceiling = useLiveQuery<number | null>(
    () => discountApprovalRuleRepository.maxDiscountPctFor(seller?.role),
    [seller?.role],
  );

  const parts = {
    base_price: n(form.base_price),
    floor_premium: n(form.floor_premium),
    facing_premium: n(form.facing_premium),
    parking_charge: n(form.parking_charge),
    other_charges: n(form.other_charges),
    discount_amount: n(form.discount_amount),
  };
  const total = finalPrice(parts);
  const pct = discountPct(parts.base_price, parts.discount_amount);
  const ceilingValue = ceiling === undefined ? null : ceiling;
  const willNeedApproval = needsDiscountApproval(
    parts.base_price,
    parts.discount_amount,
    ceilingValue,
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const tenureMonths =
    Number(form.installment_tenure_months) ||
    plan?.find((p) => p.schedule_type === 'monthly')?.month_count ||
    0;

  /** Picking a unit snapshots its price (Section 5.5). */
  function pickUnit(unitId: string) {
    const unit = projectUnits.find((u) => u.id === unitId);
    setForm((f) => ({
      ...f,
      unit_id: unitId,
      base_price: unit ? String(unit.base_price) : f.base_price,
      parking_charge:
        unit && unit.parking_allocated > 0 && f.parking_charge === '0'
          ? String(unit.parking_allocated * 500000)
          : f.parking_charge,
    }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.customer_id) next.customer_id = 'Pick the customer';
    if (!form.unit_id) next.unit_id = 'Pick the unit being booked';
    if (!form.booking_date) next.booking_date = 'Required';
    if (n(form.base_price) <= 0) next.base_price = 'Enter the unit price';
    if (parts.discount_amount < 0) next.discount_amount = 'Discount cannot be negative';
    if (parts.discount_amount > parts.base_price) {
      next.discount_amount = 'Discount cannot exceed the base price';
    }
    if (n(form.booking_amount) < 0) next.booking_amount = 'Cannot be negative';
    if (n(form.booking_amount) > total) {
      next.booking_amount = 'Booking amount is more than the final price';
    }
    if (!form.booked_by) next.booked_by = 'Pick who made this booking';
    const tenure = Number(form.installment_tenure_months);
    if (form.installment_tenure_months.trim() && (tenure < 1 || tenure > 120)) {
      next.installment_tenure_months = 'Enter between 1 and 120 months';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const pricing = {
        booking_date: form.booking_date,
        base_price: parts.base_price,
        floor_premium: parts.floor_premium,
        facing_premium: parts.facing_premium,
        parking_charge: parts.parking_charge,
        other_charges: parts.other_charges,
        discount_amount: parts.discount_amount,
        booking_amount: n(form.booking_amount),
        installment_tenure_months: Number(form.installment_tenure_months) || null,
      };

      if (booking) {
        await bookingRepository.updatePricing(booking.id, pricing, userId);
        router.push(`/admin/bookings/${booking.id}`);
        return;
      }

      // guard against two bookings on one unit
      const clash = await bookingRepository.activeForUnit(form.unit_id);
      if (clash) {
        setErrors({ unit_id: `${clash.code} is already active on this unit` });
        return;
      }

      const customer = customers.find((c) => c.id === form.customer_id);
      const saved = await bookingRepository.createBooking(
        {
          ...pricing,
          customer_id: form.customer_id,
          unit_id: form.unit_id,
          lead_id: customer?.lead_id ?? null,
          booked_by: form.booked_by,
          // recording the receipt here creates a real payment row
          payment: form.booking_amount_received
            ? {
                amount: n(form.booking_amount),
                payment_date: form.payment_date,
                payment_method: form.payment_method,
                reference_no: form.payment_reference,
                notes: 'Booking money taken at the time of booking',
              }
            : null,
        },
        userId,
      );
      router.push(`/admin/bookings/${saved.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">
      <Card>
        <CardHeader title="Booking" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Customer" required error={errors.customer_id}>
            <SelectInput
              value={form.customer_id}
              disabled={isEdit}
              onChange={(e) => set('customer_id', e.target.value)}
              invalid={Boolean(errors.customer_id)}
            >
              <option value="">Pick a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Booking Date" required error={errors.booking_date}>
            <TextInput
              type="date"
              value={form.booking_date}
              onChange={(e) => set('booking_date', e.target.value)}
              invalid={Boolean(errors.booking_date)}
            />
          </Field>
          <Field
            label="Booked By"
            required
            error={errors.booked_by}
            hint={
              seller && ceilingValue !== null
                ? `May give up to ${ceilingValue}% without approval`
                : seller
                  ? 'No discount ceiling configured — any discount needs approval'
                  : undefined
            }
          >
            <SelectInput
              value={form.booked_by}
              disabled={isEdit}
              onChange={(e) => set('booked_by', e.target.value)}
              invalid={Boolean(errors.booked_by)}
            >
              <option value="">Pick the sales person</option>
              {salesTeam.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Project" required={!isEdit}>
            <SelectInput
              value={form.project_id}
              disabled={isEdit}
              onChange={(e) => {
                set('project_id', e.target.value);
                set('unit_id', '');
              }}
            >
              <option value="">Pick a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field
            label="Unit"
            required
            error={errors.unit_id}
            className="xl:col-span-2"
            hint={
              selectedUnit
                ? `${selectedUnit.unit_type} · ${selectedUnit.size_sqft} sqft · ${UNIT_STATUS_META[selectedUnit.status].label}`
                : isEdit
                  ? undefined
                  : 'Only available or on-hold units can be booked.'
            }
          >
            <SelectInput
              value={form.unit_id}
              disabled={isEdit || !form.project_id}
              onChange={(e) => pickUnit(e.target.value)}
              invalid={Boolean(errors.unit_id)}
            >
              <option value="">Pick a unit</option>
              {selectableUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.unit_type} · {u.size_sqft} sqft · {formatBdt(u.base_price )}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        {isEdit && (
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Customer, unit and sales person are fixed once a booking exists — cancel and rebook if
            they are wrong.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Pricing (BDT)" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Base Price" required error={errors.base_price} hint="Snapshot of the unit price">
            <MoneyInput
              value={form.base_price}
              onChange={(e) => set('base_price', e.target.value)}
              invalid={Boolean(errors.base_price)}
            />
          </Field>
          <Field label="Floor Premium">
            <MoneyInput
              value={form.floor_premium}
              onChange={(e) => set('floor_premium', e.target.value)}
            />
          </Field>
          <Field label="Facing Premium">
            <MoneyInput
              value={form.facing_premium}
              onChange={(e) => set('facing_premium', e.target.value)}
            />
          </Field>
          <Field label="Parking Charge">
            <MoneyInput
              value={form.parking_charge}
              onChange={(e) => set('parking_charge', e.target.value)}
            />
          </Field>
          <Field label="Other Charges" hint="Utility connection, corner charge…">
            <MoneyInput
              value={form.other_charges}
              onChange={(e) => set('other_charges', e.target.value)}
            />
          </Field>
          <Field
            label="Discount"
            error={errors.discount_amount}
            hint={parts.discount_amount > 0 ? `${pct.toFixed(2)}% of base price` : undefined}
          >
            <MoneyInput
              value={form.discount_amount}
              onChange={(e) => set('discount_amount', e.target.value)}
              invalid={Boolean(errors.discount_amount)}
            />
          </Field>
        </div>

        <div className="mt-4 rounded-xl border border-hairline bg-canvas/60 p-4">
          <dl className="space-y-1.5 text-sm">
            {[
              ['Base price', parts.base_price],
              ['Floor premium', parts.floor_premium],
              ['Facing premium', parts.facing_premium],
              ['Parking charge', parts.parking_charge],
              ['Other charges', parts.other_charges],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between gap-4">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-ink">{formatBdt(Number(value))}</dd>
              </div>
            ))}
            {parts.discount_amount > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Discount</dt>
                <dd className="text-red-600">− {formatBdt(parts.discount_amount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-hairline pt-2 text-base font-semibold">
              <dt className="text-ink">Final price</dt>
              <dd className="text-ink">{formatBdt(total)}</dd>
            </div>
          </dl>
        </div>

        {parts.discount_amount > 0 && (
          <div
            className={`mt-4 rounded-xl border p-3 ${
              willNeedApproval
                ? 'border-amber-200 bg-amber-50'
                : 'border-emerald-200 bg-emerald-50'
            }`}
          >
            <p
              className={`flex items-start gap-2 text-sm font-medium ${
                willNeedApproval ? 'text-amber-800' : 'text-emerald-800'
              }`}
            >
              {willNeedApproval ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              ) : (
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              )}
              {willNeedApproval
                ? `${pct.toFixed(2)}% discount needs approval`
                : `${pct.toFixed(2)}% discount is within limit`}
            </p>
            <p
              className={`mt-1 text-xs ${willNeedApproval ? 'text-amber-700' : 'text-emerald-700'}`}
            >
              {willNeedApproval
                ? `Above what ${seller?.name ?? 'this role'} may give on their own${
                    ceilingValue !== null ? ` (${ceilingValue}%)` : ''
                  }. The booking will sit at Pending Approval until a manager signs off.`
                : `Within ${seller?.name ?? 'this role'}'s limit — no approval needed.`}
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Booking Amount & Payment Terms" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field
            label="Booking Amount"
            error={errors.booking_amount}
            hint="The advance expected from the buyer"
          >
            <MoneyInput
              value={form.booking_amount}
              onChange={(e) => set('booking_amount', e.target.value)}
              invalid={Boolean(errors.booking_amount)}
            />
          </Field>
          <Field
            label="Instalment Tenure (months)"
            error={errors.installment_tenure_months}
            hint={
              plan && plan.length > 0
                ? `Project default is ${plan.find((p) => p.schedule_type === 'monthly')?.month_count ?? 24} months`
                : 'Pick a project first'
            }
          >
            <TextInput
              type="number"
              min="1"
              max="120"
              value={form.installment_tenure_months}
              onChange={(e) => set('installment_tenure_months', e.target.value)}
              placeholder={String(
                plan?.find((p) => p.schedule_type === 'monthly')?.month_count ?? 24,
              )}
              invalid={Boolean(errors.installment_tenure_months)}
            />
          </Field>
          {!isEdit && (
            <div className="flex items-center pt-6">
              <Checkbox
                label="Booking money already received"
                checked={form.booking_amount_received}
                onChange={(e) => set('booking_amount_received', e.target.checked)}
              />
            </div>
          )}
        </div>

        {/* receipt details, so nobody has to reconstruct them months later */}
        {!isEdit && form.booking_amount_received && (
          <div className="mt-4 grid gap-4 rounded-xl border border-hairline bg-canvas/50 p-4 md:grid-cols-3">
            <Field label="Received on" required>
              <TextInput
                type="date"
                value={form.payment_date}
                onChange={(e) => set('payment_date', e.target.value)}
              />
            </Field>
            <Field label="Method" required>
              <SelectInput
                value={form.payment_method}
                onChange={(e) => set('payment_method', e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Reference" hint="Cheque no., bank slip, bKash TrxID">
              <TextInput
                value={form.payment_reference}
                onChange={(e) => set('payment_reference', e.target.value)}
                placeholder="e.g. TRX8H2K91LM"
              />
            </Field>
          </div>
        )}

        {plan && plan.length > 0 && total > 0 && (
          <div className="mt-4 rounded-xl border border-hairline p-4">
            <p className="mb-2 text-sm font-medium text-ink">Payment plan for this buyer</p>
            <ul className="space-y-1 text-sm text-ink-muted">
              {plan.map((row) => {
                const amount = (total * Number(row.percentage)) / 100;
                const months = row.schedule_type === 'monthly' ? tenureMonths : 0;
                return (
                  <li key={row.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {row.percentage}% {row.label}
                      {months > 0 && ` over ${months} months`}
                      {months > 0 && (
                        <span className="text-xs">
                          {' '}
                          ({formatBdt(Math.round(amount / months))}/month)
                        </span>
                      )}
                    </span>
                    <span className="text-ink">{formatBdt(amount)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">
              The instalment rows themselves are generated in the Finance module when the booking
              confirms — this is the plan they will follow.
            </p>
          </div>
        )}

        <p className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          A booking confirms itself only when the booking money is fully received <em>and</em> the
          discount is settled — the status is never set by hand.
          {isEdit && ' Receipts are recorded on the Payments tab of this booking.'}
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isEdit && (
          <Badge tone={form.booking_amount_received && !willNeedApproval ? 'green' : 'amber'}>
            Will be saved as{' '}
            {form.booking_amount_received && !willNeedApproval
              ? 'Confirmed'
              : willNeedApproval
                ? 'Pending Approval'
                : 'Hold'}
          </Badge>
        )}
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : booking ? 'Save changes' : 'Create booking'}
        </Button>
      </div>
    </form>
  );
}

function toFormState(booking: BookingWithRelations): FormState {
  return {
    customer_id: booking.customer_id,
    project_id: booking.project?.id ?? '',
    unit_id: booking.unit_id,
    booking_date: booking.booking_date,
    base_price: String(booking.base_price),
    floor_premium: String(booking.floor_premium),
    facing_premium: String(booking.facing_premium),
    parking_charge: String(booking.parking_charge),
    other_charges: String(booking.other_charges),
    discount_amount: String(booking.discount_amount),
    booking_amount: String(booking.booking_amount),
    booking_amount_received: booking.booking_amount_received,
    booked_by: booking.booked_by ?? '',
    installment_tenure_months: booking.installment_tenure_months
      ? String(booking.installment_tenure_months)
      : '',
    payment_date: todayLocal(),
    payment_method: 'bank',
    payment_reference: '',
  };
}
