'use client';

import { db } from '../db/database';
import type {
  Booking,
  CostCategory,
  Customer,
  Expense,
  Land,
  Payment,
  PaymentInstallment,
  PaymentSchedule,
  Project,
  Refund,
  SupplierPaymentMethod,
  Unit,
} from '../db/types';
import { LAND_LINKED_COST_CATEGORIES, PROCUREMENT_BUDGET_HEAD } from '../db/types';
import {
  money,
  daysOverdue,
  outstandingOn,
  settledStatus,
  summariseSchedule,
  type ProjectFinanceSummary,
} from '../domain/finance';
import {
  allocatePayments,
  planLandInstallments,
  type LandPaymentTerms,
} from '../domain/land-schedule';
import { buyerLedger } from '../domain/booking';
import { nextCode } from '../utils/id';
import { todayLocal } from '../utils/format';
import { BaseRepository, type NewRecord, type UpdateRecord } from './base.repository';
import { documentRepository } from './document.repository';
import { recalculateOwnersForLand } from './owner-settlement.repository';
import { paymentRepository } from './payment.repository';
import { landAcquisitionCostRepository } from './negotiation.repository';

/*
 * Direction of dependency, as in the other cross-module repositories:
 * booking → finance, never the other way. This file reads `db.bookings`,
 * `db.units` and `db.projects` directly rather than importing the repositories
 * that own them, because Module 4 has to call in here when a booking is
 * confirmed and two repositories importing each other is a cycle.
 */

/* ------------------------------------------------------------------ *
 * Payment schedule + instalments (Section 8.2)
 * ------------------------------------------------------------------ */

/** A land's agreed plan, read alongside what the ledger says has been paid. */
export interface LandScheduleWithInstallments extends PaymentSchedule {
  installments: PaymentInstallment[];
  summary: ReturnType<typeof summariseSchedule>;
  /** Land payments in the ledger that no line had room for — an overpayment. */
  unallocated: number;
  /** `lands.final_agreed_amount` as it stands now. */
  agreed_total: number;
  /** The agreed amount has moved since the plan was built. */
  stale_total: boolean;
}

/**
 * The expenses that count as money paid to the owner, oldest first.
 *
 * `land_payment` only — the same split `expenseRepository.landPaymentSummary`
 * makes, and for the same reason: registration, mutation and legal fees are
 * money spent *on* the land but not money paid *for* it, so they must not
 * settle an instalment the owner is still waiting on.
 */
async function landPaymentExpenses(landId: string) {
  const rows = await db.expenses.where('land_id').equals(landId).toArray();
  return rows
    .filter((e) => e.cost_category === 'land_payment')
    .sort(
      (a, b) =>
        a.expense_date.localeCompare(b.expense_date) || a.created_at.localeCompare(b.created_at),
    );
}

class PaymentScheduleRepository extends BaseRepository<PaymentSchedule> {
  constructor() {
    super(() => db.payment_schedules);
  }

  async forLand(landId: string): Promise<PaymentSchedule | undefined> {
    const rows = await db.payment_schedules
      .where('[entity_type+entity_id]')
      .equals(['land', landId])
      .toArray();
    return rows[0];
  }

  /**
   * Builds the agreed payment plan for a land purchase.
   *
   * A land needs its own generator rather than a reuse of `generateForBooking`:
   * that one walks booking → unit → tower → the project's instalment template,
   * none of which a plot has. The terms come from the form instead, because a
   * plot is negotiated once with one owner in taka rather than in percentages
   * of a price list.
   *
   * Idempotent for the same reason a booking's is: lines get re-dated by hand
   * once the owner asks for a month's grace, and regenerating would throw that
   * away silently.
   */
  async generateForLand(
    landId: string,
    terms: Omit<LandPaymentTerms, 'totalAmount'>,
    createdBy: string | null = null,
  ): Promise<PaymentSchedule | undefined> {
    const existing = await this.forLand(landId);
    if (existing) return existing;

    const land = await db.lands.get(landId);
    if (!land) return undefined;

    /*
     * The gate is the agreed amount, not the acquisition type.
     *
     * A joint venture was refused outright, on the reading of Section 2.4 that
     * the owner is paid in units rather than taka. That is true of the *unit*
     * side and silent about the cash side, which a JV in this market normally
     * has: signing money against the agreement, and often rent for the owner
     * while the building goes up. That money moves on dates and somebody has to
     * be chased for it — refusing to schedule it did not make it not exist, it
     * made it untrackable. It is captured at the signing step and lands in
     * `final_agreed_amount`, the same field a purchase fills.
     *
     * A JV with no cash side still gets no plan, because the check below is the
     * one that matters: there is no total to divide.
     */
    const total = Number(land.final_agreed_amount) || 0;
    if (!(total > 0)) return undefined;

    const planned = planLandInstallments({ ...terms, totalAmount: total });
    // terms that do not add up to the agreement produce no lines, and a
    // schedule with no lines is worse than none at all
    if (planned.length === 0) return undefined;

    const schedule = await this.create(
      { entity_type: 'land', entity_id: landId, total_amount: money(total) },
      createdBy,
    );

    for (const line of planned) {
      await paymentInstallmentRepository.create(
        {
          schedule_id: schedule.id,
          installment_no: line.installment_no,
          label: line.label,
          due_date: line.due_date,
          amount_due: line.amount_due,
          amount_paid: 0,
          status: 'pending',
        },
        createdBy,
      );
    }

    // land payments already in the ledger find their place on the new plan
    await recalculateForLand(landId);
    return schedule;
  }

  /** `null` when this land has no agreed plan — distinct from a pending read. */
  async withInstallmentsForLand(landId: string): Promise<LandScheduleWithInstallments | null> {
    const schedule = await this.forLand(landId);
    if (!schedule) return null;

    const [installments, land, paidRows] = await Promise.all([
      paymentInstallmentRepository.listForSchedule(schedule.id),
      db.lands.get(landId),
      landPaymentExpenses(landId),
    ]);

    const today = todayLocal();
    const paid = money(paidRows.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
    const allocated = money(installments.reduce((sum, i) => sum + (Number(i.amount_paid) || 0), 0));
    const agreed = money(Number(land?.final_agreed_amount) || schedule.total_amount);

    return {
      ...schedule,
      installments,
      summary: summariseSchedule(installments, today),
      unallocated: money(Math.max(0, paid - allocated)),
      agreed_total: agreed,
      stale_total: Math.abs(agreed - schedule.total_amount) > 0.009,
    };
  }

  /**
   * What this land still owes, for the expense form (Tier 3.4 follow-up).
   *
   * `next_unsettled` is deliberately **not** `summariseSchedule.next_due`:
   * that one skips overdue lines to answer "what falls due next", which is the
   * right question on a dashboard and the wrong one at the counter. Somebody
   * about to pay an owner needs the oldest line that is still open — which is
   * usually the overdue one, and is always the line their money will actually
   * land on.
   */
  async landDueSummary(landId: string): Promise<{
    agreed_total: number;
    paid: number;
    outstanding: number;
    overdue_count: number;
    next_unsettled: {
      label: string;
      due_date: string | null;
      outstanding: number;
      days_late: number;
    } | null;
    lines: PaymentInstallment[];
  } | null> {
    const schedule = await this.forLand(landId);
    if (!schedule) return null;

    const lines = await paymentInstallmentRepository.listForSchedule(schedule.id);
    const today = todayLocal();
    const summary = summariseSchedule(lines, today);

    const open = lines.find((line) => outstandingOn(line) > 0.009) ?? null;

    return {
      agreed_total: schedule.total_amount,
      paid: summary.paid,
      outstanding: summary.due,
      overdue_count: summary.overdue_count,
      next_unsettled: open
        ? {
            label: open.label,
            due_date: open.due_date ?? null,
            outstanding: outstandingOn(open),
            days_late: daysOverdue(open, today),
          }
        : null,
      lines,
    };
  }

  async removeForLand(landId: string): Promise<void> {
    const schedule = await this.forLand(landId);
    if (!schedule) return;
    const lines = await paymentInstallmentRepository.listForSchedule(schedule.id);
    await db.payment_installments.bulkDelete(lines.map((l) => l.id));
    // the expenses stay untouched: the plan is what was agreed, and deleting it
    // does not un-spend money that has already left the account
    await this.remove(schedule.id);
  }

}

class PaymentInstallmentRepository extends BaseRepository<PaymentInstallment> {
  constructor() {
    super(() => db.payment_installments);
  }

  async listForSchedule(scheduleId: string): Promise<PaymentInstallment[]> {
    const rows = await db.payment_installments.where('schedule_id').equals(scheduleId).toArray();
    return rows.sort((a, b) => a.installment_no - b.installment_no);
  }

  /**
   * Accounts editing one line (Section 8.2 — "individually edit করা যাবে").
   * A `manual` or `on_handover` line gets its due date here; an amount can be
   * renegotiated. The allocation is re-run afterwards, because moving money
   * between lines changes what every later line has received.
   */
  async editLine(
    id: string,
    changes: { label?: string; due_date?: string | null; amount_due?: number },
    createdBy: string | null = null,
  ): Promise<PaymentInstallment | undefined> {
    const line = await this.getById(id);
    if (!line) return undefined;

    const updated = await this.update(id, {
      ...(changes.label !== undefined ? { label: changes.label.trim() } : {}),
      ...(changes.due_date !== undefined ? { due_date: changes.due_date || null } : {}),
      ...(changes.amount_due !== undefined ? { amount_due: money(changes.amount_due) } : {}),
    });

    /*
     * Only land schedules are left since v37 (buyers follow their agreement
     * instead), so a line edited here re-spreads the land's payments.
     */
    const schedule = await db.payment_schedules.get(line.schedule_id);
    if (schedule?.entity_type === 'land') {
      await recalculateForLand(schedule.entity_id, createdBy);
    }
    return updated;
  }
}

/* ------------------------------------------------------------------ *
 * The collections queue — one row per live booking (SALES-FLOW-PLAN.md S5)
 *
 * Since 2026-10-22 a buyer has no generated instalment rows. What should be in
 * by today comes from the booking's agreement terms (`buyerLedger`), worked
 * out at read time, so this list is "who owes what, and who is behind".
 * ------------------------------------------------------------------ */

export interface CollectionRow {
  /** the booking's id, so the shared DataTable can key on the row */
  id: string;
  booking: Booking;
  customer?: Customer;
  unit?: Unit;
  project?: Project;
  total: number;
  received: number;
  balance: number;
  /** what the agreement says should be in by today */
  expected: number;
  behind: number;
  due_this_month: number;
  next: { date: string; label: string; amount: number } | null;
  state: 'behind' | 'on_track' | 'paid';
}

export interface CollectionFilters {
  search?: string;
  project_id?: string;
  state?: 'all' | CollectionRow['state'];
}

class CollectionRepository {
  /**
   * Every live booking with its money. Cancelled bookings are left out:
   * chasing a buyer on a booking that no longer exists is exactly the mistake
   * this list should prevent — their money is on the refund screen.
   */
  async list(filters: CollectionFilters = {}, today = todayLocal()): Promise<CollectionRow[]> {
    const [bookings, payments, customers, units, towers, projects] = await Promise.all([
      db.bookings.toArray(),
      db.payments.toArray(),
      db.customers.toArray(),
      db.units.toArray(),
      db.towers.toArray(),
      db.projects.toArray(),
    ]);

    const paidByBooking = new Map<string, number>();
    for (const p of payments) {
      paidByBooking.set(p.booking_id, (paidByBooking.get(p.booking_id) ?? 0) + (Number(p.amount) || 0));
    }
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const unitById = new Map(units.map((u) => [u.id, u]));
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const projectById = new Map(projects.map((p) => [p.id, p]));

    let rows: CollectionRow[] = [];
    for (const booking of bookings) {
      if (booking.status === 'cancelled') continue;
      const unit = unitById.get(booking.unit_id);
      const tower = unit ? towerById.get(unit.tower_id) : undefined;
      const ledger = buyerLedger(booking, money(paidByBooking.get(booking.id) ?? 0), today);
      rows.push({
        id: booking.id,
        booking,
        customer: customerById.get(booking.customer_id),
        unit,
        project: tower ? projectById.get(tower.project_id) : undefined,
        ...ledger,
        behind: money(ledger.behind),
        state: ledger.balance <= 0.5 ? 'paid' : ledger.behind > 0.5 ? 'behind' : 'on_track',
      });
    }

    if (filters.state && filters.state !== 'all') rows = rows.filter((r) => r.state === filters.state);
    if (filters.project_id) rows = rows.filter((r) => r.project?.id === filters.project_id);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.booking.code, r.customer?.name, r.customer?.phone, r.unit?.code, r.project?.name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    // behind first (most first), then whoever is due next
    const rank = (r: CollectionRow) => (r.state === 'behind' ? 0 : r.state === 'on_track' ? 1 : 2);
    return rows.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        b.behind - a.behind ||
        (a.next?.date ?? '9999').localeCompare(b.next?.date ?? '9999'),
    );
  }

  /** Headline numbers for the collections page and the owner dashboard. */
  async summary(today = todayLocal()): Promise<{
    billed: number;
    collected: number;
    outstanding: number;
    overdue_amount: number;
    overdue_count: number;
    due_this_month: number;
  }> {
    const rows = await this.list({}, today);
    let billed = 0;
    let collected = 0;
    let behind = 0;
    let behindCount = 0;
    let dueThisMonth = 0;
    for (const row of rows) {
      billed += row.total;
      collected += row.received;
      if (row.behind > 0.5) {
        behind += row.behind;
        behindCount += 1;
      }
      dueThisMonth += row.due_this_month;
    }
    return {
      billed: money(billed),
      collected: money(collected),
      outstanding: money(Math.max(0, billed - collected)),
      overdue_amount: money(behind),
      overdue_count: behindCount,
      due_this_month: money(dueThisMonth),
    };
  }
}

/**
 * Spreads what has actually been paid to the owner across the agreed plan,
 * oldest instalment first.
 *
 * The same waterfall as `recalculateForBooking`, from the other side of the
 * business. The difference is where the money comes from: a buyer pays us and
 * it lands in `payments`, whereas we pay an owner and it leaves through the
 * expense ledger. So the source rows are `expenses` with this `land_id` and
 * category `land_payment`.
 *
 * `amount_paid` stays derived, never authoritative — recomputed from the ledger
 * every time — so the plan and the ledger cannot drift apart. That is the whole
 * argument against letting Accounts tick lines by hand: two numbers for one
 * fact disagree the first time somebody records the payment and forgets the
 * tick.
 *
 * Nothing is written back to the source row — an expense records what left the
 * account, and the plan is derived from it.
 *
 * Since v17 an expense may name the instalment it settles, and that is honoured
 * before the waterfall runs (see `allocatePayments`). The default is still
 * oldest-first, because that is what most payments are; naming a line is for
 * the case where both sides agreed the money was for a particular milestone.
 */
export async function recalculateForLand(
  landId: string,
  createdBy: string | null = null,
): Promise<void> {
  void createdBy;
  const schedule = await paymentScheduleRepository.forLand(landId);
  if (!schedule) return;

  const installments = await paymentInstallmentRepository.listForSchedule(schedule.id);
  const paidRows = await landPaymentExpenses(landId);

  // one implementation of the waterfall, shared with the expense form's preview
  const { filled } = allocatePayments(
    installments,
    paidRows.map((e) => ({
      amount: Number(e.amount) || 0,
      installment_id: e.installment_id ?? null,
    })),
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

/* ------------------------------------------------------------------ *
 * Refunds (Section 8.2)
 * ------------------------------------------------------------------ */

/** A cancelled booking with money still to give back. */
export interface RefundableBooking {
  booking: Booking;
  customer?: Customer;
  unit?: Unit;
  project?: Project;
  paid: number;
  refunded: number;
  left: number;
}

export interface RefundWithRelations extends Refund {
  booking?: Booking;
  customer?: Customer;
  unit?: Unit;
  project?: Project;
  processed_by_name?: string | null;
}

class RefundRepository extends BaseRepository<Refund> {
  constructor() {
    super(() => db.refunds);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.refunds.toArray()).map((r) => r.code);
    return nextCode('REF', codes);
  }

  /** What is left to give back on a cancelled booking. */
  async refundableFor(bookingId: string): Promise<{ paid: number; refunded: number; left: number }> {
    const [paid, refunds] = await Promise.all([
      paymentRepository.totalForBooking(bookingId),
      db.refunds.where('booking_id').equals(bookingId).toArray(),
    ]);
    const refunded = money(refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0));
    return { paid: money(paid), refunded, left: money(Math.max(0, paid - refunded)) };
  }

  /**
   * Returns money on a cancelled booking.
   *
   * Guarded against giving back more than came in: the gross `amount` is what
   * leaves the buyer's ledger, so it is that — not `net_refund` — which is
   * checked against what they paid. A cancellation charge reduces the cheque,
   * not the amount being settled.
   */
  async issue(
    input: Omit<NewRecord<Refund>, 'code' | 'net_refund'> & { code?: string },
    createdBy: string | null = null,
    /** demo history only: records that predate the fund rule */
    options: { skipFundCheck?: boolean } = {},
  ): Promise<Refund> {
    const booking = await db.bookings.get(input.booking_id);
    if (!booking) throw new Error('The booking this refund belongs to no longer exists.');
    if (booking.status !== 'cancelled') {
      throw new Error('Only a cancelled booking can be refunded — cancel it first.');
    }

    const amount = money(Number(input.amount) || 0);
    const deduction = money(Number(input.deduction) || 0);
    if (amount <= 0) throw new Error('Enter an amount greater than zero.');
    if (deduction > amount) throw new Error('The deduction cannot be more than the amount refunded.');

    const { left } = await this.refundableFor(input.booking_id);
    if (amount > left + 0.009) {
      throw new Error(
        `Only ${left.toLocaleString('en-BD')} BDT is left to refund on this booking — the rest has already been returned.`,
      );
    }

    // money handed back leaves the project's fund like any other payment (client, 2026-10-22)
    if (!options.skipFundCheck) {
      const unit = await db.units.get(booking.unit_id);
      const tower = unit ? await db.towers.get(unit.tower_id) : undefined;
      if (tower) {
        const { assertProjectCanSpend } = await import('./fund.repository');
        await assertProjectCanSpend(tower.project_id, money(amount - deduction));
      }
    }

    const code = input.code?.trim() ? input.code : await this.generateCode();
    return this.create(
      { ...input, code, amount, deduction, net_refund: money(amount - deduction) },
      createdBy,
    );
  }

  /**
   * Cancelled bookings that still have money owed back, newest cancellation
   * first.
   *
   * The Refunds page lists refunds but had no way to raise one and said
   * nothing about where one comes from, so the only route was to know that
   * you open the booking. This is what its "Record refund" button picks from;
   * `issue` still enforces the real rules.
   */
  async listRefundable(): Promise<RefundableBooking[]> {
    const [bookings, customers, units, towers, projects, payments, refunds] = await Promise.all([
      db.bookings.where('status').equals('cancelled').toArray(),
      db.customers.toArray(),
      db.units.toArray(),
      db.towers.toArray(),
      db.projects.toArray(),
      db.payments.toArray(),
      db.refunds.toArray(),
    ]);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const unitById = new Map(units.map((u) => [u.id, u]));
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const projectById = new Map(projects.map((p) => [p.id, p]));

    const paidByBooking = new Map<string, number>();
    for (const p of payments) {
      paidByBooking.set(p.booking_id, (paidByBooking.get(p.booking_id) ?? 0) + (Number(p.amount) || 0));
    }
    const refundedByBooking = new Map<string, number>();
    for (const r of refunds) {
      refundedByBooking.set(
        r.booking_id,
        (refundedByBooking.get(r.booking_id) ?? 0) + (Number(r.amount) || 0),
      );
    }

    return bookings
      .map((booking) => {
        const unit = unitById.get(booking.unit_id);
        const tower = unit ? towerById.get(unit.tower_id) : undefined;
        const paid = money(paidByBooking.get(booking.id) ?? 0);
        const refunded = money(refundedByBooking.get(booking.id) ?? 0);
        return {
          booking,
          customer: customerById.get(booking.customer_id),
          unit,
          project: tower ? projectById.get(tower.project_id) : undefined,
          paid,
          refunded,
          left: money(Math.max(0, paid - refunded)),
        };
      })
      .filter((row) => row.left > 0.009)
      .sort((a, b) => b.booking.updated_at.localeCompare(a.booking.updated_at));
  }

  async list(filters: { search?: string; project_id?: string } = {}): Promise<RefundWithRelations[]> {
    const [refunds, bookings, customers, units, towers, projects, users] = await Promise.all([
      db.refunds.toArray(),
      db.bookings.toArray(),
      db.customers.toArray(),
      db.units.toArray(),
      db.towers.toArray(),
      db.projects.toArray(),
      db.users.toArray(),
    ]);
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const unitById = new Map(units.map((u) => [u.id, u]));
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let rows: RefundWithRelations[] = refunds.map((refund) => {
      const booking = bookingById.get(refund.booking_id);
      const unit = booking ? unitById.get(booking.unit_id) : undefined;
      const tower = unit ? towerById.get(unit.tower_id) : undefined;
      return {
        ...refund,
        booking,
        customer: booking ? customerById.get(booking.customer_id) : undefined,
        unit,
        project: tower ? projectById.get(tower.project_id) : undefined,
        processed_by_name: refund.processed_by
          ? (userById.get(refund.processed_by)?.name ?? null)
          : null,
      };
    });

    if (filters.project_id) rows = rows.filter((r) => r.project?.id === filters.project_id);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.code, r.reference_no, r.notes, r.booking?.code, r.customer?.name, r.project?.name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort(
      (a, b) => b.refund_date.localeCompare(a.refund_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  async listForBooking(bookingId: string): Promise<Refund[]> {
    const rows = await db.refunds.where('booking_id').equals(bookingId).toArray();
    return rows.sort((a, b) => b.refund_date.localeCompare(a.refund_date));
  }

  async removeCascade(id: string): Promise<void> {
    await documentRepository.removeForEntity('refund', id);
    await this.remove(id);
  }
}

/* ------------------------------------------------------------------ *
 * Expense ledger (Section 8.3)
 * ------------------------------------------------------------------ */

export interface ExpenseFilters {
  search?: string;
  /** '' = everything, 'company' = the ones with no project */
  project_id?: string;
  /** costs booked against one land record — drives the land page's link */
  land_id?: string;
  cost_category?: CostCategory | 'all';
  payment_method?: SupplierPaymentMethod | 'all';
  from_date?: string;
  to_date?: string;
}

export interface ExpenseWithRelations extends Expense {
  project?: Project;
  land?: Land;
  paid_by_name?: string | null;
}

/**
 * A cost only carries a plot when its category says it is land money.
 *
 * Enforced here as well as on the form, because this is the layer Phase B
 * keeps: a `land_id` left over from a category the user changed their mind
 * about would be counted by `landPaymentSummary` as a cost against that plot,
 * and no screen would show anything odd. The two land categories are system
 * options for exactly this reason — `land_extra_cost` is where registration,
 * mutation and legal fees go, so land fees are not stranded by the rule.
 */
function landIdForCategory(
  costCategory: string | undefined,
  landId: string | null | undefined,
): string | null {
  if (!costCategory) return landId ?? null;
  return (LAND_LINKED_COST_CATEGORIES as readonly string[]).includes(costCategory)
    ? (landId ?? null)
    : null;
}

class ExpenseRepository extends BaseRepository<Expense> {
  constructor() {
    super(() => db.expenses);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.expenses.toArray()).map((e) => e.code);
    return nextCode('EXP', codes);
  }

  async createExpense(
    input: Omit<NewRecord<Expense>, 'code'> & { code?: string },
    createdBy: string | null = null,
  ): Promise<Expense> {
    const amount = money(Number(input.amount) || 0);
    if (amount <= 0) throw new Error('Enter an amount greater than zero.');
    if (!input.cost_reason?.trim()) throw new Error('Say what the cost was for.');

    const code = input.code?.trim() ? input.code : await this.generateCode();
    const created = await this.create(
      {
        ...input,
        code,
        amount,
        cost_reason: input.cost_reason.trim(),
        paid_to: input.paid_to.trim(),
        land_id: landIdForCategory(input.cost_category, input.land_id),
      },
      createdBy,
    );
    // a payment to the owner settles the next instalment on the agreed plan
    await recalculateForLand(created.land_id ?? '');
    // batch L5 — an owner's own plan moves on the same event
    if (created.land_id) await recalculateOwnersForLand(created.land_id);
    return created;
  }

  /**
   * Edits a cost and re-settles whatever plan it affects (Tier 3.4).
   *
   * Both sides have to be recalculated, because an edit can *move* money: a
   * cost re-pointed from one land to another, or switched out of
   * `land_payment` into a fee, has to stop settling the plan it used to settle
   * as well as start settling the one it now does. Doing only the new side
   * would leave the old land showing an instalment paid by a cost that is no
   * longer against it.
   */
  async updateExpense(
    id: string,
    changes: UpdateRecord<Expense>,
    createdBy: string | null = null,
  ): Promise<Expense | undefined> {
    const before = await this.getById(id);
    /*
     * The category being written, or the one already stored when the edit does
     * not touch it — a change to either side can strand a `land_id`.
     */
    const category = changes.cost_category ?? before?.cost_category;
    const landId =
      changes.land_id !== undefined || changes.cost_category !== undefined
        ? landIdForCategory(category, changes.land_id ?? before?.land_id)
        : undefined;
    const updated = await this.update(id, {
      ...changes,
      ...(landId !== undefined ? { land_id: landId } : {}),
    });
    const affected = new Set(
      [before?.land_id, updated?.land_id].filter((v): v is string => Boolean(v)),
    );
    for (const landId of affected) {
      await recalculateForLand(landId, createdBy);
      await recalculateOwnersForLand(landId);
    }
    return updated;
  }

  /**
   * What has actually been paid against one land record.
   *
   * The land page showed `final_agreed_amount` and a sentence saying payments
   * are "tracked in the Finance module", with no figure and no link — while
   * EXP rows worth tens of millions sat in the ledger against that exact land.
   * Finding them meant going to Expenses and searching by hand.
   *
   * This is the paid side only. A land payment *schedule* — what is due, and
   * when — is Tier 3.4, and until it exists there is no agreed instalment plan
   * to compare against; `balance` here is simply the agreed amount less what
   * has gone out. `land_payment` is separated from the rest because
   * registration, mutation and legal fees are money spent on the land but not
   * money paid to the owner.
   */
  async landPaymentSummary(
    landId: string,
  ): Promise<{ paid: number; land_payment: number; other: number; count: number }> {
    const rows = await db.expenses.where('land_id').equals(landId).toArray();
    let landPayment = 0;
    let other = 0;
    for (const row of rows) {
      const amount = Number(row.amount) || 0;
      if (row.cost_category === 'land_payment') landPayment += amount;
      else other += amount;
    }
    return {
      paid: money(landPayment + other),
      land_payment: money(landPayment),
      other: money(other),
      count: rows.length,
    };
  }

  async list(filters: ExpenseFilters = {}): Promise<ExpenseWithRelations[]> {
    const [expenses, projects, lands, users] = await Promise.all([
      db.expenses.toArray(),
      db.projects.toArray(),
      db.lands.toArray(),
      db.users.toArray(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const landById = new Map(lands.map((l) => [l.id, l]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let rows: ExpenseWithRelations[] = expenses.map((expense) => ({
      ...expense,
      project: expense.project_id ? projectById.get(expense.project_id) : undefined,
      land: expense.land_id ? landById.get(expense.land_id) : undefined,
      paid_by_name: expense.paid_by ? (userById.get(expense.paid_by)?.name ?? null) : null,
    }));

    if (filters.project_id) {
      rows =
        filters.project_id === 'company'
          ? rows.filter((r) => !r.project_id)
          : rows.filter((r) => r.project_id === filters.project_id);
    }
    if (filters.land_id) rows = rows.filter((r) => r.land_id === filters.land_id);
    if (filters.cost_category && filters.cost_category !== 'all') {
      rows = rows.filter((r) => r.cost_category === filters.cost_category);
    }
    if (filters.payment_method && filters.payment_method !== 'all') {
      rows = rows.filter((r) => r.payment_method === filters.payment_method);
    }
    if (filters.from_date) rows = rows.filter((r) => r.expense_date >= filters.from_date!);
    if (filters.to_date) rows = rows.filter((r) => r.expense_date <= filters.to_date!);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.code, r.cost_reason, r.paid_to, r.reference_no, r.notes, r.project?.name, r.land?.name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort(
      (a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  /** `null` when the expense is gone — distinct from a pending read. */
  async getWithRelations(id: string): Promise<ExpenseWithRelations | null> {
    const expense = await this.getById(id);
    if (!expense) return null;
    const rows = await this.list();
    return rows.find((r) => r.id === id) ?? null;
  }

  async totalsByCategory(projectId?: string): Promise<Record<string, number>> {
    const rows = await db.expenses.toArray();
    return rows
      .filter((r) => !projectId || r.project_id === projectId)
      .reduce<Record<string, number>>((acc, r) => {
        acc[r.cost_category] = money((acc[r.cost_category] ?? 0) + (Number(r.amount) || 0));
        return acc;
      }, {});
  }

  async removeCascade(id: string): Promise<void> {
    const before = await this.getById(id);
    await documentRepository.removeForEntity('expense', id);
    await this.remove(id);
    // deleting the payment un-settles the instalment it was covering
    if (before?.land_id) {
      await recalculateForLand(before.land_id);
      await recalculateOwnersForLand(before.land_id);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Management dashboard (Section 8.3)
 * ------------------------------------------------------------------ */

class FinanceDashboardRepository {
  /**
   * The per-project P&L of Section 8.3.
   *
   * The `unit.for_sale_by = 'company'` filter is the gap fix recorded there: a
   * landowner's own flat can carry a booking so the inventory stays honest,
   * but that money never reaches the company, and counting it inflated
   * revenue. Cost has no such filter — building the landowner's flat costs the
   * developer exactly as much as building its own.
   */
  async byProject(today = todayLocal()): Promise<ProjectFinanceSummary[]> {
    const [
      projects,
      towers,
      units,
      bookings,
      refunds,
      expenses,
      payments,
      landMappings,
      landCash,
    ] = await Promise.all([
      db.projects.toArray(),
      db.towers.toArray(),
      db.units.toArray(),
      db.bookings.toArray(),
      db.refunds.toArray(),
      db.expenses.toArray(),
      db.payments.toArray(),
      db.land_project_mapping.toArray(),
      landAcquisitionCostRepository.cashActualByLand(),
    ]);

    // v29 — lands under a project are costed through the land, once
    const projectsPerLand = new Map<string, number>();
    for (const m of landMappings) {
      projectsPerLand.set(m.land_id, (projectsPerLand.get(m.land_id) ?? 0) + 1);
    }

    const towerProject = new Map(towers.map((t) => [t.id, t.project_id]));
    const unitById = new Map(units.map((u) => [u.id, u]));
    const projectOfBooking = (booking: Booking): string | undefined => {
      const unit = unitById.get(booking.unit_id);
      return unit ? towerProject.get(unit.tower_id) : undefined;
    };
    const isCompanySale = (booking: Booking): boolean =>
      unitById.get(booking.unit_id)?.for_sale_by === 'company';

    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const blank = (project: Project): ProjectFinanceSummary => ({
      project_id: project.id,
      project_name: project.name,
      project_code: project.code,
      sales_value: 0,
      collected: 0,
      refunded: 0,
      due: 0,
      cost_expenses: 0,
      cost_procurement: 0,
      cost_land: 0,
      total_cost: 0,
      estimated_profit: 0,
      overdue_amount: 0,
      overdue_count: 0,
      booking_count: 0,
    });
    const byId = new Map(projects.map((p) => [p.id, blank(p)]));

    for (const booking of bookings) {
      if (booking.status === 'cancelled') continue;
      if (!isCompanySale(booking)) continue;
      const row = byId.get(projectOfBooking(booking) ?? '');
      if (!row) continue;
      row.sales_value = money(row.sales_value + (Number(booking.final_price) || 0));
      row.booking_count += 1;
    }

    /*
     * Collected is read from the receipts rather than from the instalment
     * lines: money taken before a booking was confirmed has no schedule to sit
     * on yet, and leaving it out would under-report what is actually in the
     * bank. Overdue is how far each buyer is behind their agreement.
     */
    for (const payment of payments) {
      const booking = bookingById.get(payment.booking_id);
      if (!booking || booking.status === 'cancelled' || !isCompanySale(booking)) continue;
      const row = byId.get(projectOfBooking(booking) ?? '');
      if (!row) continue;
      row.collected = money(row.collected + (Number(payment.amount) || 0));
    }

    const paidByBooking = new Map<string, number>();
    for (const p of payments) {
      paidByBooking.set(p.booking_id, (paidByBooking.get(p.booking_id) ?? 0) + (Number(p.amount) || 0));
    }
    for (const booking of bookings) {
      if (booking.status === 'cancelled' || !isCompanySale(booking)) continue;
      const row = byId.get(projectOfBooking(booking) ?? '');
      if (!row) continue;
      const { behind } = buyerLedger(booking, paidByBooking.get(booking.id) ?? 0, today);
      if (behind <= 0.5) continue;
      row.overdue_amount = money(row.overdue_amount + behind);
      row.overdue_count += 1;
    }

    for (const refund of refunds) {
      const booking = bookingById.get(refund.booking_id);
      if (!booking) continue;
      const row = byId.get(projectOfBooking(booking) ?? '');
      if (!row) continue;
      row.refunded = money(row.refunded + (Number(refund.net_refund) || 0));
    }

    for (const expense of expenses) {
      if (!expense.project_id) continue;
      // a linked land's money is in `cost_land` below — counting it here too would double it
      if (expense.land_id && projectsPerLand.has(expense.land_id)) continue;
      const row = byId.get(expense.project_id);
      if (!row) continue;
      row.cost_expenses = money(row.cost_expenses + (Number(expense.amount) || 0));
    }

    /*
     * Material is project cost once it reaches the site (client decision
     * 2026-10-11), at order prices, plus what was transferred in from the
     * central store less what left. Paying the supplier is money out, not a
     * second cost; supplier vouchers are shown as payments on the project's
     * finance page. Loaded lazily: procurement's repository sits downstream.
     */
    const { procurementCostRepository } = await import('./procurement.repository');
    for (const row of byId.values()) {
      const m = await procurementCostRepository.forProject(row.project_id);
      row.cost_procurement = money(m.received_value + m.transferred_in_value - m.transferred_out_value);
    }

    // QA audit P-02 — a land-share project keeps the cost of the land it sold
    const { landProjectMappingRepository } = await import('./project.repository');
    const landCostHolder = await landProjectMappingRepository.costHolderResolver();
    for (const m of landMappings) {
      const row = byId.get(landCostHolder(m.project_id));
      if (!row) continue;
      const share = (landCash.get(m.land_id) ?? 0) / (projectsPerLand.get(m.land_id) ?? 1);
      row.cost_land = money(row.cost_land + share);
    }

    for (const row of byId.values()) {
      row.due = money(Math.max(0, row.sales_value - row.collected));
      row.total_cost = money(row.cost_expenses + row.cost_procurement + row.cost_land);
      row.estimated_profit = money(row.sales_value - row.total_cost);
    }

    return [...byId.values()].sort((a, b) => b.sales_value - a.sales_value);
  }

  /** Company-wide totals, plus the costs that belong to no single project. */
  async company(today = todayLocal()): Promise<{
    projects: ProjectFinanceSummary[];
    sales_value: number;
    collected: number;
    refunded: number;
    due: number;
    total_cost: number;
    estimated_profit: number;
    overdue_amount: number;
    overdue_count: number;
    /** expenses and central-store purchases with no project_id */
    unallocated_cost: number;
  }> {
    const projects = await this.byProject(today);
    const [expenses, vouchers, landMappings] = await Promise.all([
      db.expenses.toArray(),
      db.supplier_vouchers.toArray(),
      db.land_project_mapping.toArray(),
    ]);
    /*
     * v29 — money on a land that a project stands on is already in that
     * project's `cost_land` (development and historic cost included), so it is
     * not unallocated even when the expense names no project.
     */
    const linkedLands = new Set(landMappings.map((m) => m.land_id));

    const unallocated = money(
      expenses
        .filter((e) => !e.project_id && !(e.land_id && linkedLands.has(e.land_id)))
        .reduce((s, e) => s + (Number(e.amount) || 0), 0) +
        vouchers.filter((v) => !v.project_id).reduce((s, v) => s + (Number(v.amount) || 0), 0),
    );

    const sum = (pick: (row: ProjectFinanceSummary) => number) =>
      money(projects.reduce((acc, row) => acc + pick(row), 0));

    const salesValue = sum((r) => r.sales_value);
    const totalCost = money(sum((r) => r.total_cost) + unallocated);

    return {
      projects,
      sales_value: salesValue,
      collected: sum((r) => r.collected),
      refunded: sum((r) => r.refunded),
      due: sum((r) => r.due),
      total_cost: totalCost,
      estimated_profit: money(salesValue - totalCost),
      overdue_amount: sum((r) => r.overdue_amount),
      overdue_count: projects.reduce((acc, r) => acc + r.overdue_count, 0),
      unallocated_cost: unallocated,
    };
  }

  /**
   * Money paid out against a project (client feedback 2026-10-11): expenses
   * filed to it and supplier payments on its orders. Payments, not cost:
   * material became cost when it was received.
   */
  async paymentsForProject(projectId: string): Promise<ProjectPaymentRow[]> {
    const [expenses, vouchers, suppliers] = await Promise.all([
      db.expenses.where('project_id').equals(projectId).toArray(),
      db.supplier_vouchers.toArray(),
      db.suppliers.toArray(),
    ]);
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
    return [
      ...expenses.map((e) => ({
        id: e.id,
        date: e.expense_date,
        paid_to: e.paid_to,
        sector: e.cost_category,
        source: 'expense' as const,
        amount: Number(e.amount) || 0,
        link_id: e.id,
      })),
      ...vouchers
        .filter((v) => v.project_id === projectId)
        .map((v) => ({
          id: v.id,
          date: v.payment_date,
          paid_to: supplierName.get(v.supplier_id) ?? 'Supplier',
          sector: PROCUREMENT_BUDGET_HEAD,
          source: 'supplier_payment' as const,
          amount: Number(v.amount) || 0,
          link_id: v.po_id,
        })),
    ];
  }

  /** One project's figures, for the project detail page. */
  async forProject(projectId: string, today = todayLocal()): Promise<ProjectFinanceSummary | null> {
    const rows = await this.byProject(today);
    return rows.find((r) => r.project_id === projectId) ?? null;
  }
}

export interface ProjectPaymentRow {
  id: string;
  date: string;
  paid_to: string;
  /** cost category code, or the procurement head for supplier payments */
  sector: string;
  source: 'expense' | 'supplier_payment';
  amount: number;
  /** the expense id, or the purchase order the supplier was paid on */
  link_id: string;
}

export const paymentScheduleRepository = new PaymentScheduleRepository();
export const paymentInstallmentRepository = new PaymentInstallmentRepository();
export const collectionRepository = new CollectionRepository();
export const refundRepository = new RefundRepository();
export const expenseRepository = new ExpenseRepository();
export const financeDashboardRepository = new FinanceDashboardRepository();

export type { Payment };
