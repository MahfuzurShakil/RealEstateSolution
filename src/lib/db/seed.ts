'use client';

import { companySettingsRepository, landRepository, lookupRepository } from '../repositories';
import { demoDataWasCleared, seedDemoData } from './demo-seed';
import {
  AMENITY_OPTIONS,
  BOOKING_DOCUMENT_TYPES,
  CUSTOMER_DOCUMENT_TYPES,
  PAYMENT_DOCUMENT_TYPES,
  FACING_OPTIONS,
  LAND_DOCUMENT_TYPES,
  LAND_SIZE_UNITS,
  LEAD_DOCUMENT_TYPES,
  COST_CATEGORY_SEED,
  MATERIAL_UNIT_OPTIONS,
  PROJECT_DOCUMENT_TYPES,
  EXPENSE_DOCUMENT_TYPES,
  PURCHASE_ORDER_DOCUMENT_TYPES,
  REFUND_DOCUMENT_TYPES,
  SUPPLIER_VOUCHER_DOCUMENT_TYPES,
  SITE_PROGRESS_DOCUMENT_TYPES,
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
  await ensureOptions('document_type', 'lead', [...LEAD_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'customer', [...CUSTOMER_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'booking', [...BOOKING_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'payment', [...PAYMENT_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'site_progress_update', [...SITE_PROGRESS_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'purchase_order', [...PURCHASE_ORDER_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'supplier_voucher', [...SUPPLIER_VOUCHER_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'expense', [...EXPENSE_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'refund', [...REFUND_DOCUMENT_TYPES]);
  await ensureOptions('land_size_unit', null, [...LAND_SIZE_UNITS]);
  await ensureOptions('unit_type', null, [...UNIT_TYPE_OPTIONS]);
  await ensureOptions('facing', null, [...FACING_OPTIONS]);
  await ensureOptions('amenity', null, [...AMENITY_OPTIONS]);
  await ensureOptions('material_unit', null, [...MATERIAL_UNIT_OPTIONS]);
  // Tier 3.3: §1.2 always named `cost_category` a lookup list; it was an ENUM
  // until now. Seeded with codes, because an expense stores the code.
  await ensureSystemCostCategories();

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

/**
 * Seeds the six categories the code knows by name (Tier 3.3).
 *
 * Separate from `ensureOptions` because these carry a `code` and the
 * `is_system` flag, and because they are matched on the **code**, not the
 * value: an install where "Admin" has already been renamed to "Office &
 * Admin" must not have a second `admin` row added underneath it on the next
 * load. Existing rows are left exactly as they are, rename included.
 */
async function ensureSystemCostCategories(): Promise<void> {
  const existing = await lookupRepository.listAll('cost_category');
  const known = new Set(existing.map((r) => r.code).filter(Boolean));
  const missing = COST_CATEGORY_SEED.filter((c) => !known.has(c.code));
  if (missing.length === 0) return;

  await lookupRepository.bulkCreate(
    missing.map((c, i) => ({
      category: 'cost_category',
      scope: null,
      value: c.value,
      is_active: true,
      sort_order: existing.length + i + 1,
      code: c.code,
      is_system: true,
    })),
  );
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
