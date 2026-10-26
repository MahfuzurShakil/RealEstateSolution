'use client';

import { db } from '../../db/database';
import type { DocumentRecord } from '../../db/types';
import { isPubliclyVisible } from '../../domain/public-portal';
import type { PublicImage } from './project.public.repository';

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

/** One public site photo for the home page "Live from our sites" strip. */
export interface PublicSitePhoto {
  id: string;
  image: PublicImage;
  project_code: string;
  project_name: string;
  tower_name: string | null;
  taken_on: string;
  /** the project's overall progress, rounded */
  project_progress_pct: number | null;
}

function isProgressPhoto(doc: DocumentRecord): boolean {
  return doc.entity_type === 'site_progress_update' && doc.document_type === 'progress_photo';
}

/** An uploaded photo, or one linked by URL (demo stock photos). */
function photoImage(doc: DocumentRecord, alt: string): PublicImage | null {
  if (doc.file_data) return { kind: 'blob', id: doc.id, blob: doc.file_data, alt };
  return /^https?:\/\//.test(doc.file_url) ? { kind: 'url', url: doc.file_url, alt } : null;
}

export const progressPublicRepository = {
  /**
   * Tower-by-tower progress for one project. Returns nothing at all when the
   * project is not published — `is_public` is the gate for the whole portal.
   */
  async towerProgressForProject(projectId: string): Promise<PublicTowerProgress[]> {
    const project = await db.projects.get(projectId);
    // the same gate as the project pages: published AND sales open/paused/sold out
    if (!project || !isPubliclyVisible(project)) return [];

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

  /**
   * Newest public site photos across every visible project, for the home page.
   * Only the date, tower name and rounded % cross over — never the engineer's
   * remarks, which can carry internal delay notes (master plan §10.2).
   */
  async photoFeed(limit = 8): Promise<PublicSitePhoto[]> {
    const [projects, towers, workItems, updates, docs] = await Promise.all([
      db.projects.toArray(),
      db.towers.toArray(),
      db.tower_work_items.toArray(),
      db.site_progress_updates.toArray(),
      db.documents.where('document_type').equals('progress_photo').toArray(),
    ]);
    const visible = new Map(projects.filter(isPubliclyVisible).map((p) => [p.id, p]));
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const itemById = new Map(workItems.map((w) => [w.id, w]));
    const updateById = new Map(updates.map((u) => [u.id, u]));

    const pctByProject = new Map<string, number>();
    for (const p of visible.values()) {
      const own = towers.filter((t) => t.project_id === p.id);
      if (own.length) pctByProject.set(p.id, Math.round(own.reduce((s, t) => s + (Number(t.current_progress_pct) || 0), 0) / own.length));
    }

    const out: PublicSitePhoto[] = [];
    for (const doc of docs.filter((d) => isProgressPhoto(d) && d.is_public)) {
      const update = updateById.get(doc.entity_id);
      const item = update ? itemById.get(update.work_item_id) : undefined;
      const tower = item ? towerById.get(item.tower_id) : undefined;
      const project = tower ? visible.get(tower.project_id) : undefined;
      if (!project) continue;
      const image = photoImage(doc, `${project.name}${tower ? ` — ${tower.name}` : ''}, site photo`);
      if (!image) continue;
      out.push({
        id: doc.id,
        image,
        project_code: project.code,
        project_name: project.name,
        tower_name: tower?.name ?? null,
        taken_on: update?.update_date ?? doc.uploaded_at.slice(0, 10),
        project_progress_pct: pctByProject.get(project.id) ?? null,
      });
    }
    return out.sort((a, b) => b.taken_on.localeCompare(a.taken_on)).slice(0, limit);
  },

  /** Overall project progress — the average of its towers (Section 6.3). */
  async projectProgressPct(projectId: string): Promise<number | null> {
    const towers = await this.towerProgressForProject(projectId);
    if (towers.length === 0) return null;
    return Math.round(towers.reduce((s, t) => s + t.progress_pct, 0) / towers.length);
  },
};
