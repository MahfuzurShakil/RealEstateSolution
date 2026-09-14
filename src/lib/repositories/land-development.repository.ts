'use client';

import { db } from '../db/database';
import type {
  LandDevelopmentActivity,
  LandDevelopmentProgress,
  Supplier,
} from '../db/types';
import { BaseRepository } from './base.repository';
import { documentRepository } from './document.repository';

/**
 * Batch L6 — land development (BRD section 11, DEV-001 to DEV-004).
 *
 * Filling, boundary walls, internal roads, drainage: the work that happens to
 * raw land before a project is planned on it. Until now it had nowhere to go,
 * so a plot that needed nine feet of fill looked exactly like one that was
 * ready to build on.
 */

const money = (n: number) => Math.round(n * 100) / 100;

/** An activity with its contractor and where its progress stands. */
export interface DevelopmentActivityWithProgress extends LandDevelopmentActivity {
  contractor: Supplier | undefined;
  updates: LandDevelopmentProgress[];
  /** the most recent report's percentage, or 0 when nothing is reported */
  pct_complete: number;
  /** what site has reported spending, which is not the same as the budget */
  incurred: number;
}

/** What gate G3 reads (BRD DEV-004). */
export interface DevelopmentReadiness {
  total: number;
  completed: number;
  /** planned, in progress or on hold — anything a project would be built over */
  outstanding: number;
  onHold: number;
  budgetTotal: number;
  incurredTotal: number;
}

class LandDevelopmentRepository extends BaseRepository<LandDevelopmentActivity> {
  constructor() {
    super(() => db.land_development_activities);
  }

  async listForLand(landId: string): Promise<DevelopmentActivityWithProgress[]> {
    const rows = await db.land_development_activities.where('land_id').equals(landId).toArray();

    const joined = await Promise.all(
      rows.map(async (row) => {
        const [contractor, updates] = await Promise.all([
          row.contractor_id ? db.suppliers.get(row.contractor_id) : Promise.resolve(undefined),
          db.land_development_progress.where('activity_id').equals(row.id).toArray(),
        ]);
        const sorted = updates.sort((a, b) => b.progress_date.localeCompare(a.progress_date));
        return {
          ...row,
          contractor,
          updates: sorted,
          /*
           * The latest report's percentage, not the highest and not a sum.
           * Progress can be revised down — a wall measured optimistically gets
           * corrected at the next measurement — and taking the maximum would
           * make a correction impossible to record.
           */
          pct_complete: sorted[0]?.pct_complete ?? 0,
          /*
           * The latest report's figure too, for the same reason: each report
           * states the running total spent, not that day's spend. Summing them
           * would multiply the cost by the number of times anybody reported.
           */
          incurred: money(Number(sorted[0]?.amount_incurred) || 0),
        };
      }),
    );

    return joined.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Whether this plot is ready to carry a project (BRD DEV-004).
   *
   * `cancelled` work does not count as outstanding — a boundary wall the board
   * decided against is not something a project is waiting on. `on_hold` does
   * count, and is reported separately, because paused work is unfinished work
   * and the person holding it up is usually not the person planning the
   * project.
   */
  async readinessForLand(landId: string): Promise<DevelopmentReadiness> {
    const rows = await this.listForLand(landId);
    const live = rows.filter((r) => r.status !== 'cancelled');
    return {
      total: live.length,
      completed: live.filter((r) => r.status === 'completed').length,
      outstanding: live.filter((r) => r.status !== 'completed').length,
      onHold: live.filter((r) => r.status === 'on_hold').length,
      budgetTotal: money(live.reduce((s, r) => s + (Number(r.budget_amount) || 0), 0)),
      incurredTotal: money(live.reduce((s, r) => s + r.incurred, 0)),
    };
  }

  /** Removes the activity with its progress log and its photos. */
  async removeCascade(id: string): Promise<void> {
    const updates = await db.land_development_progress.where('activity_id').equals(id).toArray();
    await db.land_development_progress.bulkDelete(updates.map((u) => u.id));
    await documentRepository.removeForEntity('land_development_activity', id);
    await this.remove(id);
  }

  async removeForLand(landId: string): Promise<void> {
    const rows = await db.land_development_activities.where('land_id').equals(landId).toArray();
    for (const row of rows) await this.removeCascade(row.id);
  }
}

class LandDevelopmentProgressRepository extends BaseRepository<LandDevelopmentProgress> {
  constructor() {
    super(() => db.land_development_progress);
  }

  /**
   * Records a report, and closes the activity when it reaches 100%.
   *
   * The two belong together: an activity reported complete that still shows as
   * "in progress" is the sort of mismatch that leaves gate G3 blocking a
   * project over work everybody on site knows is finished.
   */
  async record(
    input: Omit<LandDevelopmentProgress, 'id' | 'created_at' | 'updated_at' | 'created_by'>,
    createdBy: string | null = null,
  ): Promise<LandDevelopmentProgress> {
    const saved = await this.create(input, createdBy);

    const activity = await db.land_development_activities.get(input.activity_id);
    if (activity) {
      const next =
        input.pct_complete >= 100
          ? 'completed'
          : activity.status === 'planned'
            ? 'in_progress'
            : activity.status;
      if (next !== activity.status) {
        await db.land_development_activities.update(activity.id, {
          status: next,
          updated_at: new Date().toISOString(),
        });
      }
    }
    return saved;
  }
}

export const landDevelopmentRepository = new LandDevelopmentRepository();
export const landDevelopmentProgressRepository = new LandDevelopmentProgressRepository();
