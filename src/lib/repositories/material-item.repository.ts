'use client';

import { db } from '../db/database';
import type { MaterialItem } from '../db/types';
import { nextCode } from '../utils/id';
import { BaseRepository, type UpdateRecord } from './base.repository';

export interface MaterialItemFilters {
  search?: string;
  category?: string;
  /** 'all' includes retired items; the default hides them. */
  status?: 'active' | 'all';
}

export interface MaterialItemWithUsage extends MaterialItem {
  /** Stock rows carrying this item, across every store. */
  stock_rows: number;
  /** Quantity held, summed over those rows. */
  quantity_available: number;
  /** Purchase order lines that have ever named it. */
  order_lines: number;
}

export class DuplicateMaterialItemError extends Error {
  constructor(name: string) {
    super(`"${name}" is already in the catalogue.`);
    this.name = 'DuplicateMaterialItemError';
  }
}

export class MaterialItemInUseError extends Error {
  constructor(name: string) {
    super(`"${name}" is used by stock or orders and cannot be deleted. Retire it instead.`);
    this.name = 'MaterialItemInUseError';
  }
}

/**
 * The material catalogue (Tier 3.1, Section 6.6).
 *
 * An item's **id** is its identity and its **name** is a label, exactly as
 * Tier 3.3 made `cost_category` work. Renaming "Cement (Fresh)" to "Fresh
 * Cement" now changes what every screen says without splitting the stock row
 * or the weighted-average cost underneath it — which is precisely what free
 * text could not do.
 */
class MaterialItemRepository extends BaseRepository<MaterialItem> {
  constructor() {
    super(() => db.material_items);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.material_items.toArray()).map((r) => r.code);
    return nextCode('ITM', codes);
  }

  /** Options for a picker: live items only, in name order. */
  async options(): Promise<MaterialItem[]> {
    const rows = await db.material_items.toArray();
    return rows.filter((r) => r.is_active).sort((a, b) => a.name.localeCompare(b.name));
  }

  async list(filters: MaterialItemFilters = {}): Promise<MaterialItemWithUsage[]> {
    const [items, stock, orderLines] = await Promise.all([
      db.material_items.toArray(),
      db.stock.toArray(),
      db.purchase_order_items.toArray(),
    ]);

    let rows: MaterialItemWithUsage[] = items.map((item) => {
      const held = stock.filter((s) => s.item_id === item.id);
      return {
        ...item,
        stock_rows: held.length,
        quantity_available: held.reduce((sum, s) => sum + (Number(s.quantity_available) || 0), 0),
        order_lines: orderLines.filter((l) => l.item_id === item.id).length,
      };
    });

    if (filters.status !== 'all') rows = rows.filter((r) => r.is_active);
    if (filters.category) rows = rows.filter((r) => r.category === filters.category);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.code, r.name, r.category, r.unit]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every category in use, so the filter needs no hard-coded list. */
  async categories(): Promise<string[]> {
    const rows = await db.material_items.toArray();
    return [...new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))].sort();
  }

  /**
   * Names are compared case-insensitively, like `lookupRepository.addOption`.
   *
   * "Cement (Fresh)" and "cement (fresh)" as two catalogue rows would rebuild
   * the exact problem this table exists to remove, and the person picking one
   * of them from a dropdown would have made an invisible mistake. Two genuinely
   * different products — "Cement (Fresh)" and "Cement (Shah Special)" — are two
   * items, which is right: they are bought at different prices and valued
   * separately.
   */
  async createItem(
    input: { name: string; unit: string; category?: string | null; notes?: string | null },
    createdBy: string | null = null,
  ): Promise<MaterialItem> {
    const name = input.name.trim();
    if (!name) throw new Error('An item needs a name.');
    if (!input.unit.trim()) throw new Error('Choose the unit it is stocked in.');

    const existing = await db.material_items.toArray();
    if (existing.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new DuplicateMaterialItemError(name);
    }

    return this.create(
      {
        code: await this.generateCode(),
        name,
        unit: input.unit.trim(),
        category: input.category?.trim() || null,
        is_active: true,
        notes: input.notes?.trim() || null,
      },
      createdBy,
    );
  }

  async updateItem(
    id: string,
    changes: UpdateRecord<MaterialItem>,
    createdBy: string | null = null,
  ): Promise<MaterialItem | undefined> {
    void createdBy;
    const name = typeof changes.name === 'string' ? changes.name.trim() : undefined;
    if (name !== undefined) {
      if (!name) throw new Error('An item needs a name.');
      const existing = await db.material_items.toArray();
      if (
        existing.some((r) => r.id !== id && r.name.trim().toLowerCase() === name.toLowerCase())
      ) {
        throw new DuplicateMaterialItemError(name);
      }
    }
    return this.update(id, { ...changes, ...(name !== undefined ? { name } : {}) });
  }

  /**
   * Changing the unit is refused once the item holds stock.
   *
   * `average_unit_price` is per unit, so switching bag to ton silently
   * revalues the store by a factor of twenty and every issue already costed
   * against it becomes wrong. Retire the item and add the right one instead —
   * the history then stays readable, because the old rows still name the unit
   * they were recorded in.
   */
  async canChangeUnit(id: string): Promise<boolean> {
    const held = await db.stock.where('item_id').equals(id).toArray();
    return held.every((r) => (Number(r.quantity_available) || 0) <= 0.0005);
  }

  async setActive(id: string, isActive: boolean): Promise<MaterialItem | undefined> {
    return this.update(id, { is_active: isActive });
  }

  /**
   * Deletable only while nothing references it.
   *
   * The same rule suppliers and purchase orders already follow: a row that is
   * the counterparty of stock or an order cannot vanish, or the records that
   * point at it stop making sense. Retiring keeps them readable.
   */
  async removeIfUnused(id: string): Promise<void> {
    const item = await this.getById(id);
    if (!item) return;

    const [stock, orders, issues, transfers, requests] = await Promise.all([
      db.stock.where('item_id').equals(id).count(),
      db.purchase_order_items.where('item_id').equals(id).count(),
      db.stock_issues.where('item_id').equals(id).count(),
      db.stock_transfers.where('item_id').equals(id).count(),
      db.material_request_items.where('item_id').equals(id).count(),
    ]);

    if (stock + orders + issues + transfers + requests > 0) {
      throw new MaterialItemInUseError(item.name);
    }
    await this.remove(id);
  }
}

export const materialItemRepository = new MaterialItemRepository();
