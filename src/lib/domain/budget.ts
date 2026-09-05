import { money } from './finance';

/**
 * Budget versus actual for one head (Tier 3.2).
 *
 * Pure arithmetic, so the same numbers can be shown on the project card, in the
 * budget editor and on the finance overview without three of them disagreeing.
 */
export interface BudgetVarianceRow {
  /** cost category code, or `PROCUREMENT_BUDGET_HEAD` */
  head: string;
  budgeted: number;
  actual: number;
  /** budgeted − actual. Negative means over budget. */
  variance: number;
  /** Share of the budget consumed; `null` when nothing was budgeted. */
  used_pct: number | null;
  /**
   * Money spent under a head nobody budgeted.
   *
   * Surfaced rather than folded into the total, because a budget that quietly
   * ignores uncategorised spend reads as complete while the money leaks. It is
   * the one thing a budget-vs-actual screen must not hide.
   */
  unbudgeted: boolean;
}

export interface BudgetSummary {
  rows: BudgetVarianceRow[];
  budgeted_total: number;
  actual_total: number;
  variance_total: number;
  used_pct: number | null;
  /** Heads that carry spend but no budget line. */
  unbudgeted_count: number;
  /** True once any line has been budgeted at all. */
  has_budget: boolean;
}

/**
 * Folds budget lines and actual spend into one comparable set of heads.
 *
 * The union of both sides, deliberately: a head that was budgeted and never
 * spent is as interesting as one spent and never budgeted, and dropping either
 * would make the totals disagree with the rows above them.
 */
export function summariseBudget(
  budgeted: Array<{ cost_category: string; budgeted_amount: number }>,
  actuals: Record<string, number>,
): BudgetSummary {
  const heads = new Set<string>([
    ...budgeted.map((b) => b.cost_category),
    ...Object.keys(actuals).filter((k) => Math.abs(actuals[k]) > 0.009),
  ]);

  const rows: BudgetVarianceRow[] = [...heads].map((head) => {
    const budget = money(
      budgeted
        .filter((b) => b.cost_category === head)
        .reduce((sum, b) => sum + (Number(b.budgeted_amount) || 0), 0),
    );
    const actual = money(Number(actuals[head]) || 0);
    return {
      head,
      budgeted: budget,
      actual,
      variance: money(budget - actual),
      used_pct: budget > 0 ? Math.round((actual / budget) * 10000) / 100 : null,
      unbudgeted: budget <= 0.009 && actual > 0.009,
    };
  });

  // over budget first, then biggest spend — a variance list is read worst-first
  rows.sort((a, b) => a.variance - b.variance || b.actual - a.actual);

  const budgeted_total = money(rows.reduce((sum, r) => sum + r.budgeted, 0));
  const actual_total = money(rows.reduce((sum, r) => sum + r.actual, 0));

  return {
    rows,
    budgeted_total,
    actual_total,
    variance_total: money(budgeted_total - actual_total),
    used_pct: budgeted_total > 0 ? Math.round((actual_total / budgeted_total) * 10000) / 100 : null,
    unbudgeted_count: rows.filter((r) => r.unbudgeted).length,
    has_budget: budgeted_total > 0.009,
  };
}
