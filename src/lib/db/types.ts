/**
 * Shared entity types.
 * Field names mirror Scope Document v3.md exactly so Phase B (Postgres)
 * can reuse the same shape without a rewrite.
 */

export type UUID = string;
export type ISODate = string;      // 'YYYY-MM-DD'
export type ISODateTime = string;  // full ISO string

/** Every table carries these (Section 0 — Conventions). */
export interface BaseEntity {
  id: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  created_by: UUID | null;
}

/* ------------------------------------------------------------------ *
 * Section 1 — Shared components
 * ------------------------------------------------------------------ */

export type EntityType =
  | 'land'
  | 'project'
  | 'unit'
  | 'customer'
  | 'contractor'
  | 'supplier'
  | 'booking'
  | 'lead'
  | 'expense'
  | 'payment'
  | 'refund'
  | 'site_progress_update'
  | 'blog_post';

export interface DocumentRecord extends BaseEntity {
  entity_type: EntityType;
  entity_id: UUID;
  /** sourced from lookup_values (category='document_type', scope=entity_type) */
  document_type: string;
  /** free-text name, required when document_type = 'other' */
  custom_type_name?: string | null;
  /** display name of the file; in Phase B this becomes the storage URL */
  file_url: string;
  /**
   * Phase A additions — the file itself is kept in IndexedDB as a Blob so the
   * demo can preview it. Phase B replaces `file_data` with S3-compatible
   * storage and keeps `file_url` only.
   */
  file_data?: Blob | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  /** true => visible on the Public Portal (P2/P3) */
  is_public: boolean;
  uploaded_by: UUID | null;
  uploaded_at: ISODateTime;
  notes?: string | null;
}

export type LookupCategory =
  | 'document_type'
  | 'cost_category'
  | 'amenity'
  | 'unit_type'
  | 'facing'
  | 'land_size_unit'
  | (string & {});

export interface LookupValue extends BaseEntity {
  category: LookupCategory;
  /** for category='document_type' this is the entity_type it belongs to */
  scope: string | null;
  value: string;
  is_active: boolean;
  sort_order: number;
}

export interface CompanySettings extends BaseEntity {
  company_name: string;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  /** Public Portal P4 — click-to-chat */
  whatsapp_number?: string | null;
  email?: string | null;
  website?: string | null;
  trade_license_no?: string | null;
  tax_id?: string | null;
  default_currency: string;
  notes?: string | null;
}

/* ------------------------------------------------------------------ *
 * Module 1 — Land Management
 * ------------------------------------------------------------------ */

export const LAND_STATUSES = [
  'new',
  'site_visit_done',
  'legal_verification',
  'negotiation',
  'decision',
  'acquired',
  'jv_signed',
  'rejected',
  'linked_to_project',
] as const;
export type LandStatus = (typeof LAND_STATUSES)[number];

export const LAND_SIZE_UNITS = ['katha', 'bigha', 'decimal'] as const;
export type LandSizeUnit = (typeof LAND_SIZE_UNITS)[number];

export const ACQUISITION_TYPES = ['direct_purchase', 'joint_venture'] as const;
export type AcquisitionType = (typeof ACQUISITION_TYPES)[number];

export interface Land extends BaseEntity {
  code: string;                       // LND-2026-001
  name: string;
  location_division: string;
  location_district: string;
  location_area: string;
  road?: string | null;
  mouza?: string | null;
  dag_number?: string | null;
  khatian_number?: string | null;
  land_size: number;
  land_size_unit: LandSizeUnit;
  asking_price: number;
  negotiated_price?: number | null;
  /** reference amount for the future Finance module */
  final_agreed_amount?: number | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  nearby_facilities?: string | null;
  acquisition_type: AcquisitionType;
  status: LandStatus;
  assigned_to?: UUID | null;
  remarks?: string | null;
}

export interface Landowner extends BaseEntity {
  name: string;
  phone?: string | null;
  nid?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface LandOwnerMapping extends BaseEntity {
  land_id: UUID;
  owner_id: UUID;
  ownership_share_pct: number;
  is_primary_contact: boolean;
}

export interface LandJvDetails extends BaseEntity {
  land_id: UUID;
  developer_share_pct: number;
  landowner_share_pct: number;
  agreement_date: ISODate;
  power_of_attorney: boolean;
  poa_reference?: string | null;
  /**
   * Addendum (see JV_SHARE_BASES below): what the share percentages are a
   * percentage OF — number of flats, or total saleable sqft. Module 2 checks
   * the actual unit allocation against the share in this basis.
   */
  jv_share_basis?: JvShareBasis;
}

/**
 * Status-change log for a land (one row per pipeline step).
 * Captures the confirmation details taken when the user moves the land forward.
 */
export interface LandStatusEvent extends BaseEntity {
  land_id: UUID;
  from_status: LandStatus;
  to_status: LandStatus;
  /** when the step actually happened (visit date, agreement date, …) */
  event_date: ISODate;
  /** who did it on the ground — surveyor, lawyer, negotiator */
  performed_by?: string | null;
  /** offered/agreed amount, used by the negotiation and outcome steps */
  amount?: number | null;
  /** deed no., case no., agreement ref. */
  reference_no?: string | null;
  remarks?: string | null;
}

/** Document types for entity_type = 'land' (Section 2.7) */
export const LAND_DOCUMENT_TYPES = [
  'khatian_copy',
  'dolil_deed',
  'mutation_certificate',
  'tax_receipt',
  'location_map',
  'site_photo',
  'jv_agreement',
  'power_of_attorney',
  'other',
] as const;

/**
 * Addendum to Scope v3.md Section 2.6 (decided with the user, 2026-09-01):
 * a JV share percentage is meaningless until you say "percent of what". In
 * Bangladesh both bases are used, so the basis is captured per land when the
 * JV terms are entered, and Module 2 checks unit allocation against it.
 */
export const JV_SHARE_BASES = ['flat_count', 'total_sqft'] as const;
export type JvShareBasis = (typeof JV_SHARE_BASES)[number];

/* ------------------------------------------------------------------ *
 * Module 2 — Project Creation
 * ------------------------------------------------------------------ */

export const PROJECT_STATUSES = [
  'planning',
  'design',
  'approval',
  'under_construction',
  'nearly_complete',
  'handover_ongoing',
  'closed',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_TYPES = ['residential', 'commercial', 'mixed'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface Project extends BaseEntity {
  code: string;                       // PRJ-2026-001
  name: string;
  project_type: ProjectType;
  /** summed from the linked lands by default, editable */
  total_land_area?: number | null;
  total_land_area_unit?: LandSizeUnit;
  /** Public Portal P2 — marketing address, not the cadastral one */
  location_summary?: string | null;
  expected_start_date: ISODate;
  expected_completion_date: ISODate;
  actual_start_date?: ISODate | null;
  status: ProjectStatus;
  project_manager?: UUID | null;
  architect?: string | null;
  surroundings?: string | null;
  /** multi-select from lookup_values (category='amenity') */
  amenities: string[];
  cover_image_url?: string | null;
  /** Public Portal P1 */
  is_public: boolean;
  is_featured: boolean;
}

export interface LandProjectMapping extends BaseEntity {
  land_id: UUID;
  project_id: UUID;
}

export const TOWER_STATUSES = ['planning', 'under_construction', 'complete'] as const;
export type TowerStatus = (typeof TOWER_STATUSES)[number];

export interface Tower extends BaseEntity {
  project_id: UUID;
  name: string;
  floor_count: number;
  status: TowerStatus;
  /** e.g. "B+G+8" */
  building_type?: string | null;
  unit_per_floor?: number | null;
  lift_count?: number | null;
  electricity_backup?: boolean | null;
  front_road_width_ft?: number | null;
}

export const UNIT_STATUSES = [
  'available',
  'hold',
  'reserved',
  'booked',
  'sold',
  'handed_over',
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const ALLOCATION_TYPES = ['developer_share', 'landowner_share'] as const;
export type AllocationType = (typeof ALLOCATION_TYPES)[number];

export const FOR_SALE_BY = ['company', 'owner_direct'] as const;
export type ForSaleBy = (typeof FOR_SALE_BY)[number];

export interface Unit extends BaseEntity {
  code: string;                       // A-501
  tower_id: UUID;
  floor: number;
  unit_type: string;                  // lookup_values (category='unit_type')
  bedroom_count?: number | null;
  bathroom_count?: number | null;
  balcony_count?: number | null;
  size_sqft: number;
  facing?: string | null;             // lookup_values (category='facing')
  base_price: number;
  parking_allocated: number;
  status: UnitStatus;
  allocation_type: AllocationType;
  /** required when allocation_type = 'landowner_share' */
  allocated_to_owner_id?: UUID | null;
  for_sale_by: ForSaleBy;
}

/**
 * Status-change log for a project (addendum, same pattern as
 * `land_status_history` in Module 1). Section 3.2 gives the pipeline but no
 * audit trail; without one nobody can answer "when did RAJUK approve this, and
 * what was the memo number".
 */
export interface ProjectStatusEvent extends BaseEntity {
  project_id: UUID;
  from_status: ProjectStatus;
  to_status: ProjectStatus;
  /** when the step actually happened, not when it was typed in */
  event_date: ISODate;
  /** who did it — the architect, the officer, the contractor */
  performed_by?: string | null;
  /** approval memo, drawing set number, handover reference */
  reference_no?: string | null;
  remarks?: string | null;
}

/** Document types for entity_type = 'project' (Section 3.7) */
export const PROJECT_DOCUMENT_TYPES = [
  'architectural_plan',
  'structural_drawing',
  'rajuk_approval',
  'environmental_clearance',
  'fire_safety_certificate',
  'layout_floor_plan',
  'brochure',
  'gallery_image',
  'other',
] as const;

/** Seed options for the Module 2 dropdowns that live in lookup_values. */
export const UNIT_TYPE_OPTIONS = ['1 Bed', '2 Bed', '3 Bed', '4 Bed', 'Duplex', 'Penthouse', 'Shop', 'Office Space'] as const;
export const FACING_OPTIONS = ['South', 'North', 'East', 'West', 'South-East', 'South-West', 'North-East', 'North-West'] as const;
export const AMENITY_OPTIONS = [
  'Lift',
  'Generator',
  'Parking',
  'Security',
  'CCTV',
  'Community Space',
  'Rooftop Garden',
  'Gymnasium',
  'Prayer Room',
  'Children Play Area',
  'Substation',
  'Fire Fighting System',
] as const;

/* ------------------------------------------------------------------ *
 * Users (Section 9.4)
 *
 * Module 8 owns the management UI for these; the table lands here because
 * Module 3 cannot assign a lead to a Sales Executive without it. The shape is
 * exactly Section 9.4, so Module 8 only has to add screens on top.
 * ------------------------------------------------------------------ */

export const USER_ROLES = [
  'super_admin',
  'management',
  'land_team',
  'project_manager',
  'sales_executive',
  'sales_manager',
  'head_of_sales',
  'site_manager',
  'procurement',
  'accounts',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'inactive'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User extends BaseEntity {
  name: string;
  phone: string;
  email: string;
  /** Phase A placeholder — no real auth (Section 0) */
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  last_login_at?: ISODateTime | null;
}

/* ------------------------------------------------------------------ *
 * Module 3 — Sales / Lead / CRM
 * ------------------------------------------------------------------ */

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'site_visit_scheduled',
  'site_visit_done',
  'negotiation',
  'booked',
  'lost',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  'website_form',
  'whatsapp',
  'facebook_ad',
  'walk_in',
  'referral',
  'phone_call',
  'other',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface Lead extends BaseEntity {
  code: string;                       // LEAD-2026-001
  name: string;
  /** UNIQUE — this is the dedup key (Section 4.5) */
  phone: string;
  email?: string | null;
  source: LeadSource;
  inquiry_message?: string | null;
  interested_project_id?: UUID | null;
  interested_unit_id?: UUID | null;
  budget_range?: string | null;
  /** Sales Executive, set by hand (Section 4.7 — no auto round-robin) */
  assigned_to?: UUID | null;
  status: LeadStatus;
  /** filled when status = lost */
  lost_reason?: string | null;
}

export const LEAD_ACTIVITY_TYPES = [
  'call',
  'whatsapp',
  'email',
  'site_visit',
  'meeting',
  'status_change',
  'other',
] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export interface LeadActivity extends BaseEntity {
  lead_id: UUID;
  activity_type: LeadActivityType;
  notes: string;
  activity_date: ISODateTime;
  /** drives the sales team's daily task list (Section 4.4) */
  next_follow_up_date?: ISODate | null;
}

/** Document types for entity_type = 'lead' (Section 4.8) */
export const LEAD_DOCUMENT_TYPES = ['nid_copy', 'other'] as const;

/** Budget bands offered on the lead form — BDT, matching how buyers speak. */
export const BUDGET_RANGE_OPTIONS = [
  'Under 50 Lakh',
  '50 Lakh – 1 Crore',
  '1 – 1.5 Crore',
  '1.5 – 2 Crore',
  '2 – 3 Crore',
  'Above 3 Crore',
] as const;

/* ------------------------------------------------------------------ *
 * Module 4 — Booking & Customer
 * ------------------------------------------------------------------ */

export interface Customer extends BaseEntity {
  code: string;                       // CUST-2026-001
  name: string;
  /** UNIQUE — same dedup idea as leads */
  phone: string;
  email?: string | null;
  nid?: string | null;
  address?: string | null;
  profession?: string | null;
  /** which lead this customer was converted from, for traceability */
  lead_id?: UUID | null;
}

/**
 * Role-based discount ceiling (Section 5.4). A booking whose discount
 * percentage exceeds the booking user's ceiling needs a higher role to approve.
 */
export interface DiscountApprovalRule extends BaseEntity {
  role: UserRole;
  max_discount_pct: number;
}

export const BOOKING_STATUSES = [
  'hold',
  'pending_approval',
  'confirmed',
  'cancelled',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const DISCOUNT_APPROVAL_STATUSES = [
  'not_required',
  'pending',
  'approved',
  'rejected',
] as const;
export type DiscountApprovalStatus = (typeof DISCOUNT_APPROVAL_STATUSES)[number];

export interface Booking extends BaseEntity {
  code: string;                       // BOOK-2026-001
  customer_id: UUID;
  unit_id: UUID;
  lead_id?: UUID | null;
  booking_date: ISODate;
  /** snapshot of unit.base_price at booking time — the unit may be repriced */
  base_price: number;
  floor_premium: number;
  facing_premium: number;
  parking_charge: number;
  other_charges: number;
  discount_amount: number;
  /** base + premiums + charges − discount (Section 5.6) */
  final_price: number;
  /** advance expected from the buyer */
  booking_amount: number;
  booking_amount_received: boolean;
  discount_approval_status: DiscountApprovalStatus;
  discount_approved_by?: UUID | null;
  /**
   * Addendum to Section 5.5: 5.6 says a rejection sends the booking back to
   * `hold` "note সহ", but no field held that note — `cancellation_reason`
   * belongs to cancellation and reusing it would corrupt both meanings.
   * Cleared when the discount is changed and resubmitted.
   */
  discount_decision_note?: string | null;
  status: BookingStatus;
  /**
   * Addendum: how many months the monthly instalments are spread over for THIS
   * buyer. Defaults from the project's plan template, but tenure is the thing
   * buyers actually negotiate ("24 months is tight, give me 36"), and editing
   * two dozen generated rows afterwards is not a workable answer. Module 7
   * reads this when it generates the schedule.
   */
  installment_tenure_months?: number | null;
  cancellation_reason?: string | null;
  /** Sales Executive who made the booking */
  booked_by?: UUID | null;
}

/** Document types for entity_type = 'customer' (Section 5.7) */
export const CUSTOMER_DOCUMENT_TYPES = ['nid_copy', 'photo', 'other'] as const;

/** Document types for entity_type = 'booking' (Section 5.8) */
export const BOOKING_DOCUMENT_TYPES = ['booking_form', 'payment_receipt', 'other'] as const;


/* ------------------------------------------------------------------ *
 * Finance — the money-capture half, brought forward from Module 7
 *
 * Section 8.2 owns these. The `payments` table lands with Module 4 on purpose:
 * when the booking money is taken is exactly when the date, the method and the
 * receipt number are known, and nobody can reconstruct them months later. The
 * schema is Section 8.2's, so Module 7 adds the rest without a rewrite.
 * ------------------------------------------------------------------ */

export const PAYMENT_METHODS = ['cash', 'bank', 'mfs', 'cheque', 'card', 'online'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Payment extends BaseEntity {
  /**
   * Addendum: null until Module 7 generates the instalment rows. A payment
   * reaches its booking through the instalment in Section 8.2; with no
   * instalments yet that link would be broken, hence `booking_id` below.
   */
  installment_id?: UUID | null;
  /** Addendum: the booking this money was taken against. */
  booking_id: UUID;
  amount: number;
  payment_date: ISODate;
  payment_method: PaymentMethod;
  reference_no?: string | null;
  received_by?: UUID | null;
  notes?: string | null;
}

export const SCHEDULE_TYPES = ['on_booking', 'monthly', 'on_handover', 'manual'] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

/** Per-project instalment plan (Section 8.2), seeded when a project is created. */
export interface InstallmentPlanTemplate extends BaseEntity {
  project_id: UUID;
  sequence_no: number;
  label: string;
  percentage: number;
  schedule_type: ScheduleType;
  /** how many months `monthly` is split over */
  month_count?: number | null;
}

/** The system default of Section 8.2, copied onto every new project. */
export const DEFAULT_INSTALLMENT_PLAN: Array<{
  sequence_no: number;
  label: string;
  percentage: number;
  schedule_type: ScheduleType;
  month_count: number | null;
}> = [
  { sequence_no: 1, label: 'Booking Amount', percentage: 10, schedule_type: 'on_booking', month_count: null },
  { sequence_no: 2, label: 'Monthly Installment', percentage: 60, schedule_type: 'monthly', month_count: 24 },
  { sequence_no: 3, label: 'Construction Milestone', percentage: 20, schedule_type: 'manual', month_count: null },
  { sequence_no: 4, label: 'Handover', percentage: 10, schedule_type: 'on_handover', month_count: null },
];

/** Document types for entity_type = 'payment' (Section 8.2) */
export const PAYMENT_DOCUMENT_TYPES = ['payment_receipt', 'cheque_copy', 'other'] as const;
