'use client';

import { db } from '../db/database';
import type { BankAccount } from '../db/types';
import {
  positionForAccount,
  unattributed,
  type AccountPosition,
  type CashFlowRow,
} from '../domain/cash';
import { money } from '../domain/finance';
import { nextCode } from '../utils/id';
import { todayLocal } from '../utils/format';
import { BaseRepository } from './base.repository';

export interface AccountWithPosition extends BankAccount, Omit<AccountPosition, 'account_id'> {}

export interface CashPosition {
  accounts: AccountWithPosition[];
  /** Sum of the accounts' closing balances — the figure that reconciles. */
  total_balance: number;
  total_in: number;
  total_out: number;
  /** Money that moved through no account; never added to `total_balance`. */
  unattributed_in: number;
  unattributed_out: number;
  unattributed_count: number;
}

export class BankAccountInUseError extends Error {
  constructor(name: string) {
    super(`"${name}" has money recorded against it and cannot be deleted. Close it instead.`);
    this.name = 'BankAccountInUseError';
  }
}

/**
 * Bank accounts and the cash position (Tier 3.5).
 *
 * The four money tables are read once here and folded into a single list of
 * movements, so every screen showing cash is looking at the same rows. The
 * definition of what counts — and what deliberately does not — is on
 * `domain/cash.ts`, next to the arithmetic it governs.
 */
class BankAccountRepository extends BaseRepository<BankAccount> {
  constructor() {
    super(() => db.bank_accounts);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.bank_accounts.toArray()).map((r) => r.code);
    return nextCode('ACC', codes);
  }

  async options(): Promise<BankAccount[]> {
    const rows = await db.bank_accounts.toArray();
    return rows.filter((r) => r.is_active).sort((a, b) => a.name.localeCompare(b.name));
  }

  async list(): Promise<BankAccount[]> {
    const rows = await db.bank_accounts.toArray();
    return rows.sort(
      (a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name),
    );
  }

  async createAccount(
    input: Omit<BankAccount, 'id' | 'code' | 'created_at' | 'updated_at' | 'created_by'> & {
      code?: string;
    },
    createdBy: string | null = null,
  ): Promise<BankAccount> {
    if (!input.name.trim()) throw new Error('The account needs a name.');
    return this.create(
      {
        ...input,
        code: input.code?.trim() ? input.code : await this.generateCode(),
        name: input.name.trim(),
        opening_balance: money(Number(input.opening_balance) || 0),
        opening_balance_date: input.opening_balance_date || todayLocal(),
      },
      createdBy,
    );
  }

  /**
   * Every money movement, from the four tables that hold one.
   *
   * Read together rather than per account so the unattributed bucket can be
   * computed from the same pass — otherwise "what has no account" would be a
   * second, differently-shaped query that could disagree with the first.
   */
  async flows(): Promise<CashFlowRow[]> {
    const [payments, expenses, vouchers, refunds, bookings, customers, suppliers] =
      await Promise.all([
        db.payments.toArray(),
        db.expenses.toArray(),
        db.supplier_vouchers.toArray(),
        db.refunds.toArray(),
        db.bookings.toArray(),
        db.customers.toArray(),
        db.suppliers.toArray(),
      ]);

    const customerOfBooking = new Map(
      bookings.map((b) => [b.id, customers.find((c) => c.id === b.customer_id)?.name ?? null]),
    );
    const supplierById = new Map(suppliers.map((s) => [s.id, s.name]));

    const rows: CashFlowRow[] = [
      ...payments.map((p) => ({
        id: p.id,
        account_id: p.account_id ?? null,
        date: p.payment_date,
        amount: money(Number(p.amount) || 0),
        kind: 'receipt' as const,
        label: customerOfBooking.get(p.booking_id) ?? 'Buyer receipt',
        reference: p.reference_no ?? null,
      })),
      ...expenses.map((e) => ({
        id: e.id,
        account_id: e.account_id ?? null,
        date: e.expense_date,
        amount: -money(Number(e.amount) || 0),
        kind: 'expense' as const,
        label: e.cost_reason || e.paid_to,
        reference: e.reference_no ?? null,
      })),
      ...vouchers.map((v) => ({
        id: v.id,
        account_id: v.account_id ?? null,
        date: v.payment_date,
        amount: -money(Number(v.amount) || 0),
        kind: 'supplier_payment' as const,
        label: supplierById.get(v.supplier_id) ?? v.code,
        reference: v.reference_no ?? null,
      })),
      // net_refund, not amount: the deduction was never handed back
      ...refunds.map((r) => ({
        id: r.id,
        account_id: r.account_id ?? null,
        date: r.refund_date,
        amount: -money(Number(r.net_refund) || 0),
        kind: 'refund' as const,
        label: customerOfBooking.get(r.booking_id) ?? r.code,
        reference: r.reference_no ?? null,
      })),
    ];

    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  async position(): Promise<CashPosition> {
    const [accounts, flows] = await Promise.all([this.list(), this.flows()]);

    const withPosition: AccountWithPosition[] = accounts.map((account) => {
      const { account_id, ...rest } = positionForAccount(
        account.id,
        account.opening_balance,
        account.opening_balance_date,
        flows,
      );
      void account_id;
      return { ...account, ...rest };
    });

    const loose = unattributed(flows);

    return {
      accounts: withPosition,
      total_balance: money(withPosition.reduce((s, a) => s + a.closing_balance, 0)),
      total_in: money(withPosition.reduce((s, a) => s + a.money_in, 0)),
      total_out: money(withPosition.reduce((s, a) => s + a.money_out, 0)),
      unattributed_in: loose.money_in,
      unattributed_out: loose.money_out,
      unattributed_count: loose.count,
    };
  }

  /** One account's statement, newest first. */
  async movements(accountId: string): Promise<CashFlowRow[]> {
    return (await this.flows()).filter((f) => f.account_id === accountId);
  }

  /**
   * Deletable only while nothing points at it — the rule suppliers and material
   * items already follow. Closing an account keeps its statement readable.
   */
  async removeIfUnused(id: string): Promise<void> {
    const account = await this.getById(id);
    if (!account) return;

    const [p, e, v, r] = await Promise.all([
      db.payments.where('account_id').equals(id).count(),
      db.expenses.where('account_id').equals(id).count(),
      db.supplier_vouchers.where('account_id').equals(id).count(),
      db.refunds.where('account_id').equals(id).count(),
    ]);
    if (p + e + v + r > 0) throw new BankAccountInUseError(account.name);
    await this.remove(id);
  }
}

export const bankAccountRepository = new BankAccountRepository();
