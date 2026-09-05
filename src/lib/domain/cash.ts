import { money } from './finance';

/**
 * The cash position (Tier 3.5, Section 8.3 addendum).
 *
 * **The definition, written down before the arithmetic** — §4.0 asks for
 * exactly that, because the sums are trivial and the meaning is not.
 *
 * Money moves through four tables and they are **disjoint record sets**: a
 * buyer receipt is a `payments` row, a supplier payment is a
 * `supplier_vouchers` row, any other cost is an `expenses` row and money given
 * back is a `refunds` row. No record appears in two of them, so adding the
 * first and subtracting the other three counts each taka exactly once.
 *
 * §4.0 warns that a cost recorded both as an expense and as a voucher would be
 * double counted. That is true, and it is a *data-entry duplicate* — two
 * records of one real payment — not a structural overlap. No filtering here
 * can fix it, because the two rows are indistinguishable from two genuine
 * payments of the same amount; it belongs to whoever enters them.
 *
 * What is deliberately **not** counted:
 *
 * - `payment_installments` — a schedule of what is owed, not money that moved.
 * - `stock_issues` and `stock_transfers` — material moving between stores,
 *   already paid for by the voucher that bought it.
 * - `project_budget_lines` — a plan.
 *
 * `refunds` contribute `net_refund`, not `amount`: the deduction was never
 * handed back, so it never left the account.
 */
export interface CashFlowRow {
  id: string;
  account_id: string | null;
  date: string;
  /** positive in, negative out */
  amount: number;
  kind: 'receipt' | 'expense' | 'supplier_payment' | 'refund';
  label: string;
  reference?: string | null;
}

export interface AccountPosition {
  account_id: string;
  opening_balance: number;
  /** movements dated on or after the opening balance date */
  money_in: number;
  money_out: number;
  closing_balance: number;
  movement_count: number;
}

export const CASH_FLOW_LABEL: Record<CashFlowRow['kind'], string> = {
  receipt: 'Buyer receipt',
  expense: 'Cost',
  supplier_payment: 'Supplier payment',
  refund: 'Refund',
};

/**
 * One account's balance from its opening figure plus what has moved since.
 *
 * Movements dated **before** `openingBalanceDate` are excluded rather than
 * added: the opening balance is a statement of what was in the account on that
 * day, so anything earlier is already inside it. Counting both would add the
 * same history twice — which is the double count that can actually happen
 * here, as opposed to the one §4.0 predicted.
 */
export function positionForAccount(
  accountId: string,
  openingBalance: number,
  openingBalanceDate: string,
  flows: CashFlowRow[],
): AccountPosition {
  const mine = flows.filter((f) => f.account_id === accountId && f.date >= openingBalanceDate);

  const money_in = money(mine.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0));
  const money_out = money(
    Math.abs(mine.filter((f) => f.amount < 0).reduce((s, f) => s + f.amount, 0)),
  );

  return {
    account_id: accountId,
    opening_balance: money(openingBalance),
    money_in,
    money_out,
    closing_balance: money(money(openingBalance) + money_in - money_out),
    movement_count: mine.length,
  };
}

/**
 * Money that moved through no account at all.
 *
 * Reported separately and never folded into the company total, for the same
 * reason unbudgeted spend is: every row recorded before accounts existed has no
 * `account_id`, and quietly adding it to a balance would produce a figure that
 * matches no statement anybody can check. The point of the position is that it
 * can be reconciled against a bank.
 */
export function unattributed(flows: CashFlowRow[]): { money_in: number; money_out: number; count: number } {
  const loose = flows.filter((f) => !f.account_id);
  return {
    money_in: money(loose.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0)),
    money_out: money(
      Math.abs(loose.filter((f) => f.amount < 0).reduce((s, f) => s + f.amount, 0)),
    ),
    count: loose.length,
  };
}
