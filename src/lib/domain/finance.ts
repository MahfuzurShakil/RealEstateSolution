import type { BadgeTone } from '@/components/ui/Badge';
import type {
  CostCategory,
  InstallmentStatus,
  PaymentInstallment,
  ScheduleType,
} from '@/lib/db/types';
import { money } from './procurement';

export { money };

/* ------------------------------------------------------------------ *
 * Instalments (Section 8.2)
 * ------------------------------------------------------------------ */

export const INSTALLMENT_STATUS_META: Record<
  InstallmentStatus,
  { label: string; tone: BadgeTone }
> = {
  pending: { label: 'Pending', tone: 'neutral' },
  partially_paid: { label: 'Partly Paid', tone: 'amber' },
  paid: { label: 'Paid', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
};

export const SCHEDULE_TYPE_LABEL: Record<ScheduleType, string> = {
  on_booking: 'On booking',
  monthly: 'Monthly',
  on_handover: 'On handover',
  manual: 'Set by Accounts',
};

/** A hair of slack, so 0.005 left over does not keep a line "unpaid" forever. */
const CENT = 0.005;

/**
 * The money-only state, which is what gets stored.
 *
 * `overdue` is not decided here on purpose — see `installmentStatus`.
 */
export function settledStatus(amountDue: number, amountPaid: number): InstallmentStatus {
  const due = Number(amountDue) || 0;
  const paid = Number(amountPaid) || 0;
  if (paid >= due - CENT && due > 0) return 'paid';
  if (paid > CENT) return 'partially_paid';
  return 'pending';
}

/**
 * What a screen should show, today.
 *
 * Overdue is a comparison against the current date, so it is worked out every
 * time it is read rather than written into the row. Section 8.2 allows either
 * ("read-time/daily job"), and read-time is the only one of the two that
 * cannot go stale overnight — there is no daily job in a browser-only Phase A.
 * A line with no due date can never be overdue: `manual` and `on_handover`
 * instalments sit without one until Accounts sets it.
 */
export function installmentStatus(
  installment: Pick<PaymentInstallment, 'amount_due' | 'amount_paid' | 'due_date'>,
  today: string,
): InstallmentStatus {
  const settled = settledStatus(installment.amount_due, installment.amount_paid);
  if (settled === 'paid') return 'paid';
  if (!installment.due_date) return settled;
  return installment.due_date < today ? 'overdue' : settled;
}

export function outstandingOn(
  installment: Pick<PaymentInstallment, 'amount_due' | 'amount_paid'>,
): number {
  return money(Math.max(0, (Number(installment.amount_due) || 0) - (Number(installment.amount_paid) || 0)));
}

/** Days past the due date; 0 when it is not overdue or has no date. */
export function daysOverdue(
  installment: Pick<PaymentInstallment, 'amount_due' | 'amount_paid' | 'due_date'>,
  today: string,
): number {
  if (installmentStatus(installment, today) !== 'overdue') return 0;
  const due = Date.parse(installment.due_date!);
  const now = Date.parse(today);
  if (!Number.isFinite(due) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.round((now - due) / 86_400_000));
}

/* ------------------------------------------------------------------ *
 * Schedule generation (Section 8.2)
 * ------------------------------------------------------------------ */

export interface PlannedInstallment {
  installment_no: number;
  label: string;
  due_date: string | null;
  amount_due: number;
}

/** `YYYY-MM-DD` plus n months, clamped to the end of the target month. */
export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // 31 Jan + 1 month is 28/29 Feb, not 3 March
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Turns a project's plan template into the actual instalment lines for one
 * booking (Section 8.2, "Generation logic").
 *
 * Two things the scope leaves to the implementation, both settled here:
 *
 * Rounding. Percentages of a price almost never divide into whole taka, and a
 * schedule whose lines do not add up to the price is worse than useless — the
 * buyer's last payment would never clear. So every line is rounded and the
 * **last** line absorbs the difference, the same way the tower WBS weights do
 * in Module 5. The schedule always totals the booking price exactly.
 *
 * Tenure. `month_count` on the template is the project's default, but tenure
 * is what an individual buyer negotiates, so `bookings.installment_tenure_months`
 * wins when it is set.
 */
export function planInstallments(
  template: Array<{
    sequence_no: number;
    label: string;
    percentage: number;
    schedule_type: ScheduleType;
    month_count?: number | null;
  }>,
  options: {
    totalAmount: number;
    bookingDate: string;
    /** the buyer's negotiated tenure, when there is one */
    tenureMonths?: number | null;
  },
): PlannedInstallment[] {
  const total = money(options.totalAmount);
  const ordered = [...template].sort((a, b) => a.sequence_no - b.sequence_no);

  const rows: PlannedInstallment[] = [];
  let no = 1;

  for (const line of ordered) {
    const share = money((total * (Number(line.percentage) || 0)) / 100);

    if (line.schedule_type === 'monthly') {
      const count = Math.max(1, Math.round(options.tenureMonths ?? line.month_count ?? 1));
      const each = money(share / count);
      for (let i = 0; i < count; i += 1) {
        rows.push({
          installment_no: no++,
          label: count > 1 ? `${line.label} ${i + 1}/${count}` : line.label,
          // the first monthly falls a month after booking, not on the day
          due_date: addMonths(options.bookingDate, i + 1),
          amount_due: each,
        });
      }
      continue;
    }

    rows.push({
      installment_no: no++,
      label: line.label,
      // `manual` and `on_handover` have no knowable date yet (Section 8.2)
      due_date: line.schedule_type === 'on_booking' ? options.bookingDate : null,
      amount_due: share,
    });
  }

  if (rows.length === 0) return rows;

  // the last line takes the rounding, so the schedule totals the price exactly
  const sum = money(rows.reduce((acc, r) => acc + r.amount_due, 0));
  const drift = money(total - sum);
  if (Math.abs(drift) > 0) {
    const last = rows[rows.length - 1];
    last.amount_due = money(last.amount_due + drift);
  }

  return rows;
}

/* ------------------------------------------------------------------ *
 * Roll-ups (Section 8.3)
 * ------------------------------------------------------------------ */

export interface ScheduleSummary {
  total_amount: number;
  paid: number;
  due: number;
  overdue_amount: number;
  overdue_count: number;
  next_due?: { label: string; due_date: string; amount: number } | null;
  paid_pct: number;
}

export function summariseSchedule(
  installments: PaymentInstallment[],
  today: string,
): ScheduleSummary {
  let total = 0;
  let paid = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  let next: ScheduleSummary['next_due'] = null;

  for (const line of installments) {
    total += Number(line.amount_due) || 0;
    paid += Number(line.amount_paid) || 0;

    const state = installmentStatus(line, today);
    if (state === 'overdue') {
      overdueAmount += outstandingOn(line);
      overdueCount += 1;
    } else if (state !== 'paid' && line.due_date) {
      if (!next || line.due_date < next.due_date) {
        next = { label: line.label, due_date: line.due_date, amount: outstandingOn(line) };
      }
    }
  }

  return {
    total_amount: money(total),
    paid: money(paid),
    due: money(Math.max(0, total - paid)),
    overdue_amount: money(overdueAmount),
    overdue_count: overdueCount,
    next_due: next,
    paid_pct: total > 0 ? Math.min(100, Math.round((paid / total) * 10000) / 100) : 0,
  };
}

export const COST_CATEGORY_META: Record<CostCategory, { label: string; tone: BadgeTone }> = {
  land_payment: { label: 'Land Payment', tone: 'teal' },
  land_extra_cost: { label: 'Land Extra Cost', tone: 'blue' },
  contractor_payment: { label: 'Contractor Payment', tone: 'amber' },
  marketing: { label: 'Marketing', tone: 'blue' },
  admin: { label: 'Admin', tone: 'neutral' },
  other: { label: 'Other', tone: 'neutral' },
};

/**
 * Section 8.3's management dashboard, for one project.
 *
 * `sales_value` and `collected` count **company-owned units only**: a
 * landowner's own flat may carry a booking so the inventory stays correct, but
 * the money is not the company's. Section 8.3 records this as a gap fix, and
 * leaving the filter out is what made the old figure too high.
 */
export interface ProjectFinanceSummary {
  project_id: string;
  project_name: string;
  project_code: string;
  sales_value: number;
  collected: number;
  refunded: number;
  due: number;
  /** expenses ledger + Module 6 supplier vouchers (8.3) */
  cost_expenses: number;
  cost_procurement: number;
  total_cost: number;
  /** sales − cost; negative early in a project is normal, not an error */
  estimated_profit: number;
  overdue_amount: number;
  overdue_count: number;
  booking_count: number;
}
