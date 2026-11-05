'use client';

import {
  loanRepository,
  lossCoveringRepository,
  profitWithdrawalRepository,
  revenueEntryRepository,
  revenuePeriodRepository,
  revenuePolicyRepository,
} from '../repositories';
import { DEFAULT_REVENUE_POLICY } from '../repositories/revenue.repository';
import { addMonths, periodAt } from '../domain/revenue-share';
import { addDays } from '../domain/installment-ledger';
import { todayLocal } from '../utils/format';
import { getDb } from './database';

/*
 * Revenue Share demo (REVENUE-SHARE-PLAN.md §12), on Nokshi Banani Business
 * Centre — the finished office tower whose floors are let. Quarterly sharing
 * over the three quarters before the current one, so the demo never goes
 * stale:
 *
 *   1. a normal quarter: profit, reserve kept, declared and credited;
 *   2. a loss quarter: the lifts and generator replaced and a floor empty —
 *      covered by Rahim's interest-free loan and a bank loan;
 *   3. a recovery quarter: the past loss recovered first, the bank's
 *      principal set aside, the rest declared;
 *
 * and the running quarter with its rent so far. Farhana (the portal demo
 * login) was paid once and can ask again; Mahmudul has one request rejected
 * and one approved; Karim took his share, Rahim and Selina have not.
 */

const LAKH = 100_000;
const PROJECT = 'Nokshi Banani Business Centre';

/** The first day of the quarter `back` quarters before today's. */
function quarterStart(today: string, back: number): string {
  const y = Number(today.slice(0, 4));
  const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  return addMonths(`${y}-${String(q * 3 + 1).padStart(2, '0')}-01`, -3 * back);
}

export async function ensureDemoRevenue(): Promise<void> {
  const db = getDb();
  if ((await db.revenue_policies.count()) > 0) return;
  const project = (await db.projects.toArray()).find((p) => p.name === PROJECT);
  if (!project) return;
  const accounts = (await db.bank_accounts.toArray()).filter((a) => a.is_active);
  const bank = accounts.find((a) => a.type === 'bank');
  if (!bank) return;
  const partners = await db.partners.toArray();
  const rahim = partners.find((p) => p.name === 'Rahim Chowdhury');
  const today = todayLocal();
  const user = null;

  const policy = await revenuePolicyRepository.save(
    project.id,
    { ...DEFAULT_REVENUE_POLICY, entry_frequency: 'monthly', first_period_start: quarterStart(today, 3) },
    user,
  );

  const month = async (start: string, upTo: string, rentFloors: number, extra: [string, number][] = []) => {
    const day = (d: number) => {
      const date = addDays(start, d - 1);
      // the running quarter stops at today
      return date <= upTo && date <= today ? date : null;
    };
    const lines: [number, 'income' | 'cost', string, number][] = [
      [5, 'income', 'Shop / floor rent', rentFloors * 3.5 * LAKH],
      [5, 'income', 'Service charge', rentFloors * 0.5 * LAKH],
      [10, 'income', 'Parking', 1.4 * LAKH],
      [25, 'cost', 'Salary & wages', 4.2 * LAKH],
      [18, 'cost', 'Utilities', 3.6 * LAKH],
      [20, 'cost', 'Maintenance & repair', 1.8 * LAKH],
    ];
    for (const [d, direction, head, amount] of lines) {
      const date = day(d);
      if (date) await revenueEntryRepository.record({ project_id: project.id, entry_date: date, direction, head, amount, account_id: bank.id, reference_no: null }, user);
    }
    for (const [head, amount] of extra) {
      const date = day(22);
      if (date) await revenueEntryRepository.record({ project_id: project.id, entry_date: date, direction: 'cost', head, amount, account_id: bank.id, reference_no: null, notes: 'One-off' }, user);
    }
  };

  const quarter = async (index: number, floors: number, extra: [string, number][] = []) => {
    const p = periodAt(policy, index);
    for (let m = 0; m < 3; m++) await month(addMonths(p.start, m), p.end, floors, m === 1 ? extra : []);
    return p;
  };

  /** Approves and declares, then dates the trail as the office would have done it. */
  const declare = async (periodId: string, end: string) => {
    const p = await revenuePeriodRepository.getById(periodId);
    await revenuePeriodRepository.approve(periodId, p!.available, user);
    await revenuePeriodRepository.declare(periodId, end, user);
    await revenuePeriodRepository.update(periodId, { approved_on: addDays(end, 6), declared_on: addDays(end, 9) });
  };

  // 1 — a normal quarter, 12 floors let
  const q1 = await quarter(0, 12, [['Government fees & tax', 2.5 * LAKH]]);
  const p1 = await revenuePeriodRepository.close(project.id, 0, user);
  await declare(p1.id, q1.end);

  // 2 — the lifts and generator replaced, one tenant gone
  const q2 = await quarter(1, 11, [['Maintenance & repair', 1.6 * 10_000_000]]);
  const p2 = await revenuePeriodRepository.close(project.id, 1, user);
  const loss = Math.max(0, -p2.operating_profit);
  const fromRahim = Math.min(loss, 40 * LAKH);
  await lossCoveringRepository.cover(
    p2.id,
    [
      ...(rahim
        ? [{ source: 'partner_loan' as const, amount: fromRahim, partner_id: rahim.id, account_id: bank.id, loan: { lender_name: '', interest_pct: 0, monthly_instalment: 0, account_id: bank.id, notes: 'Interest-free, repaid when the building is back in profit' } }]
        : []),
      {
        source: 'bank_loan' as const,
        amount: loss - (rahim ? fromRahim : 0),
        account_id: bank.id,
        loan: { lender_name: 'Eastern Bank PLC', bank_branch: 'Gulshan', loan_account_no: 'EBL-OD-2231874', interest_pct: 12, monthly_instalment: 5 * LAKH, account_id: bank.id },
      },
    ],
    addDays(q2.start, 40),
    user,
  );

  // 3 — back to 12 floors; the bank is paid monthly from here
  const q3 = await quarter(2, 12);
  const bankLoan = (await loanRepository.rows(project.id)).find((r) => r.loan.lender_type === 'bank');
  if (bankLoan) {
    let owed = bankLoan.outstanding;
    for (let m = 0; m < 3; m++) {
      const paidOn = addDays(addMonths(q3.start, m), 27);
      if (paidOn > today || owed <= 0) break;
      const principal = Math.min(owed, 5 * LAKH);
      await loanRepository.repay(bankLoan.loan.id, { paid_on: paidOn, principal, interest: Math.round((owed * 0.12) / 12), account_id: bank.id, reference_no: 'EBL standing order' }, user);
      owed -= principal;
    }
  }
  const p3 = await revenuePeriodRepository.close(project.id, 2, user);
  await declare(p3.id, q3.end);

  // 4 — the running quarter, its rent so far
  await quarter(3, 12);

  // payouts
  const customers = await db.customers.toArray();
  const farhana = customers.find((c) => c.phone === '01711223344');
  const mahmudul = customers.find((c) => c.phone === '01712908070');
  const paidAfter = addDays(q1.end, 20);
  const pay = async (id: string, on: string, ref: string) => {
    await profitWithdrawalRepository.approve(id, user);
    await profitWithdrawalRepository.markPaid(id, { account_id: bank.id, paid_on: on, reference_no: ref }, user);
  };
  const ask = async (holder: 'customer' | 'partner', id: string, amount: number, method: 'bank_transfer' | 'bkash', payTo: string, on: string) => {
    const w = await profitWithdrawalRepository.request(
      { holder_type: holder, holder_id: id, project_id: project.id, amount, method, pay_to: payTo, channel: holder === 'customer' ? 'portal' : 'office' },
      user,
      today,
    );
    await profitWithdrawalRepository.update(w.id, { requested_on: on });
    return w;
  };
  if (farhana) {
    const w = await ask('customer', farhana.id, 15_000, 'bank_transfer', 'Eastern Bank PLC, Gulshan, 1041070012345', addDays(q1.end, 14));
    await pay(w.id, paidAfter, 'EBL-TRF-55810');
  }
  if (mahmudul) {
    const r = await ask('customer', mahmudul.id, 60_000, 'bkash', '01712908070', addDays(q1.end, 12));
    await profitWithdrawalRepository.reject(r.id, 'bKash cannot take this much in one day. Please ask again for a bank transfer.', user);
    await ask('customer', mahmudul.id, 90_000, 'bank_transfer', 'Dutch-Bangla Bank, Uttara, 1171010098765', addDays(q3.end, 12));
    const w = (await profitWithdrawalRepository.rows({ customer_id: mahmudul.id })).find((x) => x.withdrawal.status === 'requested');
    if (w) await profitWithdrawalRepository.approve(w.withdrawal.id, user);
  }
  const karim = partners.find((p) => p.name === 'Karim Uddin');
  if (karim) {
    const w = await ask('partner', karim.id, 30 * LAKH, 'bank_transfer', 'DBBL, Banani, 1031100054321', addDays(q1.end, 15));
    await pay(w.id, addDays(q1.end, 16), 'DBBL-CHQ-004411');
  }
}
