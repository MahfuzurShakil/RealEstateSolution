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
import { LAND_LINKED_COST_CATEGORIES } from '../db/types';
import {
  installmentStatus,
  money,
  daysOverdue,
  outstandingOn,
  planInstallments,
  settledStatus,
  summariseSchedule,
  type ProjectFinanceSummary,
  type ScheduleSummary,
} from '../domain/finance';
import {
  allocateOldestFirst,
  planLandInstallments,
  type LandPaymentTerms,
} from '../domain/land-schedule';
import { nextCode } from '../utils/id';
import { todayLocal } from '../utils/format';
import { BaseRepository, type NewRecord, type UpdateRecord } from './base.repository';
import { documentRepository } from './document.repository';
import { paymentRepository } from './payment.repository';

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

export interface ScheduleWithInstallments extends PaymentSchedule {
  installments: PaymentInstallment[];
  summary: ScheduleSummary;
  /** money received that the schedule could not absorb — an advance */
  unallocated: number;
  /**
   * True when the booking has been repriced since the schedule was generated.
   * The schedule is a snapshot (Section 8.2), so it is never silently rebuilt
   * — Accounts is shown the gap and decides.
   */
  stale_total: boolean;
  booking_total: number;
}

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

  async forBooking(bookingId: string): Promise<PaymentSchedule | undefined> {
    const rows = await db.payment_schedules
      .where('[entity_type+entity_id]')
      .equals(['booking', bookingId])
      .toArray();
    return rows[0];
  }

  /**
   * Builds the schedule for a confirmed booking (Section 8.2).
   *
   * Idempotent: a booking that already has one keeps it, because the lines may
   * have been edited by hand since ("this buyer pays the milestone in March")
   * and regenerating would quietly throw that away. `regenerate()` is the
   * deliberate way to rebuild.
   */
  async generateForBooking(
    bookingId: string,
    createdBy: string | null = null,
  ): Promise<PaymentSchedule | undefined> {
    const existing = await this.forBooking(bookingId);
    if (existing) return existing;

    const booking = await db.bookings.get(bookingId);
    if (!booking) return undefined;

    const unit = await db.units.get(booking.unit_id);
    const tower = unit ? await db.towers.get(unit.tower_id) : undefined;
    if (!tower) return undefined;

    const template = (await db.installment_plan_templates
      .where('project_id')
      .equals(tower.project_id)
      .toArray()) as Array<{
      sequence_no: number;
      label: string;
      percentage: number;
      schedule_type: 'on_booking' | 'monthly' | 'on_handover' | 'manual';
      month_count?: number | null;
    }>;
    // a project with no plan gets no schedule rather than a made-up one
    if (template.length === 0) return undefined;

    const schedule = await this.create(
      {
        entity_type: 'booking',
        entity_id: bookingId,
        total_amount: money(booking.final_price),
      },
      createdBy,
    );

    const planned = planInstallments(template, {
      totalAmount: booking.final_price,
      bookingDate: booking.booking_date,
      tenureMonths: booking.installment_tenure_months,
      // the money actually agreed with this buyer beats the template's
      // percentage, so confirming does not invent an arrear on day one
      bookingAmount: booking.booking_amount,
    });

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

    // money already taken at booking time now finds its place on the schedule
    await recalculateForBooking(bookingId);
    return schedule;
  }

  /** Throws the schedule away and builds it again from the current price. */
  async regenerate(bookingId: string, createdBy: string | null = null): Promise<PaymentSchedule | undefined> {
    await this.removeForBooking(bookingId);
    return this.generateForBooking(bookingId, createdBy);
  }

  /** `null` when there is no schedule — distinct from a pending read. */
  async withInstallments(bookingId: string): Promise<ScheduleWithInstallments | null> {
    const schedule = await this.forBooking(bookingId);
    if (!schedule) return null;

    const [installments, booking, payments] = await Promise.all([
      paymentInstallmentRepository.listForSchedule(schedule.id),
      db.bookings.get(bookingId),
      paymentRepository.listForBooking(bookingId),
    ]);

    const today = todayLocal();
    const received = money(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
    const allocated = money(installments.reduce((sum, i) => sum + (Number(i.amount_paid) || 0), 0));

    return {
      ...schedule,
      installments,
      summary: summariseSchedule(installments, today),
      unallocated: money(Math.max(0, received - allocated)),
      booking_total: money(booking?.final_price ?? schedule.total_amount),
      stale_total: Boolean(booking) && Math.abs(booking!.final_price - schedule.total_amount) > 0.009,
    };
  }

  /* --- Land purchase schedules (Tier 3.4, Section 8.2) --- */

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

  async removeForBooking(bookingId: string): Promise<void> {
    const schedule = await this.forBooking(bookingId);
    if (!schedule) return;
    const lines = await paymentInstallmentRepository.listForSchedule(schedule.id);
    await db.payment_installments.bulkDelete(lines.map((l) => l.id));
    // the receipts stay; they just stop pointing at a line that is gone
    const payments = await paymentRepository.listForBooking(bookingId);
    for (const payment of payments) {
      if (payment.installment_id) await paymentRepository.update(payment.id, { installment_id: null });
    }
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
     * Which recalculation depends on what the schedule is for. Before Tier 3.4
     * this called `recalculateForBooking` with whatever `entity_id` held, which
     * was always a booking id. A land id passed to it would have found no
     * booking schedule and returned quietly — harmless, and wrong in the way
     * that only shows up much later.
     */
    const schedule = await db.payment_schedules.get(line.schedule_id);
    if (schedule?.entity_type === 'booking') {
      await recalculateForBooking(schedule.entity_id, createdBy);
    } else if (schedule?.entity_type === 'land') {
      await recalculateForLand(schedule.entity_id, createdBy);
    }
    return updated;
  }
}

/**
 * Spreads what the buyer has actually paid across the schedule, oldest
 * instalment first, and writes each line's `amount_paid` and money status.
 *
 * Why a waterfall rather than "one receipt belongs to one instalment":
 *
 * A receipt is a physical event — a cheque, a bKash transfer — and splitting
 * one in half to make it fit two instalment lines would be inventing a
 * transaction that never happened. But buyers do pay in lumps that clear three
 * monthlies at once, and they pay the booking money *before* the schedule
 * exists at all (Module 4 takes it at `hold`, and the schedule is only built
 * at `confirmed`). Both of those are normal, and both break a strict
 * one-receipt-one-line rule.
 *
 * So the receipts stay whole and the ledger allocates them in order.
 * `payments.installment_id` records the line a receipt *started* filling,
 * which is what a receipt is asked to show ("this was your booking money"),
 * and the overflow runs on to the next line. Nothing is stored twice:
 * `amount_paid` is always recomputed from the receipts, so the two can never
 * drift apart.
 *
 * Money left over once every line is full stays unallocated and is reported as
 * an advance rather than being forced onto a line that did not ask for it.
 */
export async function recalculateForBooking(
  bookingId: string,
  createdBy: string | null = null,
): Promise<void> {
  void createdBy;
  const schedule = await paymentScheduleRepository.forBooking(bookingId);
  if (!schedule) return;

  const installments = await paymentInstallmentRepository.listForSchedule(schedule.id);
  const payments = (await paymentRepository.listForBooking(bookingId)).sort(
    (a, b) => a.payment_date.localeCompare(b.payment_date) || a.created_at.localeCompare(b.created_at),
  );

  const filled = new Map<string, number>(installments.map((line) => [line.id, 0]));
  const startedAt = new Map<string, string | null>();

  let cursor = 0;
  for (const payment of payments) {
    let remaining = Number(payment.amount) || 0;
    let firstTouched: string | null = null;

    while (remaining > 0.005 && cursor < installments.length) {
      const line = installments[cursor];
      const room = (Number(line.amount_due) || 0) - (filled.get(line.id) ?? 0);
      if (room <= 0.005) {
        cursor += 1;
        continue;
      }
      const take = Math.min(remaining, room);
      filled.set(line.id, money((filled.get(line.id) ?? 0) + take));
      firstTouched ??= line.id;
      remaining = money(remaining - take);
      if (take >= room - 0.005) cursor += 1;
    }

    startedAt.set(payment.id, firstTouched);
  }

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

  for (const payment of payments) {
    const target = startedAt.get(payment.id) ?? null;
    if ((payment.installment_id ?? null) !== target) {
      await db.payments.update(payment.id, {
        installment_id: target,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * The collections queue (Section 8.2 / 8.3 dashboard)
 * ------------------------------------------------------------------ */

export interface CollectionRow {
  /** the instalment's own id, so the shared DataTable can key on the row */
  id: string;
  installment: PaymentInstallment;
  /** overdue layered on at read time — see the note on the type */
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue';
  outstanding: number;
  booking: Booking;
  customer?: Customer;
  unit?: Unit;
  project?: Project;
}

export interface CollectionFilters {
  search?: string;
  project_id?: string;
  status?: 'all' | 'pending' | 'partially_paid' | 'paid' | 'overdue';
  /** the collections desk's actual worklist */
  due_only?: boolean;
}

class CollectionRepository {
  /**
   * Every instalment across every live booking, with what it is for.
   *
   * Cancelled bookings are left out: chasing a buyer for an instalment on a
   * booking that no longer exists is exactly the mistake this list should
   * prevent. Their money is still visible through the refund screen.
   */
  async list(filters: CollectionFilters = {}, today = todayLocal()): Promise<CollectionRow[]> {
    const [schedules, installments, bookings, customers, units, towers, projects] =
      await Promise.all([
        db.payment_schedules.toArray(),
        db.payment_installments.toArray(),
        db.bookings.toArray(),
        db.customers.toArray(),
        db.units.toArray(),
        db.towers.toArray(),
        db.projects.toArray(),
      ]);

    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const unitById = new Map(units.map((u) => [u.id, u]));
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    /*
     * Buyer schedules only (Tier 3.4). Since land schedules exist, this table
     * holds two kinds of instalment and this queue means exactly one of them:
     * what a *buyer* still owes us. A land instalment is money we owe an owner,
     * and it has no customer to chase.
     *
     * Filtering on `entity_type` rather than relying on the booking join below
     * to drop them. The join does drop them today, but only as a side effect of
     * a land id never matching a booking id — an invariant nothing states and
     * nothing protects.
     */
    const bookingByScheduleId = new Map(
      schedules
        .filter((s) => s.entity_type === 'booking')
        .map((s) => [s.id, bookingById.get(s.entity_id)]),
    );

    let rows: CollectionRow[] = [];
    for (const line of installments) {
      const booking = bookingByScheduleId.get(line.schedule_id);
      if (!booking || booking.status === 'cancelled') continue;

      const unit = unitById.get(booking.unit_id);
      const tower = unit ? towerById.get(unit.tower_id) : undefined;

      rows.push({
        id: line.id,
        installment: line,
        status: installmentStatus(line, today),
        outstanding: outstandingOn(line),
        booking,
        customer: customerById.get(booking.customer_id),
        unit,
        project: tower ? projectById.get(tower.project_id) : undefined,
      });
    }

    if (filters.due_only) rows = rows.filter((r) => r.status !== 'paid');
    if (filters.status && filters.status !== 'all') {
      rows = rows.filter((r) => r.status === filters.status);
    }
    if (filters.project_id) rows = rows.filter((r) => r.project?.id === filters.project_id);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [
          r.booking.code,
          r.customer?.name,
          r.customer?.phone,
          r.unit?.code,
          r.project?.name,
          r.installment.label,
        ]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    /*
     * Overdue first, then by due date. A collections list read top-down should
     * be the order somebody works through it, and an undated `manual` line is
     * nobody's problem today — so it sits at the bottom rather than sorting as
     * an empty string at the top.
     */
    const rank = (r: CollectionRow) => (r.status === 'overdue' ? 0 : r.status === 'paid' ? 2 : 1);
    return rows.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.installment.due_date ?? '9999').localeCompare(b.installment.due_date ?? '9999') ||
        a.installment.installment_no - b.installment.installment_no,
    );
  }

  /** Headline numbers for the collections page. */
  async summary(today = todayLocal()): Promise<{
    billed: number;
    collected: number;
    outstanding: number;
    overdue_amount: number;
    overdue_count: number;
    due_this_month: number;
  }> {
    const rows = await this.list({}, today);
    const monthEnd = `${today.slice(0, 7)}-31`;

    let billed = 0;
    let collected = 0;
    let overdue = 0;
    let overdueCount = 0;
    let dueThisMonth = 0;

    for (const row of rows) {
      billed += Number(row.installment.amount_due) || 0;
      collected += Number(row.installment.amount_paid) || 0;
      if (row.status === 'overdue') {
        overdue += row.outstanding;
        overdueCount += 1;
      } else if (
        row.status !== 'paid' &&
        row.installment.due_date &&
        row.installment.due_date <= monthEnd
      ) {
        dueThisMonth += row.outstanding;
      }
    }

    return {
      billed: money(billed),
      collected: money(collected),
      outstanding: money(Math.max(0, billed - collected)),
      overdue_amount: money(overdue),
      overdue_count: overdueCount,
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
 * Unlike the booking side nothing is written back to the source row. A payment
 * carries `installment_id` so a receipt can say which instalment it was for;
 * an expense has no such column, needs none, and adding one would be a schema
 * change for a line of provenance nobody prints.
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
  const { filled } = allocateOldestFirst(
    installments,
    paidRows.map((e) => Number(e.amount) || 0),
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
    for (const landId of affected) await recalculateForLand(landId, createdBy);
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
    if (before?.land_id) await recalculateForLand(before.land_id);
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
      schedules,
      installments,
      refunds,
      expenses,
      vouchers,
      payments,
    ] = await Promise.all([
      db.projects.toArray(),
      db.towers.toArray(),
      db.units.toArray(),
      db.bookings.toArray(),
      db.payment_schedules.toArray(),
      db.payment_installments.toArray(),
      db.refunds.toArray(),
      db.expenses.toArray(),
      db.supplier_vouchers.toArray(),
      db.payments.toArray(),
    ]);

    const towerProject = new Map(towers.map((t) => [t.id, t.project_id]));
    const unitById = new Map(units.map((u) => [u.id, u]));
    const projectOfBooking = (booking: Booking): string | undefined => {
      const unit = unitById.get(booking.unit_id);
      return unit ? towerProject.get(unit.tower_id) : undefined;
    };
    const isCompanySale = (booking: Booking): boolean =>
      unitById.get(booking.unit_id)?.for_sale_by === 'company';

    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    // buyer schedules only — see the note in `collectionRepository.list`
    const scheduleBooking = new Map(
      schedules.filter((s) => s.entity_type === 'booking').map((s) => [s.id, s.entity_id]),
    );
    const installmentsBySchedule = new Map<string, typeof installments>();
    for (const line of installments) {
      const list = installmentsBySchedule.get(line.schedule_id);
      if (list) list.push(line);
      else installmentsBySchedule.set(line.schedule_id, [line]);
    }

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
     * bank. The instalments are used for the overdue cut, which is the one
     * thing receipts cannot answer.
     */
    for (const payment of payments) {
      const booking = bookingById.get(payment.booking_id);
      if (!booking || booking.status === 'cancelled' || !isCompanySale(booking)) continue;
      const row = byId.get(projectOfBooking(booking) ?? '');
      if (!row) continue;
      row.collected = money(row.collected + (Number(payment.amount) || 0));
    }

    for (const [scheduleId, lines] of installmentsBySchedule) {
      const booking = bookingById.get(scheduleBooking.get(scheduleId) ?? '');
      if (!booking || booking.status === 'cancelled' || !isCompanySale(booking)) continue;
      const row = byId.get(projectOfBooking(booking) ?? '');
      if (!row) continue;
      for (const line of lines) {
        if (installmentStatus(line, today) !== 'overdue') continue;
        row.overdue_amount = money(row.overdue_amount + outstandingOn(line));
        row.overdue_count += 1;
      }
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
      const row = byId.get(expense.project_id);
      if (!row) continue;
      row.cost_expenses = money(row.cost_expenses + (Number(expense.amount) || 0));
    }

    for (const voucher of vouchers) {
      if (!voucher.project_id) continue;
      const row = byId.get(voucher.project_id);
      if (!row) continue;
      row.cost_procurement = money(row.cost_procurement + (Number(voucher.amount) || 0));
    }

    for (const row of byId.values()) {
      row.due = money(Math.max(0, row.sales_value - row.collected));
      row.total_cost = money(row.cost_expenses + row.cost_procurement);
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
    const [expenses, vouchers] = await Promise.all([
      db.expenses.toArray(),
      db.supplier_vouchers.toArray(),
    ]);

    const unallocated = money(
      expenses.filter((e) => !e.project_id).reduce((s, e) => s + (Number(e.amount) || 0), 0) +
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

  /** One project's figures, for the project detail page. */
  async forProject(projectId: string, today = todayLocal()): Promise<ProjectFinanceSummary | null> {
    const rows = await this.byProject(today);
    return rows.find((r) => r.project_id === projectId) ?? null;
  }
}

export const paymentScheduleRepository = new PaymentScheduleRepository();
export const paymentInstallmentRepository = new PaymentInstallmentRepository();
export const collectionRepository = new CollectionRepository();
export const refundRepository = new RefundRepository();
export const expenseRepository = new ExpenseRepository();
export const financeDashboardRepository = new FinanceDashboardRepository();

export type { Payment };
