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
  | 'site_visit'
  | 'land_dd_item'
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
  | 'purchase_order'
  | 'supplier_voucher'
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
  /**
   * The pipeline step this file was attached at, when it was uploaded from a
   * status-change dialog rather than from the Documents tab.
   *
   * The document still belongs to the entity itself — a khatian copy attached
   * during legal verification is a land document, and the Documents tab lists
   * it like any other. This only records *where it came in*, so the Timeline
   * can show the evidence next to the step it was collected at.
   *
   * Nullable and not indexed, so no Dexie version block was opened: a land's
   * document set is small enough to filter in memory, and the same precedent
   * already covers `towers.current_progress_pct`. The name is deliberately
   * generic — project and material-request pipelines have status history of
   * exactly the same shape and will reuse this field.
   */
  status_event_id?: UUID | null;
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
  /**
   * Addendum (Tier 3.3): the stable machine key a record stores, for the
   * categories that key off one. Nullable and not indexed, so no Dexie version
   * block was opened — same precedent as `towers.current_progress_pct` and
   * `stock_transfers.request_id`.
   *
   * Most lookup lists store their *value* on the record (`facing: 'South'`),
   * so a rename in Master Data rewrites the label everywhere at once, which is
   * what you want for a typo. `cost_category` cannot work that way:
   * `expenseRepository.landPaymentSummary` and the expense form's land picker
   * both key off `land_payment`, and if that key were the label, renaming it
   * would silently change what a land's balance means. So the label stays
   * renameable and the key underneath it does not move.
   */
  code?: string | null;
  /**
   * Addendum (Tier 3.3): a seeded option the application's own code depends on.
   *
   * System options can be renamed and reordered but never retired — there is
   * no delete in Master Data, and deactivating `land_payment` would leave no
   * way to record money paid to a landowner while the land page carried on
   * reporting a balance as if there were.
   */
  is_system?: boolean;
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
  /**
   * Gate G1 (BRD SITE-003): block the move from Under Review to Due Diligence
   * until an approved feasibility recommends proceeding.
   *
   * Configurable because the BRD says configurable, and off unless switched on
   * because a land bought before this system existed has no feasibility study
   * and still has to be recordable — turning a gate on for data that predates
   * it strands lands mid-pipeline on the day it ships.
   */
  require_feasibility_approval?: boolean | null;
  /**
   * Gate G2 (BRD DD-004 / BR-001): block Agreed → Acquired / JV Signed while a
   * mandatory due-diligence item is unfinished or failed and not waived.
   *
   * The BRD's hardest rule, and the one most worth switching on. Off unless
   * chosen for the same reason as G1 — land acquired before this system
   * existed has no checklist.
   */
  require_dd_completion?: boolean | null;
  /**
   * Gate G3 (BRD DEV-004): block linking a land to a project until its
   * land-development activities are complete or the land is marked as needing
   * none.
   */
  require_development_ready?: boolean | null;
}

/* ------------------------------------------------------------------ *
 * Module 1 — Land Management
 * ------------------------------------------------------------------ */

/**
 * The land pipeline, in the BRD's vocabulary (BRD v2.0 LAND-004).
 *
 * These used to be our own names — `new`, `site_visit_done`,
 * `legal_verification`, `decision`. The client chose the BRD's words over ours,
 * so the stored values were rewritten by the v19 upgrade rather than relabelled
 * in the UI. The map, and the reason a find-and-replace would have been wrong,
 * are both on that version block in `database.ts`.
 *
 * Two values are ours and are not in the BRD's list of eight:
 *
 * - `jv_signed` — the BRD folds a joint venture into ACQUIRED, but the whole JV
 *   branch (share basis, unit allocation, owner inventory) keys off this being
 *   its own outcome.
 * - `linked_to_project` — set by Module 2 when the land is mapped to a project,
 *   never chosen by hand.
 */
export const LAND_STATUSES = [
  'sourced',
  'under_review',
  'dd_in_progress',
  'negotiation',
  'agreed',
  'acquired',
  'jv_signed',
  'rejected',
  'disposed',
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
  /**
   * BRD LAND-001. The administrative tier between district and area, and the
   * one a Bangladeshi land record is actually filed under — a mouza belongs to
   * an upazila, so a dag number is only unambiguous with it.
   */
  location_upazila?: string | null;
  location_area: string;
  /** the road the plot is on */
  road?: string | null;
  /**
   * BRD LAND-001 — how the plot is reached, which is not the same question as
   * which road it is on. Free text rather than a width: at sourcing nobody has
   * measured anything, and the surveyed width belongs to the site visit
   * (BRD SITE-001, batch L2).
   */
  road_access?: string | null;
  /**
   * BRD LAND-001 — নাল, ভিটি, ডোবা and the rest. Sourced from `lookup_values`
   * (category='land_classification') because the list differs by district and
   * the office should not need a deploy to add one.
   */
  land_classification?: string | null;
  /**
   * BRD LAND-001 — where the opportunity came from: a broker, the owner
   * directly, a reference, our own survey. Drives the "acquisition pipeline"
   * KPI in BRD section 32. From `lookup_values` (category='land_source').
   */
  source?: string | null;
  mouza?: string | null;
  dag_number?: string | null;
  khatian_number?: string | null;
  land_size: number;
  land_size_unit: LandSizeUnit;
  asking_price: number;
  /**
   * What was actually settled on.
   *
   * `negotiated_price` used to sit between this and `asking_price` (Scope v3.md
   * Section 2.3). It was dropped after client review: a single "negotiated"
   * number is a snapshot of a conversation that has rounds, and the offer
   * ladder that replaces it (BRD ACQ-001, batch L4) records every round with
   * its date, its terms and who made it. Keeping a lone field alongside that
   * would leave two answers to "what did we offer".
   *
   * Written by the pipeline when a land reaches `acquired` or `jv_signed`, and
   * editable afterwards for corrections and for lands entered after the fact.
   * On a JV this is the cash side of the deal, not a purchase price.
   */
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
  /**
   * BRD LAND-002 — how much land this owner holds, in the land's own
   * `land_size_unit`.
   *
   * Not derived from the percentage on purpose. A share and an area disagree
   * more often than they agree in a real khatian: heirs divide by the deed,
   * not by arithmetic, and the percentage is frequently a rounding of the
   * area rather than the other way round. Storing both is what lets the
   * Owners tab show them side by side and flag the gap.
   */
  ownership_area?: number | null;
  /**
   * BRD LAND-002 — what was agreed with *this* owner.
   *
   * A land with three owners is three settlements at three prices, and BR-003
   * requires every payment to reference its owner. The per-owner settlement
   * schedule that consumes this arrives in batch L5; until then the figure is
   * recorded and shown against the land total, which is how the mismatch
   * becomes visible before anybody is paid.
   */
  agreed_amount?: number | null;
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

/* ------------------------------------------------------------------ *
 * Module 1 / batch L2 — Site Visit & Feasibility (BRD section 8)
 * ------------------------------------------------------------------ */

/**
 * One visit to a plot (BRD SITE-001).
 *
 * Many per land on purpose. A plot worth buying is visited more than once —
 * the first look, the one with the engineer, the one after the rains — and
 * what changes between them is the whole value of keeping them. Until now the
 * pipeline recorded exactly one "site visit done" with a free-text remark, so
 * the second visit had nowhere to go.
 *
 * Photos and video are not fields here: they are `documents` rows with
 * `entity_type = 'site_visit'`, like every other file in the system.
 */
export interface SiteVisit extends BaseEntity {
  land_id: UUID;
  visit_date: ISODate;
  /** who led the visit */
  visited_by?: string | null;
  /** everyone else who went — engineer, lawyer, the owner's son */
  participants?: string | null;
  /** how the team actually got there on the day */
  access_note?: string | null;
  /** measured, unlike the land-level `road_access` which is a description */
  road_width_ft?: number | null;
  /*
   * BRD says "utilities" as one item. Captured as four flags plus a note
   * rather than one text blob: whether a plot has gas is the sort of thing
   * that decides a project, and a sentence cannot be filtered on later.
   * `null` means nobody checked, which is not the same as "no".
   */
  has_electricity?: boolean | null;
  has_gas?: boolean | null;
  has_water?: boolean | null;
  has_sewerage?: boolean | null;
  utilities_note?: string | null;
  drainage?: string | null;
  soil_condition?: string | null;
  /** lowland needing fill is the single biggest hidden cost on a BD plot */
  is_lowland?: boolean | null;
  filling_required_ft?: number | null;
  surroundings?: string | null;
  /** what neighbours say land is going for — not a valuation */
  price_observation?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  remarks?: string | null;
}

/**
 * What the numbers have to say before the land goes to the lawyers
 * (BRD SITE-002).
 */
export const FEASIBILITY_RECOMMENDATIONS = ['proceed', 'hold', 'reject'] as const;
export type FeasibilityRecommendation = (typeof FEASIBILITY_RECOMMENDATIONS)[number];

export const FEASIBILITY_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type FeasibilityStatus = (typeof FEASIBILITY_STATUSES)[number];

/**
 * A feasibility study for a land (BRD SITE-002, SITE-003).
 *
 * Versioned rather than edited in place: the numbers change when the site
 * visit turns up two feet of fill, and the version that the board approved has
 * to stay readable afterwards. `version_no` counts up per land and the highest
 * one is the current study.
 *
 * An approved study carrying `recommendation = 'proceed'` is what opens gate
 * G1 (SITE-003) — see `feasibilityOpensGate` in `domain/land.ts`.
 */
export interface LandFeasibility extends BaseEntity {
  land_id: UUID;
  version_no: number;
  est_acquisition_cost: number;
  est_development_cost: number;
  /** registration, legal, marketing — anything not in the two above */
  est_other_cost: number;
  expected_revenue: number;
  assumptions?: string | null;
  risks?: string | null;
  recommendation: FeasibilityRecommendation;
  status: FeasibilityStatus;
  prepared_by?: string | null;
  submitted_at?: ISODateTime | null;
  /** who approved or rejected it, and what they said */
  decided_by?: UUID | null;
  decided_at?: ISODateTime | null;
  decision_note?: string | null;
  remarks?: string | null;
}

/* ------------------------------------------------------------------ *
 * Module 1 / batch L4 — Negotiation & Acquisition (BRD section 10)
 * ------------------------------------------------------------------ */

/** Whose move it was (BRD ACQ-001). */
export const NEGOTIATION_PARTIES = ['us', 'owner'] as const;
export type NegotiationParty = (typeof NEGOTIATION_PARTIES)[number];

export const NEGOTIATION_ROUND_STATUSES = [
  'open',
  'accepted',
  'rejected',
  'superseded',
] as const;
export type NegotiationRoundStatus = (typeof NEGOTIATION_ROUND_STATUSES)[number];

/**
 * One round of a negotiation (BRD ACQ-001).
 *
 * This replaces the single "Offered amount" typed into the pipeline dialog.
 * That field recorded the last number anybody entered and nothing about how it
 * got there — who moved, when, what was attached to the price, which broker was
 * in the room. A price without its conditions is not a price: "4.2 crore" and
 * "4.2 crore with possession in six months and the boundary wall rebuilt" are
 * different deals.
 *
 * Rounds are never edited once superseded or accepted, so the ladder stays
 * readable as the record of how the deal was actually reached.
 */
export interface LandNegotiation extends BaseEntity {
  land_id: UUID;
  /** which owner this round was with; null when it is with all of them */
  owner_id?: UUID | null;
  round_no: number;
  party: NegotiationParty;
  amount: number;
  offer_date: ISODate;
  /** payment terms — instalments, advance, timing */
  terms?: string | null;
  /** everything that is not money: possession date, wall, tenants, trees */
  conditions?: string | null;
  broker_name?: string | null;
  /** commission agreed with that broker, where one is involved */
  broker_commission?: number | null;
  status: NegotiationRoundStatus;
  recorded_by?: UUID | null;
  remarks?: string | null;
}

/**
 * A line of the acquisition cost build-up (BRD ACQ-002).
 *
 * The BRD wants total acquisition cost, not just land price: registration,
 * legal, taxes and fees, broker commission and anything else. Only the
 * *estimate* is stored — the actual is read from the expense ledger, because
 * the money has already been recorded there and a second copy is a second
 * answer.
 */
export const ACQUISITION_COST_HEADS = [
  'land_price',
  'registration_fee',
  'stamp_duty',
  'vat_tax',
  'mutation_cost',
  'legal_fee',
  'broker_commission',
  'survey_fee',
  'other',
] as const;
export type AcquisitionCostHead = (typeof ACQUISITION_COST_HEADS)[number];

export const ACQUISITION_COST_HEAD_LABEL: Record<AcquisitionCostHead, string> = {
  land_price: 'Land price',
  registration_fee: 'Registration fee',
  stamp_duty: 'Stamp duty',
  vat_tax: 'VAT & tax',
  mutation_cost: 'Mutation (namjari)',
  legal_fee: 'Legal fees',
  broker_commission: 'Broker commission',
  survey_fee: 'Survey fee',
  other: 'Other',
};

export interface LandAcquisitionCost extends BaseEntity {
  land_id: UUID;
  cost_head: AcquisitionCostHead;
  estimated_amount: number;
  remarks?: string | null;
}

/* ------------------------------------------------------------------ *
 * Module 1 / batch L3 — Legal Due Diligence (BRD section 9)
 * ------------------------------------------------------------------ */

/**
 * What the checklist groups items under (BRD DD-001).
 *
 * Not a `lookup_values` category, because the code branches on nothing here —
 * it is purely how the tab is sectioned, and an admin adding a seventh group
 * would produce a section with no meaning behind it.
 */
export const DD_CATEGORIES = [
  'ownership',
  'title',
  'encumbrance',
  'statutory',
  'physical',
  'authority',
] as const;
export type DdCategory = (typeof DD_CATEGORIES)[number];

export const DD_CATEGORY_LABEL: Record<DdCategory, string> = {
  ownership: 'Ownership',
  title: 'Title & deed chain',
  encumbrance: 'Encumbrance & mortgage',
  statutory: 'Tax & statutory',
  physical: 'Physical & boundary',
  authority: 'Authority approvals',
};

/**
 * A configurable checklist item (BRD DD-001).
 *
 * A master table rather than a `lookup_values` row, because an item is more
 * than a label: it carries `is_mandatory`, which gate G2 reads, and a category
 * that sections the tab. `lookup_values` is for flat "pick one of these"
 * lists, and bolting two meaningful columns onto it for one consumer would
 * make every other list carry columns it has no use for.
 *
 * Items are deactivated, never deleted: a land whose due diligence already
 * references an item must keep reading a real row, and `is_mandatory` at the
 * time of the check is what an auditor will ask about.
 */
export interface DdChecklistItem extends BaseEntity {
  /** stable key, so renaming the label does not orphan anything */
  code: string;
  label: string;
  category: DdCategory;
  /** gate G2 only blocks on the mandatory ones (BRD DD-004 / BR-001) */
  is_mandatory: boolean;
  /** what the lawyer is actually being asked to confirm */
  guidance?: string | null;
  sort_order: number;
  is_active: boolean;
}

/**
 * The states an item moves through (BRD DD-003).
 *
 * `not_applicable` is separate from `passed` on purpose: a mortgage search on
 * land that was never mortgaged is not a check that passed, and an auditor
 * asking "was this verified" deserves the honest answer.
 *
 * `waived` is the only way a `failed` or unfinished mandatory item lets a land
 * through gate G2, and it always carries a reason and a name (BR-001).
 */
export const DD_ITEM_STATUSES = [
  'pending',
  'in_progress',
  'passed',
  'failed',
  'waived',
  'not_applicable',
] as const;
export type DdItemStatus = (typeof DD_ITEM_STATUSES)[number];

/** One checklist item as it stands on one land (BRD DD-002, DD-003). */
export interface LandDdItem extends BaseEntity {
  land_id: UUID;
  item_id: UUID;
  status: DdItemStatus;
  /** who is doing the check */
  assigned_to?: UUID | null;
  /** what they found — required when an item fails */
  finding?: string | null;
  submitted_by?: UUID | null;
  submitted_at?: ISODateTime | null;
  reviewed_by?: UUID | null;
  reviewed_at?: ISODateTime | null;
  waiver_reason?: string | null;
  waived_by?: UUID | null;
  waived_at?: ISODateTime | null;
  /**
   * Whether this item was mandatory when the land's checklist was created.
   *
   * Snapshotted rather than read live from the master, because an admin
   * unticking "mandatory" on an item would otherwise silently open gate G2 on
   * every land the item was blocking — the lands would pass a check nobody
   * decided to waive.
   */
  is_mandatory: boolean;
}

/** Document types for entity_type = 'land_dd_item' (BRD DD-002) */
export const DD_EVIDENCE_DOCUMENT_TYPES = [
  'khatian_copy',
  'dolil_deed',
  'mutation_certificate',
  'tax_receipt',
  'search_report',
  'ncc_certificate',
  'court_order',
  'survey_report',
  'other',
] as const;

/**
 * The checklist a fresh install starts with (BRD DD-001).
 *
 * Every item the BRD names, plus the ones a Bangladeshi land purchase actually
 * turns on. The mandatory set is the one the client still has to confirm —
 * see BRD-ALIGNMENT-PLAN.md section 7, Q2 — so it is seeded with the answer a
 * lawyer would give and left editable in Master Data.
 */
export const DD_CHECKLIST_SEED: Array<{
  code: string;
  label: string;
  category: DdCategory;
  is_mandatory: boolean;
  guidance: string;
}> = [
  {
    code: 'ownership_proof',
    label: 'Ownership confirmed',
    category: 'ownership',
    is_mandatory: true,
    guidance: 'Seller is the recorded owner, and every recorded owner is party to the deal.',
  },
  {
    code: 'heir_consent',
    label: 'Heirs / co-owners consent',
    category: 'ownership',
    is_mandatory: true,
    guidance: 'Warisan certificate where inherited; written consent from every co-owner.',
  },
  {
    code: 'poa_validity',
    label: 'Power of attorney valid',
    category: 'ownership',
    is_mandatory: false,
    guidance: 'Only where someone signs on an owner’s behalf — registered and unrevoked.',
  },
  {
    code: 'deed_chain',
    label: 'Deed chain traced',
    category: 'title',
    is_mandatory: true,
    guidance: 'Unbroken chain of dolil back at least 25 years.',
  },
  {
    code: 'khatian_verified',
    label: 'Khatian verified',
    category: 'title',
    is_mandatory: true,
    guidance: 'CS / SA / RS / BS khatian consistent with the deed and with each other.',
  },
  {
    code: 'mutation_done',
    label: 'Mutation (namjari) complete',
    category: 'title',
    is_mandatory: true,
    guidance: 'Mutation in the current owner’s name, with the DCR.',
  },
  {
    code: 'encumbrance_search',
    label: 'Encumbrance search clear',
    category: 'encumbrance',
    is_mandatory: true,
    guidance: 'Sub-registry search certificate covering the last 25 years.',
  },
  {
    code: 'mortgage_clear',
    label: 'No subsisting mortgage',
    category: 'encumbrance',
    is_mandatory: true,
    guidance: 'Bank NOC or redemption evidence where a charge was ever registered.',
  },
  {
    code: 'litigation_clear',
    label: 'No pending litigation',
    category: 'encumbrance',
    is_mandatory: true,
    guidance: 'Civil and land-survey court searches; check for injunctions.',
  },
  {
    code: 'land_tax_paid',
    label: 'Land development tax paid',
    category: 'statutory',
    is_mandatory: true,
    guidance: 'Dakhila up to the current Bangla year.',
  },
  {
    code: 'holding_tax_paid',
    label: 'Municipal holding tax clear',
    category: 'statutory',
    is_mandatory: false,
    guidance: 'City corporation or pourashava dues cleared.',
  },
  {
    code: 'acquisition_check',
    label: 'Not under government acquisition',
    category: 'statutory',
    is_mandatory: true,
    guidance: 'L.A. case search — check for requisition and for khas classification.',
  },
  {
    code: 'boundary_survey',
    label: 'Boundary survey matches the deed',
    category: 'physical',
    is_mandatory: true,
    guidance: 'Amin survey against the dag; note any encroachment.',
  },
  {
    code: 'possession_clear',
    label: 'Vacant possession deliverable',
    category: 'physical',
    is_mandatory: true,
    guidance: 'Tenants, structures and any adverse possession identified with a vacancy date.',
  },
  {
    code: 'access_right',
    label: 'Legal right of access',
    category: 'physical',
    is_mandatory: false,
    guidance: 'Road access is on record, not by neighbour’s goodwill.',
  },
  {
    code: 'land_use_clearance',
    label: 'Land use permits development',
    category: 'authority',
    is_mandatory: true,
    guidance: 'RAJUK / CDA detailed area plan — zoning allows the intended use.',
  },
  {
    code: 'authority_noc',
    label: 'Authority NOCs identified',
    category: 'authority',
    is_mandatory: false,
    guidance: 'Civil aviation, environment, water body or heritage NOCs where they apply.',
  },
];

/** Document types for entity_type = 'site_visit' (BRD SITE-001) */
export const SITE_VISIT_DOCUMENT_TYPES = [
  'site_photo',
  'site_video',
  'sketch_map',
  'survey_note',
  'other',
] as const;

/**
 * BRD LAND-001 — how a plot is classified in the land record.
 *
 * These are the Bangladeshi cadastral classes, kept in Bangla because that is
 * what the khatian says and what the land officer will read back to you.
 * Seeded into `lookup_values` rather than frozen as an ENUM: the set varies by
 * district, and adding one should not need a deploy.
 */
export const LAND_CLASSIFICATION_OPTIONS = [
  'নাল (Nal — paddy land)',
  'ভিটি (Bhiti — homestead)',
  'ডোবা (Doba — ditch/pond)',
  'পুকুর (Pukur — pond)',
  'বাগান (Bagan — orchard)',
  'চালা (Chala — high land)',
  'ডাঙ্গা (Danga — dry raised land)',
  'বাণিজ্যিক (Commercial)',
  'অন্যান্য (Other)',
] as const;

/**
 * BRD LAND-001 — where the opportunity came from.
 *
 * This is the denominator of the acquisition-pipeline KPI in BRD section 32:
 * without it there is no way to answer "which of our sources actually produce
 * land we buy", which is the question that decides who gets paid a commission
 * next year.
 */
export const LAND_SOURCE_OPTIONS = [
  'Broker / Dalal',
  'Direct owner approach',
  'Owner walk-in',
  'Reference',
  'Own survey',
  'Auction / Bank',
  'Other',
] as const;

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
  /**
   * The uploaded picture used as the display image, when one has been chosen.
   *
   * Phase A keeps uploaded files as Blobs in IndexedDB, so an uploaded photo
   * has no URL to put in `cover_image_url` — it is referenced by its
   * `documents` row instead. Takes precedence over `cover_image_url`, which
   * stays for an externally hosted image. In Phase B, when documents get real
   * storage URLs, this collapses back into `cover_image_url`.
   *
   * Not indexed — nothing queries by it — so no new Dexie version block
   * (same precedent as `towers.current_progress_pct`).
   */
  cover_image_document_id?: UUID | null;
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
  /**
   * Cached construction progress (Section 6.3): Σ work_item.actual_progress_pct
   * × weight_pct ÷ 100. Written by the Module 5 repository whenever a progress
   * update lands, never typed in by hand. Undefined on towers created before
   * Module 5 — read it through `towerProgressPct()`.
   */
  current_progress_pct?: number | null;
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
  /** Tier 3.5: the account this money landed in. Null = not attributed yet. */
  account_id?: UUID | null;
  /**
   * Addendum: null until Module 7 generates the instalment rows. A payment
   * reaches its booking through the instalment in Section 8.2; with no
   * instalments yet that link would be broken, hence `booking_id` below.
   *
   * **This is an output, not an input, and that is the opposite of
   * `Expense.installment_id` — do not read the two the same way.**
   * `recalculateForBooking` runs the waterfall and then *writes* this column
   * with the first instalment the receipt happened to touch, as provenance for
   * the printed receipt. Setting it before the recalculation changes nothing:
   * the next run overwrites it.
   *
   * A land payment (v17) is the other direction — there the column says where
   * the money is *meant* to go, and the allocator honours it. A buyer receipt
   * cannot be aimed at an instalment; see the note in OPEN-ITEMS.
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

/* ------------------------------------------------------------------ *
 * Module 5 — Site Progress Update (Section 6)
 * ------------------------------------------------------------------ */

export const WORK_ITEM_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/** WBS line of one tower (Section 6.2). */
export interface TowerWorkItem extends BaseEntity {
  tower_id: UUID;
  name: string;
  sequence_no: number;
  /** contribution to the tower's overall % — all items together make 100 */
  weight_pct: number;
  planned_start_date?: ISODate | null;
  planned_end_date?: ISODate | null;
  actual_progress_pct: number;
  status: WorkItemStatus;
}

/**
 * The daily site log (Section 6.3). One row per reported reading; the work
 * item's `actual_progress_pct` and the tower's cached % are recomputed from it.
 */
export interface SiteProgressUpdate extends BaseEntity {
  work_item_id: UUID;
  update_date: ISODate;
  progress_pct: number;
  remarks?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  updated_by: UUID | null;
}

/** Document types for entity_type = 'site_progress_update' (Section 6.4) */
export const SITE_PROGRESS_DOCUMENT_TYPES = ['progress_photo', 'progress_video', 'other'] as const;

/**
 * Lifecycle of Section 6.5, with the two steps it was missing.
 *
 * `fulfilled` used to be written by the goods receipt that completed the
 * purchase order — so a request was "fulfilled" the moment material landed in
 * the *store*, which is not what the word means to the person who raised it.
 * The site engineer who asked for 450 bags of cement is not fulfilled by cement
 * sitting in a godown across town, and the queue said the job was done while
 * the material had not moved.
 *
 * `received` is the store's answer — it is here, we have it. `delivered` is the
 * store's other answer — it has gone out to the site. `fulfilled` is now the
 * *site's* answer, and only the site can give it, which is the whole point:
 * short deliveries and material that never arrived are caught by the person who
 * would notice.
 *
 * Rows written before this change keep `fulfilled`. They completed under the
 * old rule, and re-labelling closed history would be inventing an
 * acknowledgement nobody gave.
 */
export const MATERIAL_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'ordered',
  'received',
  'delivered',
  'fulfilled',
] as const;
export type MaterialRequestStatus = (typeof MATERIAL_REQUEST_STATUSES)[number];

/** Site → Procurement bridge (Section 6.5). */
export interface MaterialRequest extends BaseEntity {
  code: string;                       // MREQ-2026-001
  project_id: UUID;
  tower_id?: UUID | null;
  work_item_id?: UUID | null;
  /** site engineer who raised it */
  requested_by: UUID | null;
  request_date: ISODate;
  status: MaterialRequestStatus;
  notes?: string | null;
  /**
   * Addendum to Section 6.5: the lifecycle has a `rejected` branch but no
   * field to say why, and `notes` is the requester's own text — overwriting it
   * with the procurement decision would destroy what was asked for. Same
   * pattern as `bookings.discount_decision_note` in Module 4.
   */
  decision_note?: string | null;
}

/**
 * The material catalogue (Tier 3.1, Section 6.6).
 *
 * Item names were free text in five tables — `material_request_items`,
 * `purchase_order_items`, `stock`, `stock_issues`, `stock_transfers` — and
 * §6.6 always called that temporary. Free text means "Cement (Fresh)" and
 * "cement fresh" become two items holding separate quantities and separate
 * weighted-average costs, and stock valuation quietly stops meaning anything.
 *
 * **The unit lives here, not on the line.** It is a property of the item —
 * cement is stocked in bags — and putting it in the stock key alongside the
 * name was the third way one material could split into several rows. Buying in
 * a different unit is a conversion, which is out of scope; allowing two units
 * for one item would rebuild the problem this table exists to remove.
 */
export interface MaterialItem extends BaseEntity {
  code: string;                       // ITM-0001
  name: string;
  /** lookup_values (category='material_unit') — the one unit it is stocked in */
  unit: string;
  /** free text grouping — cement, rod, sand, electrical … */
  category?: string | null;
  is_active: boolean;
  notes?: string | null;
}

export interface MaterialRequestItem extends BaseEntity {
  request_id: UUID;
  /** Tier 3.1: the catalogue item this line is for. */
  item_id?: UUID | null;
  /**
   * The name as it was written on this requisition. Kept beside `item_id`
   * rather than replaced by it: a requisition is a document, and renaming an
   * item in the catalogue must not rewrite what a site engineer asked for last
   * March. `item_id` is the identity; this is the record.
   */
  item_name: string;
  /** lookup_values (category='material_unit') — bag / ton / piece … */
  unit: string;
  quantity_requested: number;
  quantity_approved?: number | null;
  /**
   * Addendum to Section 6.6: the lines of a request have no natural order in
   * the schema, and `created_at` does not settle it — several lines are saved
   * in the same millisecond, so the list came back shuffled and the request
   * card named a different "first item" on every read. A requisition is read
   * and checked off in the order it was written, so the order is stored.
   * Not indexed: it is only ever used to sort the handful of lines of one
   * request, which are already in memory.
   */
  sort_order: number;
}

/**
 * Addendum to Section 6.5: the lifecycle is defined but nothing recorded the
 * transitions, so only a request's CURRENT status was knowable. A request
 * approved on the 8th and ordered on the 23rd had lost the approval date
 * entirely — and "when did Procurement actually approve this" is the first
 * question asked when a delivery is late. Same shape as `land_status_history`
 * and `project_status_history`, which exist for exactly this reason.
 */
export interface MaterialRequestStatusEvent extends BaseEntity {
  request_id: UUID;
  from_status: MaterialRequestStatus;
  to_status: MaterialRequestStatus;
  /** when the decision was taken, not when it was typed in */
  event_date: ISODate;
  decided_by?: UUID | null;
  note?: string | null;
}

/** Seed options for the material unit dropdown (lookup_values). */
export const MATERIAL_UNIT_OPTIONS = [
  'bag',
  'ton',
  'piece',
  'cft',
  'sft',
  'kg',
  'litre',
  'bundle',
  'truck',
  'roll',
] as const;

/**
 * Default WBS applied to a new tower (Section 6.2 note). Equal weight, in the
 * order the work actually happens; the Project Manager edits it afterwards.
 */
export const DEFAULT_TOWER_WORK_ITEMS = [
  'Foundation',
  'Ground Floor',
  'Superstructure',
  'Roof',
  'Electrical',
  'Plumbing',
  'Finishing',
  'External Works',
] as const;

/* ------------------------------------------------------------------ *
 * Module 6 — Procurement & Supplier Voucher (Section 7)
 * ------------------------------------------------------------------ */

export const SUPPLIER_TYPES = ['material_supplier', 'contractor', 'other'] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number];

/** Vendor master (Section 7.3). Reused by the future Contractor module. */
export interface Supplier extends BaseEntity {
  code: string;                       // SUP-2026-001
  name: string;
  type: SupplierType;
  contact_person?: string | null;
  phone: string;
  address?: string | null;
  notes?: string | null;
}

export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/** Section 7.4. `project_id = null` is a central/company purchase. */
export interface PurchaseOrder extends BaseEntity {
  code: string;                       // PO-2026-001
  /** the approved material request this fulfils, when there is one */
  request_id?: UUID | null;
  /** null = general/central purchase, not for one project (advance stocking) */
  project_id?: UUID | null;
  supplier_id: UUID;
  order_date: ISODate;
  status: PurchaseOrderStatus;
  notes?: string | null;
}

export interface PurchaseOrderItem extends BaseEntity {
  po_id: UUID;
  /** Tier 3.1: the catalogue item. `item_name` stays as ordered. */
  item_id?: UUID | null;
  item_name: string;
  /** lookup_values (category='material_unit') — bag / ton / piece … */
  unit: string;
  quantity_ordered: number;
  /** BDT per unit — a plain decimal number, never a float-formatted string */
  unit_price: number;
  quantity_received: number;
  /**
   * Addendum to Section 7.5, same reason as `material_request_items.sort_order`
   * (Section 6.6 addendum): several lines of one PO are saved inside the same
   * millisecond, so `created_at` does not settle their order and the printed
   * order came back shuffled on every read. A purchase order is read and
   * checked off line by line, so the order is stored. Not indexed — it only
   * ever sorts the handful of lines of one PO, already in memory.
   */
  sort_order: number;
}

/** Section 7.6 — the delivery note against a purchase order. */
export interface GoodsReceipt extends BaseEntity {
  code: string;                       // GRN-2026-001
  po_id: UUID;
  receipt_date: ISODate;
  received_by: UUID | null;
  notes?: string | null;
}

export const QUALITY_CHECKS = ['passed', 'failed', 'pending'] as const;
export type QualityCheck = (typeof QUALITY_CHECKS)[number];

export interface GoodsReceiptItem extends BaseEntity {
  grn_id: UUID;
  po_item_id: UUID;
  quantity_received: number;
  quality_check: QualityCheck;
}

/**
 * Section 7.7 — one row per `(project_id, item_name, unit)`; `project_id = null`
 * is central/company stock. `average_unit_price` is a weighted average of what
 * the material actually cost, recomputed by every GRN and inbound transfer.
 */
export interface StockRow extends BaseEntity {
  project_id?: UUID | null;
  /**
   * Tier 3.1: the identity of a stock row, alongside `project_id`.
   *
   * `item_name` and `unit` are kept for display and for rows recorded before
   * the catalogue existed, but they no longer decide which row is which — that
   * is exactly how one material became three rows with three different
   * weighted averages.
   */
  item_id?: UUID | null;
  item_name: string;
  unit: string;
  quantity_available: number;
  average_unit_price: number;
}

/**
 * Section 7.8 — material handed out of the store to the site.
 *
 * **This is a movement, not a consumption.** It used to be both, which charged
 * a project for a whole delivery on the day it was unloaded and left anything
 * unused invisible — see `StockConsumption`, which is the consumption now.
 */
export interface StockIssue extends BaseEntity {
  code: string;                       // ISSUE-2026-001
  project_id: UUID;
  work_item_id?: UUID | null;
  /** Tier 3.1: the catalogue item issued. */
  item_id?: UUID | null;
  item_name: string;
  unit: string;
  quantity_issued: number;
  /** stock.average_unit_price at the moment of issue, frozen */
  unit_cost_snapshot: number;
  total_cost: number;
  issue_date: ISODate;
  issued_by: UUID | null;
  /**
   * The material request this issue is meeting, when there is one.
   *
   * The link the lifecycle was missing: `stock_transfers` already carried it,
   * so route (b) could move a request forward, but material issued from the
   * project's own store — the ordinary case — moved nothing, and the request
   * stayed wherever the goods receipt left it. Not indexed, so it needs no new
   * Dexie version block (same as `stock_transfers.request_id`).
   */
  request_id?: UUID | null;
  notes?: string | null;
}

/**
 * Section 7.8b (addendum, decided with the user): material actually used on
 * site.
 *
 * `stock_issues` used to be the consumption record — the comment on it said so
 * — which meant the whole of a delivery became project cost the day the
 * storekeeper handed it over. That is not what happens. 500 bags go to the
 * tower, 380 get laid, and 120 sit on the site: the project was charged for
 * 500 on day one, the store shows nothing left, and the 120 bags exist in no
 * record at all. They cannot be counted, cannot be moved to the tower that
 * needs them, and at handover nobody can say what is standing on the site.
 *
 * So an issue is now a *movement* — store to site — and this is the
 * consumption. Project material cost is the sum of these, not of the issues.
 *
 * `unit_cost_snapshot` is frozen at the site's issued average (see
 * `siteAverageCost`), not re-read later, for the same reason an issue freezes
 * the store's: a purchase next month at a different rate must not restate what
 * last month's slab cost.
 */
export interface StockConsumption extends BaseEntity {
  code: string;                       // USE-2026-001
  project_id: UUID;
  /** which part of the work it went into — the point of recording it */
  work_item_id?: UUID | null;
  item_id?: UUID | null;
  item_name: string;
  unit: string;
  quantity_used: number;
  /** the site's issued average at this moment, frozen */
  unit_cost_snapshot: number;
  total_cost: number;
  used_date: ISODate;
  recorded_by: UUID | null;
  notes?: string | null;
}

/**
 * Section 7.8b — material going back from the site to the store.
 *
 * The other half of the problem above. Once the 120 unused bags are visible,
 * they have to be able to move: back to the store, where the existing transfer
 * (7.8a) can take them to whichever project needs them. Without this the only
 * way to record material leaving a site was to pretend it had been consumed.
 *
 * It puts the quantity back on the store's shelf at the cost it left with, so
 * issued value = consumed + returned + still at site, exactly.
 */
export interface StockReturn extends BaseEntity {
  code: string;                       // RET-2026-001
  project_id: UUID;
  item_id?: UUID | null;
  item_name: string;
  unit: string;
  quantity_returned: number;
  unit_cost_snapshot: number;
  return_date: ISODate;
  returned_by: UUID | null;
  notes?: string | null;
}

/**
 * Section 7.8b — material that left the site as neither work nor stock.
 *
 * The third exit, and the one that decides whether the other two can be
 * trusted. With only "used" and "returned", a site holding cement that has set
 * in the bag has no truthful entry to make: recording it as used inflates the
 * slab it never went into, and returning it puts unusable material back on a
 * shelf for another project to be issued. So it stays on the balance for ever
 * and the site ages forward carrying a quantity nobody can account for.
 *
 * It is still project cost — the money was spent — but it is reported apart
 * from consumption, because "what the building consumed" is the number a bill
 * of quantities is checked against and spoilage is not part of it.
 */
export const WRITE_OFF_REASONS = ['damaged', 'expired', 'lost', 'theft', 'other'] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

export interface StockWriteOff extends BaseEntity {
  code: string;                       // WO-2026-001
  project_id: UUID;
  item_id?: UUID | null;
  item_name: string;
  unit: string;
  quantity_written_off: number;
  unit_cost_snapshot: number;
  total_cost: number;
  reason: WriteOffReason;
  /** required by the form — a write-off with no explanation is a hole */
  notes: string;
  write_off_date: ISODate;
  approved_by: UUID | null;
}

/** Section 7.8a — central → project, or project → project. */
export interface StockTransfer extends BaseEntity {
  code: string;                       // TRF-2026-001
  /** Tier 3.1: the catalogue item moved. */
  item_id?: UUID | null;
  item_name: string;
  unit: string;
  quantity: number;
  /** null = from central stock */
  from_project_id?: UUID | null;
  to_project_id: UUID;
  unit_cost_snapshot: number;
  transfer_date: ISODate;
  transferred_by: UUID | null;
  /**
   * Set when this transfer was made to satisfy an approved material request —
   * route (b) of Section 7.8a, where the material is already in the central
   * store and no purchase is needed. Not indexed, so it needs no new Dexie
   * version block (same as `towers.current_progress_pct`).
   */
  request_id?: UUID | null;
  notes?: string | null;
}

/** Section 7.9 — a supplier payment enum, deliberately narrower than
 * `PAYMENT_METHODS`: a supplier is not paid by card. */
export const SUPPLIER_PAYMENT_METHODS = ['cash', 'bank', 'mfs', 'cheque', 'online'] as const;
export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number];

/** Section 7.9 — paid directly, no approval step. */
export interface SupplierVoucher extends BaseEntity {
  code: string;                       // VCH-2026-001
  /** Tier 3.5: the account this payment was made from. */
  account_id?: UUID | null;
  /** Tier 3.5 memo fields — see the note on `Expense`. `amount` stays net. */
  vat_amount?: number | null;
  ait_amount?: number | null;
  po_id: UUID;
  supplier_id: UUID;
  /** copied from the PO — null when it was a central-stock purchase */
  project_id?: UUID | null;
  amount: number;
  payment_date: ISODate;
  payment_method: SupplierPaymentMethod;
  reference_no?: string | null;
  paid_by: UUID | null;
  notes?: string | null;
}

/** Document types (Section 7.10) */
export const PURCHASE_ORDER_DOCUMENT_TYPES = ['quotation', 'invoice', 'other'] as const;
export const SUPPLIER_VOUCHER_DOCUMENT_TYPES = ['payment_receipt', 'cheque_copy', 'other'] as const;

/* ------------------------------------------------------------------ *
 * Module 7 — Finance (Section 8)
 * ------------------------------------------------------------------ */

/**
 * One schedule per booking (Section 8.2). `entity_type` is an ENUM of one
 * today, kept because the scope names it: a contractor's running bill will
 * hang off the same table when the Contractor module lands.
 */
/**
 * `land` joined `booking` in Tier 3.4. The column and the
 * `[entity_type+entity_id]` compound index were always there (Section 8.2);
 * until then only `booking` was ever written, which is what OPEN-ITEMS 1.8
 * recorded.
 *
 * A land schedule is what was **agreed with the owner**; the money against it
 * comes from the expense ledger, not from `payments`. Everything that reads
 * these tables therefore has to say which kind it means — a land instalment is
 * not something the collections desk chases a buyer for.
 */
export const SCHEDULE_ENTITY_TYPES = ['booking', 'land', 'land_owner'] as const;
export type ScheduleEntityType = (typeof SCHEDULE_ENTITY_TYPES)[number];

export interface PaymentSchedule extends BaseEntity {
  entity_type: ScheduleEntityType;
  entity_id: UUID;
  /**
   * Snapshot of the total when the schedule was generated —
   * `bookings.final_price` for a booking, `lands.final_agreed_amount` for a
   * land.
   */
  total_amount: number;
}

export const INSTALLMENT_STATUSES = ['pending', 'partially_paid', 'paid', 'overdue'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export interface PaymentInstallment extends BaseEntity {
  schedule_id: UUID;
  installment_no: number;
  label: string;
  /** null for `manual` / `on_handover` lines until Accounts sets one */
  due_date?: ISODate | null;
  amount_due: number;
  amount_paid: number;
  /**
   * The money-based state only: pending / partially_paid / paid.
   *
   * `overdue` is deliberately never written here. It depends on today's date,
   * so a stored value is wrong the morning after it was written, and the only
   * way to keep it true would be to write to the table every time a screen
   * reads it — which, under `useLiveQuery`, re-triggers the very read that
   * caused the write. It is layered on at read time by
   * `installmentStatus()` instead (Section 8.2 calls this "read-time").
   */
  status: InstallmentStatus;
}

/** Section 8.2 — money returned after a booking is cancelled. */
export interface Refund extends BaseEntity {
  code: string;                       // REF-2026-001
  /** Tier 3.5: the account the refund was paid out of. */
  account_id?: UUID | null;
  booking_id: UUID;
  /** gross amount being returned out of what the buyer had paid */
  amount: number;
  /** cancellation charge withheld */
  deduction: number;
  /** amount − deduction */
  net_refund: number;
  refund_date: ISODate;
  payment_method: SupplierPaymentMethod;
  reference_no?: string | null;
  processed_by: UUID | null;
  notes?: string | null;
}

/** Document types for entity_type = 'refund' (Section 8.2) */
export const REFUND_DOCUMENT_TYPES = ['refund_voucher', 'other'] as const;

/**
 * The six categories the application's own code knows by name. §1.2 names
 * `cost_category` as a `lookup_values` category, and since Tier 3.3 it is one —
 * the list is editable in Master Data and an expense may carry a category that
 * is not in this array. These six are kept because code depends on them:
 * `land_payment` is what separates money paid to a landowner from the fees
 * around it, and the two land codes below are what put a land picker on the
 * expense form.
 */
export const COST_CATEGORIES = [
  'land_payment',
  'land_extra_cost',
  'contractor_payment',
  'marketing',
  'admin',
  'other',
] as const;

/** A seeded category, distinct from the widened `CostCategory` below. */
export type SystemCostCategory = (typeof COST_CATEGORIES)[number];

/**
 * What `expenses.cost_category` holds: one of the six above, or the `code` of a
 * category added through Master Data. Widened the same way `LookupCategory` is,
 * so the six keep autocompleting while an arbitrary code still type-checks.
 */
export type CostCategory = SystemCostCategory | (string & {});

/** The two categories that mean "spent on a specific land" (Tier 3.3). */
export const LAND_LINKED_COST_CATEGORIES = ['land_payment', 'land_extra_cost'] as const;

/** Label and display order for the seeded categories, used to seed the list. */
export const COST_CATEGORY_SEED: { code: SystemCostCategory; value: string }[] = [
  { code: 'land_payment', value: 'Land Payment' },
  { code: 'land_extra_cost', value: 'Land Extra Cost' },
  { code: 'contractor_payment', value: 'Contractor Payment' },
  { code: 'marketing', value: 'Marketing' },
  { code: 'admin', value: 'Admin' },
  { code: 'other', value: 'Other' },
];

/**
 * The generic cost ledger of Section 8.3 — land payments, contractor bills,
 * marketing, admin, and any irregular project cost that no lifecycle module
 * owns. Procurement's `supplier_vouchers` stay separate and are added to this
 * at roll-up time (8.3), not merged into it.
 */
export interface Expense extends BaseEntity {
  code: string;                       // EXP-2026-001
  /** Tier 3.5: the account this cost was paid from. */
  account_id?: UUID | null;
  /**
   * Tier 3.5 — VAT and AIT withheld from this bill, recorded for the return.
   *
   * **Memo fields.** `amount` remains what actually left the account, so the
   * cash position stays right without knowing about them. Making `amount`
   * gross and deriving the payment would have changed the meaning of a column
   * every existing screen already reads.
   */
  vat_amount?: number | null;
  ait_amount?: number | null;
  /** null = a company-level cost, not chargeable to one project */
  project_id?: UUID | null;
  land_id?: UUID | null;
  /**
   * Which landowner this money was paid to (BRD ACQ-003, BR-003).
   *
   * A `land_owner_mapping.id`, not a `landowners.id`: the same person can own
   * two plots, and what is being settled is their share of *this* land.
   *
   * Nullable and not indexed — a land's expenses are a handful of rows, so the
   * per-owner position is filtered in memory. `null` means the payment was
   * against the land as a whole, which is the ordinary case on a single-owner
   * plot and the honest answer for money recorded before anybody split it.
   *
   * Only meaningful with `cost_category = 'land_payment'`, and the form only
   * offers it there: registration and legal fees are paid to an office, not to
   * an owner.
   */
  owner_mapping_id?: UUID | null;
  /**
   * The instalment of the land's payment plan this settles, when the payment
   * was made against a named one (v17).
   *
   * `null` is the ordinary case and the default: the money joins the
   * oldest-first waterfall, which is what most payments are. Set, it is applied
   * to that line first — a landowner will accept a cheque against a named
   * milestone while an earlier instalment is still short, and the plan should
   * then show the earlier line as arrears rather than silently moving the money
   * forward and reporting the opposite of what both sides agreed.
   *
   * Only meaningful with `cost_category = 'land_payment'`; anything else
   * ignores it, and the form only offers it there.
   *
   * **An input, unlike `Payment.installment_id`, which the booking side writes
   * back as provenance after its own waterfall has run.** Same column name,
   * opposite direction; the asymmetry is recorded in OPEN-ITEMS rather than
   * quietly assumed to be symmetry.
   */
  installment_id?: UUID | null;
  cost_category: CostCategory;
  /** short, plain label — the whole point of the ledger when category='other' */
  cost_reason: string;
  amount: number;
  expense_date: ISODate;
  /** landowner / contractor / vendor / individual */
  paid_to: string;
  payment_method: SupplierPaymentMethod;
  reference_no?: string | null;
  paid_by: UUID | null;
  notes?: string | null;
}

export const BANK_ACCOUNT_TYPES = ['bank', 'mfs', 'cash'] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

/**
 * Where the company's money actually sits (Tier 3.5).
 *
 * Money enters through `payments` and leaves through `expenses`,
 * `supplier_vouchers` and `refunds`. Those four are disjoint record sets — an
 * expense is never also a voucher — so a cash position that adds the first and
 * subtracts the other three counts each taka once. What it could not do before
 * this table is say *which* account the taka moved through, so nobody could
 * answer "can I pay BSRM on Thursday".
 *
 * `opening_balance` matters as much as the movements: without it the "position"
 * is only the net movement since the software was installed, which is not a
 * balance anybody can act on. `opening_balance_date` says what the figure was
 * true on, so movements before it are not double counted against it.
 */
export interface BankAccount extends BaseEntity {
  code: string;                       // ACC-001
  name: string;
  type: BankAccountType;
  bank_name?: string | null;
  /** stored as entered; nothing here is used to move money */
  account_number?: string | null;
  branch?: string | null;
  opening_balance: number;
  /** the date `opening_balance` was true on */
  opening_balance_date: ISODate;
  is_active: boolean;
  notes?: string | null;
}

/**
 * The reserved budget head for material bought through purchase orders
 * (Tier 3.2).
 *
 * A project's cost has two sources and only one of them is categorised: the
 * expense ledger carries a `cost_category`, while procurement spend reaches the
 * project through `supplier_vouchers`, which has none (Section 8.3 adds it at
 * roll-up time). A budget that only covered categorised expenses would leave
 * out the largest line on most projects — the materials — while looking
 * complete.
 *
 * The leading underscore is load-bearing: `lookupRepository` slugifies a new
 * cost category and strips leading underscores, so a category somebody names
 * "Procurement" becomes `procurement` and can never collide with this. The
 * reserved head needs no guard because it is unreachable.
 */
export const PROCUREMENT_BUDGET_HEAD = '_procurement';

/**
 * One budgeted line of a project's cost plan (Tier 3.2, Section 8.3).
 *
 * Flat and per category rather than a full bill of quantities: the actual side
 * is only recorded per category, so budgeting any finer would produce variances
 * that could never be computed. `cost_category` holds a category code from
 * `lookup_values` or `PROCUREMENT_BUDGET_HEAD`.
 */
export interface ProjectBudgetLine extends BaseEntity {
  project_id: UUID;
  cost_category: string;
  budgeted_amount: number;
  notes?: string | null;
}

/** Document types for entity_type = 'expense' (Section 8.3) */
export const EXPENSE_DOCUMENT_TYPES = ['receipt', 'voucher', 'invoice', 'other'] as const;

/* ------------------------------------------------------------------ *
 * Module 8 — User & Role Management (Section 9)
 * ------------------------------------------------------------------ */

/**
 * Project-level scoping (Section 9.5).
 *
 * `super_admin`, `management` and `land_team` see every project whether or not
 * a row exists here. For every other role the absence of a row means no access
 * at all — the mapping is an allow-list, not a filter.
 */
export interface UserProjectAssignment extends BaseEntity {
  user_id: UUID;
  project_id: UUID;
}
