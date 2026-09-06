'use client';

import { db } from '../db/database';
import { PROCUREMENT_BUDGET_HEAD, type ProjectBudgetLine } from '../db/types';
import { summariseBudget, type BudgetSummary } from '../domain/budget';
import { money } from '../domain/finance';
import { BaseRepository } from './base.repository';

/**
 * The project cost plan (Tier 3.2, Section 8.3).
 *
 * The actual side is assembled here rather than on a screen, because it comes
 * from two tables that are counted differently: the expense ledger, which
 * carries a `cost_category`, and `supplier_vouchers`, which does not and rolls
 * up under the reserved procurement head.
 *
 * **Neither `stock_issues` nor `stock_consumptions` are counted, and neither
 * should be.** Material was already paid for through the voucher that bought
 * it, and Section 8.3 is explicit that vouchers are added at roll-up time so
 * nothing is counted twice. Adding either would charge the same taka to the
 * project a second time — once when it was bought and again as it moved to the
 * tower or went into the slab.
 *
 * The second half of that is worth spelling out because `stock_consumptions` is
 * documented as "the project's real material cost", which it is — of the
 * *material*, from the store's side. This budget measures money leaving the
 * company, and that already happened at the voucher. The two answer different
 * questions and adding them would answer neither.
 */
class ProjectBudgetRepository extends BaseRepository<ProjectBudgetLine> {
  constructor() {
    super(() => db.project_budget_lines);
  }

  async listForProject(projectId: string): Promise<ProjectBudgetLine[]> {
    const rows = await db.project_budget_lines.where('project_id').equals(projectId).toArray();
    return rows.sort((a, b) => a.cost_category.localeCompare(b.cost_category));
  }

  /** What has actually been spent, by head. */
  async actualsForProject(projectId: string): Promise<Record<string, number>> {
    const [expenses, vouchers] = await Promise.all([
      db.expenses.where('project_id').equals(projectId).toArray(),
      db.supplier_vouchers.where('project_id').equals(projectId).toArray(),
    ]);

    const actuals: Record<string, number> = {};
    for (const expense of expenses) {
      const head = expense.cost_category;
      actuals[head] = money((actuals[head] ?? 0) + (Number(expense.amount) || 0));
    }
    const procurement = vouchers.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
    if (procurement > 0) actuals[PROCUREMENT_BUDGET_HEAD] = money(procurement);

    return actuals;
  }

  async summaryForProject(projectId: string): Promise<BudgetSummary> {
    const [lines, actuals] = await Promise.all([
      this.listForProject(projectId),
      this.actualsForProject(projectId),
    ]);
    return summariseBudget(lines, actuals);
  }

  /**
   * One budget line per head per project.
   *
   * Written as an upsert rather than an insert because the editor offers every
   * head at once: without this, saving the same screen twice would produce two
   * lines for one head and a budget that silently doubled.
   */
  async setLine(
    projectId: string,
    costCategory: string,
    budgetedAmount: number,
    notes: string | null = null,
    createdBy: string | null = null,
  ): Promise<ProjectBudgetLine | undefined> {
    const amount = money(Number(budgetedAmount) || 0);
    const existing = (await this.listForProject(projectId)).find(
      (l) => l.cost_category === costCategory,
    );

    // a head budgeted at nothing is not a budget line — it is the absence of one
    if (amount <= 0.009) {
      if (existing) await this.remove(existing.id);
      return undefined;
    }

    if (existing) {
      return this.update(existing.id, { budgeted_amount: amount, notes });
    }
    return this.create(
      { project_id: projectId, cost_category: costCategory, budgeted_amount: amount, notes },
      createdBy,
    );
  }

  /** Replaces a project's whole plan in one save, from the editor. */
  async replaceForProject(
    projectId: string,
    lines: Array<{ cost_category: string; budgeted_amount: number; notes?: string | null }>,
    createdBy: string | null = null,
  ): Promise<void> {
    for (const line of lines) {
      await this.setLine(
        projectId,
        line.cost_category,
        line.budgeted_amount,
        line.notes ?? null,
        createdBy,
      );
    }
  }

  async removeForProject(projectId: string): Promise<void> {
    const rows = await this.listForProject(projectId);
    await db.project_budget_lines.bulkDelete(rows.map((r) => r.id));
  }

  /** Budgeted totals for several projects at once, for the finance overview. */
  async budgetedByProject(): Promise<Record<string, number>> {
    const rows = await db.project_budget_lines.toArray();
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.project_id] = money((acc[row.project_id] ?? 0) + (Number(row.budgeted_amount) || 0));
      return acc;
    }, {});
  }
}

export const projectBudgetRepository = new ProjectBudgetRepository();
