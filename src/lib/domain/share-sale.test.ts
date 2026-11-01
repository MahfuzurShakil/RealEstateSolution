import { describe, expect, it } from 'vitest';
import type { ShareInstallment, SharePayment, ShareSale } from '../db/types';
import { allocateSharePayment, buildSchedule, closesOn, offeringMath, viewSale } from './share-sale';

const base = { created_at: '', updated_at: '', created_by: null };

describe('Share offering math', () => {
  it('values the project as NAV + premium and prices one share from it (plan §2)', () => {
    const m = offeringMath({ net_asset_value: 900_000_000, premium_value: 300_000_000, offered_pct: 50, total_shares: 500 });
    expect(m.valuation).toBe(1_200_000_000);
    expect(m.share_pct).toBeCloseTo(0.1);
    expect(m.price_per_share).toBe(1_200_000);
    expect(m.raise).toBe(600_000_000);
    expect(m.premium_pct).toBeCloseTo(33.333, 2);
  });

  it('counts the opening day in the validity', () => {
    expect(closesOn('2026-11-01', 1)).toBe('2026-11-01');
    expect(closesOn('2026-11-01', 90)).toBe('2027-01-29');
  });
});

describe('Share purchase schedule and payments', () => {
  const sale: ShareSale = {
    ...base,
    id: 's1',
    code: 'SHR-2026-001',
    offering_id: 'o1',
    project_id: 'p1',
    customer_id: 'c1',
    shares: 5,
    share_pct: 0.5,
    price_per_share: 1_000_000,
    total_price: 5_000_000,
    down_payment: 1_000_000,
    installment_count: 20,
    installment_frequency: 'monthly',
    reserved_on: '2026-06-01',
    hold_until: '2026-06-08',
    agreement_date: '2026-06-05',
    first_due_date: '2026-07-05',
    status: 'agreement_signed',
  };
  const rows = buildSchedule({ ...sale, agreement_date: '2026-06-05', first_due_date: '2026-07-05' });
  const inst: ShareInstallment[] = rows.map((r) => ({ ...base, ...r, id: `i${r.seq}`, sale_id: 's1' }));
  const paid = (seqs: number[]): SharePayment[] =>
    seqs.map((q) => ({
      ...base,
      id: `p${q}`,
      code: `SRC-${q}`,
      sale_id: 's1',
      paid_on: inst[q].due_date,
      amount: inst[q].amount,
      principal: inst[q].amount,
      late_fee: 0,
      method: 'bank_transfer',
      allocations: [{ installment_id: inst[q].id, principal: inst[q].amount, late_fee: 0 }],
    }));

  it('writes a down payment and 20 monthly installments of ৳2 lakh (plan §7)', () => {
    expect(rows).toHaveLength(21);
    expect(rows[0]).toEqual({ seq: 0, due_date: '2026-06-05', amount: 1_000_000 });
    expect(rows[1].amount).toBe(200_000);
    expect(rows[20].due_date).toBe('2028-02-05');
    expect(rows.reduce((t, r) => t + r.amount, 0)).toBe(5_000_000);
  });

  it('charges 2% after 7 days and applies a payment to the fee first', () => {
    const v = viewSale(sale, inst, paid([0, 1, 2, 3]), '2026-10-20', { late_fee_pct: 2, grace_days: 7 });
    expect(v.health).toBe('overdue');
    expect(v.overdue_amount).toBe(200_000);
    expect(v.late_fees).toBe(4_000);
    expect(v.due_now).toBe(204_000);
    expect(allocateSharePayment(v, 104_000)).toEqual([{ installment_id: 'i4', principal: 100_000, late_fee: 4_000 }]);
  });

  it('is on track inside the grace days', () => {
    const v = viewSale(sale, inst, paid([0, 1, 2, 3]), '2026-10-10', { late_fee_pct: 2, grace_days: 7 });
    expect(v.late_fees).toBe(0);
    expect(v.health).toBe('overdue');
    expect(v.progress_pct).toBe(32);
  });
});
