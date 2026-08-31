'use client';

import { companySettingsRepository, landRepository, lookupRepository } from '../repositories';
import { demoDataWasCleared, seedDemoData } from './demo-seed';
import {
  AMENITY_OPTIONS,
  FACING_OPTIONS,
  LAND_DOCUMENT_TYPES,
  LAND_SIZE_UNITS,
  PROJECT_DOCUMENT_TYPES,
  UNIT_TYPE_OPTIONS,
} from './types';

/**
 * First-run master data. Only option-lists live here — workflow statuses stay
 * ENUMs in code (Section 1.2). Safe to call repeatedly: each category is topped
 * up with only the options it is missing.
 */
let seedPromise: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  // Single-flight: React StrictMode runs effects twice in dev, and two
  // concurrent runs would both see an empty table and seed twice.
  seedPromise ??= runSeed();
  return seedPromise;
}

async function runSeed(): Promise<void> {
  // Master data is topped up per category, not seeded once: an install from
  // Module 1 already has rows, and Module 2's option-lists still need adding.
  await ensureOptions('document_type', 'land', [...LAND_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'project', [...PROJECT_DOCUMENT_TYPES]);
  await ensureOptions('land_size_unit', null, [...LAND_SIZE_UNITS]);
  await ensureOptions('unit_type', null, [...UNIT_TYPE_OPTIONS]);
  await ensureOptions('facing', null, [...FACING_OPTIONS]);
  await ensureOptions('amenity', null, [...AMENITY_OPTIONS]);

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

/** Adds the options of one category that are not in the table yet. */
async function ensureOptions(
  category: string,
  scope: string | null,
  values: string[],
): Promise<void> {
  const existing = await lookupRepository.options(category, scope);
  const known = new Set(existing.map((r) => r.value));
  const missing = values.filter((v) => !known.has(v));
  if (missing.length === 0) return;

  await lookupRepository.bulkCreate(
    missing.map((value, i) => ({
      category,
      scope,
      value,
      is_active: true,
      sort_order: existing.length + i + 1,
    })),
  );
}
