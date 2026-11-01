import type { BadgeTone } from '@/components/ui/Badge';
import type { InstallmentAllocation } from '../db/types';

/*
 * One money engine for every "price paid in installments" record
 * (BUYER-PORTAL-PLAN.md §2.1): a Share Sale purchase and a flat or plot
 * booking keep their schedule, payments and late fees by these same rules.
 *
 *   - a row is paid from the allocations that name it, never from a running total
 *   - a payment goes to late fees first, then to the oldest unpaid row
 *   - an overdue row past the grace days carries one late fee of `late_fee_pct`
 *     of its amount
 *
 * Free of Dexie, so the repositories, the database upgrade, the demo seed and
 * the tests all work it out the same way.
 */

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** One row of a schedule, as either table stores it. */
export interface LedgerRow {
  id: string;
  seq: number;
  due_date: string;
  amount: number;
}

/** A payment as the engine sees it: when, and which rows it went to. */
export interface LedgerPayment {
  paid_on: string;
  allocations: InstallmentAllocation[];
}

export interface FeeRule {
  late_fee_pct: number;
  grace_days: number;
  /** rows that never carry a late fee (a booking's booking money) */
  exempt?: (row: LedgerRow) => boolean;
}

export const NO_LATE_FEE: FeeRule = { late_fee_pct: 0, grace_days: 0 };

export type InstallmentStatus = 'paid' | 'overdue' | 'due' | 'upcoming';
export const INSTALLMENT_STATUS_META: Record<InstallmentStatus, { label: string; tone: BadgeTone }> = {
  paid: { label: 'Paid', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
  due: { label: 'Due', tone: 'amber' },
  upcoming: { label: 'Upcoming', tone: 'neutral' },
};
/** an unpaid row falling due within this many days shows as "Due" */
export const DUE_WINDOW_DAYS = 30;

export type InstallmentView<R extends LedgerRow> = R & {
  status: InstallmentStatus;
  paid_amount: number;
  remaining: number;
  days_late: number;
  late_fee_paid: number;
  late_fee_due: number;
  paid_on: string | null;
};

/** Each row with what has been paid on it, its status and late fee, as of `today`. */
export function viewInstallments<R extends LedgerRow>(
  rows: R[],
  payments: LedgerPayment[],
  today: string,
  rule: FeeRule,
): InstallmentView<R>[] {
  return rows
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((row) => {
      const touching = payments.filter((p) => p.allocations.some((a) => a.installment_id === row.id));
      const allocs = touching.flatMap((p) => p.allocations.filter((a) => a.installment_id === row.id));
      const paid = Math.min(row.amount, allocs.reduce((t, a) => t + a.principal, 0));
      const feePaid = allocs.reduce((t, a) => t + a.late_fee, 0);
      const remaining = row.amount - paid;
      const days = daysBetween(row.due_date, today);
      const status: InstallmentStatus = remaining <= 0 ? 'paid' : days > 0 ? 'overdue' : -days <= DUE_WINDOW_DAYS ? 'due' : 'upcoming';
      const daysLate = status === 'overdue' ? days : 0;
      const charged = status === 'overdue' && daysLate > rule.grace_days && !rule.exempt?.(row);
      const fee = charged ? Math.round((row.amount * rule.late_fee_pct) / 100) : feePaid;
      const lastPaid = touching.map((p) => p.paid_on).sort().pop() ?? null;
      return {
        ...row,
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

/** Late fees first, then the oldest row; what is left goes to the next one. */
export function allocatePayment(schedule: InstallmentView<LedgerRow>[], amount: number): InstallmentAllocation[] {
  let left = Math.round(amount);
  const out: InstallmentAllocation[] = [];
  for (const i of schedule) {
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

/**
 * Re-applies every payment to the schedule from scratch, oldest first, each
 * one as of its own date — so a late fee is only taken from money that came
 * in after the fee was owed. Used when the rows change under existing money
 * (an agreement recorded or edited, a receipt deleted). Money beyond the
 * schedule stays unallocated: it still counts as received, it just has no
 * row to sit on until one exists.
 */
export function replayPayments<P extends { id: string; paid_on: string; amount: number }>(
  rows: LedgerRow[],
  payments: P[],
  rule: FeeRule,
): Map<string, { allocations: InstallmentAllocation[]; principal: number; late_fee: number }> {
  const out = new Map<string, { allocations: InstallmentAllocation[]; principal: number; late_fee: number }>();
  const applied: LedgerPayment[] = [];
  for (const p of payments) {
    const view = viewInstallments(rows, applied, p.paid_on, rule);
    const allocations = allocatePayment(view, Number(p.amount) || 0);
    applied.push({ paid_on: p.paid_on, allocations });
    out.set(p.id, {
      allocations,
      principal: allocations.reduce((t, a) => t + a.principal, 0),
      late_fee: allocations.reduce((t, a) => t + a.late_fee, 0),
    });
  }
  return out;
}
