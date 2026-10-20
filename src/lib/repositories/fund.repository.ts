'use client';

import { db } from '../db/database';
import type { FundAllocation, FundReceipt, Partner, ProjectPartner } from '../db/types';
import type { CashFlowRow } from '../domain/cash';
import { money } from '../domain/procurement';
import { nextCode } from '../utils/id';
import { formatBdt } from '../utils/format';
import { BaseRepository, type NewRecord } from './base.repository';
import { bankAccountRepository } from './bank.repository';

/*
 * The Fund (DIRECT-PURCHASE-PLAN.md B5): where the money came from, whose it
 * is, what each project has received and spent, and what each partner's part
 * has been used for. Accounts say where money *sits*; this says whose it is.
 */

const projectPartnerRepository = new (class extends BaseRepository<ProjectPartner> {
  constructor() {
    super(() => db.project_partners);
  }
})();

class PartnerRepository extends BaseRepository<Partner> {
  constructor() {
    super(() => db.partners);
  }

  async list(): Promise<Partner[]> {
    return (await db.partners.toArray()).sort(
      (a, b) => Number(b.is_active) - Number(a.is_active) || b.share_pct - a.share_pct,
    );
  }

  async save(
    input: Omit<NewRecord<Partner>, 'code'> & { id?: string },
    userId: string | null,
  ): Promise<Partner> {
    if (!input.name.trim()) throw new Error('The partner needs a name.');
    const share = Number(input.share_pct);
    if (!(share >= 0 && share <= 100)) throw new Error('Share must be between 0 and 100%.');
    // company partners share the company; a project's own partners share that project
    const scope = input.project_id ?? null;
    if (scope && !(await db.projects.get(scope))) throw new Error('Pick the project this partner invests in.');
    if (scope && !(share > 0 && share < 100)) {
      throw new Error("A project partner's share must be above 0 and below 100% — the company keeps the rest.");
    }
    const others = (await db.partners.toArray()).filter(
      (p) => p.id !== input.id && p.is_active && (p.project_id ?? null) === scope,
    );
    const total = others.reduce((s, p) => s + p.share_pct, 0) + (input.is_active ? share : 0);
    if (total > 100 + 1e-9) {
      throw new Error(
        `${scope ? "This project's own partners" : "The company's partners"} would hold ${Math.round(total * 100) / 100}% — more than 100%.`,
      );
    }
    if (scope && total >= 100 - 1e-9) throw new Error('The company has to keep part of the project.');
    const payload = { ...input, project_id: scope, name: input.name.trim(), share_pct: share };
    if (input.id) {
      const saved = await this.update(input.id, payload);
      if (!saved) throw new Error('This partner no longer exists.');
      return saved;
    }
    const codes = (await db.partners.toArray()).map((p) => p.code);
    return this.create({ ...payload, code: nextCode('PTN', codes) }, userId);
  }

  /** A project's own split, or `[]` when it follows the company's. */
  async projectShares(projectId: string): Promise<ProjectPartner[]> {
    return db.project_partners.where('project_id').equals(projectId).toArray();
  }

  /** Empty `rows` puts the project back on the company split. */
  async setProjectShares(
    projectId: string,
    rows: { partner_id: string; share_pct: number }[],
    userId: string | null,
  ): Promise<void> {
    const kept = rows.filter((r) => Number(r.share_pct) > 0);
    const total = kept.reduce((s, r) => s + Number(r.share_pct), 0);
    if (kept.length > 0 && Math.abs(total - 100) > 0.01) {
      throw new Error(`A project's shares must add up to 100% (now ${Math.round(total * 100) / 100}%).`);
    }
    const old = await this.projectShares(projectId);
    await db.project_partners.bulkDelete(old.map((o) => o.id));
    for (const r of kept) {
      await projectPartnerRepository.create(
        { project_id: projectId, partner_id: r.partner_id, share_pct: Number(r.share_pct) },
        userId,
      );
    }
  }
}

export const partnerRepository = new PartnerRepository();

export type FundReceiptInput = Omit<NewRecord<FundReceipt>, 'code'>;

class FundReceiptRepository extends BaseRepository<FundReceipt> {
  constructor() {
    super(() => db.fund_receipts);
  }

  async record(input: FundReceiptInput, userId: string | null): Promise<FundReceipt> {
    const amount = money(Number(input.amount) || 0);
    if (!(amount > 0)) throw new Error('Enter an amount above 0.');
    if (!input.account_id) throw new Error('Pick the account the money went into.');
    if (input.source_type === 'partner_capital' && !input.partner_id) {
      throw new Error('Pick the partner who put this money in.');
    }
    // a project partner's money is that project's money
    const partner = input.partner_id ? await db.partners.get(input.partner_id) : undefined;
    if (input.source_type === 'partner_capital' && partner?.project_id) {
      input = { ...input, project_id: partner.project_id };
    }
    if (input.source_type !== 'partner_capital' && !input.source_name?.trim()) {
      throw new Error(input.source_type === 'loan' ? 'Name the lender.' : 'Say where the money came from.');
    }
    const codes = (await db.fund_receipts.toArray()).map((r) => r.code);
    return this.create(
      {
        ...input,
        partner_id: input.source_type === 'partner_capital' ? input.partner_id : null,
        source_name: input.source_type === 'partner_capital' ? null : input.source_name?.trim() || null,
        amount,
        code: nextCode('FND', codes),
      },
      userId,
    );
  }
}

export const fundReceiptRepository = new FundReceiptRepository();

class FundAllocationRepository extends BaseRepository<FundAllocation> {
  constructor() {
    super(() => db.fund_allocations);
  }

  /** Refused beyond what the company pool holds unallocated. */
  async allocate(
    input: Omit<NewRecord<FundAllocation>, 'code'>,
    userId: string | null,
  ): Promise<FundAllocation> {
    const amount = money(Number(input.amount) || 0);
    if (!(amount > 0)) throw new Error('Enter an amount above 0.');
    if (!input.project_id) throw new Error('Pick the project.');
    const { pool } = await fundOverview();
    if (amount > pool.unallocated + 0.005) {
      throw new Error(`The company pool has ${formatBdt(pool.unallocated)} not yet given to a project.`);
    }
    const codes = (await db.fund_allocations.toArray()).map((r) => r.code);
    return this.create({ ...input, amount, code: nextCode('ALC', codes) }, userId);
  }
}

export const fundAllocationRepository = new FundAllocationRepository();

/* ------------------------------------------------------------------ *
 * The overview
 * ------------------------------------------------------------------ */

export interface ProjectFundRow {
  project_id: string;
  project_name: string;
  project_code: string;
  /** capital or loans put straight into this project */
  direct_in: number;
  /** given from the company pool */
  allocated: number;
  /** buyers' payments for this project's units */
  collections: number;
  received: number;
  /** cash out for this project: site payments, expenses, supplier vouchers, refunds */
  spent: number;
  remaining: number;
  /** recorded site costs not yet paid */
  owed: number;
  /** recorded cost: direct purchases + expenses + supplier vouchers */
  cost: number;
  /**
   * How much of what was paid out came from the partners' money. A project
   * spends from one pot (partners' capital, loans, buyers' payments), so each
   * paid taka is taken from the sources in proportion to what they put in;
   * anything paid beyond what the project received came from the company
   * pool, which is partners' money too.
   */
  partners_used: number;
  /** partners' split for this project, own or the company's */
  shares: { partner_id: string; share_pct: number }[];
  own_split: boolean;
}

export interface PartnerRow extends Partner {
  /** capital recorded here plus their share of the opening balances */
  contributed: number;
  /** capital recorded through Money in */
  capital: number;
  /**
   * Their share of the accounts' opening balances: money the company held
   * before this system, which is the partners' existing equity.
   */
  opening_share: number;
  /** what this share% of all capital would be */
  expected: number;
  /** their share of the partners' money each project has paid out */
  share_of_cost: number;
  /** contributed less what has been used: their money still unspent */
  balance: number;
  by_project: { project_id: string; project_name: string; share_pct: number; cost: number }[];
}

export interface FundOverview {
  pool: { received: number; allocated: number; unallocated: number };
  projects: ProjectFundRow[];
  partners: PartnerRow[];
  totals: { capital: number; loans: number; other: number; collections: number; spent: number; cost: number };
  share_total: number;
}

export async function fundOverview(): Promise<FundOverview> {
  const [
    partners,
    projectPartners,
    receipts,
    allocations,
    projects,
    towers,
    units,
    bookings,
    payments,
    refunds,
    expenses,
    vouchers,
    purchases,
    sitePayments,
    accounts,
  ] = await Promise.all([
    db.partners.toArray(),
    db.project_partners.toArray(),
    db.fund_receipts.toArray(),
    db.fund_allocations.toArray(),
    db.projects.toArray(),
    db.towers.toArray(),
    db.units.toArray(),
    db.bookings.toArray(),
    db.payments.toArray(),
    db.refunds.toArray(),
    db.expenses.toArray(),
    db.supplier_vouchers.toArray(),
    db.direct_purchases.toArray(),
    db.direct_purchase_payments.toArray(),
    db.bank_accounts.toArray(),
  ]);
  const openingEquity = money(accounts.reduce((s, a) => s + (Number(a.opening_balance) || 0), 0));

  const towerProject = new Map(towers.map((t) => [t.id, t.project_id]));
  const unitProject = new Map(units.map((u) => [u.id, towerProject.get(u.tower_id)]));
  const bookingProject = new Map(bookings.map((b) => [b.id, unitProject.get(b.unit_id)]));
  const sum = <T>(rows: T[], f: (r: T) => number) => money(rows.reduce((s, r) => s + (f(r) || 0), 0));
  const active = partners.filter((p) => p.is_active).sort((a, b) => b.share_pct - a.share_pct);
  const companyPartners = active.filter((p) => !p.project_id);
  /*
   * Who carries a project (client, 2026-10-21): its own outside partners take
   * their share first; the company's partners share what is left in their
   * company proportions.
   */
  const defaultShares = (projectId: string) => {
    const outside = active.filter((p) => p.project_id === projectId);
    const left = Math.max(0, 100 - outside.reduce((s, p) => s + p.share_pct, 0));
    const companyTotal = companyPartners.reduce((s, p) => s + p.share_pct, 0) || 100;
    return [
      ...outside.map((p) => ({ partner_id: p.id, share_pct: p.share_pct })),
      ...companyPartners.map((p) => ({
        partner_id: p.id,
        share_pct: Math.round(((p.share_pct * left) / companyTotal) * 100) / 100,
      })),
    ].sort((a, b) => b.share_pct - a.share_pct);
  };

  const rows: ProjectFundRow[] = [];
  for (const p of projects) {
    const direct_in = sum(receipts.filter((r) => r.project_id === p.id), (r) => r.amount);
    const allocated = sum(allocations.filter((a) => a.project_id === p.id), (a) => a.amount);
    const collections = sum(payments.filter((x) => bookingProject.get(x.booking_id) === p.id), (x) => x.amount);
    const spent = money(
      sum(sitePayments.filter((x) => x.project_id === p.id), (x) => x.amount) +
        sum(expenses.filter((x) => x.project_id === p.id), (x) => x.amount) +
        sum(vouchers.filter((x) => x.project_id === p.id), (x) => x.amount) +
        sum(refunds.filter((x) => bookingProject.get(x.booking_id) === p.id), (x) => x.net_refund),
    );
    const mine = purchases.filter((x) => x.project_id === p.id);
    const cost = money(
      sum(mine, (x) => x.amount) +
        sum(expenses.filter((x) => x.project_id === p.id), (x) => x.amount) +
        sum(vouchers.filter((x) => x.project_id === p.id), (x) => x.amount),
    );
    const received = money(direct_in + allocated + collections);
    const partnerIn =
      sum(receipts.filter((r) => r.project_id === p.id && r.source_type === 'partner_capital'), (r) => r.amount) +
      allocated;
    const fromPot = Math.min(spent, received);
    const partners_used = money(
      (received > 0 ? (fromPot * partnerIn) / received : 0) + Math.max(0, spent - received),
    );
    if (received === 0 && spent === 0 && cost === 0) continue;
    const own = projectPartners.filter((x) => x.project_id === p.id);
    rows.push({
      project_id: p.id,
      project_name: p.name,
      project_code: p.code,
      direct_in,
      allocated,
      collections,
      received,
      spent,
      remaining: money(received - spent),
      owed: sum(mine, (x) => x.amount - (x.paid_amount || 0)),
      cost,
      partners_used,
      shares:
        own.length > 0
          ? own.map((o) => ({ partner_id: o.partner_id, share_pct: o.share_pct })).sort((a, b) => b.share_pct - a.share_pct)
          : defaultShares(p.id),
      own_split: own.length > 0,
    });
  }
  rows.sort((a, b) => b.cost - a.cost);

  // company-level cost (no project) is shared by the company split
  const companyCost = sum(expenses.filter((x) => !x.project_id), (x) => x.amount);
  const capital = sum(receipts.filter((r) => r.source_type === 'partner_capital'), (r) => r.amount);
  // the company's partners' capital, which their company shares are measured against
  const companyCapital = sum(
    receipts.filter((r) => r.source_type === 'partner_capital' && !partners.find((p) => p.id === r.partner_id)?.project_id),
    (r) => r.amount,
  );

  const partnerRows: PartnerRow[] = partners.map((partner) => {
    const capitalIn = sum(
      receipts.filter((r) => r.source_type === 'partner_capital' && r.partner_id === partner.id),
      (r) => r.amount,
    );
    // the money the company already had is its own partners' — not a project investor's
    const opening_share = partner.is_active && !partner.project_id ? money((openingEquity * partner.share_pct) / 100) : 0;
    const contributed = money(capitalIn + opening_share);
    const by_project = rows
      .map((row) => {
        const share = row.shares.find((s) => s.partner_id === partner.id)?.share_pct ?? 0;
        return {
          project_id: row.project_id,
          project_name: row.project_name,
          share_pct: share,
          cost: money((row.partners_used * share) / 100),
        };
      })
      .filter((x) => x.share_pct > 0);
    const share_of_cost = money(
      by_project.reduce((s, x) => s + x.cost, 0) +
        (partner.is_active && !partner.project_id ? (companyCost * partner.share_pct) / 100 : 0),
    );
    return {
      ...partner,
      contributed,
      capital: capitalIn,
      opening_share,
      // a project partner's capital is not measured against the company's
      expected: partner.project_id ? capitalIn : money((companyCapital * partner.share_pct) / 100),
      share_of_cost,
      balance: money(contributed - share_of_cost),
      by_project,
    };
  });

  const poolReceived = sum(receipts.filter((r) => !r.project_id), (r) => r.amount);
  const poolAllocated = sum(allocations, (a) => a.amount);

  return {
    pool: {
      received: poolReceived,
      allocated: poolAllocated,
      unallocated: money(poolReceived - poolAllocated),
    },
    projects: rows,
    partners: partnerRows,
    totals: {
      capital,
      loans: sum(receipts.filter((r) => r.source_type === 'loan'), (r) => r.amount),
      other: sum(receipts.filter((r) => r.source_type === 'other'), (r) => r.amount),
      collections: sum(payments, (x) => x.amount),
      spent: money(rows.reduce((s, r) => s + r.spent, 0)),
      cost: money(rows.reduce((s, r) => s + r.cost, 0) + companyCost),
    },
    share_total: money(companyPartners.reduce((s, p) => s + p.share_pct, 0)),
  };
}

export interface LedgerRow extends CashFlowRow {
  account_name: string;
  running: number;
}

/**
 * Every taka in and out through an account, oldest first, with the running
 * company balance (the simple general-ledger view; full double entry is later).
 */
export async function fundLedger(): Promise<{ opening: number; rows: LedgerRow[] }> {
  const [accounts, flows] = await Promise.all([bankAccountRepository.list(), bankAccountRepository.flows()]);
  const opening = money(accounts.reduce((s, a) => s + a.opening_balance, 0));
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  let running = opening;
  const rows = flows
    .filter((f) => f.account_id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((f) => {
      running = money(running + f.amount);
      return { ...f, account_name: name.get(f.account_id!) ?? '—', running };
    });
  return { opening, rows };
}
