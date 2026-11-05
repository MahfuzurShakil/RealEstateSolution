import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/database';
import { commissionLineRepository, commissionPayoutRepository, commissionPlanRepository, syncCommissions } from './commission.repository';
import { orgMemberRepository } from './org.repository';

/*
 * The commission engine end to end against the database (REVENUE-SHARE-PLAN.md
 * §7.2): lines on the sale, stages earned from the payment ledger, approve,
 * pay with tax, cancel, and the paid part taken back from the next payout.
 */

const NOW = '2026-01-01T00:00:00.000Z';
const base = (id: string) => ({ id, created_at: NOW, updated_at: NOW, created_by: null });
// test rows carry only the columns the engine reads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (list: object[]) => list as any[];

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const sale = (id: string, total: number, status = 'agreement_signed') => ({
  ...base(id),
  code: `SHR-${id}`,
  offering_id: 'o1',
  project_id: 'p1',
  customer_id: 'c1',
  shares: 10,
  share_pct: 0.1,
  price_per_share: total / 10,
  total_price: total,
  down_payment: total * 0.2,
  installment_count: 4,
  installment_frequency: 'monthly',
  reserved_on: '2026-03-01',
  hold_until: '2026-03-08',
  agreement_date: '2026-03-01',
  status,
});
const pay = (id: string, saleId: string, on: string, amount: number) => ({ ...base(id), code: `SRC-${id}`, sale_id: saleId, paid_on: on, amount, principal: amount, late_fee: 0, method: 'cash', allocations: [] });

let ids: Record<string, string> = {};

beforeAll(async () => {
  const w = window as unknown as Record<string, unknown>;
  w.localStorage = memoryStorage();
  w.dispatchEvent = () => true;
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.lookup_values.bulkAdd(
    rows(['Founder', 'Team Lead', 'Sales Executive'].map((v, i) => ({ ...base(`d${i}`), category: 'org_designation', scope: null, value: v, is_active: true, sort_order: i + 1 }))),
  );
  await db.bank_accounts.add(rows([{ ...base('a1'), code: 'ACC-1', name: 'Bank', type: 'bank', opening_balance: 0, opening_balance_date: '2026-01-01', is_active: true }])[0]);

  const karim = await orgMemberRepository.save({ name: 'Karim', designation_id: 'd0', parent_id: null, joined_on: '2025-01-01' }, null);
  const imran = await orgMemberRepository.save({ name: 'Imran', designation_id: 'd1', parent_id: karim.id, joined_on: '2025-01-01' }, null);
  const tania = await orgMemberRepository.save({ name: 'Tania', designation_id: 'd2', parent_id: imran.id, joined_on: '2025-01-01' }, null);
  ids = { karim: karim.id, imran: imran.id, tania: tania.id };

  await commissionPlanRepository.save(
    {
      name: 'Share sales',
      applies_to: 'share_sale',
      project_id: null,
      offering_id: null,
      seller_basis: 'pct',
      seller_value: 10,
      stages: [
        { key: 's1', label: 'Agreement + down payment', trigger: 'agreement_down_payment', release_type: 'pct', release_value: 20 },
        { key: 's2', label: '50% paid', trigger: 'paid_pct', threshold_pct: 50, release_type: 'pct', release_value: 30 },
        { key: 's3', label: 'Fully paid', trigger: 'fully_paid', release_type: 'pct', release_value: 50 },
      ],
      overrides: [
        { designation_id: 'd1', basis: 'pct', value: 1 },
        { designation_id: 'd0', basis: 'pct', value: 0.5 },
      ],
      cancel_rule: 'recover',
      effective_from: '2026-01-01',
      effective_to: null,
      status: 'active',
    },
    null,
  );

  // §12: Tk 10,00,000 of shares sold by Tania; 60% paid so far. A second sale paid 20%, cancelled later.
  await db.share_sales.bulkAdd(rows([sale('s1', 1_000_000), sale('s2', 500_000)]));
  await db.share_payments.bulkAdd(rows([pay('p1', 's1', '2026-03-01', 200_000), pay('p2', 's1', '2026-04-01', 400_000), pay('p3', 's2', '2026-03-01', 100_000)]));
  await orgMemberRepository.setSoldBy('share', 's1', tania.id);
  await orgMemberRepository.setSoldBy('share', 's2', tania.id);
});

describe('commission from sale to payout', () => {
  it('creates one line per person per stage and earns what the payments reached', async () => {
    await syncCommissions();
    await syncCommissions(); // twice changes nothing
    const lines = await commissionLineRepository.forSale('share', 's1');
    expect(lines).toHaveLength(9);
    const of = (m: string) => lines.filter((l) => l.member_id === ids[m]).map((l) => [l.amount, l.status]);
    expect(of('tania')).toEqual([[20_000, 'earned'], [30_000, 'earned'], [50_000, 'pending']]);
    expect(of('imran')).toEqual([[2_000, 'earned'], [3_000, 'earned'], [5_000, 'pending']]);
    expect(of('karim')).toEqual([[1_000, 'earned'], [1_500, 'earned'], [2_500, 'pending']]);
    expect(lines.find((l) => l.member_id === ids.tania && l.stage_seq === 1)?.earned_on).toBe('2026-04-01');
  });

  it('pays approved lines with tax withheld', async () => {
    const tania = (await db.commission_lines.where('member_id').equals(ids.tania).toArray()).filter((l) => l.status === 'earned' && l.stage_seq === 0);
    await commissionLineRepository.approve(tania.map((l) => l.id), null);
    const payout = await commissionPayoutRepository.pay({ member_id: ids.tania, account_id: 'a1', paid_on: '2026-04-30', tax_pct: 10 }, null);
    expect(payout).toMatchObject({ lines_total: 30_000, recovered: 0, tax_withheld: 3_000, net: 27_000 });
    expect(payout.code).toBe('CPO-2026-001');
  });

  it('voids the unpaid part of a cancelled sale and takes the paid part back next time', async () => {
    await db.share_sales.update('s2', { status: 'cancelled' });
    await syncCommissions();
    const s2 = (await commissionLineRepository.forSale('share', 's2')).filter((l) => l.member_id === ids.tania);
    expect(s2.map((l) => [l.status, Boolean(l.to_recover)])).toEqual([['paid', true], ['void', false], ['void', false]]);

    // the full payment on the live sale earns the last stage; paying it takes the 10,000 back
    await db.share_payments.add(rows([pay('p4', 's1', '2026-05-01', 400_000)])[0]);
    await syncCommissions();
    const earned = (await db.commission_lines.where('member_id').equals(ids.tania).toArray()).filter((l) => l.status === 'earned');
    await commissionLineRepository.approve(earned.map((l) => l.id), null);
    const payout = await commissionPayoutRepository.pay({ member_id: ids.tania, account_id: 'a1', paid_on: '2026-05-31', tax_pct: 0 }, null);
    expect(payout).toMatchObject({ lines_total: 80_000, recovered: 10_000, net: 70_000 });
    expect((await commissionLineRepository.forSale('share', 's2'))[0].status).toBe('recovered');
  });

  it('fixes the seller once commission is earned, and the tree on the sale date', async () => {
    await expect(orgMemberRepository.setSoldBy('share', 's1', ids.imran)).rejects.toThrow(/already been earned/);
    await expect(orgMemberRepository.move(ids.karim, ids.tania, '2026-06-01', null, null)).rejects.toThrow(/own team/);
  });
});
