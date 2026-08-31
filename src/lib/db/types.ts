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
