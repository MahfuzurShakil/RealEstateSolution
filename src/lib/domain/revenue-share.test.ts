import { describe, expect, it } from 'vitest';
import {
  addMonths,
  canWithdraw,
  eligibilityFactor,
  periodAt,
  periodsThrough,
  splitDeclared,
  workOutStatement,
  type StatementInput,
} from './revenue-share';

const policy = {
  reserve_pct: 10,
  loss_rule: 'recover_first' as const,
  mgmt_fee_type: 'none' as const,
  mgmt_fee_value: 0,
  repay_loans_first: true,
};

describe('Revenue periods', () => {
  it('follows the distribution frequency from the first start', () => {
    const q = { distribution_frequency: 'quarterly' as const, first_period_start: '2026-01-01' };
    expect(periodAt(q, 0)).toMatchObject({ start: '2026-01-01', end: '2026-03-31', label: 'Q1 2026' });
    expect(periodAt(q, 3)).toMatchObject({ start: '2026-10-01', end: '2026-12-31', label: 'Q4 2026' });
    expect(periodsThrough(q, '2026-11-04').map((p) => p.label)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026']);
  });

  it('names periods that do not start on a calendar boundary by their months', () => {
    const m = { distribution_frequency: 'quarterly' as const, first_period_start: '2026-02-01' };
    expect(periodAt(m, 0)).toMatchObject({ end: '2026-04-30', label: 'Feb–Apr 2026' });
    expect(periodAt(m, 3).label).toBe('Nov 2026 – Jan 2027');
  });

  it('clamps month ends', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
});

describe('Period statement (plan §2.3 and §12)', () => {
  const run = (o: Partial<StatementInput>) =>
    workOutStatement({ income: 0, cost: 0, loss_brought_in: 0, loan_principal_due: 0, ...policy, ...o });

  it('Q1: reserve on profit, then the loan principal due', () => {
    const s = run({ income: 5_000_000, cost: 3_200_000, loan_principal_due: 300_000 });
    expect(s.operating_profit).toBe(1_800_000);
    expect(s.reserve).toBe(180_000);
    expect(s.loan_principal_due).toBe(300_000);
    expect(s.available).toBe(1_320_000);
    expect(s.loss_carried_out).toBe(0);
  });

  it('Q2: a loss shares nothing and is carried forward', () => {
    const s = run({ income: 3_000_000, cost: 3_600_000 });
    expect(s.available).toBe(0);
    expect(s.reserve).toBe(0);
    expect(s.loss_carried_out).toBe(600_000);
  });

  it('Q3: past loss is recovered before reserve and loans', () => {
    const s = run({ income: 4_000_000, cost: 3_000_000, loss_brought_in: 600_000, loan_principal_due: 200_000 });
    expect(s.after_loss).toBe(400_000);
    expect(s.reserve).toBe(40_000);
    expect(s.available).toBe(160_000);
  });

  it('a profit smaller than the past loss reduces the loss', () => {
    const s = run({ income: 1_000_000, cost: 800_000, loss_brought_in: 600_000 });
    expect(s.available).toBe(0);
    expect(s.loss_carried_out).toBe(400_000);
  });

  it('"ignore" neither recovers nor carries a loss', () => {
    expect(run({ income: 100, cost: 500, loss_rule: 'ignore' }).loss_carried_out).toBe(0);
    expect(run({ income: 1_000, cost: 0, loss_brought_in: 900, loss_rule: 'ignore', reserve_pct: 0 }).available).toBe(1_000);
  });

  it('the fee and the loans never take more than is left', () => {
    const s = run({ income: 1_000_000, cost: 900_000, mgmt_fee_type: 'fixed', mgmt_fee_value: 80_000, loan_principal_due: 500_000 });
    expect(s.reserve).toBe(10_000);
    expect(s.mgmt_fee).toBe(80_000);
    expect(s.loan_principal_due).toBe(10_000);
    expect(s.available).toBe(0);
  });

  it('loans are not deducted when the policy does not repay them first', () => {
    expect(run({ income: 1_000, cost: 0, reserve_pct: 0, loan_principal_due: 500, repay_loans_first: false }).available).toBe(1_000);
  });
});

describe('Eligibility', () => {
  const q = ['2026-07-01', '2026-09-30'] as const;
  const full = { paid: 100, price: 100, held_from: '2026-01-10' };
  const half = { paid: 50, price: 100, held_from: '2026-01-10' };

  it('reads what is paid as the policy says', () => {
    expect(eligibilityFactor('fully_paid', false, half, ...q)).toBe(0);
    expect(eligibilityFactor('fully_paid', false, full, ...q)).toBe(1);
    expect(eligibilityFactor('pro_rata_paid', false, half, ...q)).toBe(0.5);
    expect(eligibilityFactor('all_signed', false, half, ...q)).toBe(1);
  });

  it('counts days held when signed inside the period', () => {
    // 92-day quarter, signed on day 47 → 46 days held
    const f = eligibilityFactor('all_signed', true, { ...full, held_from: '2026-08-16' }, ...q);
    expect(f).toBeCloseTo(46 / 92, 5);
    expect(eligibilityFactor('all_signed', false, { ...full, held_from: '2026-08-16' }, ...q)).toBe(1);
    expect(eligibilityFactor('all_signed', true, { ...full, held_from: '2026-10-01' }, ...q)).toBe(0);
  });
});

describe('Splitting a declared amount (plan §12)', () => {
  it('pays every share the same rate; unclaimed parts go to the owners', () => {
    const lines = splitDeclared(
      1_320_000,
      [
        { key: 'A', ownership_pct: 0.1, factor: 1 },
        { key: 'B', ownership_pct: 0.2, factor: 0.5 },
      ],
      [
        { key: 'Karim', share_pct: 50 },
        { key: 'Rahim', share_pct: 30 },
        { key: 'Selina', share_pct: 20 },
      ],
      10,
    );
    const by = new Map(lines.map((l) => [l.key, l]));
    expect(by.get('A')).toMatchObject({ gross: 1_320, tax: 132, net: 1_188 });
    expect(by.get('B')).toMatchObject({ gross: 1_320, tax: 132, net: 1_188 });
    expect(lines.reduce((s, l) => s + l.gross, 0)).toBe(1_320_000);
    expect(by.get('Karim')!.gross).toBe(658_680);
  });

  it('always adds up to the declared amount despite rounding', () => {
    const lines = splitDeclared(1_001, [{ key: 'c', ownership_pct: 33.333, factor: 1 }], [
      { key: 'x', share_pct: 1 },
      { key: 'y', share_pct: 1 },
      { key: 'z', share_pct: 1 },
    ], 0);
    expect(lines.reduce((s, l) => s + l.gross, 0)).toBe(1_001);
  });
});

describe('Withdrawal window', () => {
  const p = { min_withdrawal: 5_000, withdrawal_window: 'anytime' as const, withdrawal_window_days: 0 };
  it('needs the minimum', () => {
    expect(canWithdraw(p, 1_332, null, '2026-11-04')).toEqual({ ok: false, reason: 'Tk 3,668 more to reach the minimum.' });
    expect(canWithdraw(p, 5_000, null, '2026-11-04').ok).toBe(true);
  });
  it('honours the window', () => {
    const after = { ...p, withdrawal_window: 'after_declare' as const, withdrawal_window_days: 15 };
    expect(canWithdraw(after, 9_000, '2026-10-25', '2026-11-04').ok).toBe(true);
    expect(canWithdraw(after, 9_000, '2026-10-01', '2026-11-04').ok).toBe(false);
    const day = { ...p, withdrawal_window: 'day_of_month' as const, withdrawal_window_days: 4 };
    expect(canWithdraw(day, 9_000, null, '2026-11-04').ok).toBe(true);
    expect(canWithdraw(day, 9_000, null, '2026-11-05').ok).toBe(false);
  });
});
