'use client';

import { db } from '../db/database';
import type { Booking, Customer, Payment, Project, ShareOffering, SharePayment, ShareSale, Unit } from '../db/types';
import { viewBookingLedger, type BookingLedgerView } from '../domain/booking';
import { viewSale, type SaleView } from '../domain/share-sale';
import { todayLocal } from '../utils/format';

/*
 * One customer, two kinds of holding (BUYER-PORTAL-PLAN.md §4). A customer is
 * a Buyer while they hold a booking and an Investor while they hold a share
 * purchase — worked out from the records, so one person can be both. The type
 * picked when the customer was created only counts until they hold anything.
 */

export type CustomerRole = 'buyer' | 'investor';

export interface MoneyTotals {
  count: number;
  value: number;
  received: number;
  balance: number;
  overdue: number;
}

export interface HomeHolding {
  booking: Booking;
  unit?: Unit;
  project?: Project;
  ledger: BookingLedgerView;
}

export interface ShareHolding {
  view: SaleView;
  offering?: ShareOffering;
  project?: Project;
}

export interface CustomerPortfolio {
  customer: Customer;
  roles: CustomerRole[];
  homes: MoneyTotals;
  shares: MoneyTotals & { shares: number; pct: number };
  total: MoneyTotals;
}

/** A share purchase that is still held: reserved, being paid or paid. */
const HOLDS = (s: ShareSale) => s.status === 'reserved' || s.status === 'agreement_signed' || s.status === 'fully_paid';

function sum(rows: MoneyTotals[]): MoneyTotals {
  return rows.reduce(
    (t, r) => ({ count: t.count + r.count, value: t.value + r.value, received: t.received + r.received, balance: t.balance + r.balance, overdue: t.overdue + r.overdue }),
    { count: 0, value: 0, received: 0, balance: 0, overdue: 0 },
  );
}

async function readAll(today: string) {
  const [customers, bookings, rows, payments, sales, offerings, installments, sharePayments, requests] = await Promise.all([
    db.customers.toArray(),
    db.bookings.toArray(),
    db.booking_installments.toArray(),
    db.payments.toArray(),
    db.share_sales.toArray(),
    db.share_offerings.toArray(),
    db.share_installments.toArray(),
    db.share_payments.toArray(),
    db.share_requests.toArray(),
  ]);
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const ledgers = new Map<string, BookingLedgerView>();
  for (const b of bookings) {
    ledgers.set(
      b.id,
      viewBookingLedger(b, rows.filter((r) => r.booking_id === b.id), payments.filter((p) => p.booking_id === b.id), today),
    );
  }
  const saleViews = new Map<string, SaleView>();
  for (const s of sales) {
    const o = offeringById.get(s.offering_id);
    saleViews.set(s.id, viewSale(s, installments, sharePayments, today, { late_fee_pct: o?.late_fee_pct ?? 0, grace_days: o?.grace_days ?? 0 }));
  }
  return { customers, bookings, sales, requests, ledgers, saleViews, offeringById };
}

function portfolioOf(customer: Customer, data: Awaited<ReturnType<typeof readAll>>): CustomerPortfolio {
  const homes = data.bookings.filter((b) => b.customer_id === customer.id && b.status !== 'cancelled');
  const held = data.sales.filter((s) => s.customer_id === customer.id && HOLDS(s));
  const asked = data.requests.some((r) => r.customer_id === customer.id && (r.status === 'new' || r.status === 'contacted'));

  const homeTotals = sum(
    homes.map((b) => {
      const l = data.ledgers.get(b.id)!;
      return { count: 1, value: Number(b.final_price) || 0, received: l.paid, balance: l.outstanding, overdue: l.due_now };
    }),
  );
  const shareTotals = sum(
    held.map((s) => {
      const v = data.saleViews.get(s.id)!;
      return { count: 1, value: s.total_price, received: v.paid, balance: v.outstanding, overdue: v.due_now };
    }),
  );

  const roles: CustomerRole[] = [];
  // a cancelled booking still makes them a buyer on record
  if (data.bookings.some((b) => b.customer_id === customer.id)) roles.push('buyer');
  if (held.length || asked) roles.push('investor');
  // holding nothing yet: the type they were created as
  if (!roles.length && customer.customer_type) roles.push(customer.customer_type);

  return {
    customer,
    roles,
    homes: homeTotals,
    shares: { ...shareTotals, shares: held.reduce((t, s) => t + s.shares, 0), pct: held.reduce((t, s) => t + s.share_pct, 0) },
    total: sum([homeTotals, shareTotals]),
  };
}

export const customerPortfolioRepository = {
  /** Every customer's roles and money, for the Customers list. */
  async all(today = todayLocal()): Promise<Map<string, CustomerPortfolio>> {
    const data = await readAll(today);
    return new Map(data.customers.map((c) => [c.id, portfolioOf(c, data)]));
  },

  /** One customer's holdings in full, for the customer page. */
  async forCustomer(
    customerId: string,
    today = todayLocal(),
  ): Promise<{ portfolio: CustomerPortfolio; homes: HomeHolding[]; shares: ShareHolding[]; payments: CustomerPaymentRow[] } | null> {
    const data = await readAll(today);
    const customer = data.customers.find((c) => c.id === customerId);
    if (!customer) return null;
    const bookings = data.bookings.filter((b) => b.customer_id === customerId);
    const sales = data.sales.filter((s) => s.customer_id === customerId && s.status !== 'released');
    const [units, projects, bookingPays, sharePays] = await Promise.all([
      db.units.bulkGet(bookings.map((b) => b.unit_id)),
      db.projects.toArray(),
      db.payments.where('booking_id').anyOf(bookings.map((b) => b.id)).toArray(),
      db.share_payments.where('sale_id').anyOf(sales.map((s) => s.id)).toArray(),
    ]);
    const towers = await db.towers.bulkGet(units.map((u) => u?.tower_id ?? ''));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const homes: HomeHolding[] = bookings.map((b, i) => ({
      booking: b,
      unit: units[i] ?? undefined,
      project: towers[i] ? projectById.get(towers[i]!.project_id) : undefined,
      ledger: data.ledgers.get(b.id)!,
    }));
    const shares: ShareHolding[] = sales.map((s) => ({ view: data.saleViews.get(s.id)!, offering: data.offeringById.get(s.offering_id), project: projectById.get(s.project_id) }));
    const bookingCode = new Map(homes.map((h) => [h.booking.id, `${h.booking.code}${h.unit ? ` · ${h.unit.code}` : ''}`]));
    const saleCode = new Map(sales.map((s) => [s.id, s.code]));
    const payments: CustomerPaymentRow[] = [
      ...bookingPays.map((p: Payment) => ({
        id: p.id,
        kind: 'home' as const,
        date: p.payment_date,
        amount: Number(p.amount) || 0,
        late_fee: Number(p.late_fee) || 0,
        against: bookingCode.get(p.booking_id) ?? 'Booking',
        href: `/admin/bookings/${p.booking_id}?tab=payments`,
        reference: p.reference_no ?? null,
        online: p.channel === 'online',
      })),
      ...sharePays.map((p: SharePayment) => ({
        id: p.id,
        kind: 'share' as const,
        date: p.paid_on,
        amount: p.amount,
        late_fee: p.late_fee,
        against: saleCode.get(p.sale_id) ?? 'Share purchase',
        href: `/admin/share-sale/sales/${p.sale_id}`,
        reference: p.reference ?? null,
        online: p.channel === 'online',
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return { portfolio: portfolioOf(customer, data), homes, shares, payments };
  },
};

/** One payment on the customer's combined ledger, from either kind of holding. */
export interface CustomerPaymentRow {
  id: string;
  kind: 'home' | 'share';
  date: string;
  amount: number;
  late_fee: number;
  against: string;
  href: string;
  reference: string | null;
  online: boolean;
}
