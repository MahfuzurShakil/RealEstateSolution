'use client';

import { db } from '../db/database';
import type { DdChecklistItem, DdItemStatus, LandDdItem } from '../db/types';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';

/**
 * Batch L3 — legal due diligence (BRD section 9).
 *
 * The master checklist (DD-001) and one land's instance of it (DD-002, DD-003).
 */

/** A land's checklist row joined to the master item it came from. */
export interface LandDdItemWithMaster extends LandDdItem {
  item: DdChecklistItem | undefined;
}

/** What gate G2 and the tab header both read (BRD DD-004 / BR-001). */
export interface DdProgress {
  total: number;
  passed: number;
  /** passed, waived or not applicable — everything that is finished */
  settled: number;
  mandatoryTotal: number;
  /** mandatory items that are NOT passed, waived or not applicable */
  mandatoryOutstanding: number;
  /** mandatory items explicitly marked failed and not waived */
  mandatoryFailed: number;
}

/** A single item's own idea of "done". */
export function isSettled(status: DdItemStatus): boolean {
  return status === 'passed' || status === 'waived' || status === 'not_applicable';
}

class DdChecklistRepository extends BaseRepository<DdChecklistItem> {
  constructor() {
    super(() => db.dd_checklist_items);
  }

  /** Active items in display order — what a new land's checklist is built from. */
  async activeItems(): Promise<DdChecklistItem[]> {
    const rows = await db.dd_checklist_items.toArray();
    return rows.filter((r) => r.is_active).sort((a, b) => a.sort_order - b.sort_order);
  }

  /** Every item, active or not — the Master Data editor shows both. */
  async allItems(): Promise<DdChecklistItem[]> {
    const rows = await db.dd_checklist_items.toArray();
    return rows.sort((a, b) => a.sort_order - b.sort_order);
  }

  async nextSortOrder(): Promise<number> {
    const rows = await db.dd_checklist_items.toArray();
    return rows.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
  }

  /**
   * How many lands have already checked this item.
   *
   * The Master Data editor shows it before deactivating one, because
   * deactivating an item that thirty lands have findings against is a
   * different decision from retiring one nobody ever used.
   */
  async usageCount(itemId: string): Promise<number> {
    return db.land_dd_items.where('item_id').equals(itemId).count();
  }
}

class LandDdRepository extends BaseRepository<LandDdItem> {
  constructor() {
    super(() => db.land_dd_items);
  }

  async listForLand(landId: string): Promise<LandDdItemWithMaster[]> {
    const rows = await db.land_dd_items.where('land_id').equals(landId).toArray();
    const joined = await Promise.all(
      rows.map(async (r) => ({ ...r, item: await db.dd_checklist_items.get(r.item_id) })),
    );
    /*
     * Ordered by the master's sort order, not by when the rows were written.
     * A checklist that reorders itself between visits is a checklist nobody
     * trusts. Items whose master row is missing sort last rather than throwing.
     */
    return joined.sort((a, b) => (a.item?.sort_order ?? 9999) - (b.item?.sort_order ?? 9999));
  }

  /**
   * Creates the land's checklist from the active master items, skipping any it
   * already has.
   *
   * Safe to call repeatedly: opening the tab tops the checklist up with items
   * added to the master since, without disturbing findings already recorded.
   * `is_mandatory` is snapshotted here — see the note on the type.
   */
  async ensureForLand(landId: string, createdBy: string | null = null): Promise<void> {
    const [master, existing] = await Promise.all([
      ddChecklistRepository.activeItems(),
      db.land_dd_items.where('land_id').equals(landId).toArray(),
    ]);
    const have = new Set(existing.map((r) => r.item_id));
    const missing = master.filter((m) => !have.has(m.id));
    if (missing.length === 0) return;

    for (const item of missing) {
      await this.create(
        {
          land_id: landId,
          item_id: item.id,
          status: 'pending',
          assigned_to: null,
          finding: null,
          submitted_by: null,
          submitted_at: null,
          reviewed_by: null,
          reviewed_at: null,
          waiver_reason: null,
          waived_by: null,
          waived_at: null,
          is_mandatory: item.is_mandatory,
        } as NewRecord<LandDdItem>,
        createdBy,
      );
    }
  }

  async progressForLand(landId: string): Promise<DdProgress> {
    const rows = await db.land_dd_items.where('land_id').equals(landId).toArray();
    const mandatory = rows.filter((r) => r.is_mandatory);
    return {
      total: rows.length,
      passed: rows.filter((r) => r.status === 'passed').length,
      settled: rows.filter((r) => isSettled(r.status)).length,
      mandatoryTotal: mandatory.length,
      mandatoryOutstanding: mandatory.filter((r) => !isSettled(r.status)).length,
      mandatoryFailed: mandatory.filter((r) => r.status === 'failed').length,
    };
  }

  /** Removes a land's checklist and every piece of evidence hanging off it. */
  async removeForLand(landId: string): Promise<void> {
    const rows = await db.land_dd_items.where('land_id').equals(landId).toArray();
    for (const row of rows) await documentRepository.removeForEntity('land_dd_item', row.id);
    await db.land_dd_items.bulkDelete(rows.map((r) => r.id));
  }
}

export const ddChecklistRepository = new DdChecklistRepository();
export const landDdRepository = new LandDdRepository();
