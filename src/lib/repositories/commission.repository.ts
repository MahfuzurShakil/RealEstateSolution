'use client';

import { db } from '../db/database';
import type {
  Booking,
  CommissionLine,
  CommissionPayout,
  CommissionPlan,
  CommissionSaleKind,
  Customer,
  OrgMember,
  Project,
  ShareSale,
} from '../db/types';
import {
  buildLines,
  chainOn,
  nextPlainCode,
  paidReachedOn,
  payoutMath,
  planForSale,
  planProblem,
  stageReachedOn,
  type SaleProgress,
} from '../domain/commission';
import { money } from '../domain/procurement';
import { newId, nextCode, nowIso } from '../utils/id';
import { todayLocal } from '../utils/format';
import { BaseRepository, type NewRecord } from './base.repository';
import { ORG_DESIGNATION } from './org.repository';

/*
 * Staged commission (REVENUE-SHARE-PLAN.md §7). A sale with a seller gets the
 * plan in force on its date and one line per person per stage, the chain
 * snapshotted from the tree as it was that day. Stages are earned from the
 * share-sale and booking payment ledgers — never marked by hand — so the
 * lines are reconciled against the ledgers (`sync`) whenever a commission
 * screen opens; reconciling twice changes nothing.
 */

/* ------------------------------------------------------------------ *
 * Plans
 * ------------------------------------------------------------------ */

export type CommissionPlanInput = Omit<NewRecord<CommissionPlan>, 'code'> & { id?: string };

class CommissionPlanRepository extends BaseRepository<CommissionPlan> {
  constructor() {
    super(() => db.commission_plans);
  }

  async list(): Promise<(CommissionPlan & { sales: number })[]> {
    const [plans, lines] = await Promise.all([db.commission_plans.toArray(), db.commission_lines.toArray()]);
    const sales = new Map<string, Set<string>>();
    for (const l of lines) {
      const key = l.share_sale_id ?? l.booking_id ?? '';
      sales.set(l.plan_id, (sales.get(l.plan_id) ?? new Set()).add(key));
    }
    const order = { active: 0, draft: 1, retired: 2 };
    return plans
      .map((p) => ({ ...p, sales: sales.get(p.id)?.size ?? 0 }))
      .sort((a, b) => order[a.status] - order[b.status] || a.code.localeCompare(b.code));
  }

  /**
   * Once a plan has paid out on a sale its money rules are fixed — those
   * lines were worked out from them. Name, dates, status and notes stay
   * editable; for new rules, retire it and start another.
   */
  async save(input: CommissionPlanInput, userId: string | null): Promise<CommissionPlan> {
    const stages = input.stages.map((s, i) => ({
      ...s,
      key: s.key || `s${i + 1}-${newId().slice(0, 6)}`,
      label: s.label.trim(),
      release_value: Number(s.release_value) || 0,
      threshold_pct: s.trigger === 'paid_pct' ? Number(s.threshold_pct) || 0 : null,
    }));
    const payload = {
      ...input,
      name: input.name.trim(),
      seller_value: Number(input.seller_value) || 0,
      stages,
      overrides: input.overrides.map((o) => ({ ...o, value: Number(o.value) || 0 })),
      project_id: input.project_id || null,
      offering_id: input.applies_to === 'share_sale' ? input.offering_id || null : null,
      effective_to: input.effective_to || null,
      notes: input.notes?.trim() || null,
    };
    const problem = planProblem(payload);
    if (problem) throw new Error(problem);
    if (payload.offering_id) {
      const o = await db.share_offerings.get(payload.offering_id);
      if (!o) throw new Error('That offering no longer exists.');
      payload.project_id = o.project_id;
    }
    if (input.id) {
      const current = await db.commission_plans.get(input.id);
      if (!current) throw new Error('This plan no longer exists.');
      const used = await db.commission_lines.where('plan_id').equals(input.id).count();
      const rules = (p: Pick<CommissionPlan, 'applies_to' | 'project_id' | 'offering_id' | 'seller_basis' | 'seller_value' | 'stages' | 'overrides'>) =>
        JSON.stringify([p.applies_to, p.project_id ?? null, p.offering_id ?? null, p.seller_basis, p.seller_value, p.stages.map((s) => [s.trigger, s.threshold_pct ?? null, s.release_type, s.release_value]), p.overrides]);
      if (used > 0 && rules(current) !== rules(payload)) {
        throw new Error('Commission has already been worked out on this plan, so its rates and stages are fixed. Retire it and create a new plan for new rules.');
      }
      // keep the stage keys the lines point at
      if (used > 0) payload.stages = payload.stages.map((s, i) => ({ ...s, key: current.stages[i]?.key ?? s.key }));
      return (await this.update(input.id, payload))!;
    }
    const codes = (await db.commission_plans.toArray()).map((p) => p.code);
    return this.create({ ...payload, code: nextPlainCode('CMP', codes) }, userId);
  }

  async remove(id: string): Promise<void> {
    if ((await db.commission_lines.where('plan_id').equals(id).count()) > 0) {
      throw new Error('This plan already has commission lines. Retire it instead.');
    }
    await super.remove(id);
  }
}

export const commissionPlanRepository = new CommissionPlanRepository();

/* ------------------------------------------------------------------ *
 * Reconciling lines with the ledgers
 * ------------------------------------------------------------------ */

interface SaleFacts {
  kind: CommissionSaleKind;
  id: string;
  project_id: string | null;
  offering_id: string | null;
  date: string;
  amount: number;
  units: number;
  sold_by: string | null;
  /** released or cancelled: what was sold went back */
  ended: boolean;
  progress: SaleProgress;
}

async function allSaleFacts(): Promise<SaleFacts[]> {
  const [shares, sharePays, bookings, payments, deliveries, units, towers] = await Promise.all([
    db.share_sales.toArray(),
    db.share_payments.toArray(),
    db.bookings.toArray(),
    db.payments.toArray(),
    db.unit_deliveries.toArray(),
    db.units.toArray(),
    db.towers.toArray(),
  ]);
  const projectOfUnit = new Map(units.map((u) => [u.id, towers.find((t) => t.id === u.tower_id)?.project_id ?? null]));
  const out: SaleFacts[] = [];
  for (const s of shares) {
    const pays = sharePays.filter((p) => p.sale_id === s.id).map((p) => ({ date: p.paid_on, amount: Number(p.principal) || 0 }));
    out.push({
      kind: 'share',
      id: s.id,
      project_id: s.project_id,
      offering_id: s.offering_id,
      date: s.agreement_date ?? s.reserved_on,
      amount: s.total_price,
      units: s.shares,
      sold_by: s.sold_by_member_id ?? null,
      ended: s.status === 'released' || s.status === 'cancelled',
      progress: {
        price: s.total_price,
        agreement_on: s.status === 'reserved' ? null : (s.agreement_date ?? null),
        down_payment: s.down_payment,
        payments: pays,
        handover_on: s.certificate_date ?? null,
      },
    });
  }
  for (const b of bookings) {
    const pays = payments
      .filter((p) => p.booking_id === b.id)
      .map((p) => ({ date: p.payment_date, amount: p.principal ?? money((Number(p.amount) || 0) - (Number(p.late_fee) || 0)) }));
    const handed = deliveries
      .filter((d) => d.booking_id === b.id && (d.step === 'keys_handed_over' || d.step === 'possession_given'))
      .map((d) => d.event_date)
      .sort()[0];
    const confirmedOn = b.status === 'confirmed' ? (paidReachedOn(pays, b.booking_amount) ?? b.booking_date) : null;
    out.push({
      kind: 'booking',
      id: b.id,
      project_id: projectOfUnit.get(b.unit_id) ?? null,
      offering_id: null,
      date: b.booking_date,
      amount: b.final_price,
      units: 1,
      sold_by: b.sold_by_member_id ?? null,
      ended: b.status === 'cancelled',
      progress: {
        price: b.final_price,
        agreement_on: b.agreement_date ?? confirmedOn,
        down_payment: b.booking_amount,
        payments: pays,
        handover_on: handed ?? null,
      },
    });
  }
  return out;
}

let syncing: Promise<void> | null = null;

/**
 * Brings every commission line up to date with the sales and their payments:
 * creates the lines of a sale that has a seller and a plan, earns the stages
 * the money has reached, and applies the plan's cancel rule to a sale that
 * ended. Single-flight, and idempotent.
 */
export function syncCommissions(): Promise<void> {
  syncing ??= runSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function runSync(): Promise<void> {
  const tables = [db.commission_lines, db.commission_plans, db.org_members, db.org_moves, db.lookup_values, db.share_sales, db.share_payments, db.bookings, db.payments, db.unit_deliveries, db.units, db.towers];
  await db.transaction('rw', tables, async () => {
    const [facts, plans, members, moves, designations, lines] = await Promise.all([
      allSaleFacts(),
      db.commission_plans.toArray(),
      db.org_members.toArray(),
      db.org_moves.toArray(),
      db.lookup_values.where('category').equals(ORG_DESIGNATION).toArray(),
      db.commission_lines.toArray(),
    ]);
    const label = (id: string) => designations.find((d) => d.id === id)?.value ?? '—';
    const planById = new Map(plans.map((p) => [p.id, p]));
    const bySale = new Map<string, CommissionLine[]>();
    for (const l of lines) {
      const key = l.share_sale_id ?? l.booking_id ?? '';
      bySale.set(key, [...(bySale.get(key) ?? []), l]);
    }
    const ts = nowIso();

    for (const sale of facts) {
      let mine = bySale.get(sale.id) ?? [];
      const allPending = mine.every((l) => l.status === 'pending');
      const seller = mine.find((l) => l.role === 'seller')?.member_id ?? null;

      // no seller any more, or a different one, while nothing is earned yet: start again
      if (mine.length && allPending && seller !== sale.sold_by) {
        await db.commission_lines.bulkDelete(mine.map((l) => l.id));
        mine = [];
      }
      if (mine.length === 0) {
        if (!sale.sold_by || sale.ended) continue;
        const plan = planForSale(plans, { kind: sale.kind, project_id: sale.project_id, offering_id: sale.offering_id, date: sale.date });
        if (!plan) continue;
        const chain = chainOn(sale.sold_by, members, moves, sale.date);
        const drafts = buildLines(plan, chain, sale, label);
        mine = drafts.map((d) => ({
          ...d,
          id: newId(),
          created_at: ts,
          updated_at: ts,
          created_by: null,
          plan_id: plan.id,
          sale_kind: sale.kind,
          share_sale_id: sale.kind === 'share' ? sale.id : null,
          booking_id: sale.kind === 'booking' ? sale.id : null,
          project_id: sale.project_id,
          sale_date: sale.date,
          sale_amount: sale.amount,
          status: 'pending' as const,
          earned_on: null,
        }));
        await db.commission_lines.bulkAdd(mine);
      }

      for (const l of mine) {
        const plan = planById.get(l.plan_id);
        const stage = plan?.stages.find((s) => s.key === l.stage_key);
        let changes: Partial<CommissionLine> | null = null;
        if (sale.ended) {
          if (l.status === 'pending' || l.status === 'earned' || l.status === 'approved') {
            changes = { status: 'void', void_reason: 'Sale cancelled before this was paid' };
          } else if (l.status === 'paid' && plan?.cancel_rule === 'recover' && !l.to_recover) {
            changes = { to_recover: true };
          }
        } else if (stage) {
          const reached = stageReachedOn(stage, sale.progress);
          if (l.status === 'pending' && reached) changes = { status: 'earned', earned_on: reached };
          // a reversed payment takes an unapproved stage back
          else if (l.status === 'earned' && !reached) changes = { status: 'pending', earned_on: null };
          else if (l.status === 'earned' && reached && reached !== l.earned_on) changes = { earned_on: reached };
        }
        if (changes) await db.commission_lines.update(l.id, { ...changes, updated_at: ts });
      }
    }
  });
}

/* ------------------------------------------------------------------ *
 * Reading lines
 * ------------------------------------------------------------------ */

export interface CommissionLineRow extends CommissionLine {
  member: OrgMember | null;
  project: Project | null;
  sale_code: string;
  customer: Customer | null;
  plan_code: string;
}

async function withRelations(lines: CommissionLine[]): Promise<CommissionLineRow[]> {
  const [members, projects, shares, bookings, customers, plans] = await Promise.all([
    db.org_members.toArray(),
    db.projects.toArray(),
    db.share_sales.toArray(),
    db.bookings.toArray(),
    db.customers.toArray(),
    db.commission_plans.toArray(),
  ]);
  const member = new Map(members.map((m) => [m.id, m]));
  const project = new Map(projects.map((p) => [p.id, p]));
  const share = new Map<string, ShareSale>(shares.map((s) => [s.id, s]));
  const booking = new Map<string, Booking>(bookings.map((b) => [b.id, b]));
  const customer = new Map(customers.map((c) => [c.id, c]));
  const plan = new Map(plans.map((p) => [p.id, p.code]));
  return lines.map((l) => {
    const sale = l.share_sale_id ? share.get(l.share_sale_id) : l.booking_id ? booking.get(l.booking_id) : undefined;
    return {
      ...l,
      member: member.get(l.member_id) ?? null,
      project: l.project_id ? (project.get(l.project_id) ?? null) : null,
      sale_code: sale ? ('agreement_no' in sale && sale.agreement_no) || sale.code : '—',
      customer: sale ? (customer.get(sale.customer_id) ?? null) : null,
      plan_code: plan.get(l.plan_id) ?? '—',
    };
  });
}

export interface CommissionTotals {
  pending: number;
  earned: number;
  approved: number;
  paid: number;
  void: number;
  recovered: number;
  /** paid commission on cancelled sales, still to come off a payout */
  to_recover: number;
}

export function commissionTotals(lines: CommissionLine[]): CommissionTotals {
  const t: CommissionTotals = { pending: 0, earned: 0, approved: 0, paid: 0, void: 0, recovered: 0, to_recover: 0 };
  for (const l of lines) {
    t[l.status] = money(t[l.status] + l.amount);
    if (l.to_recover && l.status === 'paid') t.to_recover = money(t.to_recover + l.amount);
  }
  return t;
}

export interface SaleStatementRow {
  key: string;
  kind: CommissionSaleKind;
  sale_id: string;
  sale_code: string;
  sale_date: string;
  sale_amount: number;
  customer: Customer | null;
  project: Project | null;
  role: 'seller' | 'override';
  designation_at_sale: string;
  lines: CommissionLine[];
  totals: CommissionTotals;
  total: number;
}

class CommissionLineRepository extends BaseRepository<CommissionLine> {
  constructor() {
    super(() => db.commission_lines);
  }

  async rows(): Promise<CommissionLineRow[]> {
    return withRelations(await db.commission_lines.toArray());
  }

  /** One member's statement (plan §7.3): each sale, its stages, what is released, paid and to come. */
  async statement(memberId: string): Promise<SaleStatementRow[]> {
    const rows = await withRelations(await db.commission_lines.where('member_id').equals(memberId).toArray());
    const bySale = new Map<string, CommissionLineRow[]>();
    for (const r of rows) {
      const key = `${r.share_sale_id ?? r.booking_id}:${r.role}`;
      bySale.set(key, [...(bySale.get(key) ?? []), r]);
    }
    return [...bySale.entries()]
      .map(([key, ls]) => {
        const first = ls[0];
        const lines = ls.sort((a, b) => a.stage_seq - b.stage_seq);
        return {
          key,
          kind: first.sale_kind,
          sale_id: (first.share_sale_id ?? first.booking_id)!,
          sale_code: first.sale_code,
          sale_date: first.sale_date,
          sale_amount: first.sale_amount,
          customer: first.customer,
          project: first.project,
          role: first.role,
          designation_at_sale: first.designation_at_sale,
          lines,
          totals: commissionTotals(lines),
          total: money(lines.reduce((t, l) => t + l.amount, 0)),
        };
      })
      .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
  }

  /** Lines of one sale, for the purchase or booking page. */
  async forSale(kind: CommissionSaleKind, saleId: string): Promise<CommissionLineRow[]> {
    const lines = await (kind === 'share' ? db.commission_lines.where('share_sale_id') : db.commission_lines.where('booking_id')).equals(saleId).toArray();
    return (await withRelations(lines)).sort((a, b) => a.level - b.level || a.stage_seq - b.stage_seq);
  }

  /** Accounts accepts earned lines (single or in bulk) — they become payable. */
  async approve(ids: string[], userId: string | null): Promise<number> {
    const lines = (await db.commission_lines.bulkGet(ids)).filter((l): l is CommissionLine => l?.status === 'earned');
    if (lines.length === 0) throw new Error('Only earned commission can be approved.');
    const ts = nowIso();
    const on = todayLocal();
    await db.commission_lines.bulkUpdate(lines.map((l) => ({ key: l.id, changes: { status: 'approved' as const, approved_by: userId, approved_on: on, updated_at: ts } })));
    return lines.length;
  }
}

export const commissionLineRepository = new CommissionLineRepository();

/* ------------------------------------------------------------------ *
 * Payouts
 * ------------------------------------------------------------------ */

export interface PayoutPreview {
  member: OrgMember;
  lines: CommissionLine[];
  recoveries: CommissionLine[];
  lines_total: number;
  to_recover: number;
  /** the recovered lines this payout would take back: whole lines, as far as the lines cover them */
  recovering: CommissionLine[];
  recover_now: number;
}

function takeRecoveries(recoveries: CommissionLine[], linesTotal: number): CommissionLine[] {
  const taking: CommissionLine[] = [];
  let taken = 0;
  for (const r of [...recoveries].sort((a, b) => a.amount - b.amount)) {
    if (taken + r.amount > linesTotal + 0.005) continue;
    taking.push(r);
    taken = money(taken + r.amount);
  }
  return taking;
}

export interface PayoutInput {
  member_id: string;
  account_id: string;
  paid_on: string;
  tax_pct: number;
  reference_no?: string | null;
  notes?: string | null;
}

export interface PayoutRow extends CommissionPayout {
  member: OrgMember | null;
  account_name: string | null;
  line_count: number;
}

class CommissionPayoutRepository extends BaseRepository<CommissionPayout> {
  constructor() {
    super(() => db.commission_payouts);
  }

  async list(): Promise<PayoutRow[]> {
    const [payouts, members, accounts, lines] = await Promise.all([
      db.commission_payouts.toArray(),
      db.org_members.toArray(),
      db.bank_accounts.toArray(),
      db.commission_lines.toArray(),
    ]);
    return payouts
      .map((p) => ({
        ...p,
        member: members.find((m) => m.id === p.member_id) ?? null,
        account_name: accounts.find((a) => a.id === p.account_id)?.name ?? null,
        line_count: lines.filter((l) => l.payout_id === p.id).length,
      }))
      .sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.code.localeCompare(a.code));
  }

  /** Members with approved commission waiting to be paid. */
  async payable(): Promise<PayoutPreview[]> {
    const [members, lines] = await Promise.all([db.org_members.toArray(), db.commission_lines.toArray()]);
    return members
      .map((m) => this.previewFrom(m, lines))
      .filter((p) => p.lines.length > 0)
      .sort((a, b) => b.lines_total - a.lines_total);
  }

  async preview(memberId: string): Promise<PayoutPreview | null> {
    const m = await db.org_members.get(memberId);
    if (!m) return null;
    return this.previewFrom(m, await db.commission_lines.where('member_id').equals(memberId).toArray());
  }

  private previewFrom(member: OrgMember, all: CommissionLine[]): PayoutPreview {
    const mine = all.filter((l) => l.member_id === member.id);
    const lines = mine.filter((l) => l.status === 'approved');
    const recoveries = mine.filter((l) => l.status === 'paid' && l.to_recover);
    const lines_total = money(lines.reduce((t, l) => t + l.amount, 0));
    const recovering = takeRecoveries(recoveries, lines_total);
    return {
      member,
      lines,
      recoveries,
      lines_total,
      to_recover: money(recoveries.reduce((t, l) => t + l.amount, 0)),
      recovering,
      recover_now: money(recovering.reduce((t, l) => t + l.amount, 0)),
    };
  }

  /**
   * Pays a member all their approved lines at once (plan §7.2 step 4). Paid
   * commission on cancelled sales comes off first, whole lines only, as far
   * as the lines cover it; tax is withheld on the rest. The money leaves the
   * account, so Cash Position sees it.
   */
  async pay(input: PayoutInput, userId: string | null): Promise<CommissionPayout> {
    if (!input.account_id) throw new Error('Pick the account the commission is paid from.');
    if (!input.paid_on) throw new Error('Enter the day it was paid.');
    const tax = Number(input.tax_pct) || 0;
    if (tax < 0 || tax > 100) throw new Error('Tax withheld must be between 0 and 100%.');
    const preview = await this.preview(input.member_id);
    if (!preview || preview.lines.length === 0) throw new Error('This member has no approved commission to pay.');

    const taking = preview.recovering;
    const math = payoutMath(preview.lines_total, preview.recover_now, tax);
    const codes = (await db.commission_payouts.toArray()).map((p) => p.code);
    const ts = nowIso();

    return db.transaction('rw', db.commission_payouts, db.commission_lines, async () => {
      const payout = await this.create(
        {
          code: nextCode('CPO', codes, Number(input.paid_on.slice(0, 4))),
          member_id: input.member_id,
          ...math,
          tax_pct: tax,
          account_id: input.account_id,
          paid_on: input.paid_on,
          reference_no: input.reference_no?.trim() || null,
          notes: input.notes?.trim() || null,
        },
        userId,
      );
      await db.commission_lines.bulkUpdate([
        ...preview.lines.map((l) => ({ key: l.id, changes: { status: 'paid' as const, payout_id: payout.id, updated_at: ts } })),
        ...taking.map((l) => ({ key: l.id, changes: { status: 'recovered' as const, recovered_payout_id: payout.id, updated_at: ts } })),
      ]);
      return payout;
    });
  }

  /** The lines a payout paid and the ones it took back. */
  async detail(payoutId: string): Promise<{ paid: CommissionLineRow[]; recovered: CommissionLineRow[] }> {
    const all = await db.commission_lines.toArray();
    const rows = await withRelations(all.filter((l) => l.payout_id === payoutId || l.recovered_payout_id === payoutId));
    return {
      paid: rows.filter((l) => l.payout_id === payoutId && l.recovered_payout_id !== payoutId),
      recovered: rows.filter((l) => l.recovered_payout_id === payoutId),
    };
  }
}

export const commissionPayoutRepository = new CommissionPayoutRepository();
