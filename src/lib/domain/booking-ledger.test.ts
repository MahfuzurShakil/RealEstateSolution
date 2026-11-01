import { describe, expect, it } from 'vitest';
import type { Booking, BookingInstallment, Payment } from '../db/types';
import { allocateBookingPayments, bookingFeeRule, bookingScheduleRows, paidOffOn, principalOf, viewBookingLedger } from './booking';
import { allocatePayment, replayPayments, viewInstallments } from './installment-ledger';

/*
 * BUYER-PORTAL-PLAN.md §2 — a booking's money runs on the same ledger as a
 * Share Sale purchase. These pin the rules both now share.
 */

const terms = {
  booking_date: '2026-01-10',
  final_price: 1_000_000,
  booking_amount: 200_000,
  payment_mode: 'installment' as const,
  full_payment_due_date: null,
  installment_count: 3,
  installment_amount: null,
  first_installment_date: '2026-02-10',
};

function rows(): BookingInstallment[] {
  return bookingScheduleRows(terms).map((r) => ({ ...r, id: `r${r.seq}`, booking_id: 'b1', created_at: '', updated_at: '', created_by: null }));
}

function pay(id: string, payment_date: string, amount: number): Payment {
  return { id, booking_id: 'b1', amount, payment_date, payment_method: 'bank', created_at: `${payment_date}T10:00:00Z`, updated_at: '', created_by: null };
}

describe('booking schedule', () => {
  it('is the booking money, then the balance split evenly with the last row closing the price', () => {
    expect(bookingScheduleRows(terms).map((r) => [r.kind, r.label, r.due_date, r.amount])).toEqual([
      ['booking_money', 'Booking money', '2026-01-10', 200_000],
      ['installment', 'Installment 1 of 3', '2026-02-10', 266_667],
      ['installment', 'Installment 2 of 3', '2026-03-10', 266_667],
      ['installment', 'Installment 3 of 3', '2026-04-10', 266_666],
    ]);
  });

  it('is one balance row when the agreement says full payment', () => {
    const full = { ...terms, payment_mode: 'full' as const, full_payment_due_date: '2026-06-30', installment_count: null };
    expect(bookingScheduleRows(full).map((r) => [r.kind, r.amount])).toEqual([
      ['booking_money', 200_000],
      ['full_balance', 800_000],
    ]);
  });

  it('is only the booking money before an agreement is recorded', () => {
    expect(bookingScheduleRows({ ...terms, payment_mode: null }).map((r) => r.kind)).toEqual(['booking_money']);
  });
});

describe('shared ledger', () => {
  it('takes the late fee first, then the oldest row', () => {
    const rule = { late_fee_pct: 2, grace_days: 5 };
    const view = viewInstallments(rows(), [{ paid_on: '2026-01-10', allocations: [{ installment_id: 'r0', principal: 200_000, late_fee: 0 }] }], '2026-02-20', rule);
    expect(view[1].status).toBe('overdue');
    expect(view[1].late_fee_due).toBe(5_333);
    expect(allocatePayment(view, 100_000)).toEqual([{ installment_id: 'r1', principal: 94_667, late_fee: 5_333 }]);
  });

  it('never charges a late fee on the booking money', () => {
    const late = { ...terms, id: 'b1', late_fee_pct: 2, late_fee_grace_days: 0 } as unknown as Booking;
    const applied = allocateBookingPayments(rows(), [pay('p1', '2026-02-01', 200_000)], bookingFeeRule(late));
    expect(applied.get('p1')).toEqual({ allocations: [{ installment_id: 'r0', principal: 200_000, late_fee: 0 }], principal: 200_000, late_fee: 0 });
  });

  it('charges no fee inside the grace days', () => {
    const view = viewInstallments(rows(), [], '2026-02-13', { late_fee_pct: 2, grace_days: 5 });
    expect(view[1].late_fee_due).toBe(0);
  });

  it('re-applies receipts as of their own dates, and keeps money beyond the rows unallocated', () => {
    const applied = replayPayments(rows(), [
      { id: 'p1', paid_on: '2026-01-10', amount: 200_000 },
      { id: 'p2', paid_on: '2026-03-01', amount: 300_000 },
      { id: 'p3', paid_on: '2026-03-02', amount: 600_000 },
    ], { late_fee_pct: 2, grace_days: 5 });
    // p2 is 19 days late on installment 1: its fee comes off first
    expect(applied.get('p2')!.late_fee).toBe(5_333);
    expect(applied.get('p2')!.allocations[0]).toEqual({ installment_id: 'r1', principal: 266_667, late_fee: 5_333 });
    // p3 clears the rest; anything over the price has no row to go to
    expect(applied.get('p3')!.principal).toBe(533_333 - 28_000);
  });
});

describe('booking ledger view', () => {
  const booking = { ...terms, id: 'b1', status: 'confirmed', late_fee_pct: null } as unknown as Booking;

  it('counts a receipt toward the price less any late fee it paid', () => {
    expect(principalOf({ amount: 105_000, late_fee: 5_000 })).toBe(100_000);
    expect(principalOf({ amount: 100_000 })).toBe(100_000);
  });

  it('shows what is paid, overdue and next', () => {
    const r = rows();
    const payments = [pay('p1', '2026-01-10', 200_000), pay('p2', '2026-02-10', 100_000)];
    const applied = allocateBookingPayments(r, payments, { late_fee_pct: 0, grace_days: 0 });
    const withAlloc = payments.map((p) => ({ ...p, ...applied.get(p.id)! }));
    const v = viewBookingLedger(booking, r, withAlloc, '2026-03-15');
    expect(v.paid).toBe(300_000);
    expect(v.outstanding).toBe(700_000);
    expect(v.overdue_count).toBe(2);
    expect(v.overdue_amount).toBe(166_667 + 266_667);
    expect(v.next?.label).toBe('Installment 1 of 3');
  });

  it('knows the day the price was fully paid', () => {
    const payments = [pay('p1', '2026-01-10', 200_000), pay('p2', '2026-05-01', 800_000)];
    expect(paidOffOn(booking, payments)).toBe('2026-05-01');
    expect(paidOffOn(booking, payments.slice(0, 1))).toBeNull();
  });
});
