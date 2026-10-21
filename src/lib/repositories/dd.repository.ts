'use client';

import { db } from '../db/database';
import type { DdChecklistItem, DdItemStatus, DocumentRecord, LandDdItem } from '../db/types';
import { DD_ITEM_DOCUMENT_TYPE } from '../db/types';
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

/** A checklist row's display name — the master label, or the name typed in. */
export function ddItemLabel(row: LandDdItemWithMaster): string {
  return row.item?.label ?? row.custom_label ?? 'Retired checklist item';
}

/**
 * The document type a file uploaded against this row is filed under, so the
 * upload never asks (2026-10-21). `other` carries the row's own name.
 */
export function ddItemDocumentType(row: LandDdItemWithMaster): {
  document_type: string;
  custom_type_name: string | null;
} {
  const type = row.item ? DD_ITEM_DOCUMENT_TYPE[row.item.code] : undefined;
  return type
    ? { document_type: type, custom_type_name: null }
    : { document_type: 'other', custom_type_name: ddItemLabel(row) };
}

/** A single item's own idea of "done". */
export function isSettled(status: DdItemStatus): boolean {
  return (
    status === 'passed' ||
    status === 'conditionally_approved' ||
    status === 'waived' ||
    status === 'not_applicable'
  );
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
      rows.map(async (r) => ({
        ...r,
        // a hand-added document has no master row
        item: r.custom_label ? undefined : await db.dd_checklist_items.get(r.item_id),
      })),
    );
    /*
     * Ordered by the master's sort order, not by when the rows were written.
     * A checklist that reorders itself between visits is a checklist nobody
     * trusts. Hand-added documents follow in the order they were added.
     */
    return joined.sort(
      (a, b) =>
        (a.item?.sort_order ?? 9999) - (b.item?.sort_order ?? 9999) ||
        a.created_at.localeCompare(b.created_at),
    );
  }

  /**
   * Creates the land's required documents, and only those (2026-10-21).
   *
   * Safe to call repeatedly: opening the tab tops the list up with items made
   * mandatory in the master since, without disturbing findings already
   * recorded. Everything optional is added by hand with `addItems` when the
   * land needs it — a list of seventeen where eleven do not apply was the
   * complaint. `is_mandatory` is snapshotted here — see the note on the type.
   *
   * It also clears out optional rows an earlier version created up front,
   * but only ones nobody has touched: still pending, no finding, nobody
   * assigned, no file. Anything with work on it stays.
   */
  async ensureForLand(landId: string, createdBy: string | null = null): Promise<void> {
    const [master, existing] = await Promise.all([
      ddChecklistRepository.allItems(),
      db.land_dd_items.where('land_id').equals(landId).toArray(),
    ]);
    const masterById = new Map(master.map((m) => [m.id, m]));

    for (const row of existing) {
      const item = masterById.get(row.item_id);
      if (!item || item.is_mandatory || row.added_by_user) continue;
      if (row.status !== 'pending' || row.finding || row.assigned_to) continue;
      const files = await documentRepository.listForEntity('land_dd_item', row.id);
      if (files.length === 0) await db.land_dd_items.delete(row.id);
    }

    const have = new Set(existing.map((r) => r.item_id));
    const missing = master.filter((m) => m.is_active && m.is_mandatory && !have.has(m.id));
    for (const item of missing) {
      await this.create(blankRow(landId, item.id, true), createdBy);
    }
  }

  /**
   * Adds documents the land team picked: optional master items by id, and
   * documents of their own by name.
   */
  async addItems(
    landId: string,
    input: { itemIds: string[]; customLabels: string[] },
    createdBy: string | null = null,
  ): Promise<void> {
    const existing = await db.land_dd_items.where('land_id').equals(landId).toArray();
    const have = new Set(existing.map((r) => r.item_id));
    for (const itemId of input.itemIds) {
      if (have.has(itemId)) continue;
      const item = await db.dd_checklist_items.get(itemId);
      await this.create(
        { ...blankRow(landId, itemId, Boolean(item?.is_mandatory)), added_by_user: true },
        createdBy,
      );
    }
    for (const label of input.customLabels) {
      const name = label.trim();
      if (!name) continue;
      await this.create(
        {
          ...blankRow(landId, `custom-${crypto.randomUUID()}`, false),
          custom_label: name,
          added_by_user: true,
        },
        createdBy,
      );
    }
  }

  /** Every file filed against this land's checklist, by checklist row. */
  async documentsForLand(landId: string): Promise<Map<string, DocumentRecord[]>> {
    const rows = await db.land_dd_items.where('land_id').equals(landId).toArray();
    const out = new Map<string, DocumentRecord[]>();
    for (const row of rows) {
      out.set(row.id, await documentRepository.listForEntity('land_dd_item', row.id));
    }
    return out;
  }

  /** Removes one optional document row and its files. Mandatory rows stay. */
  async removeItem(id: string): Promise<void> {
    const row = await db.land_dd_items.get(id);
    if (!row || row.is_mandatory) return;
    await documentRepository.removeForEntity('land_dd_item', id);
    await db.land_dd_items.delete(id);
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

function blankRow(landId: string, itemId: string, isMandatory: boolean): NewRecord<LandDdItem> {
  return {
    land_id: landId,
    item_id: itemId,
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
    is_mandatory: isMandatory,
  } as NewRecord<LandDdItem>;
}
