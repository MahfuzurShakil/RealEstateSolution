import type { BadgeTone } from '@/components/ui/Badge';
import type {
  DistributionFrequency,
  EligibilityRule,
  LenderType,
  LossCoverSource,
  LossRule,
  MgmtFeeType,
  RevenueEntryFrequency,
  RevenuePeriodStatus,
  RevenuePolicy,
  WithdrawalMethod,
  WithdrawalStatus,
  WithdrawalWindow,
} from '../db/types';
import { daysBetween } from './installment-ledger';

/*
 * Revenue Share (REVENUE-SHARE-PLAN.md): the arithmetic only, so it can be
 * tested without a database. Recording is daily, sharing is periodic; a
 * period's profit passes a profit check (past loss, reserve, fee) and a cash
 * check (loan principal due) before anything is shared, and the declared
 * amount is split by ownership on the record date — the same rate per share
 * for customers and owners.
 */

export const ENTRY_FREQUENCY_LABEL: Record<RevenueEntryFrequency, string> = {
  daily: 'Daily',
  monthly: 'Monthly totals',
  quarterly: 'Quarterly totals',
};

export const DISTRIBUTION_FREQUENCY_LABEL: Record<DistributionFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  yearly: 'Yearly',
};

export const MGMT_FEE_LABEL: Record<MgmtFeeType, string> = {
  none: 'No management fee',
  pct_income: '% of income',
  pct_profit: '% of profit',
  fixed: 'Fixed taka per period',
};

export const LOSS_RULE_LABEL: Record<LossRule, string> = {
  recover_first: 'Recover past losses first',
  ignore: 'Do not carry losses',
};

export const ELIGIBILITY_LABEL: Record<EligibilityRule, string> = {
  fully_paid: 'Fully paid holders only',
  pro_rata_paid: 'Signed holders, by what they have paid',
  all_signed: 'All signed holders in full',
};

export const WITHDRAWAL_WINDOW_LABEL: Record<WithdrawalWindow, string> = {
  anytime: 'Any time',
  after_declare: 'Within N days of a declaration',
  day_of_month: 'On one day each month',
};

export const PERIOD_STATUS_META: Record<RevenuePeriodStatus | 'open' | 'due', { label: string; tone: BadgeTone }> = {
  open: { label: 'Running', tone: 'blue' },
  due: { label: 'Ready to close', tone: 'amber' },
  closed: { label: 'Closed', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'teal' },
  declared: { label: 'Declared', tone: 'green' },
};

export const LOSS_COVER_LABEL: Record<LossCoverSource, string> = {
  person_loan: 'Loan from a person',
  bank_loan: 'Loan from a bank',
  partner_loan: 'Loan from a partner',
  partner_capital: 'Partner put in capital',
  reserve: 'From the reserve',
  company_fund: 'From company funds',
};

export const LENDER_TYPE_LABEL: Record<LenderType, string> = {
  person: 'Person',
  bank: 'Bank',
  partner: 'Partner',
};

export const WITHDRAWAL_STATUS_META: Record<WithdrawalStatus, { label: string; tone: BadgeTone }> = {
  requested: { label: 'Requested', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
};

export const WITHDRAWAL_METHOD_LABEL: Record<WithdrawalMethod, string> = {
  bank_transfer: 'Bank transfer',
  bkash: 'bKash',
  nagad: 'Nagad',
  cheque: 'Cheque',
  cash: 'Cash at office',
};

const taka = (n: number) => Math.round(n);

/* ---------------------------------------------------------------- periods */

const PERIOD_MONTHS: Record<DistributionFrequency, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The same day n months on, clamped to the month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

function dayBefore(date: string): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

export interface PeriodDates {
  index: number;
  start: string;
  end: string;
  label: string;
}

export function periodLabel(frequency: DistributionFrequency, start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const onMonth = sd === 1;
  if (onMonth && frequency === 'monthly') return `${MONTH[sm - 1]} ${sy}`;
  if (onMonth && frequency === 'quarterly' && (sm - 1) % 3 === 0) return `Q${(sm - 1) / 3 + 1} ${sy}`;
  if (onMonth && frequency === 'half_yearly' && (sm === 1 || sm === 7)) return `H${sm === 1 ? 1 : 2} ${sy}`;
  if (onMonth && frequency === 'yearly' && sm === 1) return String(sy);
  return sy === ey ? `${MONTH[sm - 1]}–${MONTH[em - 1]} ${sy}` : `${MONTH[sm - 1]} ${sy} – ${MONTH[em - 1]} ${ey}`;
}

export function periodAt(policy: Pick<RevenuePolicy, 'distribution_frequency' | 'first_period_start'>, index: number): PeriodDates {
  const months = PERIOD_MONTHS[policy.distribution_frequency];
  const start = addMonths(policy.first_period_start, index * months);
  const end = dayBefore(addMonths(policy.first_period_start, (index + 1) * months));
  return { index, start, end, label: periodLabel(policy.distribution_frequency, start, end) };
}

/** Every period that has started by `today`, oldest first. */
export function periodsThrough(
  policy: Pick<RevenuePolicy, 'distribution_frequency' | 'first_period_start'>,
  today: string,
): PeriodDates[] {
  const out: PeriodDates[] = [];
  for (let i = 0; i < 600; i++) {
    const p = periodAt(policy, i);
    if (p.start > today) break;
    out.push(p);
  }
  return out;
}

export function daysIn(start: string, end: string): number {
  return daysBetween(start, end) + 1;
}

/* -------------------------------------------------------------- statement */

export interface StatementInput {
  income: number;
  cost: number;
  loss_brought_in: number;
  loss_rule: LossRule;
  reserve_pct: number;
  mgmt_fee_type: MgmtFeeType;
  mgmt_fee_value: number;
  /** loan principal falling due in the period */
  loan_principal_due: number;
  repay_loans_first: boolean;
}

export interface Statement {
  income: number;
  cost: number;
  operating_profit: number;
  loss_brought_in: number;
  /** operating profit less the past loss recovered */
  after_loss: number;
  reserve: number;
  mgmt_fee: number;
  /** what the cash check took for loans; 0 when loans are not repaid first */
  loan_principal_due: number;
  available: number;
  loss_carried_out: number;
}

/**
 * Plan §2.3, in this order: past loss, reserve (a % of what is left), the
 * management fee, then the loan principal due. None of them can take more
 * than is left, so `available` is never negative; a loss adds to the loss
 * carried forward instead.
 */
export function workOutStatement(i: StatementInput): Statement {
  const income = taka(i.income);
  const cost = taka(i.cost);
  const op = income - cost;
  const recover = i.loss_rule === 'recover_first';
  const lossIn = recover ? taka(Math.max(0, i.loss_brought_in)) : 0;
  const afterLoss = op - lossIn;
  if (afterLoss <= 0) {
    return {
      income,
      cost,
      operating_profit: op,
      loss_brought_in: lossIn,
      after_loss: afterLoss,
      reserve: 0,
      mgmt_fee: 0,
      loan_principal_due: 0,
      available: 0,
      loss_carried_out: recover ? -afterLoss : 0,
    };
  }
  const reserve = taka((afterLoss * Math.max(0, i.reserve_pct)) / 100);
  let left = afterLoss - reserve;
  const feeAsked =
    i.mgmt_fee_type === 'pct_income'
      ? (income * i.mgmt_fee_value) / 100
      : i.mgmt_fee_type === 'pct_profit'
        ? (afterLoss * i.mgmt_fee_value) / 100
        : i.mgmt_fee_type === 'fixed'
          ? i.mgmt_fee_value
          : 0;
  const fee = Math.min(left, taka(Math.max(0, feeAsked)));
  left -= fee;
  const loans = i.repay_loans_first ? Math.min(left, taka(Math.max(0, i.loan_principal_due))) : 0;
  left -= loans;
  return {
    income,
    cost,
    operating_profit: op,
    loss_brought_in: lossIn,
    after_loss: afterLoss,
    reserve,
    mgmt_fee: fee,
    loan_principal_due: loans,
    available: left,
    loss_carried_out: 0,
  };
}

/* ------------------------------------------------------------ eligibility */

export interface HoldingFacts {
  /** principal paid by the record date */
  paid: number;
  price: number;
  /** the day the agreement was signed */
  held_from: string;
}

/**
 * How much of a full share a holding takes (plan §5.1): by what is paid, as
 * the policy says, and by days held when it was signed inside the period.
 */
export function eligibilityFactor(
  rule: EligibilityRule,
  prorateDays: boolean,
  h: HoldingFacts,
  periodStart: string,
  periodEnd: string,
): number {
  let f: number;
  const paidShare = h.price > 0 ? Math.min(1, Math.max(0, h.paid / h.price)) : 1;
  if (rule === 'fully_paid') f = paidShare >= 1 - 1e-9 ? 1 : 0;
  else if (rule === 'pro_rata_paid') f = paidShare;
  else f = 1;
  if (h.held_from > periodEnd) return 0;
  if (prorateDays && h.held_from > periodStart) {
    f *= daysIn(h.held_from, periodEnd) / daysIn(periodStart, periodEnd);
  }
  return Math.round(f * 1e6) / 1e6;
}

/* ------------------------------------------------------------- the split */

export interface CustomerHolding {
  key: string;
  /** % of the project */
  ownership_pct: number;
  factor: number;
}

export interface OwnerSlice {
  key: string;
  /** % of the project, before the unclaimed part is added */
  share_pct: number;
}

export interface SplitLine {
  key: string;
  kind: 'customer' | 'owner';
  ownership_pct: number;
  factor: number;
  gross: number;
  tax: number;
  net: number;
}

/**
 * Plan §5.1. Each customer takes declared × ownership × factor; the owners
 * take their own slices plus whatever customers could not (the unpaid part,
 * the days not held), in proportion to their slices. Rounded to the taka with
 * the remainder on the largest owner, so the lines always add up to the
 * declared amount.
 */
export function splitDeclared(
  declared: number,
  customers: CustomerHolding[],
  owners: OwnerSlice[],
  taxPct: number,
): SplitLine[] {
  const D = taka(declared);
  const lines: SplitLine[] = customers.map((c) => {
    const gross = taka((D * c.ownership_pct * c.factor) / 100);
    return { key: c.key, kind: 'customer', ownership_pct: c.ownership_pct, factor: c.factor, gross, tax: 0, net: 0 };
  });
  const toOwners = D - lines.reduce((s, l) => s + l.gross, 0);
  const ownerTotal = owners.reduce((s, o) => s + o.share_pct, 0);
  const ownerLines: SplitLine[] = owners.map((o) => ({
    key: o.key,
    kind: 'owner',
    ownership_pct: o.share_pct,
    factor: 1,
    gross: ownerTotal > 0 ? taka((toOwners * o.share_pct) / ownerTotal) : 0,
    tax: 0,
    net: 0,
  }));
  const drift = toOwners - ownerLines.reduce((s, l) => s + l.gross, 0);
  if (ownerLines.length && drift !== 0) {
    const biggest = ownerLines.reduce((a, b) => (b.ownership_pct > a.ownership_pct ? b : a));
    biggest.gross += drift;
  }
  return [...lines, ...ownerLines].map((l) => {
    const tax = taka((l.gross * Math.max(0, taxPct)) / 100);
    return { ...l, tax, net: l.gross - tax };
  });
}

/* ------------------------------------------------------------- withdrawal */

export interface WithdrawalCheck {
  ok: boolean;
  reason: string | null;
}

/** Plan §5.3: at least the minimum, and inside the window the policy sets. */
export function canWithdraw(
  policy: Pick<RevenuePolicy, 'min_withdrawal' | 'withdrawal_window' | 'withdrawal_window_days'>,
  balance: number,
  lastDeclaredOn: string | null,
  today: string,
): WithdrawalCheck {
  if (balance <= 0) return { ok: false, reason: 'Nothing to withdraw yet.' };
  if (balance < policy.min_withdrawal) {
    return { ok: false, reason: `Tk ${(policy.min_withdrawal - balance).toLocaleString('en-IN')} more to reach the minimum.` };
  }
  if (policy.withdrawal_window === 'after_declare') {
    if (!lastDeclaredOn) return { ok: false, reason: 'Opens after the next profit declaration.' };
    if (daysBetween(lastDeclaredOn, today) > policy.withdrawal_window_days) {
      return { ok: false, reason: `Requests open for ${policy.withdrawal_window_days} days after each declaration.` };
    }
  }
  if (policy.withdrawal_window === 'day_of_month' && Number(today.slice(8, 10)) !== policy.withdrawal_window_days) {
    return { ok: false, reason: `Requests are taken on day ${policy.withdrawal_window_days} of each month.` };
  }
  return { ok: true, reason: null };
}
