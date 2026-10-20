import type { BadgeTone } from '@/components/ui/Badge';
import type { ConstructionCostType, PurchaseMode } from '../db/types';

/**
 * Work-item budgets and direct purchases (DIRECT-PURCHASE-PLAN.md B2/B3).
 * Pure functions and constants only — the repository does the reading.
 */

export const COST_TYPE_META: Record<ConstructionCostType, { label: string; tone: BadgeTone }> = {
  material: { label: 'Material', tone: 'blue' },
  labour: { label: 'Labour', tone: 'amber' },
  machinery_rent: { label: 'Machinery rent', tone: 'teal' },
  transport: { label: 'Transport', tone: 'neutral' },
  subcontract: { label: 'Subcontract', tone: 'teal' },
  utility: { label: 'Water / power', tone: 'neutral' },
  professional_fee: { label: 'Professional fee', tone: 'blue' },
  govt_fee: { label: 'Government fee', tone: 'amber' },
  other: { label: 'Other', tone: 'neutral' },
};

/** Absent on every install before v34 — those companies buy directly. */
export function purchaseModeOf(mode: PurchaseMode | null | undefined): PurchaseMode {
  return mode ?? 'direct';
}
export const showsProcurement = (mode: PurchaseMode) => mode !== 'direct';
export const showsDirectPurchase = (mode: PurchaseMode) => mode !== 'procurement';

export interface BudgetTemplateLine {
  cost_type: ConstructionCostType;
  description: string;
  /** the unit this item is normally counted in — bag, ton, cft, person-day… */
  unit: string | null;
  /**
   * Demo data only: a typical BDT per sqft of built-up area, so the sample
   * projects carry believable budgets. The app never fills a figure in for
   * the user (client, 2026-10-21) — suggestions are names and units.
   */
  rate_per_sqft: number;
}

/** Whether a kind of work is done once per building or floor by floor. */
export type WorkScope = 'tower' | 'floor';

export interface WorkTypeDef {
  /** the lookup value (`work_item_type`) */
  label: string;
  scope: WorkScope;
  /** one line on what it covers, shown when picking */
  covers: string;
  suggestions: BudgetTemplateLine[];
}

const T = (
  cost_type: ConstructionCostType,
  description: string,
  unit: string | null,
  rate_per_sqft = 0,
): BudgetTemplateLine => ({ cost_type, description, unit, rate_per_sqft });

/*
 * How a building goes up in Bangladesh (client, 2026-10-21): the site is
 * prepared, piled and founded once; then the frame rises floor by floor —
 * column, beam and slab casting (chhad dhalai) — and behind it, again floor
 * by floor, brick work, plaster, wiring, plumbing, doors and windows, tiles
 * and paint; the roof top, lift, generator and the outside come last. The
 * floor-wise kinds create one work item per floor, so progress and cost can
 * be followed slab by slab.
 *
 * Suggestions are the items that kind of work normally needs, each with the
 * unit it is counted in. They carry no amounts the user sees.
 */
export const WORK_TYPES: WorkTypeDef[] = [
  {
    label: 'Site Preparation',
    scope: 'tower',
    covers: 'Soil test, survey, clearing, hoarding, labour shed, site water and power',
    suggestions: [
      T('other', 'Soil test', null, 3),
      T('labour', 'Site clearing labour', 'person-day', 2),
      T('material', 'Hoarding / boundary sheet', 'rft', 4),
      T('material', 'Labour shed and site office', null, 3),
      T('utility', 'Temporary electricity and water connection', null, 2),
    ],
  },
  {
    label: 'Piling',
    scope: 'tower',
    covers: 'Cast-in-situ or precast piles, pile test',
    suggestions: [
      T('subcontract', 'Piling work', 'rft', 120),
      T('material', 'Rod for piles', 'ton', 25),
      T('material', 'Cement', 'bag', 10),
      T('other', 'Pile load test', null, 3),
    ],
  },
  {
    label: 'Foundation',
    scope: 'tower',
    covers: 'Excavation, pile cap, grade beam, mat or footing, retaining wall',
    suggestions: [
      T('machinery_rent', 'Excavator rent', 'day', 15),
      T('material', 'Rod', 'ton', 80),
      T('material', 'Cement', 'bag', 40),
      T('material', 'Sand', 'cft', 15),
      T('material', 'Stone chips', 'cft', 20),
      T('material', 'Shuttering and polythene', 'sqft', 15),
      T('labour', 'Mason, rod binder and helper', 'person-day', 30),
      T('other', 'Dewatering', 'day', 5),
    ],
  },
  {
    label: 'Floor Structure',
    scope: 'floor',
    covers: 'Column, beam and slab casting of a floor (chhad dhalai) — basements included',
    suggestions: [
      T('material', 'Rod', 'ton', 40),
      T('material', 'Cement', 'bag', 20),
      T('material', 'Stone chips', 'cft', 10),
      T('material', 'Sand', 'cft', 7),
      T('subcontract', 'Ready-mix concrete', 'cum', 0),
      T('material', 'Shuttering, props and scaffolding', 'sqft', 8),
      T('labour', 'Mason, rod binder and helper', 'person-day', 22),
      T('machinery_rent', 'Mixer, vibrator and hoist', 'day', 4),
    ],
  },
  {
    label: 'Brick Work & Plaster',
    scope: 'floor',
    covers: 'Outer and partition walls, then inside and outside plaster',
    suggestions: [
      T('material', 'Brick', 'piece', 14),
      T('material', 'Cement', 'bag', 7),
      T('material', 'Sand', 'cft', 5),
      T('labour', 'Mason and helper', 'person-day', 13),
    ],
  },
  {
    label: 'Electrical',
    scope: 'floor',
    covers: 'Conduit, wiring, switches and boards',
    suggestions: [
      T('material', 'Conduit and boxes', 'rft', 4),
      T('material', 'Cable and wire', 'coil', 6),
      T('material', 'Switches, sockets and boards', 'piece', 5),
      T('labour', 'Electrician', 'person-day', 4),
    ],
  },
  {
    label: 'Plumbing & Sanitary',
    scope: 'floor',
    covers: 'Water and soil lines, sanitary ware',
    suggestions: [
      T('material', 'Pipes and fittings', 'rft', 6),
      T('material', 'Sanitary ware and fittings', 'set', 8),
      T('labour', 'Plumber', 'person-day', 3),
    ],
  },
  {
    label: 'Finishing',
    scope: 'floor',
    covers: 'Tiles and flooring, doors and windows, grills, paint',
    suggestions: [
      T('material', 'Floor and wall tiles', 'sqft', 22),
      T('material', 'Door frames and shutters', 'piece', 10),
      T('subcontract', 'Thai aluminium windows', 'sqft', 8),
      T('material', 'Grills and railings', 'kg', 5),
      T('material', 'Paint, putty and primer', 'litre', 7),
      T('labour', 'Tiles mistri, carpenter and painter', 'person-day', 10),
    ],
  },
  {
    label: 'Roof Top',
    scope: 'tower',
    covers: 'Parapet, overhead water tank, roof waterproofing',
    suggestions: [
      T('material', 'Parapet and tank material', null, 15),
      T('subcontract', 'Roof waterproofing', 'sqft', 12),
      T('labour', 'Mason and helper', 'person-day', 5),
    ],
  },
  {
    label: 'Lift & Generator',
    scope: 'tower',
    covers: 'Lift, generator, substation and main cabling',
    suggestions: [
      T('subcontract', 'Lift supply and installation', 'set', 110),
      T('subcontract', 'Generator supply and installation', 'set', 45),
      T('subcontract', 'Substation and main cabling', null, 35),
    ],
  },
  {
    label: 'External Works',
    scope: 'tower',
    covers: 'Boundary wall, gate, drainage, driveway, landscaping',
    suggestions: [
      T('subcontract', 'Boundary wall and gate', 'rft', 50),
      T('material', 'Driveway and paving', 'sqft', 20),
      T('subcontract', 'Drainage', 'rft', 10),
      T('other', 'Landscaping', null, 5),
    ],
  },
  {
    label: 'Other',
    scope: 'tower',
    covers: 'Anything not listed above',
    suggestions: [T('material', 'Material', null), T('labour', 'Labour', 'person-day'), T('machinery_rent', 'Machinery rent', 'day')],
  },
];

/*
 * Work items typed with earlier lists keep their suggestions through these
 * aliases: the fixed WBS of 2026-10-20 and the 17 kinds of 2026-10-21, which
 * the client found too many and were merged into the twelve above.
 */
const ALIASES: Record<string, string> = {
  'ground floor': 'Floor Structure',
  superstructure: 'Floor Structure',
  basement: 'Floor Structure',
  roof: 'Roof Top',
  plumbing: 'Plumbing & Sanitary',
  'brick work': 'Brick Work & Plaster',
  plaster: 'Brick Work & Plaster',
  'doors & windows': 'Finishing',
  'tiles & flooring': 'Finishing',
  paint: 'Finishing',
  lift: 'Lift & Generator',
  'generator & substation': 'Lift & Generator',
};

export function workTypeDef(label: string | null | undefined): WorkTypeDef {
  const key = (label ?? '').trim().toLowerCase();
  const name = ALIASES[key] ?? label ?? '';
  return (
    WORK_TYPES.find((t) => t.label.toLowerCase() === name.toLowerCase()) ?? {
      label: label || 'Other',
      scope: 'tower',
      covers: '',
      suggestions: WORK_TYPES[WORK_TYPES.length - 1].suggestions,
    }
  );
}

/** A work item's suggestions come from its type; items from before types read their name. */
export function templateForItem(item: { name: string; work_type?: string | null }): BudgetTemplateLine[] {
  return templateFor(item.work_type || item.name);
}

export function templateFor(workTypeOrName: string): BudgetTemplateLine[] {
  return workTypeDef(workTypeOrName).suggestions;
}

/* ------------------------------------------------------------------ *
 * Floors of a tower, for the floor-wise kinds of work
 * ------------------------------------------------------------------ */

export interface FloorOption {
  /** sort key: basements negative, ground 0, roof after the top floor */
  no: number;
  label: string;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Basements (recorded, or read from `building_type` "B2+G+8" → 2), then Ground, the upper
 * floors and the roof. `floor_count` counts the floors above ground including
 * the ground floor, as the tower form records it.
 */
export function towerBasements(tower: { basement_count?: number | null; building_type?: string | null }): number {
  if (tower.basement_count != null) return Math.max(0, Number(tower.basement_count) || 0);
  const m = /^\s*B(\d*)\s*\+/i.exec(tower.building_type ?? '');
  return m ? Number(m[1] || 1) : 0;
}

/**
 * The size a tower was designed to (client, 2026-10-21): a typical floor's
 * area, and the built-up area over every floor including basements. Null
 * when the floor area was not recorded.
 */
export function towerSize(tower: {
  floor_count: number;
  basement_count?: number | null;
  building_type?: string | null;
  floor_area_sqft?: number | null;
}): { floor_area: number; floors: number; basements: number; built_up: number } | null {
  const area = Number(tower.floor_area_sqft) || 0;
  if (!(area > 0)) return null;
  const basements = towerBasements(tower);
  const floors = Math.max(1, Number(tower.floor_count) || 1);
  return { floor_area: area, floors, basements, built_up: Math.round(area * (floors + basements)) };
}

export function towerFloors(tower: {
  floor_count: number;
  building_type?: string | null;
  basement_count?: number | null;
}): FloorOption[] {
  const basements = towerBasements(tower);
  const out: FloorOption[] = [];
  for (let b = basements; b >= 1; b--) out.push({ no: -b, label: basements > 1 ? `Basement ${b}` : 'Basement' });
  out.push({ no: 0, label: 'Ground floor' });
  for (let f = 1; f < Math.max(1, tower.floor_count); f++) out.push({ no: f, label: `${ordinal(f)} floor` });
  out.push({ no: Math.max(1, tower.floor_count), label: 'Roof' });
  return out;
}

/* ------------------------------------------------------------------ *
 * Budget health (the alerts of B6 read the same rules)
 * ------------------------------------------------------------------ */

export type BudgetHealth = 'no_budget' | 'ok' | 'near' | 'over' | 'ahead_of_work';

export const BUDGET_HEALTH_META: Record<BudgetHealth, { label: string; tone: BadgeTone }> = {
  no_budget: { label: 'No budget', tone: 'neutral' },
  ok: { label: 'On budget', tone: 'green' },
  near: { label: 'Budget nearly used', tone: 'amber' },
  over: { label: 'Over budget', tone: 'red' },
  ahead_of_work: { label: 'Spending ahead of work', tone: 'amber' },
};

/** at or above this share of the budget, warn */
export const NEAR_BUDGET_PCT = 80;
/** a pending direct purchase older than this many days is overdue */
export const PAYMENT_OVERDUE_DAYS = 30;
/** spent % this many points ahead of progress %, warn */
export const AHEAD_OF_WORK_POINTS = 15;

/**
 * Transparency, not restriction (PLATFORM-REPLAN.md): an over-budget cost is
 * always recordable; this only says how it looks.
 */
export function budgetHealth(budget: number, actual: number, progressPct: number): BudgetHealth {
  if (!(budget > 0)) return actual > 0 ? 'over' : 'no_budget';
  const used = (actual / budget) * 100;
  if (used > 100 + 1e-9) return 'over';
  if (used - progressPct >= AHEAD_OF_WORK_POINTS) return 'ahead_of_work';
  // nearly used only matters while work is left to pay for
  if (used >= NEAR_BUDGET_PCT && progressPct < 100) return 'near';
  return 'ok';
}

export function usedPct(budget: number, actual: number): number | null {
  return budget > 0 ? Math.round((actual / budget) * 1000) / 10 : null;
}
