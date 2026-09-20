'use client';

import { db } from '../db/database';
import type {
  Expense,
  LandOwnerMapping,
  Landowner,
  PaymentInstallment,
  PaymentSchedule,
} from '../db/types';
import { money, settledStatus, summariseSchedule } from '../domain/finance';
import {
  allocatePayments,
  planLandInstallments,
  type LandPaymentTerms,
} from '../domain/land-schedule';
import { todayLocal } from '../utils/format';
import { BaseRepository } from './base.repository';

/**
 * Batch L5 — owner settlement (BRD ACQ-003, LAND-002, BR-003).
 *
 * A land with three owners is three settlements. They are agreed at three
 * prices and paid on three sets of dates — owner A takes his bayna in January,
 * owner B in March — so a single land-level plan cannot say what any one of
 * them is owed today.
 *
 * The schedule's `entity_id` is a **`land_owner_mapping.id`**, not a
 * `landowners.id`: the same person can own two plots, and what is being settled
 * is their share of *this* land.
 *
 * A land runs either the land-level plan or per-owner plans, never both. Two
 * sets of instalments over the same money is two answers to "what is owed", and
 * the reconciliation between them would be a permanent source of
 * disagreement — so `LandPaymentPlanPanel` offers one or the other and says
 * which is in force.
 */

/** Where one owner's settlement stands right now (BRD LAND-002). */
export interface OwnerSettlement {
  mapping: LandOwnerMapping;
  owner: Landowner | undefined;
  /** what was agreed with this owner; 0 when nobody has recorded it */
  agreed: number;
  /** land-payment expenses naming this owner */
  paid: number;
  outstanding: number;
  /** their own instalment plan, when they have one */
  schedule: PaymentSchedule | undefined;
  installments: PaymentInstallment[];
  summary: ReturnType<typeof summariseSchedule> | null;
  payments: Expense[];
}

/** The land-level view of all of them together. */
export interface LandSettlementPosition {
  owners: OwnerSettlement[];
  agreedTotal: number;
  paidTotal: number;
  outstandingTotal: number;
  /** `lands.final_agreed_amount` — what the owners should add up to */
  landAgreed: number;
  /** true when the owner amounts do not sum to the land's agreed amount */
  mismatch: boolean;
  /** land payments in the ledger that name no owner */
  unattributed: number;
  /** how many owners have a plan of their own */
  scheduledCount: number;
}

/** Money paid *for* the land, as opposed to money spent on it. */
function isLandPayment(e: Expense): boolean {
  return e.cost_category === 'land_payment';
}

class OwnerSettlementRepository extends BaseRepository<PaymentSchedule> {
  constructor() {
    super(() => db.payment_schedules);
  }

  async forMapping(mappingId: string): Promise<PaymentSchedule | undefined> {
    const rows = await db.payment_schedules
      .where('[entity_type+entity_id]')
      .equals(['land_owner', mappingId])
      .toArray();
    return rows[0];
  }

  /**
   * Is this land's settlement scheduled by its owners' own plans?
   *
   * A land runs either the land-level plan or per-owner plans, never both (see
   * the note at the top of this file). Everything that asks "has this land got
   * a schedule" — the registration gate ACQ-003, the land list's "waiting on",
   * the Progress card — was only ever reading the land-level one, so a
   * purchase settled owner by owner read as unscheduled and the gate would
   * refuse a registration whose plan was complete (review 2026-09-20). That
   * was invisible until a land in the demo actually had owner plans.
   *
   * True only when *every* owner who has an agreed amount has a plan. A land
   * where two of three owners are scheduled is mid-work: the third is exactly
   * the payment the gate exists to stop being made blind.
   */
  async hasOwnerPlanCoverage(landId: string): Promise<boolean> {
    const mappings = await db.land_owner_mapping.where('land_id').equals(landId).toArray();
    const owing = mappings.filter((m) => (Number(m.agreed_amount) || 0) > 0);
    if (owing.length === 0) return false;
    const schedules = await Promise.all(owing.map((m) => this.forMapping(m.id)));
    return schedules.every(Boolean);
  }

  /**
   * The same question for every land at once, for the land list.
   *
   * Two full-table reads instead of two per land: the list asks this for every
   * row it renders, and `hasOwnerPlanCoverage` in a loop is what made the old
   * pipeline summary slow enough to notice.
   */
  async landsCoveredByOwnerPlans(): Promise<Set<string>> {
    const [mappings, schedules] = await Promise.all([
      db.land_owner_mapping.toArray(),
      db.payment_schedules.where('entity_type').equals('land_owner').toArray(),
    ]);
    const scheduled = new Set(schedules.map((s) => s.entity_id));
    const byLand = new Map<string, LandOwnerMapping[]>();
    for (const m of mappings) {
      if ((Number(m.agreed_amount) || 0) <= 0) continue;
      const list = byLand.get(m.land_id);
      if (list) list.push(m);
      else byLand.set(m.land_id, [m]);
    }
    const covered = new Set<string>();
    for (const [landId, owing] of byLand) {
      if (owing.every((m) => scheduled.has(m.id))) covered.add(landId);
    }
    return covered;
  }

  /**
   * Builds one owner's settlement plan from their agreed amount.
   *
   * Reuses `planLandInstallments` rather than growing a second planner: an
   * owner's settlement has exactly the shape a land purchase has — bayna, some
   * monthly instalments, a balance at registration — because it *is* a land
   * purchase, from one of several sellers.
   *
   * Idempotent like the others: lines get re-dated by hand when an owner asks
   * for a month's grace, and regenerating would throw that away silently.
   */
  async generateForMapping(
    mappingId: string,
    terms: Omit<LandPaymentTerms, 'totalAmount'>,
    createdBy: string | null = null,
  ): Promise<PaymentSchedule | undefined> {
    const existing = await this.forMapping(mappingId);
    if (existing) return existing;

    const mapping = await db.land_owner_mapping.get(mappingId);
    if (!mapping) return undefined;

    const total = money(Number(mapping.agreed_amount) || 0);
    if (!(total > 0)) return undefined;

    const planned = planLandInstallments({ ...terms, totalAmount: total });
    if (planned.length === 0) return undefined;

    const schedule = await this.create(
      { entity_type: 'land_owner', entity_id: mappingId, total_amount: total },
      createdBy,
    );

    for (const line of planned) {
      await db.payment_installments.add({
        id: crypto.randomUUID(),
        schedule_id: schedule.id,
        installment_no: line.installment_no,
        label: line.label,
        due_date: line.due_date,
        amount_due: line.amount_due,
        amount_paid: 0,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: createdBy,
      } as PaymentInstallment);
    }

    await recalculateForOwner(mappingId);
    return schedule;
  }

  async removeForMapping(mappingId: string): Promise<void> {
    const schedule = await this.forMapping(mappingId);
    if (!schedule) return;
    const lines = await db.payment_installments.where('schedule_id').equals(schedule.id).toArray();
    await db.payment_installments.bulkDelete(lines.map((l) => l.id));
    await db.payment_schedules.delete(schedule.id);
  }

  /** Called when a land is deleted — its owners' plans go with it. */
  async removeForLand(landId: string): Promise<void> {
    const mappings = await db.land_owner_mapping.where('land_id').equals(landId).toArray();
    for (const m of mappings) await this.removeForMapping(m.id);
  }

  /**
   * Where every owner of one land stands (BRD LAND-002, ACQ-003).
   *
   * Read rather than stored, from three sources that already exist: the agreed
   * amount on the mapping, the expenses that name the owner, and their own
   * schedule if they have one. Nothing here is a new number anybody types.
   */
  async positionForLand(landId: string): Promise<LandSettlementPosition> {
    const [land, mappings, expenses] = await Promise.all([
      db.lands.get(landId),
      db.land_owner_mapping.where('land_id').equals(landId).toArray(),
      db.expenses.where('land_id').equals(landId).toArray(),
    ]);

    const landPayments = expenses.filter(isLandPayment);
    const today = todayLocal();

    const owners: OwnerSettlement[] = [];
    for (const mapping of mappings) {
      const [owner, schedule] = await Promise.all([
        db.landowners.get(mapping.owner_id),
        this.forMapping(mapping.id),
      ]);
      const payments = landPayments
        .filter((e) => e.owner_mapping_id === mapping.id)
        .sort((a, b) => a.expense_date.localeCompare(b.expense_date));
      const paid = money(payments.reduce((s, e) => s + (Number(e.amount) || 0), 0));
      const agreed = money(Number(mapping.agreed_amount) || 0);
      const installments = schedule
        ? await db.payment_installments.where('schedule_id').equals(schedule.id).sortBy('installment_no')
        : [];

      owners.push({
        mapping,
        owner,
        agreed,
        paid,
        outstanding: money(Math.max(0, agreed - paid)),
        schedule,
        installments,
        summary: schedule ? summariseSchedule(installments, today) : null,
        payments,
      });
    }

    const agreedTotal = money(owners.reduce((s, o) => s + o.agreed, 0));
    const paidTotal = money(owners.reduce((s, o) => s + o.paid, 0));
    const landAgreed = money(Number(land?.final_agreed_amount) || 0);
    const unattributed = money(
      landPayments
        .filter((e) => !e.owner_mapping_id)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    );

    return {
      owners,
      agreedTotal,
      paidTotal,
      outstandingTotal: money(owners.reduce((s, o) => s + o.outstanding, 0)),
      landAgreed,
      /*
       * Only a mismatch worth reporting when every owner has an agreed amount.
       * A land where two of three owners have been settled on is mid-work, not
       * wrong, and flagging it red would train people to ignore the flag.
       */
      mismatch:
        owners.length > 0 &&
        owners.every((o) => o.agreed > 0) &&
        landAgreed > 0 &&
        Math.abs(agreedTotal - landAgreed) > 0.01,
      unattributed,
      scheduledCount: owners.filter((o) => o.schedule).length,
    };
  }
}

/**
 * Re-applies one owner's payments to their instalments.
 *
 * The same waterfall the land and booking schedules use — a payment naming an
 * instalment lands on it, everything else fills oldest-first — run over only
 * the expenses that name this owner.
 */
export async function recalculateForOwner(mappingId: string): Promise<void> {
  const schedule = await ownerSettlementRepository.forMapping(mappingId);
  if (!schedule) return;

  const mapping = await db.land_owner_mapping.get(mappingId);
  if (!mapping) return;

  const [installments, expenses] = await Promise.all([
    db.payment_installments.where('schedule_id').equals(schedule.id).sortBy('installment_no'),
    db.expenses.where('land_id').equals(mapping.land_id).toArray(),
  ]);

  const mine = expenses
    .filter((e) => isLandPayment(e) && e.owner_mapping_id === mappingId)
    .sort(
      (a, b) =>
        a.expense_date.localeCompare(b.expense_date) || a.created_at.localeCompare(b.created_at),
    );

  const { filled } = allocatePayments(
    installments,
    mine.map((e) => ({ amount: Number(e.amount) || 0, installment_id: e.installment_id ?? null })),
  );

  for (const line of installments) {
    const paid = money(filled.get(line.id) ?? 0);
    const status = settledStatus(line.amount_due, paid);
    if (Math.abs(paid - (Number(line.amount_paid) || 0)) > 0.005 || status !== line.status) {
      await db.payment_installments.update(line.id, {
        amount_paid: paid,
        status,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

/** Every owner plan on a land — after an expense that named one is saved. */
export async function recalculateOwnersForLand(landId: string): Promise<void> {
  const mappings = await db.land_owner_mapping.where('land_id').equals(landId).toArray();
  for (const m of mappings) await recalculateForOwner(m.id);
}

export const ownerSettlementRepository = new OwnerSettlementRepository();
