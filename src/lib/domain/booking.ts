import type { BadgeTone } from '@/components/ui/Badge';
import type {
  Booking,
  BookingStatus,
  PaymentMethod,
  SalePaymentMode,
} from '@/lib/db/types';

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
  installment: 'Instalments (kisti)',
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

/** What one kisti is: the typed amount, or the balance after booking money split evenly. */
export function kistiAmount(t: AgreementTerms): number {
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
 * typed kisti amount never leaves a few taka owed for ever.
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
    const each = kistiAmount(t);
    for (let k = 1; k <= n; k++) {
      lines.push({
        date: addMonths(t.first_installment_date, k - 1),
        label: `Kisti ${k} of ${n}`,
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
