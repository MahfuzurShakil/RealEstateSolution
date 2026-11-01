'use client';

import { db } from '../db/database';
import type { BookingInstallment } from '../db/types';
import {
  allocateBookingPayments,
  bookingFeeRule,
  bookingScheduleRows,
  paidOffOn,
  viewBookingLedger,
  type BookingLedgerView,
} from '../domain/booking';
import { newId } from '../utils/id';
import { todayLocal } from '../utils/format';

/**
 * A booking's schedule and what each receipt paid (BUYER-PORTAL-PLAN.md §2).
 *
 * `sync` is the one writer: it rebuilds the rows from the booking's money and
 * agreement terms when they no longer match, then re-applies every receipt
 * through the shared ledger. The booking repository calls it whenever the
 * price, the agreement or the money changes, so nothing else writes these
 * rows or a receipt's allocations.
 */
export const bookingLedgerRepository = {
  async rows(bookingId: string): Promise<BookingInstallment[]> {
    const rows = await db.booking_installments.where('booking_id').equals(bookingId).toArray();
    return rows.sort((a, b) => a.seq - b.seq);
  },

  async sync(bookingId: string, createdBy: string | null = null): Promise<void> {
    const booking = await db.bookings.get(bookingId);
    if (!booking) return;
    const ts = new Date().toISOString();
    let rows = await this.rows(bookingId);
    const wanted = bookingScheduleRows(booking);
    const same =
      rows.length === wanted.length &&
      rows.every((r, i) => {
        const w = wanted[i];
        return r.seq === w.seq && r.kind === w.kind && r.label === w.label && r.due_date === w.due_date && r.amount === w.amount;
      });

    const payments = await db.payments.where('booking_id').equals(bookingId).toArray();
    await db.transaction('rw', db.booking_installments, db.payments, db.bookings, async () => {
      if (!same) {
        await db.booking_installments.where('booking_id').equals(bookingId).delete();
        rows = wanted.map((w) => ({ ...w, id: newId(), booking_id: bookingId, created_at: ts, updated_at: ts, created_by: createdBy }));
        await db.booking_installments.bulkAdd(rows);
      }
      const applied = allocateBookingPayments(rows, payments, bookingFeeRule(booking));
      for (const p of payments) {
        const a = applied.get(p.id);
        if (!a) continue;
        if (JSON.stringify(p.allocations ?? []) === JSON.stringify(a.allocations) && (p.late_fee ?? 0) === a.late_fee && p.principal === a.principal) continue;
        await db.payments.update(p.id, { allocations: a.allocations, principal: a.principal, late_fee: a.late_fee, updated_at: ts });
        Object.assign(p, a);
      }
      const paidOff = paidOffOn(booking, payments);
      if ((booking.fully_paid_on ?? null) !== paidOff) await db.bookings.update(bookingId, { fully_paid_on: paidOff, updated_at: ts });
    });
  },

  async removeForBooking(bookingId: string): Promise<void> {
    await db.booking_installments.where('booking_id').equals(bookingId).delete();
  },

  async view(bookingId: string, today = todayLocal()): Promise<BookingLedgerView | null> {
    const booking = await db.bookings.get(bookingId);
    if (!booking) return null;
    const [rows, payments] = await Promise.all([
      this.rows(bookingId),
      db.payments.where('booking_id').equals(bookingId).toArray(),
    ]);
    return viewBookingLedger(booking, rows, payments, today);
  },

  /** Every live booking's ledger at once, for Collections and the dashboards. */
  async viewAll(today = todayLocal()): Promise<Map<string, BookingLedgerView>> {
    const [bookings, rows, payments] = await Promise.all([
      db.bookings.toArray(),
      db.booking_installments.toArray(),
      db.payments.toArray(),
    ]);
    const out = new Map<string, BookingLedgerView>();
    for (const b of bookings) {
      out.set(
        b.id,
        viewBookingLedger(
          b,
          rows.filter((r) => r.booking_id === b.id),
          payments.filter((p) => p.booking_id === b.id),
          today,
        ),
      );
    }
    return out;
  },
};
