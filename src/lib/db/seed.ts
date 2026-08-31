'use client';

import { companySettingsRepository, landRepository, lookupRepository } from '../repositories';
import { demoDataWasCleared, seedDemoData } from './demo-seed';
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

  // Demo dataset: only on a truly fresh database, and never again once the
  // user has deliberately cleared it from the dashboard.
  if ((await landRepository.count()) === 0 && !demoDataWasCleared()) {
    await seedDemoData();
  }

  if ((await companySettingsRepository.count()) === 0) {
    await companySettingsRepository.create({
      company_name: 'Nokshi Properties Ltd.',
      default_currency: 'BDT',
      address: 'House 27, Road 11, Banani, Dhaka 1213',
      phone: '+880 2 9876543',
      whatsapp_number: '+8801711000000',
      email: 'info@nokshiproperties.com.bd',
      website: 'https://nokshiproperties.com.bd',
      logo_url: null,
      trade_license_no: null,
      tax_id: null,
      notes: null,
    });
  }
}
