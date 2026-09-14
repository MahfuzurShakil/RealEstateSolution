'use client';

import { db } from '../db/database';
import type { LandFeasibility, SiteVisit } from '../db/types';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';

/**
 * Batch L2 — BRD section 8. Site visits (SITE-001) and feasibility (SITE-002).
 *
 * Both hang off a land and neither is reachable from anywhere else, so they
 * share a file the way the land repositories do.
 */
class SiteVisitRepository extends BaseRepository<SiteVisit> {
  constructor() {
    super(() => db.site_visits);
  }

  /** Newest first — the most recent visit is the one that describes the plot. */
  async listForLand(landId: string): Promise<SiteVisit[]> {
    const rows = await db.site_visits.where('land_id').equals(landId).toArray();
    return rows.sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  }

  async countForLand(landId: string): Promise<number> {
    return db.site_visits.where('land_id').equals(landId).count();
  }

  /**
   * Removes the visit together with its photos.
   *
   * Without this the documents would outlive the visit they belong to, and
   * `entity_id` would point at nothing — the Documents tab for the land filters
   * on `entity_type = 'land'`, so they would not even be visible to delete.
   */
  async removeCascade(id: string): Promise<void> {
    await documentRepository.removeForEntity('site_visit', id);
    await this.remove(id);
  }

  /** Called when a land is deleted (see `landRepository.removeCascade`). */
  async removeForLand(landId: string): Promise<void> {
    const rows = await db.site_visits.where('land_id').equals(landId).toArray();
    for (const row of rows) await this.removeCascade(row.id);
  }
}

class LandFeasibilityRepository extends BaseRepository<LandFeasibility> {
  constructor() {
    super(() => db.land_feasibility);
  }

  /** Highest version first. */
  async listForLand(landId: string): Promise<LandFeasibility[]> {
    const rows = await db.land_feasibility.where('land_id').equals(landId).toArray();
    return rows.sort((a, b) => b.version_no - a.version_no);
  }

  /** The study that counts today: the highest version, whatever its status. */
  async currentForLand(landId: string): Promise<LandFeasibility | undefined> {
    return (await this.listForLand(landId))[0];
  }

  /**
   * The study gate G1 reads (BRD SITE-003).
   *
   * Deliberately the *latest* approved one rather than any approved one. A
   * land whose approved study was superseded by a draft that has not been
   * decided yet is still cleared to move — the board's last word stands until
   * they give a new one. What must not happen is a rejected re-study silently
   * leaving an old approval in place to open the gate, and it cannot: a
   * rejected version is not approved, so the newest *approved* row is still
   * the board's last approval.
   */
  async latestApprovedForLand(landId: string): Promise<LandFeasibility | undefined> {
    const rows = await this.listForLand(landId);
    return rows.find((r) => r.status === 'approved');
  }

  /**
   * `version_no` is assigned here, not by the caller.
   *
   * Two forms open at once would otherwise both save version 3, and
   * `&[land_id+version_no]` would reject the second with an index error the
   * user cannot act on. Callers omit it; the demo seeder passes an explicit
   * number because it is replaying a history that already has versions.
   *
   * It is `?: number` and tested with `> 0` rather than `??`, because `??`
   * falls back only on null and undefined. A caller passing `version_no: 0` as
   * a placeholder — which the study dialog did — kept the zero, so the new
   * version sorted *below* version 1 and the superseded study stayed "current".
   */
  async create(
    input: Omit<NewRecord<LandFeasibility>, 'version_no'> & { version_no?: number },
    createdBy: string | null = null,
  ): Promise<LandFeasibility> {
    const existing = await this.listForLand(input.land_id);
    const version_no =
      input.version_no && input.version_no > 0
        ? input.version_no
        : (existing[0]?.version_no ?? 0) + 1;
    return super.create({ ...input, version_no }, createdBy);
  }

  async removeForLand(landId: string): Promise<void> {
    const rows = await db.land_feasibility.where('land_id').equals(landId).toArray();
    await db.land_feasibility.bulkDelete(rows.map((r) => r.id));
  }
}

export const siteVisitRepository = new SiteVisitRepository();
export const landFeasibilityRepository = new LandFeasibilityRepository();
