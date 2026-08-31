'use client';

import { db } from '../db/database';
import type { LookupCategory, LookupValue } from '../db/types';
import { BaseRepository } from './base.repository';

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
}

export const lookupRepository = new LookupRepository();
