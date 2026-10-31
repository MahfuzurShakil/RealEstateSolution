import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/lib/repositories/investor/investor-demo.data';
import { allocatePayment, amountChoices, lateFeeFor, maxPayable, takaInWords, viewPortfolio, type InvestorSnapshot } from './investor-portal';

const TODAY = '2026-11-01';

function snapshot(): InvestorSnapshot {
  return { today: TODAY, ...buildDemoData(TODAY), read_notification_ids: [], interested_round_codes: [] };
}
const hotelOf = (s: InvestorSnapshot) => viewPortfolio(s).holdings.find((v) => v.holding.code === 'SHR-2026-0041')!;

describe('Customer Portal rules', () => {
  it('charges 2% only after the 7-day grace', () => {
    expect(lateFeeFor(200_000, 7)).toBe(0);
    expect(lateFeeFor(200_000, 8)).toBe(4_000);
  });

  it('matches the proposal’s worked example (§7)', () => {
    const hotel = hotelOf(snapshot());
    expect(hotel.holding.total_price).toBe(5_000_000);
    expect(hotel.schedule).toHaveLength(21);
    expect(hotel.schedule[1].amount).toBe(200_000);
    expect(hotel.paid).toBe(1_600_000);
    expect(hotel.due_now).toBe(204_000);
    expect(hotel.current_value).toBe(6_000_000);
  });

  it('sums the portfolio, including the seeded part payment', () => {
    const p = viewPortfolio(snapshot());
    expect(p.total_invested).toBe(8_400_000);
    expect(p.paid).toBe(3_975_000);
    const resort = p.holdings.find((v) => v.holding.code === 'SHR-2026-0067')!;
    const inst2 = resort.schedule.find((i) => i.seq === 2)!;
    expect(inst2.partial).toBe(true);
    expect(inst2.remaining).toBe(125_000);
    expect(p.holdings.find((v) => v.holding.code === 'SHR-2025-0012')!.health).toBe('fully_paid');
  });

  it('applies a part payment to the late fee first, then the oldest installment', () => {
    const hotel = hotelOf(snapshot());
    expect(allocatePayment(hotel, 50_000)).toEqual([{ installment_id: 'SHR-2026-0041-4', principal: 46_000, late_fee: 4_000 }]);
    expect(allocatePayment(hotel, 304_000)).toEqual([
      { installment_id: 'SHR-2026-0041-4', principal: 200_000, late_fee: 4_000 },
      { installment_id: 'SHR-2026-0041-5', principal: 100_000, late_fee: 0 },
    ]);
  });

  it('keeps the late fee owing once an overdue installment is part paid', () => {
    const s = snapshot();
    s.payments.push({
      receipt_no: 'T1', holding_code: 'SHR-2026-0041', allocations: [{ installment_id: 'SHR-2026-0041-4', principal: 100_000, late_fee: 4_000 }],
      principal: 100_000, late_fee: 4_000, total: 104_000, method: 'bkash', method_detail: 'bKash', channel: 'online', reference: 'X', paid_at: `${TODAY}T10:00:00`,
    });
    const hotel = hotelOf(s);
    const inst4 = hotel.schedule.find((i) => i.seq === 4)!;
    expect(inst4.status).toBe('overdue');
    expect(inst4.late_fee_due).toBe(0);
    expect(hotel.due_now).toBe(100_000);
  });

  it('offers due-now, next and full amounts', () => {
    const hotel = hotelOf(snapshot());
    const choices = amountChoices(hotel);
    expect(choices.map((c) => c.id)).toEqual(['due_now', 'next', 'full', 'custom']);
    expect(choices[0].amount).toBe(204_000);
    expect(choices[1].amount).toBe(404_000);
    expect(choices[2].amount).toBe(maxPayable(hotel));
    expect(maxPayable(hotel)).toBe(3_404_000);
  });

  it('writes amounts in words the way a receipt does', () => {
    expect(takaInWords(204_000)).toBe('Taka Two Lakh Four Thousand Only');
    expect(takaInWords(50_00_000)).toBe('Taka Fifty Lakh Only');
    expect(takaInWords(12_34_56_789)).toBe('Taka Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only');
  });
});
