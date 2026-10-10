import { PROCUREMENT_BUDGET_HEAD, type ProjectType } from '@/lib/db/types';
import { money } from './finance';

/**
 * v29 — the owner's view of a project: what it will cost, what it will earn,
 * and what has happened so far (PLATFORM-REPLAN.md §1.5).
 *
 * Built on the cost plan that already existed (`project_budget_lines`, one
 * line per cost head) rather than beside it, so the estimate here, the
 * finance overview's budget column and — in Phase 2 — every voucher tagged
 * with a head all talk about the same khat.
 *
 * Land is not a budget line. It comes from the linked lands' cost sheets, so
 * the land price is entered once, on the land, and never re-typed here.
 */

export interface CostingHead {
  /** the `cost_category` code the budget line and the spend are filed under */
  code: string;
  label: string;
  /** what goes under it, for the editor */
  hint: string;
  /** construction heads mean nothing on a land share, and on a plot scheme
   *  the development work is costed on the land */
  builtOnly?: boolean;
  /** not on a land share: nothing is connected to shares */
  notShare?: boolean;
}

export const COSTING_HEADS: CostingHead[] = [
  {
    code: 'design_approval',
    label: 'Design & approval',
    hint: 'Architect, structural design, soil test, RAJUK / CDA / local approval fees',
  },
  {
    code: PROCUREMENT_BUDGET_HEAD,
    label: 'Construction: materials',
    hint: 'Rod, cement, brick, sand, stone, tiles, fittings, bought through purchase orders',
    builtOnly: true,
  },
  {
    code: 'contractor_payment',
    label: 'Construction: contractor & labour',
    hint: 'Civil, electrical and plumbing contractors, piling, labour bills',
    builtOnly: true,
  },
  {
    code: 'utility_connection',
    label: 'Utilities & connections',
    hint: 'DESCO / DPDC / PDB line, substation, WASA, gas, generator, lift',
    notShare: true,
  },
  {
    code: 'marketing',
    label: 'Marketing',
    hint: 'Brochure, fair stalls, digital ads, site signboard',
  },
  {
    code: 'sales_commission',
    label: 'Sales commission',
    hint: 'Agent and in-house sales commission',
  },
  {
    code: 'other',
    label: 'Other',
    hint: 'Anything that fits no head above',
  },
];

/*
 * Not project heads (client walkthrough 2026-10-10): office overhead and
 * finance cost. One admin team and one bank relationship serve every
 * project, so splitting them per project is guesswork; they belong to the
 * company-level view (Phase 3). Spend filed under them still shows, folded
 * into "Other", so nothing disappears.
 */

/** What a head is called on each type, where the generic name misleads. */
const HEAD_LABEL_BY_TYPE: Partial<Record<ProjectType, Record<string, { label: string; hint: string }>>> = {
  land_share: {
    design_approval: {
      label: 'Legal & deed',
      hint: 'Share deed drafting, lawyer, registration of the share deeds',
    },
  },
  plot_development: {
    design_approval: {
      label: 'Layout design & approval',
      hint: 'Survey, layout plan, RAJUK / Pourashava subdivision approval',
    },
    utility_connection: {
      label: 'Utilities for the plots',
      hint: 'Electricity lines, water, gas and drainage to each plot',
    },
  },
};

/** The heads that apply to a project type, named for that type. */
export function costingHeadsFor(type: ProjectType): CostingHead[] {
  const built = type === 'apartment' || type === 'commercial' || type === 'mixed';
  return COSTING_HEADS.filter(
    (h) => (!h.builtOnly || built) && (!h.notShare || type !== 'land_share'),
  ).map((h) => ({ ...h, ...(HEAD_LABEL_BY_TYPE[type]?.[h.code] ?? {}) }));
}

/** Land money is costed on the land, never as a project head. */
export const LAND_COST_CATEGORIES: ReadonlySet<string> = new Set(['land_payment', 'land_extra_cost']);

/** Typical Bangladesh split of a construction estimate, used by the quick estimate. */
export const MATERIAL_SHARE_OF_CONSTRUCTION = 0.6;

export interface CostingLine {
  code: string;
  label: string;
  estimated: number;
  actual: number;
}

export interface ProjectCosting {
  land: { estimated: number; actual: number; lands: number; landownerShareValue: number | null };
  lines: CostingLine[];
  /** spend under a ledger category no head covers (custom Master Data codes) */
  otherLedger: number;
  contingencyPct: number;
  contingency: number;
  estimatedTotal: number;
  actualTotal: number;
  revenue: {
    source: 'units' | 'estimate' | 'none';
    expected: number;
    /** confirmed bookings at their final price */
    booked: number;
    /** unsold company units at list price */
    unsold: number;
    companyUnits: number;
    /** every unit, the landowner's included */
    totalUnits: number;
    soldUnits: number;
  };
  collected: number;
  margin: number;
  /** null when there is no revenue to compare against */
  marginPct: number | null;
  /** the share of expected revenue that has to be sold to cover the cost */
  breakEvenPct: number | null;
  /** cost per sqft on built product, per land unit on land sales */
  costPerArea: { value: number; per: string } | null;
}

export interface CostingInput {
  type: ProjectType;
  land: ProjectCosting['land'];
  budget: Array<{ cost_category: string; budgeted_amount: number }>;
  /** spend by cost category, land categories already removed */
  actuals: Record<string, number>;
  contingencyPct: number;
  revenue: ProjectCosting['revenue'];
  collected: number;
  area: { value: number; per: string } | null;
}

/** Pure arithmetic — the tab, the finance overview and a report all agree. */
export function summariseCosting(input: CostingInput): ProjectCosting {
  const heads = costingHeadsFor(input.type);
  const headCodes = new Set(heads.map((h) => h.code));
  const budgetFor = (code: string) =>
    money(
      input.budget
        .filter((b) => b.cost_category === code)
        .reduce((s, b) => s + (Number(b.budgeted_amount) || 0), 0),
    );

  const lines: CostingLine[] = heads.map((h) => ({
    code: h.code,
    label: h.label,
    estimated: budgetFor(h.code),
    actual: money(Number(input.actuals[h.code]) || 0),
  }));

  // budget or spend under a code with no head (old data, custom categories)
  const strayBudget = money(
    input.budget
      .filter((b) => !headCodes.has(b.cost_category) && !LAND_COST_CATEGORIES.has(b.cost_category))
      .reduce((s, b) => s + (Number(b.budgeted_amount) || 0), 0),
  );
  const otherLedger = money(
    Object.entries(input.actuals)
      .filter(([code]) => !headCodes.has(code) && !LAND_COST_CATEGORIES.has(code))
      .reduce((s, [, v]) => s + (Number(v) || 0), 0),
  );
  if (strayBudget > 0 || otherLedger > 0) {
    const other = lines.find((l) => l.code === 'other');
    if (other) {
      other.estimated = money(other.estimated + strayBudget);
      other.actual = money(other.actual + otherLedger);
    }
  }

  const headsEstimated = money(lines.reduce((s, l) => s + l.estimated, 0));
  const contingency = money((headsEstimated * input.contingencyPct) / 100);
  const estimatedTotal = money(input.land.estimated + headsEstimated + contingency);
  const actualTotal = money(input.land.actual + lines.reduce((s, l) => s + l.actual, 0));

  const expected = input.revenue.expected;
  const margin = money(expected - estimatedTotal);
  return {
    land: input.land,
    lines,
    otherLedger,
    contingencyPct: input.contingencyPct,
    contingency,
    estimatedTotal,
    actualTotal,
    revenue: input.revenue,
    collected: input.collected,
    margin,
    marginPct: expected > 0 ? Math.round((margin / expected) * 1000) / 10 : null,
    breakEvenPct: expected > 0 ? Math.round((estimatedTotal / expected) * 1000) / 10 : null,
    costPerArea:
      input.area && input.area.value > 0
        ? { value: money(estimatedTotal / input.area.value), per: input.area.per }
        : null,
  };
}
