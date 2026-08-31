'use client';

import { db } from '../db/database';
import type { CompanySettings } from '../db/types';
import { BaseRepository, type UpdateRecord } from './base.repository';

/** company_settings holds exactly one row (Section 1.3). */
class CompanySettingsRepository extends BaseRepository<CompanySettings> {
  constructor() {
    super(() => db.company_settings);
  }

  async get(): Promise<CompanySettings | undefined> {
    const rows = await db.company_settings.limit(1).toArray();
    return rows[0];
  }

  async save(changes: UpdateRecord<CompanySettings>): Promise<CompanySettings | undefined> {
    const existing = await this.get();
    if (!existing) {
      return this.create({
        company_name: 'Company',
        default_currency: 'BDT',
        ...changes,
      } as never);
    }
    return this.update(existing.id, changes);
  }
}

export const companySettingsRepository = new CompanySettingsRepository();
