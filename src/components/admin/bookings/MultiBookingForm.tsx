'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Info, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, SelectInput, TextInput } from '@/components/ui/Field';
import { AccountPicker } from '@/components/admin/finance/AccountPicker';
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
} from '@/lib/domain/booking';
import {
  PREMIUM_LABEL,
  isUnitSellable,
  projectSalesStatus,
  projectShape,
  unitDescription,
  type PremiumKind,
} from '@/lib/domain/project';
import {
  bookingRepository,
  customerRepository,
  projectRepository,
  unitRepository,
  userRepository,
} from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/** One unit in the go — its own price, exactly as a single booking has. */
interface Line {
  unit_id: string;
  base_price: string;
  floor_premium: string;
  facing_premium: string;
  parking_charge: string;
  road_premium: string;
  corner_premium: string;
  other_charges: string;
  discount_amount: string;
  booking_amount: string;
}

const PREMIUM_LINE_KEY = {
  floor: 'floor_premium',
  facing: 'facing_premium',
  parking: 'parking_charge',
  road: 'road_premium',
  corner: 'corner_premium',
} as const satisfies Record<PremiumKind, keyof Line>;

const n = (v: string) => Number(v) || 0;

function lineParts(line: Line) {
  return {
    base_price: n(line.base_price),
    floor_premium: n(line.floor_premium),
    facing_premium: n(line.facing_premium),
    parking_charge: n(line.parking_charge),
    road_premium: n(line.road_premium),
    corner_premium: n(line.corner_premium),
    other_charges: n(line.other_charges),
    discount_amount: n(line.discount_amount),
  };
}

/**
 * v32 — "Book several units": one buyer takes two or three units in one go.
 *
 * Each picked unit still becomes its own booking — its own receipts, agreement
 * and delivery — and the repository ties them together with a shared
 * `booking_group`. Customer, date, sales person and the receipt details are
 * entered once for all of them; each agreement is recorded per booking after.
 */
export function MultiBookingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { userId } = useMockSession();

  const [customerId, setCustomerId] = useState(params.get('customer') ?? '');
  const [projectId, setProjectId] = useState('');
  const [bookingDate, setBookingDate] = useState(todayLocal());
  const [bookedBy, setBookedBy] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [received, setReceived] = useState(false);
  const [paymentDate, setPaymentDate] = useState(todayLocal());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank');
  const [paymentReference, setPaymentReference] = useState('');
  const [accountId, setAccountId] = useState('');

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
    () => (projectId ? unitRepository.listForProject(projectId) : Promise.resolve<Unit[]>([])),
    [projectId],
  );
  const sellable = useMemo(
    () => (loadedUnits ?? []).filter((u) => isUnitSellable(u.status)),
    [loadedUnits],
  );
  const unitById = useMemo(() => new Map(sellable.map((u) => [u.id, u])), [sellable]);

  const project = projects.find((p) => p.id === projectId);
  const shape = projectShape(project?.project_type ?? 'apartment');
  const itemPlural = shape.labels.itemPlural.toLowerCase();

  const picked = new Set(lines.map((l) => l.unit_id));
  const totals = lines.reduce(
    (acc, l) => {
      acc.final += finalPrice(lineParts(l));
      acc.booking += n(l.booking_amount);
      return acc;
    },
    { final: 0, booking: 0 },
  );
  /** Ticking a unit snapshots its price, as picking one on the single form does. */
  function toggleUnit(unit: Unit) {
    setLines((ls) =>
      ls.some((l) => l.unit_id === unit.id)
        ? ls.filter((l) => l.unit_id !== unit.id)
        : [
            ...ls,
            {
              unit_id: unit.id,
              base_price: String(unit.base_price),
              floor_premium: '0',
              facing_premium: '0',
              parking_charge:
                unit.parking_allocated > 0 ? String(unit.parking_allocated * 500000) : '0',
              road_premium: '0',
              corner_premium: '0',
              other_charges: '0',
              discount_amount: '0',
              booking_amount: '',
            },
          ],
    );
  }

  function setLine(unitId: string, key: keyof Line, value: string) {
    setLines((ls) => ls.map((l) => (l.unit_id === unitId ? { ...l, [key]: value } : l)));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!customerId) next.customer_id = 'Pick the customer';
    if (!bookingDate) next.booking_date = 'Required';
    if (!bookedBy) next.booked_by = 'Pick who made this booking';
    if (lines.length === 0) next.lines = `Tick at least one of the ${itemPlural} below`;
    if (received && !accountId) next.account_id = 'Pick the account it went into';
    for (const l of lines) {
      const code = unitById.get(l.unit_id)?.code ?? 'a unit';
      const parts = lineParts(l);
      if (parts.base_price <= 0) next[l.unit_id] = `${code}: enter the price`;
      else if (parts.discount_amount < 0 || parts.discount_amount > parts.base_price)
        next[l.unit_id] = `${code}: discount must be between 0 and the base price`;
      else if (n(l.booking_amount) < 0 || n(l.booking_amount) > finalPrice(parts))
        next[l.unit_id] = `${code}: booking amount must be between 0 and the final price`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const customer = customers.find((c) => c.id === customerId);
      await bookingRepository.createGroupBooking(
        {
          customer_id: customerId,
          lead_id: customer?.lead_id ?? null,
          booking_date: bookingDate,
          booked_by: bookedBy,
        },
        lines.map((l) => ({
          unit_id: l.unit_id,
          ...lineParts(l),
          booking_amount: n(l.booking_amount),
          // each unit's booking money is its own receipt, so each booking
          // is credited with exactly what was paid against it
          payment:
            received && n(l.booking_amount) > 0
              ? {
                  amount: n(l.booking_amount),
                  payment_date: paymentDate,
                  payment_method: paymentMethod,
                  reference_no: paymentReference,
                  account_id: accountId,
                  notes: 'Booking money taken at the time of booking (multi-unit)',
                }
              : null,
        })),
        userId,
      );
      router.push(`/admin/customers/${customerId}`);
    } catch (err) {
      setErrors({ lines: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">
      <Card>
        <CardHeader title="Buyer" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Customer" required error={errors.customer_id}>
            <SelectInput
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
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
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              invalid={Boolean(errors.booking_date)}
            />
          </Field>
          <Field label="Booked By" required error={errors.booked_by}>
            <SelectInput
              value={bookedBy}
              onChange={(e) => setBookedBy(e.target.value)}
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
          <Field label="Project" required hint="Only projects with sales open are listed.">
            <SelectInput
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setLines([]);
              }}
            >
              <option value="">Pick a project</option>
              {projects
                .filter((p) => projectSalesStatus(p) === 'open')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
            </SelectInput>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={`${shape.labels.itemPlural} to book`} />
        {!projectId ? (
          <p className="text-sm text-ink-muted">Pick a project to see its free {itemPlural}.</p>
        ) : sellable.length === 0 ? (
          <p className="text-sm text-ink-muted">No {itemPlural} are free on this project.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sellable.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleUnit(u)}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                  picked.has(u.id)
                    ? 'border-admin-500 bg-admin-50 text-admin-800'
                    : 'border-hairline bg-white text-ink hover:bg-admin-50/60'
                }`}
              >
                <span className="block font-medium">{unitDescription(u, shape)}</span>
                <span className="text-ink-muted">{formatBdt(u.base_price)}</span>
              </button>
            ))}
          </div>
        )}
        {errors.lines && <p className="mt-3 text-xs text-red-600">{errors.lines}</p>}

        {lines.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                  <th className="py-2 pr-2 font-medium">Unit</th>
                  <th className="py-2 pr-2 font-medium">Base price</th>
                  {shape.premiums.map((k) => (
                    <th key={k} className="py-2 pr-2 font-medium">
                      {PREMIUM_LABEL[k]}
                    </th>
                  ))}
                  <th className="py-2 pr-2 font-medium">Other</th>
                  <th className="py-2 pr-2 font-medium">Discount</th>
                  <th className="py-2 pr-2 font-medium">Booking amount</th>
                  <th className="py-2 pr-2 text-right font-medium">Final price</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const unit = unitById.get(l.unit_id);
                  const parts = lineParts(l);
                  const cell = (key: keyof Line) => (
                    <td className="py-2 pr-2">
                      <TextInput
                        type="number"
                        min="0"
                        value={l[key]}
                        onChange={(e) => setLine(l.unit_id, key, e.target.value)}
                        className="min-w-[110px]"
                      />
                    </td>
                  );
                  return (
                    <tr key={l.unit_id} className="border-b border-hairline align-top">
                      <td className="py-3 pr-2 font-medium text-ink">
                        {unit?.code ?? '—'}
                        {errors[l.unit_id] && (
                          <span className="block text-xs font-normal text-red-600">
                            {errors[l.unit_id]}
                          </span>
                        )}
                      </td>
                      {cell('base_price')}
                      {shape.premiums.map((k) => (
                        <td key={k} className="py-2 pr-2">
                          <TextInput
                            type="number"
                            min="0"
                            value={l[PREMIUM_LINE_KEY[k]]}
                            onChange={(e) => setLine(l.unit_id, PREMIUM_LINE_KEY[k], e.target.value)}
                            className="min-w-[110px]"
                          />
                        </td>
                      ))}
                      {cell('other_charges')}
                      <td className="py-2 pr-2">
                        <TextInput
                          type="number"
                          min="0"
                          value={l.discount_amount}
                          onChange={(e) => setLine(l.unit_id, 'discount_amount', e.target.value)}
                          className="min-w-[110px]"
                        />
                        {parts.discount_amount > 0 && (
                          <span className="mt-1 block text-xs text-ink-muted">
                            {discountPct(parts.base_price, parts.discount_amount).toFixed(2)}% of base
                          </span>
                        )}
                      </td>
                      {cell('booking_amount')}
                      <td className="py-3 pr-2 text-right font-medium text-ink">
                        {formatBdt(finalPrice(parts))}
                      </td>
                      <td className="py-2">
                        <Button
                          variant="dangerGhost"
                          size="sm"
                          onClick={() => unit && toggleUnit(unit)}
                          aria-label={`Remove ${unit?.code ?? 'unit'}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-sm font-semibold text-ink">
                  <td className="pt-3" colSpan={4 + shape.premiums.length}>
                    Total — {lines.length} {lines.length === 1 ? shape.labels.item.toLowerCase() : itemPlural}
                  </td>
                  <td className="pt-3 pr-2">{formatBdt(totals.booking)}</td>
                  <td className="pt-3 pr-2 text-right">{formatBdt(totals.final)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Booking Money" />
        <Checkbox
          label={`Booking money already received for every ${shape.labels.item.toLowerCase()} (${formatBdt(totals.booking)})`}
          checked={received}
          onChange={(e) => setReceived(e.target.checked)}
        />
        {received && (
          <div className="mt-4 grid gap-4 rounded-xl border border-hairline bg-canvas/50 p-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Received on" required>
              <TextInput
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </Field>
            <Field label="Method" required>
              <SelectInput
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <AccountPicker
              value={accountId}
              onChange={setAccountId}
              label="Received into"
              required
              error={errors.account_id}
            />
            <Field label="Reference" hint="Cheque no., bank slip, bKash TrxID">
              <TextInput
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </Field>
          </div>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Each unit becomes its own booking, all sharing one group reference. A unit confirms
          itself when its booking money is in; record each one&apos;s agreement from its booking
          page.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {lines.length > 0 && (
          <Badge tone="teal">
            {lines.length} {lines.length === 1 ? shape.labels.item.toLowerCase() : itemPlural} ·{' '}
            {formatBdt(totals.final)}
          </Badge>
        )}
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving
            ? 'Saving…'
            : `Book ${lines.length || ''} ${lines.length === 1 ? shape.labels.item.toLowerCase() : itemPlural}`}
        </Button>
      </div>
    </form>
  );
}
