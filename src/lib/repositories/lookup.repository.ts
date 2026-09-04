'use client';

import { db } from '../db/database';
import type { LookupCategory, LookupValue } from '../db/types';
import { BaseRepository } from './base.repository';

/** A category, plus the entity_type it is scoped to when it has one. */
export interface LookupGroupKey {
  category: LookupCategory;
  scope: string | null;
}

/**
 * Categories whose records store a stable `code` rather than the label.
 *
 * Only `cost_category` today (Tier 3.3). Everything else stores its value on
 * the record, which is why renaming "South" renames it on every unit at once.
 * See the note on `LookupValue.code` for why this one cannot work that way.
 */
export const CODE_KEYED_LOOKUP_CATEGORIES: LookupCategory[] = ['cost_category'];

export class SystemOptionError extends Error {
  constructor(value: string) {
    super(`"${value}" is a built-in option and cannot be retired.`);
    this.name = 'SystemOptionError';
  }
}

/**
 * `Land Registration Fee` -> `land_registration_fee`.
 *
 * The code is generated once, when the option is created, and never follows a
 * later rename — that is the whole point of having it. Uniqueness is only
 * needed within the one list.
 */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'category'
  );
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

  /** Goes through `setActive`, so the system-option guard cannot be sidestepped. */
  /**
   * The cost-category list the expense screens read (Section 8.3 / §1.2).
   *
   * Returns **every** option, retired ones included, because the screens need
   * it for two different jobs and only one of them wants the active subset.
   * Labelling a cost recorded under a category that has since been retired
   * still has to show that category's real name — "Legal & Registration", not
   * a humanised guess at its code — so the label lookup must be able to see it.
   * Callers filter on `is_active` for the dropdowns, where a retired option
   * genuinely must not be offered.
   */
  async costCategories(): Promise<LookupValue[]> {
    return this.listAll('cost_category');
  }

  async deactivate(id: string): Promise<void> {
    await this.setActive(id, false);
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

    /*
     * A code-keyed list needs its key at creation time, because the record will
     * store the code and not the label. Uniquified against the codes already in
     * this list, including the seeded ones — "Other Costs" must not collide
     * with the seeded `other`, or two categories would become one.
     */
    let code: string | null = null;
    if (CODE_KEYED_LOOKUP_CATEGORIES.includes(category)) {
      const taken = new Set(existing.map((r) => r.code).filter(Boolean));
      const base = slugify(trimmed);
      code = base;
      for (let n = 2; taken.has(code); n += 1) code = `${base}_${n}`;
    }

    return this.create(
      {
        category,
        scope,
        value: trimmed,
        is_active: true,
        sort_order: existing.length + 1,
        code,
        is_system: false,
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

  /**
   * Retiring an option is refused for a seeded one the code depends on.
   *
   * There is no delete in Master Data — an option is retired by being
   * deactivated — so this is the only way a built-in category could disappear.
   * Deactivating `land_payment` would leave no way to record money paid to a
   * landowner while the land page carried on reporting a balance as though
   * there were, and nothing on screen would look wrong. Renaming and
   * reordering stay open: it is the key underneath, not the label, that the
   * code holds on to.
   */
  async setActive(id: string, isActive: boolean): Promise<LookupValue | undefined> {
    const row = await this.getById(id);
    if (!row) return undefined;
    if (!isActive && row.is_system) throw new SystemOptionError(row.value);
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
    // Countable since Tier 3.3, because an expense stores the code.
    if (row.category === 'cost_category' && row.code) {
      const code = row.code;
      return (await db.expenses.toArray()).filter((e) => e.cost_category === code).length;
    }
    if (row.category !== 'document_type' || !row.scope) return null;
    const docs = await db.documents
      .where('entity_type')
      .equals(row.scope)
      .toArray();
    return docs.filter((d) => d.document_type === row.value).length;
  }
}

export const lookupRepository = new LookupRepository();
