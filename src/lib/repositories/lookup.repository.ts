'use client';

import { db } from '../db/database';
import type { LookupCategory, LookupValue } from '../db/types';
import { BaseRepository } from './base.repository';

/** A category, plus the entity_type it is scoped to when it has one. */
export interface LookupGroupKey {
  category: LookupCategory;
  scope: string | null;
}

export class DuplicateLookupError extends Error {
  constructor(value: string) {
    super(`"${value}" is already in this list.`);
    this.name = 'DuplicateLookupError';
  }
}

class LookupRepository extends BaseRepository<LookupValue> {
  constructor() {
    super(() => db.lookup_values);
  }

  /**
   * Active options for a dropdown, sorted. `scope` narrows document_type
   * options to one entity_type (land / project / booking ...).
   */
  async options(category: LookupCategory, scope: string | null = null): Promise<LookupValue[]> {
    const rows = await db.lookup_values.where('category').equals(category).toArray();
    return rows
      .filter((r) => r.is_active && (scope === null || r.scope === scope))
      .sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value));
  }

  async deactivate(id: string): Promise<void> {
    await this.update(id, { is_active: false });
  }

  /* --- Module 8: Master Data screen (Section 9.7) --- */

  /**
   * Every option in a list, inactive ones included.
   *
   * `options()` is what the dropdowns read and it hides inactive values on
   * purpose. The Master Data screen has to show them — an option is retired by
   * being deactivated, not deleted, so the records that already use it keep
   * making sense, and an admin needs to see what has been retired to bring it
   * back.
   */
  async listAll(category: LookupCategory, scope: string | null = null): Promise<LookupValue[]> {
    const rows = await db.lookup_values.where('category').equals(category).toArray();
    return rows
      .filter((r) => (scope === null ? r.scope === null : r.scope === scope))
      .sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value));
  }

  /** Every distinct list in the table, so the screen needs no hard-coded map. */
  async groups(): Promise<Array<LookupGroupKey & { total: number; active: number }>> {
    const rows = await db.lookup_values.toArray();
    const byKey = new Map<string, LookupGroupKey & { total: number; active: number }>();

    for (const row of rows) {
      const key = `${row.category}::${row.scope ?? ''}`;
      const entry = byKey.get(key) ?? {
        category: row.category,
        scope: row.scope,
        total: 0,
        active: 0,
      };
      entry.total += 1;
      if (row.is_active) entry.active += 1;
      byKey.set(key, entry);
    }

    return [...byKey.values()].sort(
      (a, b) =>
        String(a.category).localeCompare(String(b.category)) ||
        (a.scope ?? '').localeCompare(b.scope ?? ''),
    );
  }

  /**
   * Adds an option to a list. Values are compared case-insensitively: "Lift"
   * and "lift" would render as two separate choices in the same dropdown, and
   * whoever picked the wrong one would have made an invisible mistake.
   */
  async addOption(
    category: LookupCategory,
    scope: string | null,
    value: string,
    createdBy: string | null = null,
  ): Promise<LookupValue> {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('Type the option first.');

    const existing = await this.listAll(category, scope);
    if (existing.some((r) => r.value.trim().toLowerCase() === trimmed.toLowerCase())) {
      throw new DuplicateLookupError(trimmed);
    }

    return this.create(
      {
        category,
        scope,
        value: trimmed,
        is_active: true,
        sort_order: existing.length + 1,
      },
      createdBy,
    );
  }

  async renameOption(id: string, value: string): Promise<LookupValue | undefined> {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('An option needs a name.');

    const row = await this.getById(id);
    if (!row) return undefined;

    const siblings = await this.listAll(row.category, row.scope);
    if (
      siblings.some(
        (r) => r.id !== id && r.value.trim().toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      throw new DuplicateLookupError(trimmed);
    }

    /*
     * Renaming changes the label everywhere it is already used, because
     * records store the value itself rather than a reference to this row. That
     * is right for a typo fix and wrong for "reuse this slot for something
     * else" — the screen says so before the rename is confirmed.
     */
    return this.update(id, { value: trimmed });
  }

  async setActive(id: string, isActive: boolean): Promise<LookupValue | undefined> {
    return this.update(id, { is_active: isActive });
  }

  /** Moves an option one place up or down within its own list. */
  async move(id: string, direction: 'up' | 'down'): Promise<void> {
    const row = await this.getById(id);
    if (!row) return;

    const siblings = await this.listAll(row.category, row.scope);
    const index = siblings.findIndex((r) => r.id === id);
    const swapWith = siblings[direction === 'up' ? index - 1 : index + 1];
    if (index < 0 || !swapWith) return;

    // rewrite the whole list's order rather than swapping two numbers: rows
    // seeded at different times can share a sort_order, and a swap between two
    // equal values moves nothing
    const reordered = [...siblings];
    reordered[index] = swapWith;
    reordered[direction === 'up' ? index - 1 : index + 1] = row;
    for (const [i, item] of reordered.entries()) {
      if (item.sort_order !== i + 1) await this.update(item.id, { sort_order: i + 1 });
    }
  }

  /**
   * How many records already use this option, so the screen can say what
   * deactivating it would leave behind. Only `document_type` is countable
   * today — the others are stored on rows this repository must not reach into
   * (a unit's `facing`, a project's `amenities`), and guessing at a count
   * would be worse than admitting there isn't one.
   */
  async usageCount(row: LookupValue): Promise<number | null> {
    if (row.category !== 'document_type' || !row.scope) return null;
    const docs = await db.documents
      .where('entity_type')
      .equals(row.scope)
      .toArray();
    return docs.filter((d) => d.document_type === row.value).length;
  }
}

export const lookupRepository = new LookupRepository();
