'use client';

import { db } from '../../db/database';
import type { WithdrawalMethod, WithdrawalStatus } from '../../db/types';
import { todayLocal } from '../../utils/format';
import { customerProfitBalances, customerProfitHistory, profitWithdrawalRepository } from '../revenue.repository';
import { CUSTOMER_PORTAL_CHANGED, investorRepository } from './investor.repository';

/*
 * The Customer Portal's view of profit sharing (REVENUE-SHARE-PLAN.md §5).
 * Whitelisted like the rest of the portal: the signed-in customer's own
 * lines and balances, and each period's headline figures — never another
 * holder, a partner split, a loan or the reserve.
 */

export interface EarningLine {
  id: string;
  project_name: string;
  holding_code: string | null;
  period_label: string;
  period_end: string;
  declared_on: string | null;
  /** the project's headline for the period */
  project_income: number;
  project_cost: number;
  project_profit: number;
  project_declared: number;
  ownership_pct: number;
  /** 1 = full share */
  counted_pct: number;
  gross: number;
  tax: number;
  to_dues: number;
  net: number;
}

export interface EarningBalance {
  project_id: string;
  project_name: string;
  credited: number;
  paid_out: number;
  pending: number;
  balance: number;
  can_request: boolean;
  reason: string | null;
  min_withdrawal: number;
}

export interface EarningRequest {
  code: string;
  project_name: string;
  amount: number;
  method: WithdrawalMethod;
  pay_to: string;
  status: WithdrawalStatus;
  requested_on: string;
  paid_on: string | null;
  reference: string | null;
  reject_reason: string | null;
}

export interface Earnings {
  balances: EarningBalance[];
  lines: EarningLine[];
  requests: EarningRequest[];
  total_credited: number;
  total_balance: number;
  /** what the customer has on file to be paid into */
  bank_on_file: string | null;
  phone: string;
}

function customerId(): string {
  const s = investorRepository.session();
  if (!s) throw new Error('Please sign in again.');
  return s.customer_id;
}

export const earningsRepository = {
  async earnings(today = todayLocal()): Promise<Earnings | null> {
    const s = investorRepository.session();
    if (!s) return null;
    const customer = await db.customers.get(s.customer_id);
    if (!customer) return null;
    const [balances, history, requests, policies] = await Promise.all([
      customerProfitBalances(customer.id, today),
      customerProfitHistory(customer.id),
      profitWithdrawalRepository.rows({ customer_id: customer.id }),
      db.revenue_policies.toArray(),
    ]);
    const minOf = new Map(policies.map((p) => [p.project_id, p.min_withdrawal]));
    return {
      balances: balances.map((b) => ({
        project_id: b.project_id,
        project_name: b.project_name,
        credited: b.credited,
        paid_out: b.paid_out,
        pending: b.pending,
        balance: b.balance,
        can_request: b.check.ok,
        reason: b.check.reason,
        min_withdrawal: minOf.get(b.project_id) ?? 0,
      })),
      lines: history.map((h) => ({
        id: h.allocation.id,
        project_name: h.project_name,
        holding_code: h.sale_code,
        period_label: h.period.label,
        period_end: h.period.period_end,
        declared_on: h.period.declared_on ?? null,
        project_income: h.period.income,
        project_cost: h.period.cost,
        project_profit: h.period.operating_profit,
        project_declared: h.period.declared,
        ownership_pct: h.allocation.ownership_pct,
        counted_pct: Math.round(h.allocation.eligibility_factor * 100),
        gross: h.allocation.gross,
        tax: h.allocation.tax_withheld,
        to_dues: h.allocation.adjusted_to_dues,
        net: h.allocation.net_credited,
      })),
      requests: requests.map((r) => ({
        code: r.withdrawal.code,
        project_name: r.project_name,
        amount: r.withdrawal.amount,
        method: r.withdrawal.method,
        pay_to: r.withdrawal.pay_to,
        status: r.withdrawal.status,
        requested_on: r.withdrawal.requested_on,
        paid_on: r.withdrawal.paid_on ?? null,
        reference: r.withdrawal.reference_no ?? null,
        reject_reason: r.withdrawal.reject_reason ?? null,
      })),
      total_credited: balances.reduce((t, b) => t + b.credited, 0),
      total_balance: balances.reduce((t, b) => t + b.balance, 0),
      bank_on_file: customer.bank_account
        ? [customer.bank_name, customer.bank_branch, customer.bank_account].filter(Boolean).join(', ')
        : null,
      phone: customer.phone,
    };
  },

  async requestPayout(input: { project_id: string; amount: number; method: WithdrawalMethod; pay_to: string }): Promise<void> {
    await profitWithdrawalRepository.request(
      { ...input, holder_type: 'customer', holder_id: customerId(), channel: 'portal' },
      null,
    );
    window.dispatchEvent(new Event(CUSTOMER_PORTAL_CHANGED));
  },
};
