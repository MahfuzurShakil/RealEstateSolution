'use client';

import { db } from '../db/database';
import type {
  ConstructionCostType,
  DirectPurchase,
  Tower,
  TowerWorkItem,
  WorkItemBudgetLine,
} from '../db/types';
import { budgetHealth, usedPct, type BudgetHealth } from '../domain/construction-cost';
import { money, qty } from '../domain/procurement';
import { nextCode } from '../utils/id';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';

/* ------------------------------------------------------------------ *
 * Work-item budget (DIRECT-PURCHASE-PLAN.md B2)
 * ------------------------------------------------------------------ */

export interface BudgetLineInput {
  id?: string;
  cost_type: ConstructionCostType;
  description: string;
  quantity?: number | null;
  unit?: string | null;
  rate?: number | null;
  budgeted_amount: number;
}

class WorkItemBudgetRepository extends BaseRepository<WorkItemBudgetLine> {
  constructor() {
    super(() => db.work_item_budget_lines);
  }

  async listForWorkItem(workItemId: string): Promise<WorkItemBudgetLine[]> {
    const rows = await db.work_item_budget_lines.where('work_item_id').equals(workItemId).toArray();
    return rows.sort((a, b) => a.sort_order - b.sort_order);
  }

  /**
   * The budget sheet is saved whole: lines kept by id are updated, missing
   * ones removed, new ones added. A line that direct purchases already point
   * at cannot be removed — those costs would lose the line they were bought
   * against.
   */
  async saveForWorkItem(
    workItemId: string,
    lines: BudgetLineInput[],
    userId: string | null,
  ): Promise<void> {
    const item = await db.tower_work_items.get(workItemId);
    if (!item) throw new Error('This work item no longer exists.');
    const tower = await db.towers.get(item.tower_id);
    if (!tower) throw new Error('This tower no longer exists.');

    const bad = lines.find((l) => !l.description.trim() || !(Number(l.budgeted_amount) >= 0));
    if (bad) throw new Error('Every budget line needs a description and an amount.');

    const existing = await this.listForWorkItem(workItemId);
    const kept = new Set(lines.map((l) => l.id).filter(Boolean));
    for (const row of existing) {
      if (kept.has(row.id)) continue;
      const used = await db.direct_purchases.where('budget_line_id').equals(row.id).count();
      if (used > 0) {
        throw new Error(
          `"${row.description}" has ${used} cost${used === 1 ? '' : 's'} recorded against it, so it cannot be removed.`,
        );
      }
      await this.remove(row.id);
    }

    for (const [index, line] of lines.entries()) {
      const payload = {
        work_item_id: workItemId,
        project_id: tower.project_id,
        tower_id: tower.id,
        cost_type: line.cost_type,
        description: line.description.trim(),
        quantity: line.quantity != null ? qty(Number(line.quantity)) : null,
        unit: line.unit?.trim() || null,
        rate: line.rate != null ? money(Number(line.rate)) : null,
        budgeted_amount: money(Number(line.budgeted_amount) || 0),
        sort_order: index + 1,
      };
      if (line.id && existing.some((e) => e.id === line.id)) await this.update(line.id, payload);
      else await this.create(payload, userId);
    }
  }

  /** Saleable area of a tower's units — the starting point for template rates. */
  async towerSaleableArea(towerId: string): Promise<number> {
    const units = await db.units.where('tower_id').equals(towerId).toArray();
    return Math.round(units.reduce((s, u) => s + (Number(u.size_sqft) || 0), 0));
  }
}

export const workItemBudgetRepository = new WorkItemBudgetRepository();

/* ------------------------------------------------------------------ *
 * Direct purchase (DIRECT-PURCHASE-PLAN.md B3)
 * ------------------------------------------------------------------ */

export type DirectPurchaseInput = Omit<
  NewRecord<DirectPurchase>,
  'code' | 'project_id' | 'tower_id' | 'paid_amount' | 'payment_status' | 'amount'
> & {
  /** quantity × rate when both are given, otherwise this lump sum */
  amount?: number | null;
};

export interface AttachmentInput {
  file: File;
  document_type: string;
}

export interface DirectPurchaseWithRelations extends DirectPurchase {
  tower_name: string;
  work_item_name: string;
  budget_line_description: string | null;
  attachment_count: number;
}

class DirectPurchaseRepository extends BaseRepository<DirectPurchase> {
  constructor() {
    super(() => db.direct_purchases);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.direct_purchases.toArray()).map((p) => p.code);
    return nextCode('DP', codes);
  }

  /**
   * Records a cost with its paper. The attachment is required by the client
   * (2026-10-18): a cost nobody can show a bill, challan or muster roll for
   * is the leak this feature exists to stop.
   */
  async record(
    input: DirectPurchaseInput,
    attachments: AttachmentInput[],
    userId: string | null,
  ): Promise<DirectPurchase> {
    if (attachments.length === 0) {
      throw new Error('Attach the bill, challan, muster roll or a photo — a cost needs its paper.');
    }
    const item = await db.tower_work_items.get(input.work_item_id);
    if (!item) throw new Error('Pick the work item this cost is for.');
    const tower = await db.towers.get(item.tower_id);
    if (!tower) throw new Error('This tower no longer exists.');
    if (input.budget_line_id) {
      const line = await db.work_item_budget_lines.get(input.budget_line_id);
      if (!line || line.work_item_id !== item.id) {
        throw new Error('That budget line belongs to another work item.');
      }
    }
    if (!input.description.trim()) throw new Error('Say what was bought or paid for.');
    if (!input.vendor_name.trim()) throw new Error('Say who it was bought from.');

    const q = input.quantity != null ? Number(input.quantity) : null;
    const r = input.rate != null ? Number(input.rate) : null;
    const amount = money(q != null && r != null ? q * r : Number(input.amount) || 0);
    if (!(amount > 0)) throw new Error('Enter the amount, or a quantity and a rate.');

    const saved = await this.create(
      {
        ...input,
        code: await this.generateCode(),
        project_id: tower.project_id,
        tower_id: tower.id,
        description: input.description.trim(),
        vendor_name: input.vendor_name.trim(),
        quantity: q != null ? qty(q) : null,
        rate: r != null ? money(r) : null,
        amount,
        paid_amount: 0,
        payment_status: 'pending',
      },
      userId,
    );

    for (const a of attachments) {
      await documentRepository.create(
        {
          entity_type: 'direct_purchase',
          entity_id: saved.id,
          document_type: a.document_type,
          custom_type_name: null,
          file_url: a.file.name,
          file_data: a.file,
          file_name: a.file.name,
          file_size: a.file.size,
          mime_type: a.file.type,
          is_public: false,
          uploaded_by: userId,
          uploaded_at: new Date().toISOString(),
          notes: null,
        },
        userId,
      );
    }
    return saved;
  }

  async list(filters: { project_id?: string; work_item_id?: string } = {}): Promise<DirectPurchaseWithRelations[]> {
    let rows: DirectPurchase[];
    if (filters.work_item_id) {
      rows = await db.direct_purchases.where('work_item_id').equals(filters.work_item_id).toArray();
    } else if (filters.project_id) {
      rows = await db.direct_purchases.where('project_id').equals(filters.project_id).toArray();
    } else {
      rows = await db.direct_purchases.toArray();
    }
    rows.sort((a, b) => b.purchase_date.localeCompare(a.purchase_date) || b.code.localeCompare(a.code));

    const [towers, items, lines, docs] = await Promise.all([
      db.towers.bulkGet([...new Set(rows.map((r) => r.tower_id))]),
      db.tower_work_items.bulkGet([...new Set(rows.map((r) => r.work_item_id))]),
      db.work_item_budget_lines.bulkGet(
        [...new Set(rows.map((r) => r.budget_line_id).filter(Boolean) as string[])],
      ),
      db.documents.where('entity_type').equals('direct_purchase').toArray(),
    ]);
    const name = <T extends { id: string }>(list: (T | undefined)[], id: string | null | undefined) =>
      list.find((x) => x?.id === id);

    return rows.map((r) => ({
      ...r,
      tower_name: (name(towers, r.tower_id) as Tower | undefined)?.name ?? '—',
      work_item_name: (name(items, r.work_item_id) as TowerWorkItem | undefined)?.name ?? '—',
      budget_line_description:
        (name(lines, r.budget_line_id) as WorkItemBudgetLine | undefined)?.description ?? null,
      attachment_count: docs.filter((d) => d.entity_id === r.id).length,
    }));
  }

  /** Only an unpaid cost can be taken back; once money moved it is history. */
  async removeCascade(id: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) return;
    if (row.paid_amount > 0) throw new Error('Money has been paid against this cost, so it cannot be deleted.');
    await documentRepository.removeForEntity('direct_purchase', id);
    await this.remove(id);
  }
}

export const directPurchaseRepository = new DirectPurchaseRepository();

/* ------------------------------------------------------------------ *
 * The project's cost sheet — budget vs actual vs progress
 * ------------------------------------------------------------------ */

export interface WorkItemCostRow {
  work_item: TowerWorkItem;
  budget: number;
  actual: number;
  /** owed to vendors: actual less paid */
  unpaid: number;
  used_pct: number | null;
  health: BudgetHealth;
  line_count: number;
  purchase_count: number;
}

export interface TowerCostRow {
  tower: Tower;
  items: WorkItemCostRow[];
  budget: number;
  actual: number;
  unpaid: number;
}

export interface ProjectCostSheet {
  towers: TowerCostRow[];
  budget: number;
  actual: number;
  unpaid: number;
  over_count: number;
  warn_count: number;
}

export async function projectCostSheet(projectId: string): Promise<ProjectCostSheet> {
  const towers = (await db.towers.where('project_id').equals(projectId).toArray()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const [lines, purchases] = await Promise.all([
    db.work_item_budget_lines.where('project_id').equals(projectId).toArray(),
    db.direct_purchases.where('project_id').equals(projectId).toArray(),
  ]);

  const out: TowerCostRow[] = [];
  for (const tower of towers) {
    const items = (await db.tower_work_items.where('tower_id').equals(tower.id).toArray()).sort(
      (a, b) => a.sequence_no - b.sequence_no,
    );
    const rows = items.map((item) => {
      const myLines = lines.filter((l) => l.work_item_id === item.id);
      const mine = purchases.filter((p) => p.work_item_id === item.id);
      const budget = money(myLines.reduce((s, l) => s + l.budgeted_amount, 0));
      const actual = money(mine.reduce((s, p) => s + p.amount, 0));
      const unpaid = money(mine.reduce((s, p) => s + (p.amount - (p.paid_amount || 0)), 0));
      return {
        work_item: item,
        budget,
        actual,
        unpaid,
        used_pct: usedPct(budget, actual),
        health: budgetHealth(budget, actual, item.actual_progress_pct),
        line_count: myLines.length,
        purchase_count: mine.length,
      };
    });
    out.push({
      tower,
      items: rows,
      budget: money(rows.reduce((s, r) => s + r.budget, 0)),
      actual: money(rows.reduce((s, r) => s + r.actual, 0)),
      unpaid: money(rows.reduce((s, r) => s + r.unpaid, 0)),
    });
  }
  const all = out.flatMap((t) => t.items);
  return {
    towers: out,
    budget: money(out.reduce((s, t) => s + t.budget, 0)),
    actual: money(out.reduce((s, t) => s + t.actual, 0)),
    unpaid: money(out.reduce((s, t) => s + t.unpaid, 0)),
    over_count: all.filter((r) => r.health === 'over').length,
    warn_count: all.filter((r) => r.health === 'near' || r.health === 'ahead_of_work').length,
  };
}

/** Actual spent per budget line of one work item, for the budget sheet. */
export async function actualByBudgetLine(workItemId: string): Promise<Map<string, number>> {
  const rows = await db.direct_purchases.where('work_item_id').equals(workItemId).toArray();
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = r.budget_line_id ?? '';
    out.set(key, money((out.get(key) ?? 0) + r.amount));
  }
  return out;
}
