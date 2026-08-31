'use client';

import Dexie, { type EntityTable } from 'dexie';
import type {
  CompanySettings,
  DocumentRecord,
  Land,
  LandJvDetails,
  LandOwnerMapping,
  LandStatusEvent,
  Landowner,
  LookupValue,
} from './types';

/**
 * Single Dexie instance shared by BOTH portals.
 *
 * Public Portal (Public-Portal_v1.md, Section 0 "Architecture Decision") and
 * Admin Portal live in the same Next.js app and read the same IndexedDB
 * database, so data entered in /admin shows up on the public site instantly.
 * Public routes must never touch this object directly — they go through
 * `lib/repositories/public/*`, which whitelists fields.
 */
export class AppDatabase extends Dexie {
  // Section 1 — shared tables
  documents!: EntityTable<DocumentRecord, 'id'>;
  lookup_values!: EntityTable<LookupValue, 'id'>;
  company_settings!: EntityTable<CompanySettings, 'id'>;

  // Module 1 — Land Management
  lands!: EntityTable<Land, 'id'>;
  landowners!: EntityTable<Landowner, 'id'>;
  land_owner_mapping!: EntityTable<LandOwnerMapping, 'id'>;
  land_jv_details!: EntityTable<LandJvDetails, 'id'>;
  land_status_history!: EntityTable<LandStatusEvent, 'id'>;

  constructor() {
    super('realestate_platform');

    // v1 — Shared components + Module 1 only.
    // Later modules append a NEW version block; never edit an old one.
    this.version(1).stores({
      documents: 'id, entity_type, entity_id, document_type, is_public, [entity_type+entity_id]',
      lookup_values: 'id, category, scope, is_active, sort_order, [category+scope]',
      company_settings: 'id',

      lands: 'id, &code, name, status, acquisition_type, location_district, location_area, assigned_to, created_at',
      landowners: 'id, name, phone, nid',
      land_owner_mapping: 'id, land_id, owner_id, [land_id+owner_id]',
      land_jv_details: 'id, &land_id',
    });

    // v2 — Module 1 status log. Non-indexed document fields (the uploaded Blob,
    // file name/size) need no version bump; only new stores and indexes do.
    this.version(2).stores({
      land_status_history: 'id, land_id, to_status, event_date, created_at',
    });
  }
}

let instance: AppDatabase | null = null;

/** Lazily created so the module stays import-safe during SSR. */
export function getDb(): AppDatabase {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is browser-only — call getDb() from a client component.');
  }
  if (!instance) instance = new AppDatabase();
  return instance;
}

/** Convenience proxy: `db.lands.toArray()` works in client code. */
export const db = new Proxy({} as AppDatabase, {
  get(_t, prop) {
    return Reflect.get(getDb(), prop, getDb());
  },
});
