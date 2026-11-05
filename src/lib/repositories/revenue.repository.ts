'use client';

import { db } from '../db/database';
import type {
  Customer,
  Loan,
  LoanRepayment,
  LossCoverSource,
  LossCovering,
  Partner,
  ProfitAllocation,
  ProfitWithdrawal,
  RevenueEntry,
  RevenuePeriod,
  RevenuePolicy,
  WithdrawalMethod,
} from '../db/types';
import {
  canWithdraw,
  daysIn,
  eligibilityFactor,
  periodAt,
  periodsThrough,
  splitDeclared,
  workOutStatement,
  type PeriodDates,
  type Statement,
  type WithdrawalCheck,
} from '../domain/revenue-share';
import { daysBetween } from '../domain/installment-ledger';
import { nextCode } from '../utils/id';
import { formatBdt, todayLocal } from '../utils/format';
import { BaseRepository, type NewRecord } from './base.repository';
import { fundReceiptRepository, splitProject } from './fund.repository';
import { shareSaleRepository } from './share-sale.repository';

/*
 * Revenue Share (REVENUE-SHARE-PLAN.md R1–R5). A running project records its
 * income and cost; each period is closed into a frozen statement, approved
 * with the amount to share, and declared — which writes every holder's line
 * from ownership on the record date. Losses carry forward and are covered by
 * loans; shares credit a balance that holders ask to be paid from.
 */

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0);
const taka = (n: number) => Math.round(Number(n) || 0);

/* ------------------------------------------------------------------ policy */

export type RevenuePolicyInput = Omit<NewRecord<RevenuePolicy>, 'project_id'>;

export const DEFAULT_REVENUE_POLICY: RevenuePolicyInput = {
  entry_frequency: 'daily',
  distribution_frequency: 'quarterly',
  first_period_start: `${todayLocal().slice(0, 4)}-01-01`,
  reserve_pct: 10,
  mgmt_fee_type: 'none',
  mgmt_fee_value: 0,
  tax_withholding_pct: 10,
  loss_rule: 'recover_first',
  eligibility_rule: 'pro_rata_paid',
  prorate_days: true,
  repay_loans_first: true,
  min_withdrawal: 5_000,
  withdrawal_window: 'anytime',
  withdrawal_window_days: 0,
  adjust_overdue_first: true,
  notes: null,
};

class RevenuePolicyRepository extends BaseRepository<RevenuePolicy> {
  constructor() {
    super(() => db.revenue_policies);
  }

  async forProject(projectId: string): Promise<RevenuePolicy | undefined> {
    return db.revenue_policies.where('project_id').equals(projectId).first();
  }

  async save(projectId: string, input: RevenuePolicyInput, userId: string | null): Promise<RevenuePolicy> {
    const pct = (n: number, what: string) => {
      if (!(n >= 0 && n <= 100)) throw new Error(`${what} must be between 0 and 100%.`);
    };
    pct(input.reserve_pct, 'Reserve');
    pct(input.tax_withholding_pct, 'Tax withheld');
    if (input.mgmt_fee_type === 'pct_income' || input.mgmt_fee_type === 'pct_profit') pct(input.mgmt_fee_value, 'The management fee');
    if (!(input.min_withdrawal >= 0)) throw new Error('The minimum withdrawal cannot be negative.');
    if (input.withdrawal_window === 'day_of_month' && !(input.withdrawal_window_days >= 1 && input.withdrawal_window_days <= 28)) {
      throw new Error('Pick a day of the month from 1 to 28.');
    }
    if (input.withdrawal_window === 'after_declare' && !(input.withdrawal_window_days >= 1)) {
      throw new Error('Say for how many days requests stay open.');
    }
    if (!input.first_period_start) throw new Error('Pick the day the first period starts.');
    const existing = await this.forProject(projectId);
    if (existing) {
      // the periods already closed were worked out on the old calendar
      const closed = await db.revenue_periods.where('project_id').equals(projectId).count();
      if (
        closed > 0 &&
        (existing.first_period_start !== input.first_period_start ||
          existing.distribution_frequency !== input.distribution_frequency)
      ) {
        throw new Error('Periods are already closed on this calendar — the start and frequency can no longer change.');
      }
      return (await this.update(existing.id, { ...input, project_id: projectId }))!;
    }
    return this.create({ ...input, project_id: projectId }, userId);
  }
}

export const revenuePolicyRepository = new RevenuePolicyRepository();

/* ----------------------------------------------------------------- entries */

export type RevenueEntryInput = Omit<NewRecord<RevenueEntry>, 'code'>;

async function lockedThrough(projectId: string): Promise<string | null> {
  const periods = await db.revenue_periods.where('project_id').equals(projectId).toArray();
  return periods.reduce<string | null>((max, p) => (max === null || p.period_end > max ? p.period_end : max), null);
}

class RevenueEntryRepository extends BaseRepository<RevenueEntry> {
  constructor() {
    super(() => db.revenue_entries);
  }

  async forProject(projectId: string): Promise<RevenueEntry[]> {
    return (await db.revenue_entries.where('project_id').equals(projectId).toArray()).sort(
      (a, b) => b.entry_date.localeCompare(a.entry_date) || b.code.localeCompare(a.code),
    );
  }

  async record(input: RevenueEntryInput, userId: string | null): Promise<RevenueEntry> {
    const amount = taka(input.amount);
    if (!(amount > 0)) throw new Error('Enter an amount above 0.');
    if (!input.head?.trim()) throw new Error(input.direction === 'income' ? 'Pick the income head.' : 'Pick the cost head.');
    if (!input.entry_date) throw new Error('Pick the date.');
    if (input.entry_date > todayLocal()) throw new Error('The date cannot be in the future.');
    if (!input.account_id) throw new Error(input.direction === 'income' ? 'Pick the account the money went into.' : 'Pick the account it was paid from.');
    const lock = await lockedThrough(input.project_id);
    if (lock && input.entry_date <= lock) {
      throw new Error(`The period up to ${lock} is closed. Put a correction in the running period instead.`);
    }
    const codes = (await db.revenue_entries.toArray()).map((e) => e.code);
    return this.create({ ...input, amount, head: input.head.trim(), code: nextCode('REV', codes) }, userId);
  }

  /** Several lines for one day at once — the daily sheet. Lines with no amount are skipped. */
  async recordDay(
    projectId: string,
    date: string,
    accountId: string | null,
    lines: { direction: RevenueEntry['direction']; head: string; amount: number }[],
    userId: string | null,
  ): Promise<number> {
    const real = lines.filter((l) => taka(l.amount) > 0);
    if (!real.length) throw new Error('Type at least one amount.');
    for (const l of real) {
      await this.record({ project_id: projectId, entry_date: date, direction: l.direction, head: l.head, amount: l.amount, account_id: accountId }, userId);
    }
    return real.length;
  }

  async removeEntry(id: string): Promise<void> {
    const e = await db.revenue_entries.get(id);
    if (!e) return;
    const lock = await lockedThrough(e.project_id);
    if (lock && e.entry_date <= lock) throw new Error('This entry is inside a closed period and cannot be removed.');
    await this.remove(id);
  }
}

export const revenueEntryRepository = new RevenueEntryRepository();

/* ----------------------------------------------------------------- loans */

/** Principal still owed on a loan on a date. */
function outstandingOn(loan: Loan, repayments: LoanRepayment[], date: string): number {
  return loan.principal - sum(repayments.filter((r) => r.loan_id === loan.id && r.paid_on <= date), (r) => r.principal);
}

/** Months a period covers, for the instalment due in it. */
function monthsIn(p: PeriodDates): number {
  return Math.max(1, Math.round(daysIn(p.start, p.end) / 30.4));
}

async function loanPrincipalDue(projectId: string, p: PeriodDates): Promise<number> {
  const [loans, repayments] = await Promise.all([
    db.loans.where('project_id').equals(projectId).toArray(),
    db.loan_repayments.where('project_id').equals(projectId).toArray(),
  ]);
  return sum(
    // a loan repaid inside the period still had principal due in it
    loans.filter((l) => l.status !== 'written_off' && l.taken_on <= p.end),
    (l) => Math.min(Math.max(0, outstandingOn(l, repayments, p.start)), l.monthly_instalment * monthsIn(p)),
  );
}

export interface LoanInput {
  project_id: string;
  lender_type: Loan['lender_type'];
  lender_name: string;
  partner_id?: string | null;
  phone?: string | null;
  bank_branch?: string | null;
  loan_account_no?: string | null;
  principal: number;
  interest_pct: number;
  taken_on: string;
  repay_by?: string | null;
  monthly_instalment: number;
  account_id: string;
  period_id?: string | null;
  notes?: string | null;
}

export interface LoanRow {
  loan: Loan;
  repaid: number;
  interest_paid: number;
  outstanding: number;
  project_name: string;
  last_paid_on: string | null;
}

class LoanRepository extends BaseRepository<Loan> {
  constructor() {
    super(() => db.loans);
  }

  /** Records the loan and the money it brought in (a `loan` fund receipt into the project). */
  async take(input: LoanInput, userId: string | null): Promise<Loan> {
    const principal = taka(input.principal);
    if (!(principal > 0)) throw new Error('Enter the amount borrowed.');
    if (input.lender_type === 'partner' && !input.partner_id) throw new Error('Pick the partner who lent it.');
    const partner = input.partner_id ? await db.partners.get(input.partner_id) : undefined;
    const lender = input.lender_type === 'partner' ? (partner?.name ?? '') : input.lender_name.trim();
    if (!lender) throw new Error(input.lender_type === 'bank' ? 'Name the bank.' : 'Name the lender.');
    if (!(input.interest_pct >= 0 && input.interest_pct <= 100)) throw new Error('Interest must be between 0 and 100%.');
    if (!(input.monthly_instalment >= 0)) throw new Error('The monthly instalment cannot be negative.');
    if (!input.account_id) throw new Error('Pick the account the money went into.');
    if (!input.taken_on) throw new Error('Pick the day the money came in.');
    const receipt = await fundReceiptRepository.record(
      {
        source_type: 'loan',
        source_name: lender,
        partner_id: null,
        project_id: input.project_id,
        account_id: input.account_id,
        amount: principal,
        receipt_date: input.taken_on,
        reference_no: input.loan_account_no ?? null,
        notes: input.notes ?? null,
      },
      userId,
    );
    const codes = (await db.loans.toArray()).map((l) => l.code);
    return this.create(
      {
        ...input,
        lender_name: lender,
        partner_id: input.lender_type === 'partner' ? input.partner_id : null,
        principal,
        monthly_instalment: taka(input.monthly_instalment),
        fund_receipt_id: receipt.id,
        status: 'active',
        code: nextCode('LON', codes),
      },
      userId,
    );
  }

  /** Principal reduces what is owed; interest is also written as a running cost of the project. */
  async repay(
    loanId: string,
    input: { paid_on: string; principal: number; interest: number; account_id: string; reference_no?: string | null },
    userId: string | null,
  ): Promise<LoanRepayment> {
    const loan = await db.loans.get(loanId);
    if (!loan || loan.status !== 'active') throw new Error('Only an active loan can be repaid.');
    const principal = taka(input.principal);
    const interest = taka(input.interest);
    if (!(principal + interest > 0)) throw new Error('Enter the principal or interest paid.');
    if (!input.account_id) throw new Error('Pick the account it was paid from.');
    if (!input.paid_on || input.paid_on > todayLocal()) throw new Error('Pick a date that is not in the future.');
    const repayments = await db.loan_repayments.where('loan_id').equals(loanId).toArray();
    const left = outstandingOn(loan, repayments, '9999-12-31');
    if (principal > left) throw new Error(`Only ${formatBdt(left)} of principal is still owed.`);
    if (interest > 0) {
      await revenueEntryRepository.record(
        {
          project_id: loan.project_id,
          entry_date: input.paid_on,
          direction: 'cost',
          head: 'Loan interest',
          amount: interest,
          account_id: input.account_id,
          reference_no: loan.code,
          notes: `Interest to ${loan.lender_name}`,
        },
        userId,
      );
    }
    const codes = (await db.loan_repayments.toArray()).map((r) => r.code);
    const row = await loanRepaymentRepository.create(
      {
        code: nextCode('LRP', codes),
        loan_id: loanId,
        project_id: loan.project_id,
        paid_on: input.paid_on,
        principal,
        interest,
        account_id: input.account_id,
        reference_no: input.reference_no ?? null,
      },
      userId,
    );
    if (principal === left) await this.update(loanId, { status: 'repaid' });
    return row;
  }

  async rows(projectId?: string): Promise<LoanRow[]> {
    const [loans, repayments, projects] = await Promise.all([
      projectId ? db.loans.where('project_id').equals(projectId).toArray() : db.loans.toArray(),
      db.loan_repayments.toArray(),
      db.projects.toArray(),
    ]);
    const name = new Map(projects.map((p) => [p.id, p.name]));
    return loans
      .map((loan) => {
        const mine = repayments.filter((r) => r.loan_id === loan.id).sort((a, b) => b.paid_on.localeCompare(a.paid_on));
        const repaid = sum(mine, (r) => r.principal);
        return {
          loan,
          repaid,
          interest_paid: sum(mine, (r) => r.interest),
          outstanding: loan.status === 'written_off' ? 0 : loan.principal - repaid,
          project_name: name.get(loan.project_id) ?? '—',
          last_paid_on: mine[0]?.paid_on ?? null,
        };
      })
      .sort((a, b) => b.loan.taken_on.localeCompare(a.loan.taken_on));
  }

  async repayments(loanId: string): Promise<LoanRepayment[]> {
    return (await db.loan_repayments.where('loan_id').equals(loanId).toArray()).sort((a, b) => b.paid_on.localeCompare(a.paid_on));
  }
}

export const loanRepository = new LoanRepository();

class LoanRepaymentRepository extends BaseRepository<LoanRepayment> {
  constructor() {
    super(() => db.loan_repayments);
  }
}

export const loanRepaymentRepository = new LoanRepaymentRepository();

/* ----------------------------------------------------------------- periods */

export interface PeriodRow {
  dates: PeriodDates;
  stored: RevenuePeriod | null;
  /** stored status, or `open` while it runs and `due` once it has ended unclosed */
  status: RevenuePeriod['status'] | 'open' | 'due';
  income: number;
  cost: number;
  profit: number;
  /** what is shared: declared once approved, else what would be available */
  shared: number | null;
}

export interface RevenueOverview {
  policy: RevenuePolicy;
  periods: PeriodRow[];
  reserve_balance: number;
  loss_to_recover: number;
  loans_outstanding: number;
  income_to_date: number;
  cost_to_date: number;
  declared_to_date: number;
}

async function storedPeriods(projectId: string): Promise<RevenuePeriod[]> {
  return (await db.revenue_periods.where('project_id').equals(projectId).toArray()).sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  );
}

function inPeriod(entries: RevenueEntry[], p: { start: string; end: string }) {
  const rows = entries.filter((e) => e.entry_date >= p.start && e.entry_date <= p.end);
  return {
    income: sum(rows.filter((e) => e.direction === 'income'), (e) => e.amount),
    cost: sum(rows.filter((e) => e.direction === 'cost'), (e) => e.amount),
  };
}

export async function revenueOverview(projectId: string, today = todayLocal()): Promise<RevenueOverview | null> {
  const policy = await revenuePolicyRepository.forProject(projectId);
  if (!policy) return null;
  const [entries, stored, coverings, loans] = await Promise.all([
    db.revenue_entries.where('project_id').equals(projectId).toArray(),
    storedPeriods(projectId),
    db.loss_coverings.where('project_id').equals(projectId).toArray(),
    loanRepository.rows(projectId),
  ]);
  const byStart = new Map(stored.map((p) => [p.period_start, p]));
  const periods: PeriodRow[] = periodsThrough(policy, today)
    .map((dates) => {
      const s = byStart.get(dates.start) ?? null;
      const live = inPeriod(entries, dates);
      const income = s?.income ?? live.income;
      const cost = s?.cost ?? live.cost;
      return {
        dates,
        stored: s,
        status: s ? s.status : dates.end < today ? ('due' as const) : ('open' as const),
        income,
        cost,
        profit: income - cost,
        shared: s ? (s.status === 'closed' ? s.available : s.declared) : null,
      };
    })
    .reverse();
  const last = stored[stored.length - 1];
  return {
    policy,
    periods,
    reserve_balance: sum(stored, (p) => p.reserve) - sum(coverings.filter((c) => c.source === 'reserve'), (c) => c.amount),
    loss_to_recover: last?.loss_carried_out ?? 0,
    loans_outstanding: sum(loans, (l) => l.outstanding),
    income_to_date: sum(entries.filter((e) => e.direction === 'income'), (e) => e.amount),
    cost_to_date: sum(entries.filter((e) => e.direction === 'cost'), (e) => e.amount),
    declared_to_date: sum(stored.filter((p) => p.status === 'declared'), (p) => p.declared),
  };
}

export interface PeriodPreview {
  dates: PeriodDates;
  statement: Statement;
  heads: { direction: 'income' | 'cost'; head: string; amount: number }[];
  /** why it cannot be closed yet, if it cannot */
  blocked: string | null;
}

/** The statement a period would close with, worked out from today's entries. */
export async function previewPeriod(projectId: string, index: number, today = todayLocal()): Promise<PeriodPreview> {
  const policy = await revenuePolicyRepository.forProject(projectId);
  if (!policy) throw new Error('Revenue sharing is not set up for this project.');
  const dates = periodAt(policy, index);
  const [entries, stored] = await Promise.all([
    db.revenue_entries.where('project_id').equals(projectId).toArray(),
    storedPeriods(projectId),
  ]);
  const previous = index > 0 ? stored.find((p) => p.period_start === periodAt(policy, index - 1).start) : undefined;
  const rows = entries.filter((e) => e.entry_date >= dates.start && e.entry_date <= dates.end);
  const heads = new Map<string, { direction: 'income' | 'cost'; head: string; amount: number }>();
  for (const e of rows) {
    const k = `${e.direction}::${e.head}`;
    const h = heads.get(k) ?? { direction: e.direction, head: e.head, amount: 0 };
    h.amount += e.amount;
    heads.set(k, h);
  }
  const { income, cost } = inPeriod(entries, dates);
  const statement = workOutStatement({
    income,
    cost,
    loss_brought_in: previous?.loss_carried_out ?? 0,
    loss_rule: policy.loss_rule,
    reserve_pct: policy.reserve_pct,
    mgmt_fee_type: policy.mgmt_fee_type,
    mgmt_fee_value: policy.mgmt_fee_value,
    loan_principal_due: await loanPrincipalDue(projectId, dates),
    repay_loans_first: policy.repay_loans_first,
  });
  let blocked: string | null = null;
  if (dates.end >= today) blocked = `This period runs until ${dates.end}; it can be closed once it has ended.`;
  else if (index > 0 && !previous) blocked = 'Close the period before this one first.';
  else if (stored.some((p) => p.period_start === dates.start)) blocked = 'This period is already closed.';
  return {
    dates,
    statement,
    heads: [...heads.values()].sort((a, b) => a.direction.localeCompare(b.direction) || b.amount - a.amount),
    blocked,
  };
}

export interface HolderLine {
  allocation: ProfitAllocation;
  name: string;
  code: string | null;
}

export interface PeriodDetail {
  period: RevenuePeriod;
  project_name: string;
  heads: PeriodPreview['heads'];
  coverings: (LossCovering & { loan_code: string | null })[];
  lines: HolderLine[];
  /** before declaring: who would share and how, on the period's end */
  preview: HolderLine[];
}

class RevenuePeriodRepository extends BaseRepository<RevenuePeriod> {
  constructor() {
    super(() => db.revenue_periods);
  }

  /** Freezes the statement (plan §2.3, Accounts). */
  async close(projectId: string, index: number, userId: string | null, today = todayLocal()): Promise<RevenuePeriod> {
    const p = await previewPeriod(projectId, index, today);
    if (p.blocked) throw new Error(p.blocked);
    const codes = (await db.revenue_periods.toArray()).map((r) => r.code);
    const s = p.statement;
    return this.create(
      {
        code: nextCode('RVP', codes, Number(p.dates.end.slice(0, 4))),
        project_id: projectId,
        period_start: p.dates.start,
        period_end: p.dates.end,
        label: p.dates.label,
        status: 'closed',
        income: s.income,
        cost: s.cost,
        operating_profit: s.operating_profit,
        loss_brought_in: s.loss_brought_in,
        reserve: s.reserve,
        mgmt_fee: s.mgmt_fee,
        loan_principal_due: s.loan_principal_due,
        available: s.available,
        loss_carried_out: s.loss_carried_out,
        declared: s.available,
        closed_by: userId,
      },
      userId,
    );
  }

  /** Back to running, while nothing later is closed and it is not yet approved. */
  async reopen(id: string): Promise<void> {
    const p = await db.revenue_periods.get(id);
    if (!p) return;
    if (p.status !== 'closed') throw new Error('Only a closed period that is not yet approved can be reopened.');
    const later = (await storedPeriods(p.project_id)).some((x) => x.period_start > p.period_start);
    if (later) throw new Error('A later period is already closed. Reopen that one first.');
    if ((await db.loss_coverings.where('period_id').equals(id).count()) > 0) {
      throw new Error('This loss already has its cover recorded, so the figures cannot change.');
    }
    await this.remove(id);
  }

  /** Management accepts the figures and sets how much is shared (≤ available). */
  async approve(id: string, declared: number, userId: string | null): Promise<RevenuePeriod> {
    const p = await db.revenue_periods.get(id);
    if (!p || p.status !== 'closed') throw new Error('Only a closed period can be approved.');
    const amount = taka(declared);
    if (amount < 0) throw new Error('The amount to share cannot be negative.');
    if (amount > p.available) throw new Error(`At most ${formatBdt(p.available)} can be shared from this period.`);
    return (await this.update(id, { status: 'approved', declared: amount, approved_by: userId, approved_on: todayLocal() }))!;
  }

  async unapprove(id: string): Promise<void> {
    const p = await db.revenue_periods.get(id);
    if (!p || p.status !== 'approved') throw new Error('Only an approved period can go back.');
    await this.update(id, { status: 'closed', declared: p.available, approved_by: null, approved_on: null });
  }

  /**
   * Declares (plan §5.1): ownership on the record date, a frozen line per
   * holder, and — when the policy says so — each customer's share paid onto
   * their overdue installments first. Cannot be undone.
   */
  async declare(id: string, recordDate: string, userId: string | null, today = todayLocal()): Promise<RevenuePeriod> {
    const p = await db.revenue_periods.get(id);
    if (!p || p.status !== 'approved') throw new Error('Approve the period before declaring it.');
    if (!recordDate) throw new Error('Pick the record date.');
    if (recordDate < p.period_end) throw new Error('The record date cannot be before the period ends.');
    if (recordDate > today) throw new Error('The record date cannot be in the future.');
    const policy = (await revenuePolicyRepository.forProject(p.project_id))!;
    const draft = await draftLines(p, policy, recordDate);
    for (const d of draft) {
      let adjusted = 0;
      if (policy.adjust_overdue_first && d.share_sale_id && d.net > 0) {
        const view = await shareSaleRepository.view(d.share_sale_id, today);
        const due = view && view.sale.status === 'agreement_signed' ? view.due_now : 0;
        adjusted = Math.min(d.net, Math.floor(due));
        if (adjusted > 0) {
          await shareSaleRepository.recordPayment(
            {
              sale_id: d.share_sale_id,
              paid_on: today,
              amount: adjusted,
              method: 'profit_adjustment',
              reference: p.code,
              notes: `Profit share for ${p.label}`,
              account_id: null,
            },
            userId,
          );
        }
      }
      await profitAllocationRepository.create(
        {
          period_id: p.id,
          project_id: p.project_id,
          holder_type: d.holder_type,
          customer_id: d.customer_id,
          partner_id: d.partner_id,
          share_sale_id: d.share_sale_id,
          ownership_pct: d.ownership_pct,
          eligibility_factor: d.factor,
          gross: d.gross,
          tax_withheld: d.tax,
          adjusted_to_dues: adjusted,
          net_credited: d.net - adjusted,
        },
        userId,
      );
    }
    return (await this.update(id, { status: 'declared', record_date: recordDate, declared_by: userId, declared_on: today }))!;
  }

  async detail(id: string): Promise<PeriodDetail | null> {
    const period = await db.revenue_periods.get(id);
    if (!period) return null;
    const [project, entries, coverings, loans, allocations, policy] = await Promise.all([
      db.projects.get(period.project_id),
      db.revenue_entries.where('project_id').equals(period.project_id).toArray(),
      db.loss_coverings.where('period_id').equals(id).toArray(),
      db.loans.where('project_id').equals(period.project_id).toArray(),
      db.profit_allocations.where('period_id').equals(id).toArray(),
      revenuePolicyRepository.forProject(period.project_id),
    ]);
    const heads = new Map<string, { direction: 'income' | 'cost'; head: string; amount: number }>();
    for (const e of entries.filter((x) => x.entry_date >= period.period_start && x.entry_date <= period.period_end)) {
      const k = `${e.direction}::${e.head}`;
      const h = heads.get(k) ?? { direction: e.direction, head: e.head, amount: 0 };
      h.amount += e.amount;
      heads.set(k, h);
    }
    const loanCode = new Map(loans.map((l) => [l.id, l.code]));
    const names = await holderNames();
    const named = (a: ProfitAllocation): HolderLine => ({ allocation: a, ...names(a) });
    let preview: HolderLine[] = [];
    if (period.status !== 'declared' && policy) {
      const draft = await draftLines(period, policy, period.record_date ?? period.period_end);
      preview = draft.map((d) =>
        named({
          id: d.key,
          created_at: '',
          updated_at: '',
          created_by: null,
          period_id: period.id,
          project_id: period.project_id,
          holder_type: d.holder_type,
          customer_id: d.customer_id,
          partner_id: d.partner_id,
          share_sale_id: d.share_sale_id,
          ownership_pct: d.ownership_pct,
          eligibility_factor: d.factor,
          gross: d.gross,
          tax_withheld: d.tax,
          adjusted_to_dues: 0,
          net_credited: d.net,
        }),
      );
    }
    return {
      period,
      project_name: project?.name ?? '—',
      heads: [...heads.values()].sort((a, b) => a.direction.localeCompare(b.direction) || b.amount - a.amount),
      coverings: coverings.map((c) => ({ ...c, loan_code: c.loan_id ? (loanCode.get(c.loan_id) ?? null) : null })),
      lines: allocations.map(named).sort(holderOrder),
      preview: preview.sort(holderOrder),
    };
  }

  async forProject(projectId: string): Promise<RevenuePeriod[]> {
    return (await storedPeriods(projectId)).reverse();
  }
}

export const revenuePeriodRepository = new RevenuePeriodRepository();

function holderOrder(a: HolderLine, b: HolderLine): number {
  return (
    Number(a.allocation.holder_type === 'partner') - Number(b.allocation.holder_type === 'partner') ||
    b.allocation.gross - a.allocation.gross
  );
}

async function holderNames(): Promise<(a: ProfitAllocation) => { name: string; code: string | null }> {
  const [customers, partners, sales] = await Promise.all([db.customers.toArray(), db.partners.toArray(), db.share_sales.toArray()]);
  const c = new Map(customers.map((x) => [x.id, x]));
  const pt = new Map(partners.map((x) => [x.id, x]));
  const s = new Map(sales.map((x) => [x.id, x]));
  return (a) =>
    a.holder_type === 'customer'
      ? { name: c.get(a.customer_id ?? '')?.name ?? '—', code: s.get(a.share_sale_id ?? '')?.code ?? null }
      : { name: pt.get(a.partner_id ?? '')?.name ?? '—', code: pt.get(a.partner_id ?? '')?.code ?? null };
}

interface DraftLine {
  key: string;
  holder_type: 'customer' | 'partner';
  customer_id: string | null;
  partner_id: string | null;
  share_sale_id: string | null;
  ownership_pct: number;
  factor: number;
  gross: number;
  tax: number;
  net: number;
}

/** Ownership on the record date (plan §4) and the declared amount split by it. */
async function draftLines(p: RevenuePeriod, policy: RevenuePolicy, recordDate: string): Promise<DraftLine[]> {
  const [sales, payments, partners] = await Promise.all([
    db.share_sales.where('project_id').equals(p.project_id).toArray(),
    db.share_payments.toArray(),
    db.partners.toArray(),
  ]);
  const holding = sales.filter(
    (s) => (s.status === 'agreement_signed' || s.status === 'fully_paid') && s.agreement_date && s.agreement_date <= recordDate,
  );
  const customers = holding.map((s) => {
    const paid = sum(payments.filter((x) => x.sale_id === s.id && x.paid_on <= recordDate), (x) => x.principal);
    return {
      sale: s,
      h: {
        key: s.id,
        ownership_pct: s.share_pct,
        factor: eligibilityFactor(
          policy.eligibility_rule,
          policy.prorate_days,
          { paid, price: s.total_price, held_from: s.agreement_date! },
          p.period_start,
          p.period_end,
        ),
      },
    };
  });
  const customerPct = sum(customers, (c) => c.h.ownership_pct);
  const owners = splitProject(p.project_id, partners).map((sl) => ({
    key: sl.partner_id,
    share_pct: (sl.share_pct * Math.max(0, 100 - customerPct)) / 100,
  }));
  const lines = splitDeclared(p.declared, customers.map((c) => c.h), owners, policy.tax_withholding_pct);
  const saleById = new Map(customers.map((c) => [c.sale.id, c.sale]));
  return lines.map((l) => {
    const sale = saleById.get(l.key);
    return {
      key: l.key,
      holder_type: l.kind === 'customer' ? 'customer' : 'partner',
      customer_id: sale?.customer_id ?? null,
      partner_id: sale ? null : l.key,
      share_sale_id: sale?.id ?? null,
      ownership_pct: Math.round(l.ownership_pct * 10_000) / 10_000,
      factor: l.factor,
      gross: l.gross,
      tax: l.tax,
      net: l.net,
    };
  });
}

/* ------------------------------------------------------------ loss covering */

export interface CoverLine {
  source: LossCoverSource;
  amount: number;
  /** for a loan: who and on what terms */
  loan?: Omit<LoanInput, 'project_id' | 'principal' | 'period_id' | 'lender_type' | 'taken_on'> | null;
  partner_id?: string | null;
  account_id?: string | null;
  notes?: string | null;
}

class LossCoveringRepository extends BaseRepository<LossCovering> {
  constructor() {
    super(() => db.loss_coverings);
  }

  /** Plan §3: records how a loss period's shortfall was paid for. */
  async cover(periodId: string, lines: CoverLine[], date: string, userId: string | null): Promise<void> {
    const p = await db.revenue_periods.get(periodId);
    if (!p) throw new Error('This period no longer exists.');
    const loss = Math.max(0, -p.operating_profit);
    if (!(loss > 0)) throw new Error('This period made no loss.');
    const already = sum(await db.loss_coverings.where('period_id').equals(periodId).toArray(), (c) => c.amount);
    const adding = sum(lines, (l) => taka(l.amount));
    if (!(adding > 0)) throw new Error('Enter at least one amount.');
    if (already + adding > loss) throw new Error(`The loss was ${formatBdt(loss)}; ${formatBdt(loss - already)} is still uncovered.`);
    const overview = await revenueOverview(p.project_id);
    const fromReserve = sum(lines.filter((l) => l.source === 'reserve'), (l) => taka(l.amount));
    if (fromReserve > (overview?.reserve_balance ?? 0)) throw new Error(`The reserve holds ${formatBdt(overview?.reserve_balance ?? 0)}.`);
    for (const l of lines) {
      const amount = taka(l.amount);
      if (!(amount > 0)) continue;
      let loan_id: string | null = null;
      let fund_receipt_id: string | null = null;
      if (l.source === 'person_loan' || l.source === 'bank_loan' || l.source === 'partner_loan') {
        if (!l.loan || !l.account_id) throw new Error('Fill in who lent the money and the account it went into.');
        const loan = await loanRepository.take(
          {
            ...l.loan,
            project_id: p.project_id,
            lender_type: l.source === 'bank_loan' ? 'bank' : l.source === 'partner_loan' ? 'partner' : 'person',
            partner_id: l.source === 'partner_loan' ? l.partner_id : null,
            principal: amount,
            taken_on: date,
            account_id: l.account_id,
            period_id: p.id,
          },
          userId,
        );
        loan_id = loan.id;
        fund_receipt_id = loan.fund_receipt_id ?? null;
      } else if (l.source === 'partner_capital') {
        if (!l.partner_id || !l.account_id) throw new Error('Pick the partner and the account the money went into.');
        const r = await fundReceiptRepository.record(
          {
            source_type: 'partner_capital',
            partner_id: l.partner_id,
            source_name: null,
            project_id: p.project_id,
            account_id: l.account_id,
            amount,
            receipt_date: date,
            notes: `Covering the ${p.label} loss`,
          },
          userId,
        );
        fund_receipt_id = r.id;
      }
      await this.create(
        {
          period_id: p.id,
          project_id: p.project_id,
          source: l.source,
          amount,
          loan_id,
          fund_receipt_id,
          partner_id: l.source === 'partner_capital' || l.source === 'partner_loan' ? (l.partner_id ?? null) : null,
          notes: l.notes ?? null,
        },
        userId,
      );
    }
  }
}

export const lossCoveringRepository = new LossCoveringRepository();

/* ------------------------------------------------------- balances & payouts */

class ProfitAllocationRepository extends BaseRepository<ProfitAllocation> {
  constructor() {
    super(() => db.profit_allocations);
  }
}

export const profitAllocationRepository = new ProfitAllocationRepository();

export interface HolderBalance {
  project_id: string;
  project_name: string;
  holder_type: 'customer' | 'partner';
  holder_id: string;
  holder_name: string;
  credited: number;
  paid_out: number;
  pending: number;
  balance: number;
  last_declared_on: string | null;
  check: WithdrawalCheck;
}

async function balancesWhere(filter: (a: { customer_id?: string | null; partner_id?: string | null; project_id: string }) => boolean, today: string): Promise<HolderBalance[]> {
  const [allocs, withdrawals, projects, periods, policies, customers, partners] = await Promise.all([
    db.profit_allocations.toArray(),
    db.profit_withdrawals.toArray(),
    db.projects.toArray(),
    db.revenue_periods.toArray(),
    db.revenue_policies.toArray(),
    db.customers.toArray(),
    db.partners.toArray(),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const policyOf = new Map(policies.map((p) => [p.project_id, p]));
  const name = new Map<string, string>([...customers.map((c) => [c.id, c.name] as const), ...partners.map((p) => [p.id, p.name] as const)]);
  const groups = new Map<string, HolderBalance>();
  for (const a of allocs.filter(filter)) {
    const holder = (a.holder_type === 'customer' ? a.customer_id : a.partner_id) ?? '';
    const k = `${a.project_id}::${holder}`;
    const g = groups.get(k) ?? {
      project_id: a.project_id,
      project_name: projectName.get(a.project_id) ?? '—',
      holder_type: a.holder_type,
      holder_id: holder,
      holder_name: name.get(holder) ?? '—',
      credited: 0,
      paid_out: 0,
      pending: 0,
      balance: 0,
      last_declared_on: null,
      check: { ok: false, reason: null },
    };
    g.credited += a.net_credited;
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    const mine = withdrawals.filter(
      (w) => w.project_id === g.project_id && (w.holder_type === 'customer' ? w.customer_id : w.partner_id) === g.holder_id,
    );
    g.paid_out = sum(mine.filter((w) => w.status === 'paid'), (w) => w.amount);
    g.pending = sum(mine.filter((w) => w.status === 'requested' || w.status === 'approved'), (w) => w.amount);
    g.balance = g.credited - g.paid_out - g.pending;
    g.last_declared_on =
      periods
        .filter((p) => p.project_id === g.project_id && p.status === 'declared')
        .map((p) => p.declared_on ?? '')
        .sort()
        .pop() || null;
    const policy = policyOf.get(g.project_id);
    g.check = policy ? canWithdraw(policy, g.balance, g.last_declared_on, today) : { ok: false, reason: 'Not set up.' };
  }
  return [...groups.values()].sort((a, b) => b.balance - a.balance);
}

export async function customerProfitBalances(customerId: string, today = todayLocal()): Promise<HolderBalance[]> {
  return balancesWhere((a) => a.customer_id === customerId, today);
}

export async function partnerProfitBalances(today = todayLocal()): Promise<HolderBalance[]> {
  return balancesWhere((a) => !!a.partner_id, today);
}

export async function projectProfitBalances(projectId: string, today = todayLocal()): Promise<HolderBalance[]> {
  return balancesWhere((a) => a.project_id === projectId, today);
}

export interface WithdrawalRow {
  withdrawal: ProfitWithdrawal;
  holder_name: string;
  holder_phone: string | null;
  project_name: string;
  account_name: string | null;
}

class ProfitWithdrawalRepository extends BaseRepository<ProfitWithdrawal> {
  constructor() {
    super(() => db.profit_withdrawals);
  }

  /** A customer from the portal, or the office for a customer or partner. */
  async request(
    input: {
      holder_type: 'customer' | 'partner';
      holder_id: string;
      project_id: string;
      amount: number;
      method: WithdrawalMethod;
      pay_to: string;
      channel: 'portal' | 'office';
    },
    userId: string | null,
    today = todayLocal(),
  ): Promise<ProfitWithdrawal> {
    const amount = taka(input.amount);
    if (!(amount > 0)) throw new Error('Enter an amount above 0.');
    if (!input.pay_to.trim()) throw new Error(input.method === 'bank_transfer' ? 'Enter the bank account to pay into.' : 'Enter where to pay it.');
    const balances = await balancesWhere(
      (a) => a.project_id === input.project_id && (input.holder_type === 'customer' ? a.customer_id : a.partner_id) === input.holder_id,
      today,
    );
    const b = balances[0];
    if (!b) throw new Error('There is no profit balance on this project yet.');
    // the office may pay a partner outside the customer window
    if (input.holder_type === 'customer' && !b.check.ok) throw new Error(b.check.reason ?? 'Requests are not open now.');
    if (amount > b.balance) throw new Error(`The balance is ${formatBdt(b.balance)}.`);
    const policy = await revenuePolicyRepository.forProject(input.project_id);
    if (input.holder_type === 'customer' && policy && amount < Math.min(policy.min_withdrawal, b.balance)) {
      throw new Error(`Ask for at least ${formatBdt(policy.min_withdrawal)}.`);
    }
    const codes = (await db.profit_withdrawals.toArray()).map((w) => w.code);
    return this.create(
      {
        code: nextCode('WDR', codes),
        holder_type: input.holder_type,
        customer_id: input.holder_type === 'customer' ? input.holder_id : null,
        partner_id: input.holder_type === 'partner' ? input.holder_id : null,
        project_id: input.project_id,
        amount,
        method: input.method,
        pay_to: input.pay_to.trim(),
        status: 'requested',
        requested_on: today,
        channel: input.channel,
      },
      userId,
    );
  }

  async approve(id: string, userId: string | null): Promise<void> {
    const w = await db.profit_withdrawals.get(id);
    if (!w || w.status !== 'requested') throw new Error('Only a new request can be approved.');
    await this.update(id, { status: 'approved', decided_by: userId, decided_on: todayLocal() });
  }

  async reject(id: string, reason: string, userId: string | null): Promise<void> {
    const w = await db.profit_withdrawals.get(id);
    if (!w || (w.status !== 'requested' && w.status !== 'approved')) throw new Error('This request is already settled.');
    if (!reason.trim()) throw new Error('Say why, so the customer knows.');
    await this.update(id, { status: 'rejected', reject_reason: reason.trim(), decided_by: userId, decided_on: todayLocal() });
  }

  async markPaid(id: string, input: { account_id: string; paid_on: string; reference_no?: string | null }, userId: string | null): Promise<void> {
    const w = await db.profit_withdrawals.get(id);
    if (!w || (w.status !== 'requested' && w.status !== 'approved')) throw new Error('This request is already settled.');
    if (!input.account_id) throw new Error('Pick the account it was paid from.');
    if (!input.paid_on || input.paid_on > todayLocal()) throw new Error('Pick a date that is not in the future.');
    await this.update(id, {
      status: 'paid',
      account_id: input.account_id,
      paid_on: input.paid_on,
      reference_no: input.reference_no?.trim() || null,
      decided_by: w.decided_by ?? userId,
      decided_on: w.decided_on ?? input.paid_on,
    });
  }

  async rows(filter?: { customer_id?: string; project_id?: string }): Promise<WithdrawalRow[]> {
    const [all, customers, partners, projects, accounts] = await Promise.all([
      db.profit_withdrawals.toArray(),
      db.customers.toArray(),
      db.partners.toArray(),
      db.projects.toArray(),
      db.bank_accounts.toArray(),
    ]);
    const c = new Map<string, Customer>(customers.map((x) => [x.id, x]));
    const pt = new Map<string, Partner>(partners.map((x) => [x.id, x]));
    const pj = new Map(projects.map((x) => [x.id, x.name]));
    const ac = new Map(accounts.map((x) => [x.id, x.name]));
    return all
      .filter((w) => (!filter?.customer_id || w.customer_id === filter.customer_id) && (!filter?.project_id || w.project_id === filter.project_id))
      .map((w) => {
        const holder = w.holder_type === 'customer' ? c.get(w.customer_id ?? '') : pt.get(w.partner_id ?? '');
        return {
          withdrawal: w,
          holder_name: holder?.name ?? '—',
          holder_phone: holder?.phone ?? null,
          project_name: pj.get(w.project_id) ?? '—',
          account_name: w.account_id ? (ac.get(w.account_id) ?? null) : null,
        };
      })
      .sort((a, b) => b.withdrawal.requested_on.localeCompare(a.withdrawal.requested_on) || b.withdrawal.code.localeCompare(a.withdrawal.code));
  }
}

export const profitWithdrawalRepository = new ProfitWithdrawalRepository();

/* --------------------------------------------------------------- all periods */

export interface DistributionRow {
  period: RevenuePeriod;
  project_name: string;
  holders: number;
  customers_gross: number;
  owners_gross: number;
  tax: number;
}

export async function profitDistributions(): Promise<DistributionRow[]> {
  const [periods, allocs, projects] = await Promise.all([
    db.revenue_periods.toArray(),
    db.profit_allocations.toArray(),
    db.projects.toArray(),
  ]);
  const name = new Map(projects.map((p) => [p.id, p.name]));
  return periods
    .map((period) => {
      const mine = allocs.filter((a) => a.period_id === period.id);
      return {
        period,
        project_name: name.get(period.project_id) ?? '—',
        holders: mine.length,
        customers_gross: sum(mine.filter((a) => a.holder_type === 'customer'), (a) => a.gross),
        owners_gross: sum(mine.filter((a) => a.holder_type === 'partner'), (a) => a.gross),
        tax: sum(mine, (a) => a.tax_withheld),
      };
    })
    .sort((a, b) => b.period.period_end.localeCompare(a.period.period_end) || a.project_name.localeCompare(b.project_name));
}

/** A customer's line in each declared period, for the portal and the customer page. */
export async function customerProfitHistory(customerId: string): Promise<
  { allocation: ProfitAllocation; period: RevenuePeriod; project_name: string; sale_code: string | null }[]
> {
  const allocs = await db.profit_allocations.where('customer_id').equals(customerId).toArray();
  const [periods, projects, sales] = await Promise.all([
    db.revenue_periods.bulkGet([...new Set(allocs.map((a) => a.period_id))]),
    db.projects.toArray(),
    db.share_sales.where('customer_id').equals(customerId).toArray(),
  ]);
  const period = new Map(periods.filter(Boolean).map((p) => [p!.id, p!]));
  const name = new Map(projects.map((p) => [p.id, p.name]));
  const code = new Map(sales.map((s) => [s.id, s.code]));
  return allocs
    .filter((a) => period.has(a.period_id))
    .map((a) => ({
      allocation: a,
      period: period.get(a.period_id)!,
      project_name: name.get(a.project_id) ?? '—',
      sale_code: a.share_sale_id ? (code.get(a.share_sale_id) ?? null) : null,
    }))
    .sort((a, b) => b.period.period_end.localeCompare(a.period.period_end));
}

/** Days since the latest declaration, for "new" badges. */
export function daysSince(date: string | null, today = todayLocal()): number | null {
  return date ? daysBetween(date, today) : null;
}

/* --------------------------------------------------------------- cap table */

export interface CapTableRow {
  key: string;
  kind: 'customer' | 'owner';
  name: string;
  /** sale code or partner code */
  code: string | null;
  shares: number | null;
  ownership_pct: number;
  /** customers: % of the price paid */
  paid_pct: number | null;
  href: string | null;
}

/** Plan §4 — who owns the project on a date: customers' holdings, owners the rest by partner %. */
export async function projectCapTable(projectId: string, date = todayLocal()): Promise<{ rows: CapTableRow[]; customers_pct: number; owners_pct: number }> {
  const [sales, payments, partners, customers] = await Promise.all([
    db.share_sales.where('project_id').equals(projectId).toArray(),
    db.share_payments.toArray(),
    db.partners.toArray(),
    db.customers.toArray(),
  ]);
  const cname = new Map(customers.map((c) => [c.id, c.name]));
  const held = sales.filter(
    (s) => (s.status === 'agreement_signed' || s.status === 'fully_paid') && s.agreement_date && s.agreement_date <= date,
  );
  const customerRows: CapTableRow[] = held
    .map((s) => {
      const paid = sum(payments.filter((p) => p.sale_id === s.id && p.paid_on <= date), (p) => p.principal);
      return {
        key: s.id,
        kind: 'customer' as const,
        name: cname.get(s.customer_id) ?? '—',
        code: s.code,
        shares: s.shares,
        ownership_pct: s.share_pct,
        paid_pct: s.total_price ? Math.min(100, Math.round((paid / s.total_price) * 100)) : 100,
        href: `/admin/share-sale/sales/${s.id}`,
      };
    })
    .sort((a, b) => b.ownership_pct - a.ownership_pct);
  const customersPct = sum(customerRows, (r) => r.ownership_pct);
  const ownersPct = Math.max(0, 100 - customersPct);
  const ownerRows: CapTableRow[] = splitProject(projectId, partners).map((sl) => ({
    key: sl.partner_id,
    kind: 'owner',
    name: sl.name,
    code: partners.find((p) => p.id === sl.partner_id)?.code ?? null,
    shares: null,
    ownership_pct: (sl.share_pct * ownersPct) / 100,
    paid_pct: null,
    href: null,
  }));
  return { rows: [...customerRows, ...ownerRows], customers_pct: customersPct, owners_pct: ownersPct };
}
