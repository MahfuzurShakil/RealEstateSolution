import type { BadgeTone } from '@/components/ui/Badge';
import type {
  ShareFrequency,
  ShareInstallment,
  ShareOffering,
  ShareOfferingStatus,
  SharePayment,
  SharePaymentAllocation,
  SharePaymentMethod,
  ShareSale,
  ShareSaleStatus,
} from '../db/types';
import { addMonths } from './booking';

/*
 * Share Sale rules (PROJECT-SHARE-SALE-PLAN.md, Phase 1), kept free of Dexie
 * so the admin screens, the demo seed and the tests all work them out the
 * same way:
 *
 *   valuation        = net asset value + premium
 *   ownership/share  = % offered ÷ number of shares
 *   price per share  = valuation × ownership/share
 *
 * A purchase's schedule is a down payment plus up to the offering's maximum
 * installments; payments go to late fees first, then the oldest installment.
 */

export const OFFERING_STATUS_META: Record<ShareOfferingStatus | 'expired', { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  open: { label: 'Open', tone: 'green' },
  expired: { label: 'Validity ended', tone: 'amber' },
  closed: { label: 'Closed', tone: 'blue' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export const FREQUENCY_LABEL: Record<ShareFrequency, string> = { monthly: 'Monthly', quarterly: 'Quarterly' };
const FREQUENCY_MONTHS: Record<ShareFrequency, number> = { monthly: 1, quarterly: 3 };

export const SHARE_PAYMENT_METHOD_LABEL: Record<SharePaymentMethod, string> = {
  bank_transfer: 'Bank deposit / transfer',
  cheque: 'Cheque',
  cash: 'Cash at office',
  bkash: 'bKash',
  nagad: 'Nagad',
  card: 'Card',
  online: 'Online (Customer Portal)',
};

/** What a purchase shows as: the stored stage, or what the schedule says about it. */
export type SaleHealth = 'reserved' | 'hold_expired' | 'paying' | 'overdue' | 'fully_paid' | 'certified' | 'released' | 'cancelled';
export const SALE_HEALTH_META: Record<SaleHealth, { label: string; tone: BadgeTone }> = {
  reserved: { label: 'Reserved', tone: 'blue' },
  hold_expired: { label: 'Hold expired', tone: 'amber' },
  paying: { label: 'Paying', tone: 'teal' },
  overdue: { label: 'Overdue', tone: 'red' },
  fully_paid: { label: 'Fully paid', tone: 'green' },
  certified: { label: 'Certificate issued', tone: 'green' },
  released: { label: 'Released', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** Shares a purchase still takes out of its offering. */
export const SALE_HOLDS_SHARES: Record<ShareSaleStatus, boolean> = {
  reserved: true,
  agreement_signed: true,
  fully_paid: true,
  released: false,
  cancelled: false,
};

/* -------------------------------------------------------------- offering */

export interface OfferingTerms {
  net_asset_value: number;
  premium_value: number;
  offered_pct: number;
  total_shares: number;
}

export interface OfferingMath {
  valuation: number;
  share_pct: number;
  price_per_share: number;
  /** what the offering raises if every share sells */
  raise: number;
  /** premium as a % of the net asset value */
  premium_pct: number | null;
}

export function offeringMath(t: OfferingTerms): OfferingMath {
  const nav = Number(t.net_asset_value) || 0;
  const premium = Number(t.premium_value) || 0;
  const pct = Number(t.offered_pct) || 0;
  const shares = Math.floor(Number(t.total_shares) || 0);
  const valuation = nav + premium;
  const sharePct = shares > 0 ? pct / shares : 0;
  const price = Math.round((valuation * sharePct) / 100);
  return {
    valuation,
    share_pct: sharePct,
    price_per_share: price,
    raise: price * shares,
    premium_pct: nav > 0 ? (premium / nav) * 100 : null,
  };
}

/** An offering as the list shows it: an open one past its closing day reads "Validity ended". */
export function offeringState(o: Pick<ShareOffering, 'status' | 'closes_on'>, today: string): ShareOfferingStatus | 'expired' {
  return o.status === 'open' && o.closes_on && o.closes_on < today ? 'expired' : o.status;
}

export function closesOn(opensOn: string, validityDays: number): string {
  return addDays(opensOn, Math.max(0, validityDays - 1));
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface OfferingAvailability {
  sold: number;
  reserved: number;
  available: number;
  sold_pct: number;
}

/** Shares sold (agreement signed or paid), reserved, and still free in one offering. */
export function offeringAvailability(o: Pick<ShareOffering, 'id' | 'total_shares'>, sales: ShareSale[]): OfferingAvailability {
  const mine = sales.filter((s) => s.offering_id === o.id);
  const sold = mine.filter((s) => s.status === 'agreement_signed' || s.status === 'fully_paid').reduce((t, s) => t + s.shares, 0);
  const reserved = mine.filter((s) => s.status === 'reserved').reduce((t, s) => t + s.shares, 0);
  return { sold, reserved, available: Math.max(0, o.total_shares - sold - reserved), sold_pct: o.total_shares ? (sold / o.total_shares) * 100 : 0 };
}

/* -------------------------------------------------------------- schedule */

export interface PlanTerms {
  total_price: number;
  down_payment: number;
  installment_count: number;
  installment_frequency: ShareFrequency;
  /** the down payment falls due on this day */
  agreement_date: string;
  first_due_date: string;
}

/**
 * Down payment on the agreement day, then equal installments by the
 * frequency. Whole taka; the last installment takes the rounding.
 */
export function buildSchedule(t: PlanTerms): Omit<ShareInstallment, 'id' | 'sale_id' | 'created_at' | 'updated_at' | 'created_by'>[] {
  const out = [{ seq: 0, due_date: t.agreement_date, amount: Math.round(t.down_payment) }];
  const n = Math.max(0, Math.floor(t.installment_count));
  const rest = Math.round(t.total_price) - Math.round(t.down_payment);
  if (n === 0) {
    out[0].amount = Math.round(t.total_price);
    return out;
  }
  const each = Math.floor(rest / n);
  for (let k = 0; k < n; k++) {
    out.push({
      seq: k + 1,
      due_date: addMonths(t.first_due_date, k * FREQUENCY_MONTHS[t.installment_frequency]),
      amount: k === n - 1 ? rest - each * (n - 1) : each,
    });
  }
  return out;
}

export function installmentLabel(seq: number): string {
  return seq === 0 ? 'Down payment' : `Installment ${seq}`;
}

/* ----------------------------------------------------------- what is due */

export type ShareInstallmentStatus = 'paid' | 'overdue' | 'due' | 'upcoming';
export const SHARE_INSTALLMENT_STATUS_META: Record<ShareInstallmentStatus, { label: string; tone: BadgeTone }> = {
  paid: { label: 'Paid', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
  due: { label: 'Due', tone: 'amber' },
  upcoming: { label: 'Upcoming', tone: 'neutral' },
};
/** an unpaid installment falling due within this many days shows as "Due" */
export const DUE_WINDOW_DAYS = 30;

export interface ShareInstallmentView extends ShareInstallment {
  label: string;
  status: ShareInstallmentStatus;
  paid_amount: number;
  remaining: number;
  days_late: number;
  late_fee_paid: number;
  late_fee_due: number;
  paid_on: string | null;
}

export interface FeeRule {
  late_fee_pct: number;
  grace_days: number;
}

export function viewShareInstallments(installments: ShareInstallment[], payments: SharePayment[], today: string, rule: FeeRule): ShareInstallmentView[] {
  return installments
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((inst) => {
      const touching = payments.filter((p) => p.allocations.some((a) => a.installment_id === inst.id));
      const allocs = touching.flatMap((p) => p.allocations.filter((a) => a.installment_id === inst.id));
      const paid = Math.min(inst.amount, allocs.reduce((t, a) => t + a.principal, 0));
      const feePaid = allocs.reduce((t, a) => t + a.late_fee, 0);
      const remaining = inst.amount - paid;
      const days = daysBetween(inst.due_date, today);
      const status: ShareInstallmentStatus = remaining <= 0 ? 'paid' : days > 0 ? 'overdue' : -days <= DUE_WINDOW_DAYS ? 'due' : 'upcoming';
      const daysLate = status === 'overdue' ? days : 0;
      const fee = status === 'overdue' && daysLate > rule.grace_days ? Math.round((inst.amount * rule.late_fee_pct) / 100) : feePaid;
      const lastPaid = touching.map((p) => p.paid_on).sort().pop() ?? null;
      return {
        ...inst,
        label: installmentLabel(inst.seq),
        status,
        paid_amount: paid,
        remaining,
        days_late: daysLate,
        late_fee_paid: feePaid,
        late_fee_due: Math.max(0, fee - feePaid),
        paid_on: status === 'paid' ? lastPaid : null,
      };
    });
}

export interface SaleView {
  sale: ShareSale;
  schedule: ShareInstallmentView[];
  payments: SharePayment[];
  paid: number;
  outstanding: number;
  overdue_amount: number;
  late_fees: number;
  /** overdue principal plus late fees */
  due_now: number;
  next: ShareInstallmentView | null;
  paid_count: number;
  progress_pct: number;
  health: SaleHealth;
}

export function viewSale(sale: ShareSale, installments: ShareInstallment[], payments: SharePayment[], today: string, rule: FeeRule): SaleView {
  const pays = payments.filter((p) => p.sale_id === sale.id).sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.code.localeCompare(a.code));
  const schedule = viewShareInstallments(
    installments.filter((i) => i.sale_id === sale.id),
    pays,
    today,
    rule,
  );
  const sum = (rows: ShareInstallmentView[], f: (r: ShareInstallmentView) => number) => rows.reduce((t, r) => t + f(r), 0);
  const overdueRows = schedule.filter((r) => r.status === 'overdue');
  const paid = schedule.length ? sum(schedule, (r) => r.paid_amount) : 0;
  const lateFees = sum(schedule, (r) => r.late_fee_due);
  const overdue = sum(overdueRows, (r) => r.remaining);
  let health: SaleHealth;
  if (sale.status === 'reserved') health = sale.hold_until < today ? 'hold_expired' : 'reserved';
  else if (sale.status === 'released' || sale.status === 'cancelled') health = sale.status;
  else if (sale.certificate_no) health = 'certified';
  else if (schedule.length && schedule.every((r) => r.status === 'paid')) health = 'fully_paid';
  else health = overdueRows.length ? 'overdue' : 'paying';
  return {
    sale,
    schedule,
    payments: pays,
    paid,
    outstanding: sale.status === 'released' || sale.status === 'cancelled' ? 0 : sale.total_price - paid,
    overdue_amount: overdue,
    late_fees: lateFees,
    due_now: overdue + lateFees,
    next: schedule.find((r) => r.status !== 'paid') ?? null,
    paid_count: schedule.filter((r) => r.status === 'paid').length,
    progress_pct: sale.total_price ? Math.round((paid / sale.total_price) * 100) : 0,
    health,
  };
}

/** Late fees first, then the oldest installment; what is left goes to the next one. */
export function allocateSharePayment(view: SaleView, amount: number): SharePaymentAllocation[] {
  let left = Math.round(amount);
  const out: SharePaymentAllocation[] = [];
  for (const i of view.schedule) {
    if (left <= 0) break;
    if (i.status === 'paid' && i.late_fee_due === 0) continue;
    const fee = Math.min(left, i.late_fee_due);
    left -= fee;
    const principal = Math.min(left, i.remaining);
    left -= principal;
    if (fee || principal) out.push({ installment_id: i.id, principal, late_fee: fee });
  }
  return out;
}

export function maxSharePayable(view: SaleView): number {
  return view.outstanding + view.late_fees;
}

/* -------------------------------------------------------------- display */

/** "0.1%" / "0.125%" — share percentages without float noise. */
export function formatSharePct(pct: number): string {
  return `${Number(pct.toFixed(4))}%`;
}

/** "BDT 120 Cr" / "BDT 12 L" — a short amount for valuations, in the admin's BDT style. */
export function formatCrore(amount: number): string {
  if (Math.abs(amount) >= 10_000_000) return `BDT ${Number((amount / 10_000_000).toFixed(2))} Cr`;
  if (Math.abs(amount) >= 100_000) return `BDT ${Number((amount / 100_000).toFixed(2))} L`;
  return `BDT ${Math.round(amount).toLocaleString('en-IN')}`;
}
