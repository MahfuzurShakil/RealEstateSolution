'use client';

import {
  companySettingsRepository,
  ddChecklistRepository,
  landRepository,
  lookupRepository,
} from '../repositories';
import { demoDataWasCleared, seedDemoData } from './demo-seed';
import { ensureDemoSitePhotos, ensureDemoWebsiteContent, ensureDemoWebsitePictures, ensureDemoWebsiteText } from './demo-website';
import {
  AMENITY_OPTIONS,
  BOOKING_DOCUMENT_TYPES,
  CUSTOMER_DOCUMENT_TYPES,
  PAYMENT_DOCUMENT_TYPES,
  FACING_OPTIONS,
  LAND_DOCUMENT_TYPES,
  LAND_CLASSIFICATION_OPTIONS,
  LAND_SIZE_UNITS,
  LAND_SOURCE_OPTIONS,
  LEAD_DOCUMENT_TYPES,
  COST_CATEGORY_SEED,
  MATERIAL_UNIT_OPTIONS,
  PROJECT_DOCUMENT_TYPES,
  EXPENSE_DOCUMENT_TYPES,
  DIRECT_PURCHASE_DOCUMENT_TYPES,
  WORK_ITEM_TYPE_OPTIONS,
  PURCHASE_ORDER_DOCUMENT_TYPES,
  REFUND_DOCUMENT_TYPES,
  SUPPLIER_VOUCHER_DOCUMENT_TYPES,
  SUPPLIER_BILL_DOCUMENT_TYPES,
  SITE_PROGRESS_DOCUMENT_TYPES,
  SITE_VISIT_DOCUMENT_TYPES,
  DD_CHECKLIST_SEED,
  DD_EVIDENCE_DOCUMENT_TYPES,
  DEVELOPMENT_DOCUMENT_TYPES,
  LAND_DEVELOPMENT_ACTIVITIES,
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
  await ensureOptions('document_type', 'site_visit', [...SITE_VISIT_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'land_dd_item', [...DD_EVIDENCE_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'land_development_activity', [
    ...DEVELOPMENT_DOCUMENT_TYPES,
  ]);
  await ensureOptions('document_type', 'project', [...PROJECT_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'lead', [...LEAD_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'customer', [...CUSTOMER_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'booking', [...BOOKING_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'payment', [...PAYMENT_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'site_progress_update', [...SITE_PROGRESS_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'purchase_order', [...PURCHASE_ORDER_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'supplier_voucher', [...SUPPLIER_VOUCHER_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'supplier_bill', [...SUPPLIER_BILL_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'expense', [...EXPENSE_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'direct_purchase', [...DIRECT_PURCHASE_DOCUMENT_TYPES]);
  await ensureOptions('document_type', 'refund', [...REFUND_DOCUMENT_TYPES]);
  await ensureOptions('land_size_unit', null, [...LAND_SIZE_UNITS]);
  // BRD LAND-001. Both vary by district, so neither is an ENUM in code.
  await ensureOptions('land_classification', null, [...LAND_CLASSIFICATION_OPTIONS]);
  await ensureOptions('land_source', null, [...LAND_SOURCE_OPTIONS]);
  // BRD DEV-001 — the list differs by plot, so it is Master Data
  await ensureOptions('land_development_activity', null, [...LAND_DEVELOPMENT_ACTIVITIES]);
  await ensureOptions('unit_type', null, [...UNIT_TYPE_OPTIONS]);
  await reviveWorkTypes();
  await ensureOptions('work_item_type', null, [...WORK_ITEM_TYPE_OPTIONS]);
  await retireWorkTypes();
  await ensureOptions('facing', null, [...FACING_OPTIONS]);
  await ensureOptions('amenity', null, [...AMENITY_OPTIONS]);
  await ensureOptions('material_unit', null, [...MATERIAL_UNIT_OPTIONS]);
  // Tier 3.3: §1.2 always named `cost_category` a lookup list; it was an ENUM
  // until now. Seeded with codes, because an expense stores the code.
  await ensureSystemCostCategories();
  // BRD DD-001 — the checklist a fresh install starts with, editable after
  await ensureDdChecklist();

  // Demo dataset: only on a truly fresh database, and never again once the
  // user has deliberately cleared it from the dashboard.
  if ((await landRepository.count()) === 0 && !demoDataWasCleared()) {
    await seedDemoData();
  }
  // public-website demo pictures; a no-op once each demo project has them
  if (!demoDataWasCleared()) {
    await ensureDemoWebsitePictures();
    await ensureDemoSitePhotos();
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
  if (!demoDataWasCleared()) {
    await ensureDemoWebsiteText();
    await ensureDemoWebsiteContent();
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

/**
 * Seeds the due-diligence checklist (BRD DD-001).
 *
 * Matched on `code`, not on the label: an install where 'Mutation (namjari)
 * complete' has been renamed must not have a second copy added underneath it
 * on the next load. Existing rows are left exactly as they are, including a
 * mandatory flag the office has since changed.
 */
async function ensureDdChecklist(): Promise<void> {
  const existing = await ddChecklistRepository.allItems();

  /*
   * 2026-10-21 — the mandatory set shrank to six. A row nobody has touched
   * since it was seeded (updated_at still equals created_at) follows the new
   * flag; one the office has edited keeps whatever they chose.
   */
  const seedByCode = new Map(DD_CHECKLIST_SEED.map((c) => [c.code, c]));
  for (const row of existing) {
    const seeded = seedByCode.get(row.code);
    if (seeded && row.updated_at === row.created_at && row.is_mandatory !== seeded.is_mandatory) {
      await ddChecklistRepository.update(row.id, { is_mandatory: seeded.is_mandatory });
    }
  }

  const known = new Set(existing.map((r) => r.code));
  const missing = DD_CHECKLIST_SEED.filter((c) => !known.has(c.code));
  if (missing.length === 0) return;

  for (const [i, item] of missing.entries()) {
    await ddChecklistRepository.create({
      code: item.code,
      label: item.label,
      category: item.category,
      is_mandatory: item.is_mandatory,
      guidance: item.guidance,
      sort_order: existing.length + i + 1,
      is_active: true,
    });
  }
}

/** Adds the options of one category that are not in the table yet. */
/**
 * The first work-type list (2026-10-20) followed the old fixed WBS; the
 * 2026-10-21 list follows how a BD building actually goes up. The old names
 * are switched off, not deleted — items already typed with them keep them,
 * and their suggestions are found through aliases.
 */
/**
 * A name retired by one list and brought back by the next (Finishing, Lift &
 * Generator) is switched on again — before `ensureOptions`, which only sees
 * active values and would otherwise add it a second time.
 */
async function reviveWorkTypes(): Promise<void> {
  const all = (await lookupRepository.getAll()).filter((r) => r.category === 'work_item_type');
  for (const r of all) {
    if (!r.is_active && (WORK_ITEM_TYPE_OPTIONS as readonly string[]).includes(r.value)) {
      await lookupRepository.update(r.id, { is_active: true });
    }
  }
}

async function retireWorkTypes(): Promise<void> {
  // 2026-10-20 names, then the 2026-10-21 names merged into fewer kinds
  const stale = new Set([
    'Ground Floor',
    'Superstructure',
    'Roof',
    'Basement',
    'Brick Work',
    'Plaster',
    'Doors & Windows',
    'Tiles & Flooring',
    'Paint',
    'Lift',
    'Generator & Substation',
  ]);
  const rows = await lookupRepository.options('work_item_type', null);
  for (const r of rows) if (stale.has(r.value)) await lookupRepository.update(r.id, { is_active: false });
  // order the list the way the work happens
  const order = [...WORK_ITEM_TYPE_OPTIONS] as string[];
  for (const r of await lookupRepository.options('work_item_type', null)) {
    const at = order.indexOf(r.value);
    if (at >= 0 && r.sort_order !== at + 1) await lookupRepository.update(r.id, { sort_order: at + 1 });
  }
}

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
