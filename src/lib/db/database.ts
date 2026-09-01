'use client';

import Dexie, { type EntityTable } from 'dexie';
import type {
  Booking,
  CompanySettings,
  Customer,
  DiscountApprovalRule,
  InstallmentPlanTemplate,
  DocumentRecord,
  Land,
  LandJvDetails,
  LandOwnerMapping,
  LandProjectMapping,
  LandStatusEvent,
  Landowner,
  Lead,
  LeadActivity,
  LookupValue,
  Payment,
  Project,
  ProjectStatusEvent,
  Tower,
  Unit,
  User,
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

  // Module 2 — Project Creation
  projects!: EntityTable<Project, 'id'>;
  land_project_mapping!: EntityTable<LandProjectMapping, 'id'>;
  towers!: EntityTable<Tower, 'id'>;
  project_status_history!: EntityTable<ProjectStatusEvent, 'id'>;
  units!: EntityTable<Unit, 'id'>;

  // Users (Section 9.4) — Module 8 owns the UI, Module 3 needs the rows
  users!: EntityTable<User, 'id'>;

  // Module 3 — Sales / Lead / CRM
  leads!: EntityTable<Lead, 'id'>;
  lead_activities!: EntityTable<LeadActivity, 'id'>;

  // Module 4 — Booking & Customer
  customers!: EntityTable<Customer, 'id'>;
  bookings!: EntityTable<Booking, 'id'>;
  discount_approval_rules!: EntityTable<DiscountApprovalRule, 'id'>;

  // Finance — money capture, brought forward from Module 7 (Section 8.2)
  payments!: EntityTable<Payment, 'id'>;
  installment_plan_templates!: EntityTable<InstallmentPlanTemplate, 'id'>;

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

    // v3 — Module 2 (Project Creation). `jv_share_basis` is a new *field* on
    // land_jv_details, not an index, so that table needs no schema change.
    this.version(3).stores({
      projects: 'id, &code, name, status, project_type, is_public, is_featured, created_at',
      land_project_mapping: 'id, land_id, project_id, [land_id+project_id]',
      towers: 'id, project_id, name, status',
      units:
        'id, &code, tower_id, floor, status, unit_type, allocation_type, allocated_to_owner_id, for_sale_by, [tower_id+floor]',
    });

    // v4 — Module 3 (Sales / Lead / CRM) + the users table it assigns to.
    // `leads.phone` is unique on purpose: it is the dedup key (Section 4.5).
    this.version(4).stores({
      users: 'id, &phone, &email, name, role, status',
      leads:
        'id, &code, &phone, name, status, source, assigned_to, interested_project_id, interested_unit_id, created_at',
      lead_activities: 'id, lead_id, activity_type, activity_date, next_follow_up_date',
    });

    // v5 — Module 4 (Booking & Customer).
    this.version(5).stores({
      customers: 'id, &code, &phone, name, lead_id, created_at',
      bookings:
        'id, &code, customer_id, unit_id, lead_id, status, discount_approval_status, booking_date, booked_by, created_at',
      discount_approval_rules: 'id, &role',
    });

    // v6 — project pipeline audit trail (addendum, mirrors land_status_history)
    this.version(6).stores({
      project_status_history: 'id, project_id, to_status, event_date, created_at',
    });

    // v7 — money capture, brought forward from Module 7 (Section 8.2)
    this.version(7).stores({
      payments: 'id, booking_id, installment_id, payment_date, payment_method, received_by',
      installment_plan_templates: 'id, project_id, sequence_no, [project_id+sequence_no]',
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
