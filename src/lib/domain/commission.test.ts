import { describe, expect, it } from 'vitest';
import type { CommissionPlan, CommissionStage, OrgMember, OrgMove } from '../db/types';
import {
  buildLines,
  chainOn,
  nextPlainCode,
  parentOn,
  payoutMath,
  planForSale,
  planProblem,
  stageAmounts,
  stageReachedOn,
  wouldLoop,
  type SaleProgress,
} from './commission';

const base = { created_at: '2026-01-01T00:00:00Z', updated_at: '', created_by: null };

const member = (id: string, designation_id: string, parent_id: string | null, joined_on = '2025-01-01'): OrgMember => ({
  ...base,
  id,
  code: id,
  name: id,
  designation_id,
  parent_id,
  joined_on,
  status: 'active',
});

// REVENUE-SHARE-PLAN.md §12: Tania under Team Lead Imran under founder Karim
const karim = member('karim', 'founder', null);
const imran = member('imran', 'lead', 'karim');
const tania = member('tania', 'exec', 'imran');
const members = [karim, imran, tania];
const label = (id: string) => ({ founder: 'Founder', lead: 'Team Lead', exec: 'Sales Executive' })[id] ?? id;

const STAGES: CommissionStage[] = [
  { key: 's1', label: 'Agreement + down payment', trigger: 'agreement_down_payment', release_type: 'pct', release_value: 20 },
  { key: 's2', label: '50% paid', trigger: 'paid_pct', threshold_pct: 50, release_type: 'pct', release_value: 30 },
  { key: 's3', label: 'Fully paid', trigger: 'fully_paid', release_type: 'pct', release_value: 50 },
];

const plan = (over: Partial<CommissionPlan> = {}): CommissionPlan => ({
  ...base,
  id: 'p1',
  code: 'CMP-001',
  name: 'Share sales',
  applies_to: 'share_sale',
  project_id: null,
  offering_id: null,
  seller_basis: 'pct',
  seller_value: 10,
  stages: STAGES,
  overrides: [
    { designation_id: 'lead', basis: 'pct', value: 1 },
    { designation_id: 'founder', basis: 'pct', value: 0.5 },
  ],
  cancel_rule: 'recover',
  effective_from: '2026-01-01',
  effective_to: null,
  status: 'active',
  ...over,
});

describe('the tree on a date', () => {
  const moves: OrgMove[] = [{ ...base, id: 'm1', member_id: 'tania', from_parent_id: 'rahim', to_parent_id: 'imran', effective_date: '2026-06-01' }];

  it('reads the parent from the moves, not from today', () => {
    expect(parentOn(tania, moves, '2026-05-31')).toBe('rahim');
    expect(parentOn(tania, moves, '2026-06-01')).toBe('imran');
    expect(parentOn(imran, moves, '2026-01-01')).toBe('karim');
  });

  it('walks the chain up from the seller, nearest first', () => {
    expect(chainOn('tania', members, [], '2026-07-01').map((m) => m.id)).toEqual(['tania', 'imran', 'karim']);
  });

  it('stops on a loop and refuses a move under one’s own team', () => {
    const loop = [member('a', 'x', 'b'), member('b', 'x', 'a')];
    expect(chainOn('a', loop, [], '2026-01-01').map((m) => m.id)).toEqual(['a', 'b']);
    expect(wouldLoop('imran', 'tania', members)).toBe(true);
    expect(wouldLoop('tania', 'karim', members)).toBe(false);
  });
});

describe('the commission on a sale (plan §12)', () => {
  const sale = { amount: 1_000_000, units: 10, date: '2026-03-01' };

  it('gives Tania 10%, Imran 1% and Karim 0.5%, released 20/30/50', () => {
    const lines = buildLines(plan(), chainOn('tania', members, [], sale.date), sale, label);
    const of = (id: string) => lines.filter((l) => l.member_id === id).map((l) => l.amount);
    expect(of('tania')).toEqual([20_000, 30_000, 50_000]);
    expect(of('imran')).toEqual([2_000, 3_000, 5_000]);
    expect(of('karim')).toEqual([1_000, 1_500, 2_500]);
    expect(lines.find((l) => l.member_id === 'imran')?.designation_at_sale).toBe('Team Lead');
    expect(lines.filter((l) => l.role === 'seller')).toHaveLength(3);
  });

  it('pays Tk 100 a share released Tk 20 / 30 / 50 when fixed', () => {
    const fixed = plan({
      seller_basis: 'per_share',
      seller_value: 100,
      overrides: [],
      stages: STAGES.map((s, i) => ({ ...s, release_type: 'fixed', release_value: [20, 30, 50][i] })),
    });
    expect(buildLines(fixed, [tania], sale, label).map((l) => l.amount)).toEqual([200, 300, 500]);
  });

  it('gives the rounding to the last stage so the parts add up', () => {
    expect(stageAmounts(100, [STAGES[0], { ...STAGES[1], release_value: 33.333 }, STAGES[2]], { sellerTotal: 100, units: 1, perShare: false })).toEqual([20, 33.33, 46.67]);
  });

  it('skips an upline with no override, and one who had left by the sale day', () => {
    const gone = { ...karim, left_on: '2026-02-01' };
    const lines = buildLines(plan({ overrides: [{ designation_id: 'founder', basis: 'pct', value: 0.5 }] }), [tania, imran, gone], sale, label);
    expect(new Set(lines.map((l) => l.member_id))).toEqual(new Set(['tania']));
  });
});

describe('when a stage is reached', () => {
  const progress: SaleProgress = {
    price: 1_000_000,
    agreement_on: '2026-03-05',
    down_payment: 200_000,
    payments: [
      { date: '2026-03-01', amount: 200_000 },
      { date: '2026-04-01', amount: 300_000 },
      { date: '2026-05-01', amount: 500_000 },
    ],
    handover_on: null,
  };

  it('reads each trigger from the payments', () => {
    expect(stageReachedOn({ trigger: 'down_payment' }, progress)).toBe('2026-03-01');
    expect(stageReachedOn({ trigger: 'agreement_down_payment' }, progress)).toBe('2026-03-05');
    expect(stageReachedOn({ trigger: 'paid_pct', threshold_pct: 50 }, progress)).toBe('2026-04-01');
    expect(stageReachedOn({ trigger: 'fully_paid' }, progress)).toBe('2026-05-01');
    expect(stageReachedOn({ trigger: 'handover' }, progress)).toBeNull();
  });

  it('is not reached while the money is short', () => {
    const short = { ...progress, payments: progress.payments.slice(0, 1) };
    expect(stageReachedOn({ trigger: 'paid_pct', threshold_pct: 50 }, short)).toBeNull();
    expect(stageReachedOn({ trigger: 'agreement_down_payment' }, { ...short, agreement_on: null })).toBeNull();
  });
});

describe('plans', () => {
  it('picks the most specific plan in force on the sale day', () => {
    const all = [plan(), plan({ id: 'proj', project_id: 'x' }), plan({ id: 'old', project_id: 'x', effective_to: '2025-12-31', effective_from: '2025-01-01' }), plan({ id: 'draft', offering_id: 'o', status: 'draft' })];
    expect(planForSale(all, { kind: 'share', project_id: 'x', offering_id: 'o', date: '2026-03-01' })?.id).toBe('proj');
    expect(planForSale(all, { kind: 'share', project_id: 'y', date: '2026-03-01' })?.id).toBe('p1');
    expect(planForSale(all, { kind: 'booking', project_id: 'x', date: '2026-03-01' })).toBeNull();
    expect(planForSale(all, { kind: 'share', project_id: 'x', date: '2025-06-01' })?.id).toBe('old');
    expect(planForSale(all, { kind: 'share', project_id: 'x', date: '2024-06-01' })).toBeNull();
  });

  it('refuses % stages that do not add up to 100', () => {
    expect(planProblem(plan())).toBeNull();
    expect(planProblem(plan({ stages: STAGES.slice(0, 2) }))).toMatch(/100%/);
    expect(planProblem(plan({ stages: [{ ...STAGES[1], threshold_pct: null }] }))).toMatch(/% of the price/);
  });
});

describe('payouts', () => {
  it('takes back recovered commission before tax, never more than the lines', () => {
    expect(payoutMath(160_000, 144_000, 10)).toEqual({ lines_total: 160_000, recovered: 144_000, tax_withheld: 1_600, net: 14_400 });
    expect(payoutMath(10_000, 50_000, 10).recovered).toBe(10_000);
  });

  it('numbers codes without a year', () => {
    expect(nextPlainCode('ORG', ['ORG-001', 'ORG-009', 'CMP-020'])).toBe('ORG-010');
    expect(nextPlainCode('CMP', [])).toBe('CMP-001');
  });
});
