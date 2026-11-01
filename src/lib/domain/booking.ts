import type { BadgeTone } from '@/components/ui/Badge';
import type {
  Booking,
  BookingInstallment,
  BookingInstallmentKind,
  BookingStatus,
  Payment,
  PaymentMethod,
  SalePaymentMode,
} from '@/lib/db/types';
import { NO_LATE_FEE, replayPayments, viewInstallments, type FeeRule, type InstallmentView } from './installment-ledger';

/**
 * Booking status (SALES-FLOW-PLAN.md S1, client 2026-10-22):
 *
 *   hold → confirmed      (the booking money is in)
 *        → cancelled
 *
 * There is no discount approval any more: a small developer's owner gives the
 * discount himself, so the discount is recorded and shown but never gates.
 */
export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  hold: { label: 'Hold', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank: 'Bank Transfer',
  mfs: 'bKash / Nagad',
  cheque: 'Cheque',
  card: 'Card',
  online: 'Online',
};

/** The trail shown on the detail page; `cancelled` sits outside it. */
export const BOOKING_PIPELINE_STEPS: BookingStatus[] = ['hold', 'confirmed'];

/* ------------------------------------------------------------------ *
 * Pricing (Section 5.6)
 * ------------------------------------------------------------------ */

/**
 * Every price line a booking can carry.
 *
 * v27 — the premiums a booking actually *asks* for come from the project
 * shape (`ProjectShape.premiums`): floor, facing and parking on a flat, road
 * width and corner on a plot, none on a land share. They all live here and all
 * default to zero, so the sum below stays one expression rather than a branch
 * per shape, and a booking carrying a premium its shape no longer uses still
 * totals correctly instead of quietly losing money.
 */
export interface PriceParts {
  base_price: number;
  floor_premium: number;
  facing_premium: number;
  parking_charge: number;
  road_premium?: number | null;
  corner_premium?: number | null;
  other_charges: number;
  discount_amount: number;
}

export function finalPrice(parts: PriceParts): number {
  return (
    Number(parts.base_price || 0) +
    Number(parts.floor_premium || 0) +
    Number(parts.facing_premium || 0) +
    Number(parts.parking_charge || 0) +
    Number(parts.road_premium || 0) +
    Number(parts.corner_premium || 0) +
    Number(parts.other_charges || 0) -
    Number(parts.discount_amount || 0)
  );
}

/**
 * Discount as a percentage of base price, shown beside the amount. Base price
 * is the denominator, not the gross total, so premiums cannot make a big
 * discount look small.
 */
export function discountPct(basePrice: number, discountAmount: number): number {
  const base = Number(basePrice) || 0;
  if (base <= 0) return 0;
  return (Number(discountAmount) || 0) / base * 100;
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

/**
 * Where a booking should sit given its current facts. Called after every edit
 * so the status is never something a user typed by hand — it is derived from
 * the money: the full booking amount received means confirmed.
 */
export function derivedStatus(
  booking: Pick<Booking, 'booking_amount_received' | 'status'>,
): BookingStatus {
  // cancelled is terminal and only ever set deliberately
  if (booking.status === 'cancelled') return 'cancelled';
  return booking.booking_amount_received ? 'confirmed' : 'hold';
}

/* ------------------------------------------------------------------ *
 * Agreement terms (SALES-FLOW-PLAN.md S3)
 * ------------------------------------------------------------------ */

export const SALE_PAYMENT_MODE_LABEL: Record<SalePaymentMode, string> = {
  full: 'Full payment',
  installment: 'Installments',
};

export type AgreementTerms = Pick<
  Booking,
  | 'booking_date'
  | 'final_price'
  | 'booking_amount'
  | 'payment_mode'
  | 'full_payment_due_date'
  | 'installment_count'
  | 'installment_amount'
  | 'first_installment_date'
>;

export function hasAgreement(b: Pick<Booking, 'agreement_date' | 'payment_mode'>): boolean {
  return Boolean(b.agreement_date || b.payment_mode);
}

/** `YYYY-MM-DD` plus whole months, the day held (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** What one installment is: the typed amount, or the balance after booking money split evenly. */
export function installmentAmount(t: AgreementTerms): number {
  const typed = Number(t.installment_amount) || 0;
  if (typed > 0) return typed;
  const n = Number(t.installment_count) || 0;
  if (n <= 0) return 0;
  // whole taka; the last line closes at the final price, so rounding never strands money
  return Math.round(Math.max(Number(t.final_price) - Number(t.booking_amount), 0) / n);
}

/**
 * The dates money is expected on, in order, from the agreement's plain terms.
 * Nothing is stored: change the terms and every figure built on this moves
 * with them. The last line always closes at the final price, so rounding in a
 * typed installment amount never leaves a few taka owed for ever.
 */
export function expectedLines(t: AgreementTerms): Array<{ date: string; label: string; cumulative: number }> {
  const total = Number(t.final_price) || 0;
  const booking = Math.min(Number(t.booking_amount) || 0, total);
  const lines = [{ date: t.booking_date, label: 'Booking money', cumulative: booking }];

  if (t.payment_mode === 'full' && t.full_payment_due_date) {
    lines.push({ date: t.full_payment_due_date, label: 'Full payment', cumulative: total });
  }
  if (t.payment_mode === 'installment' && t.first_installment_date) {
    const n = Math.max(Math.floor(Number(t.installment_count) || 0), 0);
    const each = installmentAmount(t);
    for (let k = 1; k <= n; k++) {
      lines.push({
        date: addMonths(t.first_installment_date, k - 1),
        label: `Installment ${k} of ${n}`,
        cumulative: k === n ? total : Math.min(booking + each * k, total),
      });
    }
  }
  return lines;
}

/** How much the agreement says should be in by `asOf`. */
export function expectedByDate(t: AgreementTerms, asOf: string): number {
  let expected = 0;
  for (const line of expectedLines(t)) if (line.date <= asOf) expected = line.cumulative;
  return expected;
}

/**
 * The first date the receipts do not yet cover, and what is still owed on it.
 * Its date can be in the past — that is the line the buyer is late on.
 */
export function nextDue(
  t: AgreementTerms,
  received: number,
): { date: string; label: string; amount: number } | null {
  let before = 0;
  for (const line of expectedLines(t)) {
    if (line.cumulative > received + 0.5) {
      return { date: line.date, label: line.label, amount: line.cumulative - Math.max(before, received) };
    }
    before = line.cumulative;
  }
  return null;
}

/** The buyer's money in one line: owed, in, left, and how far behind the agreement. */
export function buyerLedger(t: AgreementTerms, received: number, asOf: string) {
  const total = Number(t.final_price) || 0;
  const expected = expectedByDate(t, asOf);
  const monthEnd = `${asOf.slice(0, 7)}-31`;
  return {
    total,
    received,
    balance: Math.max(total - received, 0),
    expected,
    behind: Math.max(expected - received, 0),
    /** falling due later this month, on top of anything already behind */
    due_this_month: Math.max(expectedByDate(t, monthEnd) - Math.max(expected, received), 0),
    next: nextDue(t, received),
  };
}

/* ------------------------------------------------------------------ *
 * The stored schedule (BUYER-PORTAL-PLAN.md §2, v45)
 *
 * The rows are exactly `expectedLines` turned from running totals into
 * amounts, so the Collections figures read from the terms and the schedule
 * read from the rows can never disagree. Money goes through the same ledger
 * as a Share Sale purchase (installment-ledger.ts).
 * ------------------------------------------------------------------ */

export type BookingScheduleRow = Pick<BookingInstallment, 'seq' | 'kind' | 'label' | 'due_date' | 'amount'>;

export function bookingScheduleRows(t: AgreementTerms): BookingScheduleRow[] {
  const rows: BookingScheduleRow[] = [];
  let before = 0;
  expectedLines(t).forEach((line, seq) => {
    const kind: BookingInstallmentKind = seq === 0 ? 'booking_money' : line.label === 'Full payment' ? 'full_balance' : 'installment';
    const amount = Math.round(line.cumulative - before);
    before = line.cumulative;
    if (amount > 0) rows.push({ seq, kind, label: kind === 'full_balance' ? 'Balance' : line.label, due_date: line.date, amount });
  });
  return rows;
}

/**
 * The late fee the agreement sets; none when it sets none. The booking money
 * never carries one: it is what confirms the unit, taken before any agreement,
 * and a fee on it could pull a confirmed booking back to Hold.
 */
export function bookingFeeRule(b: Pick<Booking, 'late_fee_pct' | 'late_fee_grace_days'>): FeeRule {
  const pct = Number(b.late_fee_pct) || 0;
  if (!(pct > 0)) return NO_LATE_FEE;
  return { late_fee_pct: pct, grace_days: Math.max(0, Number(b.late_fee_grace_days) || 0), exempt: (row) => row.seq === 0 };
}

/** What a receipt puts toward the price: all of it, less any late fee it paid. */
export function principalOf(p: Pick<Payment, 'amount' | 'late_fee'>): number {
  return (Number(p.amount) || 0) - (Number(p.late_fee) || 0);
}

/** Receipts in the order the ledger applies them: by date, then as entered. */
export function inLedgerOrder<P extends Pick<Payment, 'payment_date' | 'created_at'>>(payments: P[]): P[] {
  return payments.slice().sort((a, b) => a.payment_date.localeCompare(b.payment_date) || a.created_at.localeCompare(b.created_at));
}

/** Re-applies a booking's receipts to its rows (see `replayPayments`). */
export function allocateBookingPayments(rows: BookingInstallment[], payments: Payment[], rule: FeeRule) {
  return replayPayments(
    rows,
    inLedgerOrder(payments).map((p) => ({ id: p.id, paid_on: p.payment_date, amount: Number(p.amount) || 0 })),
    rule,
  );
}

export type BookingInstallmentView = InstallmentView<BookingInstallment>;

export interface BookingLedgerView {
  schedule: BookingInstallmentView[];
  /** toward the price (late fees left out) */
  paid: number;
  outstanding: number;
  overdue_amount: number;
  overdue_count: number;
  late_fees: number;
  /** overdue principal plus late fees */
  due_now: number;
  next: BookingInstallmentView | null;
  /** received but beyond every row — an advance waiting for the agreement */
  unallocated: number;
}

export function viewBookingLedger(booking: Booking, rows: BookingInstallment[], payments: Payment[], today: string): BookingLedgerView {
  const schedule = viewInstallments(
    rows,
    payments.map((p) => ({ paid_on: p.payment_date, allocations: p.allocations ?? [] })),
    today,
    bookingFeeRule(booking),
  );
  const paid = payments.reduce((t, p) => t + principalOf(p), 0);
  const allocated = schedule.reduce((t, r) => t + r.paid_amount, 0);
  const overdue = schedule.filter((r) => r.status === 'overdue');
  const overdueAmount = overdue.reduce((t, r) => t + r.remaining, 0);
  const lateFees = schedule.reduce((t, r) => t + r.late_fee_due, 0);
  return {
    schedule,
    paid,
    outstanding: booking.status === 'cancelled' ? 0 : Math.max(Number(booking.final_price) - paid, 0),
    overdue_amount: overdueAmount,
    overdue_count: overdue.length,
    late_fees: lateFees,
    due_now: overdueAmount + lateFees,
    next: schedule.find((r) => r.status !== 'paid') ?? null,
    unallocated: Math.max(paid - allocated, 0),
  };
}

/** The day the receipts first covered the whole price, or null while money is owed. */
export function paidOffOn(booking: Pick<Booking, 'final_price' | 'status'>, payments: Payment[]): string | null {
  const price = Number(booking.final_price) || 0;
  if (price <= 0 || booking.status === 'cancelled') return null;
  let total = 0;
  for (const p of inLedgerOrder(payments)) {
    total += principalOf(p);
    if (total + 0.5 >= price) return p.payment_date;
  }
  return null;
}
