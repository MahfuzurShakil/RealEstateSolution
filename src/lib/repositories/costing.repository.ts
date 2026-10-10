'use client';

import { db } from '../db/database';
import type { Project } from '../db/types';
import { LAND_SIZE_UNIT_LABEL } from '../domain/land';
import { money } from '../domain/finance';
import {
  LAND_COST_CATEGORIES,
  MATERIAL_SHARE_OF_CONSTRUCTION,
  summariseCosting,
  type ProjectCosting,
} from '../domain/costing';
import { projectBudgetRepository } from './budget.repository';
import { financeDashboardRepository } from './finance.repository';
import { landAcquisitionCostRepository } from './negotiation.repository';
import { projectRepository, unitRepository } from './project.repository';

/**
 * v29 — a project's costing, assembled from what is already recorded
 * (PLATFORM-REPLAN.md §1.5). Nothing here is stored except the estimate
 * itself: budget lines per head, the contingency and the quick revenue
 * estimate on the project.
 */
const SPOKEN_FOR: ReadonlySet<string> = new Set(['booked', 'sold', 'handed_over']);

class ProjectCostingRepository {
  async forProject(projectId: string): Promise<ProjectCosting | null> {
    const project = await db.projects.get(projectId);
    if (!project) return null;

    const [mappings, budget, actualsRaw, units, finance] = await Promise.all([
      db.land_project_mapping.where('project_id').equals(projectId).toArray(),
      projectBudgetRepository.listForProject(projectId),
      projectBudgetRepository.actualsForProject(projectId),
      unitRepository.listForProject(projectId),
      financeDashboardRepository.forProject(projectId),
    ]);

    /*
     * Land, from each linked land's cost sheet. A land under two projects is
     * split evenly, the same rule the finance roll-up uses, so the two never
     * disagree about what this project's land cost.
     */
    let landEstimated = 0;
    let landActual = 0;
    let ownerShare: number | null = null;
    for (const m of mappings) {
      const [sheet, sharers] = await Promise.all([
        landAcquisitionCostRepository.sheetForLand(m.land_id),
        db.land_project_mapping.where('land_id').equals(m.land_id).count(),
      ]);
      const split = Math.max(1, sharers);
      landEstimated += sheet.landTotal.estimated / split;
      landActual += sheet.landTotal.actual / split;
      if (sheet.landownerShare) ownerShare = (ownerShare ?? 0) + sheet.landownerShare.value / split;
    }

    // land money is on the land row; leaving it in the heads would count it twice
    const actuals: Record<string, number> = {};
    for (const [code, v] of Object.entries(actualsRaw)) {
      if (!LAND_COST_CATEGORIES.has(code)) actuals[code] = v;
    }

    /*
     * Revenue: once units exist, what they are actually selling for — the
     * final price on a live booking, the list price on what is still unsold.
     * Only units the company sells: on a JV the landowner's flats are his to
     * sell and earn the company nothing. Before units exist, the quick
     * estimate on the project.
     */
    const companyUnits = units.filter((u) => u.for_sale_by === 'company');
    const unitIds = new Set(companyUnits.map((u) => u.id));
    const bookings = (await db.bookings.toArray()).filter(
      (b) => unitIds.has(b.unit_id) && b.status !== 'cancelled',
    );
    const bookedUnit = new Map(bookings.map((b) => [b.unit_id, b]));
    let booked = 0;
    let unsold = 0;
    for (const u of companyUnits) {
      const b = bookedUnit.get(u.id);
      if (b) booked += Number(b.final_price) || 0;
      else unsold += Number(u.base_price) || 0;
    }
    const quick = (Number(project.est_saleable_area) || 0) * (Number(project.est_avg_rate) || 0);
    const revenue =
      companyUnits.length > 0
        ? {
            source: 'units' as const,
            expected: money(booked + unsold),
            booked: money(booked),
            unsold: money(unsold),
            companyUnits: companyUnits.length,
            totalUnits: units.length,
            // by unit status: a unit handed over before bookings were recorded is still sold
            soldUnits: companyUnits.filter((u) => SPOKEN_FOR.has(u.status)).length,
          }
        : {
            source: quick > 0 ? ('estimate' as const) : ('none' as const),
            expected: money(quick),
            booked: 0,
            unsold: 0,
            companyUnits: 0,
            totalUnits: 0,
            soldUnits: 0,
          };

    return summariseCosting({
      type: project.project_type,
      land: {
        estimated: money(landEstimated),
        actual: money(landActual),
        lands: mappings.length,
        landownerShareValue: ownerShare === null ? null : money(ownerShare),
      },
      budget,
      actuals,
      contingencyPct: Number(project.contingency_pct) || 0,
      revenue,
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
