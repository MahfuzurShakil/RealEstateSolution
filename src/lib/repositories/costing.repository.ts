'use client';

import { db } from '../db/database';
import type { Project } from '../db/types';
import { LAND_SIZE_UNIT_LABEL } from '../domain/land';
import { money } from '../domain/finance';
import { PROCUREMENT_BUDGET_HEAD } from '../db/types';
import {
  LAND_COST_CATEGORIES,
  LAND_ESTIMATE_HEAD,
  MATERIAL_SHARE_OF_CONSTRUCTION,
  summariseCosting,
  type ProjectCosting,
} from '../domain/costing';
import { projectBudgetRepository } from './budget.repository';
import { financeDashboardRepository } from './finance.repository';
import { landAcquisitionCostRepository } from './negotiation.repository';
import { procurementCostRepository } from './procurement.repository';
import { landProjectMappingRepository, projectRepository, unitRepository } from './project.repository';

/**
 * v29 — a project's costing, assembled from what is already recorded
 * (PLATFORM-REPLAN.md §1.5). Nothing here is stored except the estimate
 * itself: budget lines per head, the contingency and the quick revenue
 * estimate on the project.
 */
const SPOKEN_FOR: ReadonlySet<string> = new Set(['booked', 'sold', 'handed_over']);

class ProjectCostingRepository {
  /**
   * Estimate and actual, side by side and independent (client feedback
   * 2026-10-11).
   *
   * - **Estimate**: only what the owner typed for this project, by type:
   *   land, each cost head, contingency, and the expected sales (quantity ×
   *   price). Units, bookings and land sheets are never read for it.
   * - **Actual**: what has really been spent against the project, wherever it
   *   was recorded: land (payments, fees, historic cost, development, from
   *   the land records), material **when received at site** (decision), and
   *   every expense filed to the project by cost head.
   */
  async forProject(projectId: string): Promise<ProjectCosting | null> {
    const project = await db.projects.get(projectId);
    if (!project) return null;

    const [mappings, budget, expenses, materials, finance, units] = await Promise.all([
      // QA audit P-02 — the land whose cost this project carries
      landProjectMappingRepository.costedMappingsFor(projectId),
      projectBudgetRepository.listForProject(projectId),
      db.expenses.where('project_id').equals(projectId).toArray(),
      procurementCostRepository.forProject(projectId),
      financeDashboardRepository.forProject(projectId),
      unitRepository.listForProject(projectId),
    ]);

    // actual land cost from the land records, split evenly if a land is shared
    let landActual = 0;
    let ownerShare: number | null = null;
    for (const m of mappings) {
      const [sheet, sharers] = await Promise.all([
        landAcquisitionCostRepository.sheetForLand(m.land_id),
        db.land_project_mapping.where('land_id').equals(m.land_id).count(),
      ]);
      const split = Math.max(1, sharers);
      landActual += sheet.landTotal.actual / split;
      if (sheet.landownerShare) ownerShare = (ownerShare ?? 0) + sheet.landownerShare.value / split;
    }
    const landEstimate = budget
      .filter((b) => b.cost_category === LAND_ESTIMATE_HEAD)
      .reduce((t, b) => t + (Number(b.budgeted_amount) || 0), 0);

    // actual by head: expenses on the project (land money is on the land row)
    const actuals: Record<string, number> = {};
    for (const e of expenses) {
      if (LAND_COST_CATEGORIES.has(e.cost_category)) continue;
      actuals[e.cost_category] = money((actuals[e.cost_category] ?? 0) + (Number(e.amount) || 0));
    }
    // material is project cost once it reaches the site (decision 2026-10-11)
    const materialCost =
      materials.received_value + materials.transferred_in_value - materials.transferred_out_value;
    if (materialCost > 0) actuals[PROCUREMENT_BUDGET_HEAD] = money(materialCost);

    const quick = (Number(project.est_saleable_area) || 0) * (Number(project.est_avg_rate) || 0);
    const companyUnits = units.filter((u) => u.for_sale_by === 'company');
    return summariseCosting({
      type: project.project_type,
      land: {
        estimated: money(landEstimate),
        actual: money(landActual),
        lands: mappings.length,
        landownerShareValue: ownerShare === null ? null : money(ownerShare),
      },
      budget,
      actuals,
      contingencyPct: Number(project.contingency_pct) || 0,
      revenue: {
        source: quick > 0 ? 'estimate' : 'none',
        expected: money(quick),
        booked: 0,
        unsold: 0,
        companyUnits: companyUnits.length,
        totalUnits: units.length,
        soldUnits: companyUnits.filter((u) => SPOKEN_FOR.has(u.status)).length,
      },
      collected: finance?.collected ?? 0,
      area: this.area(project, units),
    });
  }

  /** What "cost per area" divides by: built sqft, or the land itself. */
  private area(
    project: Project,
    units: Array<{ size_sqft?: number | null }>,
  ): { value: number; per: string } | null {
    const built =
      project.project_type === 'apartment' ||
      project.project_type === 'commercial' ||
      project.project_type === 'mixed';
    if (built) {
      // every unit, the landowner's too: the company builds all of them
      const sqft = units.reduce((s, u) => s + (Number(u.size_sqft) || 0), 0);
      const value = sqft > 0 ? sqft : Number(project.est_saleable_area) || 0;
      return value > 0 ? { value, per: 'sqft' } : null;
    }
    const land = Number(project.total_land_area) || 0;
    return land > 0
      ? { value: land, per: LAND_SIZE_UNIT_LABEL[project.total_land_area_unit ?? 'katha'].toLowerCase() }
      : null;
  }

  /**
   * Saves the estimate in one go: a budget line per head, plus the
   * contingency and the quick revenue figures on the project.
   */
  async saveEstimate(
    projectId: string,
    input: {
      heads: Array<{ cost_category: string; budgeted_amount: number }>;
      contingency_pct: number | null;
      est_saleable_area: number | null;
      est_avg_rate: number | null;
    },
    actor: string | null,
  ): Promise<void> {
    await projectBudgetRepository.replaceForProject(projectId, input.heads, actor);
    await projectRepository.update(projectId, {
      contingency_pct: input.contingency_pct,
      est_saleable_area: input.est_saleable_area,
      est_avg_rate: input.est_avg_rate,
    });
  }

  /** Splits a quick construction figure the way BD contractors usually see it. */
  splitConstruction(total: number): { materials: number; contractor: number } {
    const materials = money(total * MATERIAL_SHARE_OF_CONSTRUCTION);
    return { materials, contractor: money(total - materials) };
  }
}

export const projectCostingRepository = new ProjectCostingRepository();
