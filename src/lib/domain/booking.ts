import type { BadgeTone } from '@/components/ui/Badge';
import type {
  Booking,
  BookingStatus,
  DiscountApprovalStatus,
  PaymentMethod,
  UserRole,
} from '@/lib/db/types';

/**
 * Module 4 status pipeline (Scope v3.md, Section 5.2):
 *
 *   hold → pending_approval → confirmed
 *        → cancelled  (from hold or pending_approval)
 *
 * `pending_approval` is conditional — it only appears when the discount goes
 * past what the booking user's role may give away on its own (5.4).
 */
export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  hold: { label: 'Hold', tone: 'amber' },
  pending_approval: { label: 'Pending Approval', tone: 'blue' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export const DISCOUNT_APPROVAL_META: Record<
  DiscountApprovalStatus,
  { label: string; tone: BadgeTone }
> = {
  not_required: { label: 'Not Required', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
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
export const BOOKING_PIPELINE_STEPS: BookingStatus[] = ['hold', 'pending_approval', 'confirmed'];

/* ------------------------------------------------------------------ *
 * Pricing (Section 5.6)
 * ------------------------------------------------------------------ */

export interface PriceParts {
  base_price: number;
  floor_premium: number;
  facing_premium: number;
  parking_charge: number;
  other_charges: number;
  discount_amount: number;
}

export function finalPrice(parts: PriceParts): number {
  return (
    Number(parts.base_price || 0) +
    Number(parts.floor_premium || 0) +
    Number(parts.facing_premium || 0) +
    Number(parts.parking_charge || 0) +
    Number(parts.other_charges || 0) -
    Number(parts.discount_amount || 0)
  );
}

/**
 * Discount as a percentage of base price — the number the approval rule is
 * compared against (Section 5.4). Base price is the denominator, not the
 * gross total, so premiums cannot be used to disguise a bigger discount.
 */
export function discountPct(basePrice: number, discountAmount: number): number {
  const base = Number(basePrice) || 0;
  if (base <= 0) return 0;
  return (Number(discountAmount) || 0) / base * 100;
}

/* ------------------------------------------------------------------ *
 * Gating (Section 5.2)
 * ------------------------------------------------------------------ */

/**
 * Does this discount need someone senior to sign off?
 * `null` ceiling means the role has no rule configured, so anything it gives
 * away needs approval — safer than silently allowing it.
 */
export function needsDiscountApproval(
  basePrice: number,
  discountAmount: number,
  maxDiscountPct: number | null,
): boolean {
  const pct = discountPct(basePrice, discountAmount);
  if (pct <= 0) return false;
  if (maxDiscountPct === null) return true;
  // a hair of floating-point slack, so 5.00% against a 5% ceiling passes
  return pct > maxDiscountPct + 0.001;
}

/**
 * The only rule that promotes a booking to `confirmed` (Section 5.2):
 * the money is in AND the discount is either not an issue or signed off.
 * Both conditions, or it stays where it is.
 */
export function canConfirm(booking: Pick<
  Booking,
  'booking_amount_received' | 'discount_approval_status'
>): boolean {
  return (
    booking.booking_amount_received === true &&
    (booking.discount_approval_status === 'not_required' ||
      booking.discount_approval_status === 'approved')
  );
}

/**
 * Where a booking should sit given its current facts. Called after every edit
 * so the status is never something a user typed by hand — it is derived.
 */
export function derivedStatus(
  booking: Pick<Booking, 'booking_amount_received' | 'discount_approval_status' | 'status'>,
): BookingStatus {
  // cancelled is terminal and only ever set deliberately
  if (booking.status === 'cancelled') return 'cancelled';
  if (canConfirm(booking)) return 'confirmed';
  if (booking.discount_approval_status === 'pending') return 'pending_approval';
  return 'hold';
}

/** What is still missing before the booking can be confirmed. */
export function blockersForConfirm(
  booking: Pick<Booking, 'booking_amount_received' | 'discount_approval_status'>,
): string[] {
  const blockers: string[] = [];
  if (!booking.booking_amount_received) blockers.push('Booking amount has not been received');
  if (booking.discount_approval_status === 'pending') {
    blockers.push('Discount is waiting for approval');
  }
  if (booking.discount_approval_status === 'rejected') {
    blockers.push('Discount was rejected — adjust it and submit again');
  }
  return blockers;
}

export function isBookingClosed(status: BookingStatus): boolean {
  return status === 'confirmed' || status === 'cancelled';
}

/** Roles allowed to approve a discount — anyone above a sales executive. */
export const DISCOUNT_APPROVER_ROLES: UserRole[] = [
  'sales_manager',
  'head_of_sales',
  'management',
  'super_admin',
];

export function canApproveDiscount(role: UserRole): boolean {
  return DISCOUNT_APPROVER_ROLES.includes(role);
}

/**
 * One sentence explaining why the approval step is where it is. "(not needed)"
 * on its own left people guessing, which is exactly the wrong thing for a rule
 * about giving money away.
 */
export function discountApprovalExplanation(
  booking: Pick<Booking, 'base_price' | 'discount_amount' | 'discount_approval_status'>,
  sellerName: string | undefined,
  ceilingPct: number | null,
): string {
  const pct = discountPct(booking.base_price, booking.discount_amount);
  const who = sellerName ?? 'this role';
  const limit = ceilingPct === null ? 'no configured limit' : `${ceilingPct}% limit`;

  switch (booking.discount_approval_status) {
    case 'not_required':
      return booking.discount_amount > 0
        ? `${pct.toFixed(2)}% discount is inside ${who}'s ${limit}, so no approval was needed.`
        : 'No discount was given, so there was nothing to approve.';
    case 'pending':
      return `${pct.toFixed(2)}% discount is above ${who}'s ${limit} — a Sales Manager or above has to sign it off before the booking can confirm.`;
    case 'approved':
      return `${pct.toFixed(2)}% discount was above ${who}'s ${limit} and has been approved.`;
    case 'rejected':
      return `${pct.toFixed(2)}% discount was rejected. Lower it and save — if it lands inside the ${limit}, no approval is needed at all.`;
  }
}
