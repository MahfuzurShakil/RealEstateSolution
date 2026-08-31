'use client';

import { companySettingsRepository, lookupRepository } from '../repositories';
import { LAND_DOCUMENT_TYPES, LAND_SIZE_UNITS } from './types';

/**
 * First-run master data. Only option-lists live here — workflow statuses stay
 * ENUMs in code (Section 1.2). Safe to call repeatedly: it no-ops if rows exist.
 */
let seedPromise: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  // Single-flight: React StrictMode runs effects twice in dev, and two
  // concurrent runs would both see an empty table and seed twice.
  seedPromise ??= runSeed();
  return seedPromise;
}

async function runSeed(): Promise<void> {
  if ((await lookupRepository.count()) === 0) {
    await lookupRepository.bulkCreate([
      ...LAND_DOCUMENT_TYPES.map((value, i) => ({
        category: 'document_type',
        scope: 'land',
        value,
        is_active: true,
        sort_order: i + 1,
      })),
      ...LAND_SIZE_UNITS.map((value, i) => ({
        category: 'land_size_unit',
        scope: null,
        value,
        is_active: true,
        sort_order: i + 1,
      })),
    ]);
  }

  if ((await companySettingsRepository.count()) === 0) {
    await companySettingsRepository.create({
      company_name: 'Your Developer Ltd.',
      default_currency: 'BDT',
      address: null,
      phone: null,
      whatsapp_number: null,
      email: null,
      website: null,
      logo_url: null,
      trade_license_no: null,
      tax_id: null,
      notes: null,
    });
  }
}
