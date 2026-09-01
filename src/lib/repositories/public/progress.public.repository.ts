'use client';

import { db } from '../../db/database';
import type { DocumentRecord } from '../../db/types';

/**
 * Public Portal data for Section 6.7 — "Project detail page-এ Tower-wise
 * `current_progress_pct` + latest `progress_photo`".
 *
 * The Public Portal pages themselves (P1–P4) are built later; this repository
 * exists now so that when they are, the progress feed is already the only way
 * in and nobody is tempted to read `db.towers` from a public component.
 *
 * Whitelisting is the whole point (AGENTS.md): a tower row carries nothing
 * confidential today, but a project's WBS does — planned dates, weights and
 * the delay against them are internal management facts, and a buyer must not
 * be able to read "Foundation is 40% behind schedule" off the marketing site.
 * So only the name, the floor count and the rounded percentage cross over.
 */

export interface PublicTowerProgress {
  tower_id: string;
  name: string;
  floor_count: number;
  /** whole numbers — a buyer does not need 63.47% */
  progress_pct: number;
  /** newest site photo marked is_public, as an object URL-able Blob */
  latest_photo: { id: string; file_name: string; blob: Blob | null; taken_on: string } | null;
}

function isProgressPhoto(doc: DocumentRecord): boolean {
  return doc.entity_type === 'site_progress_update' && doc.document_type === 'progress_photo';
}

export const progressPublicRepository = {
  /**
   * Tower-by-tower progress for one project. Returns nothing at all when the
   * project is not published — `is_public` is the gate for the whole portal.
   */
  async towerProgressForProject(projectId: string): Promise<PublicTowerProgress[]> {
    const project = await db.projects.get(projectId);
    if (!project?.is_public) return [];

    const towers = await db.towers.where('project_id').equals(projectId).toArray();
    const [workItems, updates, documents] = await Promise.all([
      db.tower_work_items.toArray(),
      db.site_progress_updates.toArray(),
      db.documents.toArray(),
    ]);

    const itemsByTower = new Map<string, string[]>();
    for (const item of workItems) {
      const list = itemsByTower.get(item.tower_id) ?? [];
      list.push(item.id);
      itemsByTower.set(item.tower_id, list);
    }

    const photos = documents.filter((d) => isProgressPhoto(d) && d.is_public);
    const updateById = new Map(updates.map((u) => [u.id, u]));

    return towers
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((tower) => {
        const itemIds = new Set(itemsByTower.get(tower.id) ?? []);
        const towerUpdateIds = new Set(
          updates.filter((u) => itemIds.has(u.work_item_id)).map((u) => u.id),
        );

        const latest = photos
          .filter((d) => towerUpdateIds.has(d.entity_id))
          .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
          .at(-1);

        return {
          tower_id: tower.id,
          name: tower.name,
          floor_count: tower.floor_count,
          progress_pct: Math.round(Number(tower.current_progress_pct) || 0),
          latest_photo: latest
            ? {
                id: latest.id,
                file_name: latest.file_name ?? latest.file_url,
                blob: latest.file_data ?? null,
                taken_on: updateById.get(latest.entity_id)?.update_date ?? latest.uploaded_at.slice(0, 10),
              }
            : null,
        };
      });
  },

  /** Overall project progress — the average of its towers (Section 6.3). */
  async projectProgressPct(projectId: string): Promise<number | null> {
    const towers = await this.towerProgressForProject(projectId);
    if (towers.length === 0) return null;
    return Math.round(towers.reduce((s, t) => s + t.progress_pct, 0) / towers.length);
  },
};
