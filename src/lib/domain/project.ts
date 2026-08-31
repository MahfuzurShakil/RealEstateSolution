import type { BadgeTone } from '@/components/ui/Badge';
import type {
  AllocationType,
  ForSaleBy,
  JvShareBasis,
  ProjectStatus,
  ProjectType,
  TowerStatus,
  UnitStatus,
} from '@/lib/db/types';

/**
 * Module 2 status pipeline (Scope v3.md, Section 3.2):
 *
 *   planning → design → approval → under_construction
 *            → nearly_complete → handover_ongoing → closed
 *
 * Unlike Module 1 this is a straight line with no branch, so a project can
 * only move one step forward — or one step back, when a stage was marked too
 * early (a RAJUK resubmission drops `approval` back to `design`).
 */
export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  design: { label: 'Design', tone: 'blue' },
  approval: { label: 'Approval', tone: 'amber' },
  under_construction: { label: 'Under Construction', tone: 'teal' },
  nearly_complete: { label: 'Nearly Complete', tone: 'teal' },
  handover_ongoing: { label: 'Handover Ongoing', tone: 'green' },
  closed: { label: 'Closed', tone: 'green' },
};

export const PROJECT_PIPELINE_STEPS: ProjectStatus[] = [
  'planning',
  'design',
  'approval',
  'under_construction',
  'nearly_complete',
  'handover_ongoing',
  'closed',
];

/** One step forward, or one step back to correct a premature move. */
export function allowedNextProjectStatuses(current: ProjectStatus): ProjectStatus[] {
  const i = PROJECT_PIPELINE_STEPS.indexOf(current);
  return [PROJECT_PIPELINE_STEPS[i + 1], PROJECT_PIPELINE_STEPS[i - 1]].filter(
    (s): s is ProjectStatus => Boolean(s),
  );
}

/** `actual_start_date` is stamped when construction actually begins. */
export function statusStartsConstruction(status: ProjectStatus): boolean {
  return status === 'under_construction';
}

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  mixed: 'Mixed Use',
};

export const TOWER_STATUS_META: Record<TowerStatus, { label: string; tone: BadgeTone }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  under_construction: { label: 'Under Construction', tone: 'amber' },
  complete: { label: 'Complete', tone: 'green' },
};

export const UNIT_STATUS_META: Record<UnitStatus, { label: string; tone: BadgeTone }> = {
  available: { label: 'Available', tone: 'green' },
  hold: { label: 'Hold', tone: 'amber' },
  reserved: { label: 'Reserved', tone: 'amber' },
  booked: { label: 'Booked', tone: 'blue' },
  sold: { label: 'Sold', tone: 'teal' },
  handed_over: { label: 'Handed Over', tone: 'neutral' },
};

export const ALLOCATION_TYPE_LABEL: Record<AllocationType, string> = {
  developer_share: 'Developer Share',
  landowner_share: 'Landowner Share',
};

export const FOR_SALE_BY_LABEL: Record<ForSaleBy, string> = {
  company: 'Company',
  owner_direct: 'Owner Direct',
};

export const JV_SHARE_BASIS_LABEL: Record<JvShareBasis, string> = {
  flat_count: 'Number of flats',
  total_sqft: 'Total sqft',
};

/* ------------------------------------------------------------------ *
 * Unit bulk generation (decided 2026-09-01)
 *
 * A 20-storey tower has ~80 units, and typing them one by one is unusable.
 * In Bangladeshi buildings a floor layout repeats, so the input is ONE floor
 * pattern applied to a floor range; a few runs cover a whole tower and the odd
 * floor is edited afterwards.
 * ------------------------------------------------------------------ */

export interface UnitPatternRow {
  /** appended after the floor number: 'A' gives A-501, '1' gives A-501 too */
  suffix: string;
  unit_type: string;
  bedroom_count: string;
  bathroom_count: string;
  balcony_count: string;
  size_sqft: string;
  facing: string;
  /** per-sqft rate is the usual way a price list is quoted in BD */
  price_mode: 'per_sqft' | 'fixed';
  price_value: string;
  parking_allocated: string;
}

export interface UnitPatternInput {
  prefix: string;          // 'A' → A-501
  separator: string;       // '-'
  floor_from: number;
  floor_to: number;
  /** floors to skip — the ground floor is often parking or commercial */
  excluded_floors: number[];
  rows: UnitPatternRow[];
}

export function floorsInRange(input: {
  floor_from: number;
  floor_to: number;
  excluded_floors: number[];
}): number[] {
  const { floor_from, floor_to, excluded_floors } = input;
  if (!Number.isFinite(floor_from) || !Number.isFinite(floor_to) || floor_to < floor_from) return [];
  const floors: number[] = [];
  for (let f = floor_from; f <= floor_to; f += 1) {
    if (!excluded_floors.includes(f)) floors.push(f);
  }
  return floors;
}

export function unitCode(prefix: string, separator: string, floor: number, suffix: string): string {
  return `${prefix}${separator}${floor}${suffix}`;
}

/** Every code the pattern would produce, in generation order. */
export function previewUnitCodes(input: UnitPatternInput): string[] {
  const floors = floorsInRange(input);
  return floors.flatMap((floor) =>
    input.rows.map((row) => unitCode(input.prefix, input.separator, floor, row.suffix)),
  );
}

export function priceFor(row: UnitPatternRow): number {
  const value = Number(row.price_value) || 0;
  if (row.price_mode === 'fixed') return value;
  return Math.round(value * (Number(row.size_sqft) || 0));
}

/* ------------------------------------------------------------------ *
 * JV allocation check (decided 2026-09-01)
 *
 * `land_jv_details` holds the agreed developer/landowner split, `units` holds
 * the flat-by-flat allocation, and nothing reconciled the two — a 45% owner
 * share could be marked against any number of flats. This computes target vs.
 * actual in whichever basis the JV was signed on.
 *
 * The target is only computable when the project maps to exactly ONE JV land:
 * with several JV lands the per-land shares cannot be combined without knowing
 * each land's contribution to the building, so those are listed per land and
 * the automatic check is skipped.
 * ------------------------------------------------------------------ */

export interface AllocationTotals {
  flat_count: number;
  total_sqft: number;
}

export interface JvAllocationSummary {
  basis: JvShareBasis;
  /** what the agreement promises */
  developer_target: number;
  landowner_target: number;
  /** what the units actually say */
  developer_actual: number;
  landowner_actual: number;
  /** allocated total, i.e. the pool the targets are computed from */
  total: number;
  within_tolerance: boolean;
  tolerance_label: string;
}

/**
 * flat_count rounds to whole flats so ±1 is fine; total_sqft is a continuous
 * number, so ~2% either way is the practical limit.
 */
export function jvAllocationSummary(
  totals: { developer: AllocationTotals; landowner: AllocationTotals },
  jv: { developer_share_pct: number; landowner_share_pct: number; jv_share_basis?: JvShareBasis },
): JvAllocationSummary {
  const basis: JvShareBasis = jv.jv_share_basis ?? 'flat_count';
  const key = basis === 'flat_count' ? 'flat_count' : 'total_sqft';

  const developer_actual = totals.developer[key];
  const landowner_actual = totals.landowner[key];
  const total = developer_actual + landowner_actual;

  const developer_target = (total * Number(jv.developer_share_pct)) / 100;
  const landowner_target = (total * Number(jv.landowner_share_pct)) / 100;

  const gap = Math.abs(landowner_actual - landowner_target);
  const within_tolerance =
    total === 0 ? true : basis === 'flat_count' ? gap <= 1 : gap <= total * 0.02;

  return {
    basis,
    developer_target,
    landowner_target,
    developer_actual,
    landowner_actual,
    total,
    within_tolerance,
    tolerance_label: basis === 'flat_count' ? '±1 flat' : '±2% of total sqft',
  };
}

/** A unit is spoken for once a customer is attached to it. */
export function isUnitSellable(status: UnitStatus): boolean {
  return status === 'available' || status === 'hold';
}
