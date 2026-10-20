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
  /** BDT per sqft of the tower's built-up area — so a bigger tower scales up */
  rate_per_sqft: number;
}

/*
 * Typical Dhaka rates for a 6–10 storey RCC residential building, 2026, per
 * sqft of built-up area (about BDT 3,000/sqft all-in for the structure and
 * finishes). They are a starting point the user edits, not a quotation —
 * which is why every line is ticked off and changed on the budget sheet
 * before anything is saved.
 */
const T = (cost_type: ConstructionCostType, description: string, rate_per_sqft: number) => ({
  cost_type,
  description,
  rate_per_sqft,
});

export const WORK_ITEM_BUDGET_TEMPLATES: Record<string, BudgetTemplateLine[]> = {
  foundation: [
    T('machinery_rent', 'Excavator / earthwork machinery rent', 15),
    T('subcontract', 'Piling (cast-in-situ, incl. labour)', 150),
    T('material', 'Rod (pile cap, grade beam, mat)', 80),
    T('material', 'Cement', 40),
    T('material', 'Sand and stone chips', 35),
    T('material', 'Shuttering and polythene', 15),
    T('labour', 'Mason and helper labour', 30),
    T('other', 'Soil test and dewatering', 8),
  ],
  'ground floor': [
    T('material', 'Rod', 45),
    T('material', 'Cement', 25),
    T('material', 'Brick', 20),
    T('material', 'Sand and stone chips', 25),
    T('labour', 'Labour', 25),
    T('material', 'Shuttering', 10),
  ],
  superstructure: [
    T('material', 'Rod', 320),
    T('material', 'Cement', 160),
    T('material', 'Stone chips', 80),
    T('material', 'Sand', 60),
    T('material', 'Brick', 90),
    T('material', 'Shuttering, props and scaffolding', 60),
    T('labour', 'Mason, rod binder and helper labour', 180),
    T('machinery_rent', 'Mixer, vibrator and hoist', 30),
    T('utility', 'Site water and electricity', 20),
  ],
  'brick work': [
    T('material', 'Brick', 110),
    T('material', 'Cement', 35),
    T('material', 'Sand', 25),
    T('labour', 'Mason and helper labour', 70),
    T('material', 'Plaster (cement and sand)', 45),
  ],
  'lift & generator': [
    T('subcontract', 'Lift supply and installation', 160),
    T('subcontract', 'Generator supply and installation', 55),
    T('material', 'Substation and cabling', 40),
  ],
  roof: [
    T('material', 'Roof slab and parapet material', 35),
    T('subcontract', 'Waterproofing', 30),
    T('labour', 'Labour', 15),
  ],
  electrical: [
    T('material', 'Cables and conduits', 80),
    T('material', 'Switches, sockets and fittings', 50),
    T('material', 'Distribution boards and earthing', 40),
    T('labour', 'Electrician labour', 30),
  ],
  plumbing: [
    T('material', 'Pipes and fittings', 60),
    T('material', 'Sanitary ware', 80),
    T('material', 'Pump and water tank', 20),
    T('labour', 'Plumber labour', 20),
  ],
  finishing: [
    T('material', 'Floor and wall tiles', 250),
    T('material', 'Paint', 90),
    T('material', 'Doors and windows', 200),
    T('material', 'Grills and railings', 60),
    T('labour', 'Finishing labour', 100),
  ],
  'external works': [
    T('subcontract', 'Boundary wall and gate', 55),
    T('material', 'Driveway and paving', 25),
    T('subcontract', 'Drainage', 10),
    T('other', 'Landscaping', 10),
  ],
};

/** Any work item with a name we do not know still gets the usual three heads. */
const GENERIC: BudgetTemplateLine[] = [
  T('material', 'Material', 0),
  T('labour', 'Labour', 0),
  T('machinery_rent', 'Machinery rent', 0),
];

/** A work item's lines come from its type; items from before types read their name. */
export function templateForItem(item: { name: string; work_type?: string | null }): BudgetTemplateLine[] {
  return templateFor(item.work_type || item.name);
}

export function templateFor(workItemName: string): BudgetTemplateLine[] {
  return WORK_ITEM_BUDGET_TEMPLATES[workItemName.trim().toLowerCase()] ?? GENERIC;
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
