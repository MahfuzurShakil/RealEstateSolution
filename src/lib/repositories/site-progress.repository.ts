'use client';

import { db } from '../db/database';
import {
  DEFAULT_TOWER_WORK_ITEMS,
  type DocumentRecord,
  type MaterialRequest,
  type MaterialRequestItem,
  type MaterialRequestStatus,
  type MaterialRequestStatusEvent,
  type Project,
  type SiteProgressUpdate,
  type Tower,
  type TowerWorkItem,
  type WorkItemStatus,
} from '../db/types';
import {
  MATERIAL_REQUEST_STATUS_META,
  STALE_AFTER_DAYS,
  clampPct,
  daysBetween,
  isSiteActive,
  progressSeries,
  readingKind,
  rollupAcrossTowers,
  rollupProgress,
  statusForProgress,
  towerProgressPct,
  varianceOn,
  type ActivityEvent,
  type ProgressPoint,
  type ProgressRollup,
} from '../domain/site-progress';
import { nextCode } from '../utils/id';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';

/*
 * This file deliberately reads `db.towers` / `db.projects` directly instead of
 * importing project.repository: Module 2's TowerRepository has to call into
 * here (a new tower gets a default WBS), and two repositories importing each
 * other is a cycle. The dependency runs one way — project → site-progress.
 */

/* ------------------------------------------------------------------ *
 * Work items (Section 6.2)
 * ------------------------------------------------------------------ */

/** The fields a Project Manager may edit on a WBS line. */
export interface WorkItemInput {
  name?: string;
  sequence_no?: number;
  weight_pct?: number;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_progress_pct?: number;
}

class TowerWorkItemRepository extends BaseRepository<TowerWorkItem> {
  constructor() {
    super(() => db.tower_work_items);
  }

  /** In WBS order — this is a sequence of work, not an alphabetical list. */
  async listForTower(towerId: string): Promise<TowerWorkItem[]> {
    const rows = await db.tower_work_items.where('tower_id').equals(towerId).toArray();
    return rows.sort((a, b) => a.sequence_no - b.sequence_no);
  }

  async listForProject(projectId: string): Promise<TowerWorkItem[]> {
    const towers = await db.towers.where('project_id').equals(projectId).toArray();
    const towerIds = new Set(towers.map((t) => t.id));
    const rows = (await db.tower_work_items.toArray()).filter((i) => towerIds.has(i.tower_id));
    return rows.sort((a, b) => a.sequence_no - b.sequence_no);
  }

  /**
   * The default template of Section 6.2, applied when a tower is created.
   * Equal weight, evenly spread across the project's planned build window so
   * the planned-vs-actual comparison has something to work with from day one —
   * the Project Manager retunes both afterwards.
   */
  async seedDefaultsForTower(
    towerId: string,
    createdBy: string | null = null,
  ): Promise<TowerWorkItem[]> {
    const existing = await this.listForTower(towerId);
    if (existing.length > 0) return existing;

    const tower = await db.towers.get(towerId);
    const project = tower ? await db.projects.get(tower.project_id) : undefined;
    const window = plannedWindow(project, DEFAULT_TOWER_WORK_ITEMS.length);

    // 8 items over 100% is 12.5 each; the last one absorbs the rounding
    const count = DEFAULT_TOWER_WORK_ITEMS.length;
    const each = Math.round((100 / count) * 100) / 100;

    const created: TowerWorkItem[] = [];
    for (const [index, name] of DEFAULT_TOWER_WORK_ITEMS.entries()) {
      const isLast = index === count - 1;
      created.push(
        await this.create(
          {
            tower_id: towerId,
            name,
            sequence_no: index + 1,
            weight_pct: isLast ? Math.round((100 - each * (count - 1)) * 100) / 100 : each,
            planned_start_date: window?.[index]?.start ?? null,
            planned_end_date: window?.[index]?.end ?? null,
            actual_progress_pct: 0,
            status: 'not_started',
          },
          createdBy,
        ),
      );
    }

    await recalculateTower(towerId);
    return created;
  }

  /**
   * Editing a work item by hand. Progress typed in here counts as a correction,
   * not a site report, so it moves the number without inventing a daily log
   * entry — but it still keeps the status and the tower cache in step.
   */
  async updateItem(id: string, changes: WorkItemInput): Promise<TowerWorkItem | undefined> {
    const patch: Record<string, unknown> = { ...changes };
    if (changes.actual_progress_pct !== undefined) {
      const pct = clampPct(Number(changes.actual_progress_pct));
      patch.actual_progress_pct = pct;
      patch.status = statusForProgress(pct);
    }

    const saved = await this.update(id, patch as never);
    if (saved) await recalculateTower(saved.tower_id);
    return saved;
  }

  /** Deleting a work item takes its daily log and its attachments with it. */
  async removeCascade(id: string): Promise<void> {
    const item = await this.getById(id);
    const updates = await db.site_progress_updates.where('work_item_id').equals(id).toArray();
    for (const update of updates) {
      await documentRepository.removeForEntity('site_progress_update', update.id);
    }
    await db.site_progress_updates.bulkDelete(updates.map((u) => u.id));

    // requests raised against it survive, but lose the pointer
    const requests = await db.material_requests.where('work_item_id').equals(id).toArray();
    for (const request of requests) await db.material_requests.update(request.id, { work_item_id: null });

    await this.remove(id);
    if (item) await recalculateTower(item.tower_id);
  }

  /** Everything hanging off a tower, called when Module 2 deletes one. */
  async removeForTower(towerId: string): Promise<void> {
    for (const item of await this.listForTower(towerId)) await this.removeCascade(item.id);
  }

  /** Recomputes and stores `towers.current_progress_pct`. */
  async recalculateTower(towerId: string): Promise<number> {
    return recalculateTower(towerId);
  }

  async rollupForTower(towerId: string, today: string): Promise<ProgressRollup> {
    return rollupProgress(await this.listForTower(towerId), today);
  }

  /** Averaged over the project's towers, per Section 6.3. */
  async rollupForProject(projectId: string, today: string): Promise<ProgressRollup> {
    return rollupAcrossTowers(await this.listForProject(projectId), today);
  }
}

/**
 * Spreads `count` sequential work items evenly across the project's planned
 * build window, so the default WBS opens with usable plan dates.
 */
function plannedWindow(
  project: Project | undefined,
  count: number,
): Array<{ start: string; end: string }> | null {
  if (!project?.expected_start_date || !project?.expected_completion_date) return null;
  const from = Date.parse(project.expected_start_date);
  const to = Date.parse(project.expected_completion_date);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;

  const span = (to - from) / count;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return Array.from({ length: count }, (_, i) => ({
    start: iso(from + span * i),
    end: iso(from + span * (i + 1)),
  }));
}

/** Section 6.3: Σ actual × weight ÷ 100, cached on the tower row. */
async function recalculateTower(towerId: string): Promise<number> {
  const items = await db.tower_work_items.where('tower_id').equals(towerId).toArray();
  const pct = towerProgressPct(items);
  await db.towers.update(towerId, {
    current_progress_pct: pct,
    updated_at: new Date().toISOString(),
  });
  return pct;
}

/* ------------------------------------------------------------------ *
 * Daily progress log (Section 6.3)
 * ------------------------------------------------------------------ */

export interface ProgressUpdateFilters {
  search?: string;
  project_id?: string;
  tower_id?: string;
  work_item_id?: string;
  updated_by?: string;
  /** inclusive ISO dates */
  from_date?: string;
  to_date?: string;
}

/** A log entry with everything the list and detail pages have to show. */
export interface ProgressUpdateWithRelations extends SiteProgressUpdate {
  work_item?: TowerWorkItem;
  tower?: Tower;
  project?: Project;
  reporter_name?: string | null;
}

class SiteProgressUpdateRepository extends BaseRepository<SiteProgressUpdate> {
  constructor() {
    super(() => db.site_progress_updates);
  }

  /** Newest first — the site log is read from the top. */
  async listForWorkItem(workItemId: string): Promise<SiteProgressUpdate[]> {
    const rows = await db.site_progress_updates.where('work_item_id').equals(workItemId).toArray();
    return rows.sort((a, b) => b.update_date.localeCompare(a.update_date) || b.created_at.localeCompare(a.created_at));
  }

  async list(filters: ProgressUpdateFilters = {}): Promise<ProgressUpdateWithRelations[]> {
    const [updates, items, towers, projects, users] = await Promise.all([
      db.site_progress_updates.toArray(),
      db.tower_work_items.toArray(),
      db.towers.toArray(),
      db.projects.toArray(),
      db.users.toArray(),
    ]);

    const itemById = new Map(items.map((i) => [i.id, i]));
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let rows: ProgressUpdateWithRelations[] = updates.map((update) => {
      const work_item = itemById.get(update.work_item_id);
      const tower = work_item ? towerById.get(work_item.tower_id) : undefined;
      const project = tower ? projectById.get(tower.project_id) : undefined;
      return {
        ...update,
        work_item,
        tower,
        project,
        reporter_name: update.updated_by ? (userById.get(update.updated_by)?.name ?? null) : null,
      };
    });

    if (filters.project_id) rows = rows.filter((r) => r.project?.id === filters.project_id);
    if (filters.tower_id) rows = rows.filter((r) => r.tower?.id === filters.tower_id);
    if (filters.work_item_id) rows = rows.filter((r) => r.work_item_id === filters.work_item_id);
    if (filters.updated_by && filters.updated_by !== 'all') {
      rows = rows.filter((r) => r.updated_by === filters.updated_by);
    }
    if (filters.from_date) rows = rows.filter((r) => r.update_date >= filters.from_date!);
    if (filters.to_date) rows = rows.filter((r) => r.update_date <= filters.to_date!);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.remarks, r.work_item?.name, r.tower?.name, r.project?.name, r.reporter_name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort(
      (a, b) => b.update_date.localeCompare(a.update_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  /**
   * `null` (not `undefined`) when the reading is gone.
   *
   * `useLiveQuery` reports its own "still running" state as `undefined`, so a
   * repository that also returns `undefined` for "no such row" leaves the
   * detail page unable to tell a missing record from a pending query — it sat
   * on "Loading…" forever instead of saying the record was deleted.
   */
  async getWithRelations(id: string): Promise<ProgressUpdateWithRelations | null> {
    const update = await this.getById(id);
    if (!update) return null;

    const work_item = await db.tower_work_items.get(update.work_item_id);
    const tower = work_item ? await db.towers.get(work_item.tower_id) : undefined;
    const project = tower ? await db.projects.get(tower.project_id) : undefined;
    const reporter = update.updated_by ? await db.users.get(update.updated_by) : undefined;

    return { ...update, work_item, tower, project, reporter_name: reporter?.name ?? null };
  }

  /**
   * Logging a reading (Section 6.3 behaviour): the work item takes the new
   * percentage, its status follows, and the tower's cached % is recomputed.
   *
   * Progress is not allowed to go backwards from a later reading: an entry
   * back-dated behind one that already exists records history without
   * rewriting where the item stands today.
   */
  async log(
    input: {
      work_item_id: string;
      update_date: string;
      progress_pct: number;
      remarks?: string | null;
      gps_lat?: number | null;
      gps_lng?: number | null;
      updated_by: string | null;
    },
    createdBy: string | null = null,
  ): Promise<SiteProgressUpdate> {
    const pct = clampPct(Number(input.progress_pct));
    const saved = await this.create({ ...input, progress_pct: pct }, createdBy);
    await applyLatestReading(input.work_item_id);
    return saved;
  }

  /** Removing a log entry rolls the work item back to the reading before it. */
  async removeCascade(id: string): Promise<void> {
    const update = await this.getById(id);
    await documentRepository.removeForEntity('site_progress_update', id);
    await this.remove(id);
    if (update) await applyLatestReading(update.work_item_id);
  }

  async countForProject(projectId: string): Promise<number> {
    return (await this.list({ project_id: projectId })).length;
  }
}

/**
 * Re-derives a work item's standing from its log: the most recent reading
 * wins, and with no readings left it falls back to zero.
 */
async function applyLatestReading(workItemId: string): Promise<void> {
  const updates = await db.site_progress_updates.where('work_item_id').equals(workItemId).toArray();
  const latest = updates.sort(
    (a, b) => a.update_date.localeCompare(b.update_date) || a.created_at.localeCompare(b.created_at),
  ).at(-1);

  const pct = clampPct(Number(latest?.progress_pct ?? 0));
  const status: WorkItemStatus = statusForProgress(pct);

  await db.tower_work_items.update(workItemId, {
    actual_progress_pct: pct,
    status,
    updated_at: new Date().toISOString(),
  });

  const item = await db.tower_work_items.get(workItemId);
  if (item) await recalculateTower(item.tower_id);
}

/* ------------------------------------------------------------------ *
 * Material requests (Section 6.5 / 6.6)
 * ------------------------------------------------------------------ */

export interface MaterialRequestFilters {
  search?: string;
  status?: MaterialRequestStatus | 'all';
  project_id?: string;
  tower_id?: string;
  requested_by?: string;
  /** the Procurement inbox: everything still waiting on a decision */
  pending_only?: boolean;
}

export interface MaterialRequestWithRelations extends MaterialRequest {
  items: MaterialRequestItem[];
  history: MaterialRequestStatusEvent[];
  project?: Project;
  tower?: Tower;
  work_item?: TowerWorkItem;
  requester_name?: string | null;
}

export interface MaterialRequestItemInput {
  id?: string;
  /** Tier 3.1: the catalogue item this line asks for. */
  item_id?: string | null;
  item_name: string;
  unit: string;
  quantity_requested: number;
  quantity_approved?: number | null;
}

/** Older rows predate `sort_order`; fall back to when they were created. */
function lineOrder(a: MaterialRequestItem, b: MaterialRequestItem): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at);
}

class MaterialRequestRepository extends BaseRepository<MaterialRequest> {
  constructor() {
    super(() => db.material_requests);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.material_requests.toArray()).map((r) => r.code);
    return nextCode('MREQ', codes);
  }

  /** A request without lines is meaningless, so the two are saved together. */
  async createRequest(
    input: Omit<NewRecord<MaterialRequest>, 'code' | 'status'> & {
      code?: string;
      items: MaterialRequestItemInput[];
    },
    createdBy: string | null = null,
  ): Promise<MaterialRequest> {
    const { items, ...rest } = input;
    const code = rest.code?.trim() ? rest.code : await this.generateCode();

    const request = await this.create({ ...rest, code, status: 'pending' }, createdBy);
    await materialRequestItemRepository.replaceForRequest(request.id, items, createdBy);
    return request;
  }

  async updateRequest(
    id: string,
    changes: {
      project_id?: string;
      tower_id?: string | null;
      work_item_id?: string | null;
      requested_by?: string | null;
      request_date?: string;
      notes?: string | null;
    },
    items: MaterialRequestItemInput[],
    createdBy: string | null = null,
  ): Promise<MaterialRequest | undefined> {
    await materialRequestItemRepository.replaceForRequest(id, items, createdBy);
    return this.update(id, changes as never);
  }

  async list(filters: MaterialRequestFilters = {}): Promise<MaterialRequestWithRelations[]> {
    const [requests, items, projects, towers, workItems, users] = await Promise.all([
      db.material_requests.toArray(),
      db.material_request_items.toArray(),
      db.projects.toArray(),
      db.towers.toArray(),
      db.tower_work_items.toArray(),
      db.users.toArray(),
    ]);

    const itemsByRequest = new Map<string, MaterialRequestItem[]>();
    for (const item of [...items].sort(lineOrder)) {
      const list = itemsByRequest.get(item.request_id) ?? [];
      list.push(item);
      itemsByRequest.set(item.request_id, list);
    }
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const workItemById = new Map(workItems.map((w) => [w.id, w]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let rows: MaterialRequestWithRelations[] = requests.map((request) => ({
      ...request,
      items: itemsByRequest.get(request.id) ?? [],
      // the list does not draw the trail; the detail page and timeline do
      history: [],
      project: projectById.get(request.project_id),
      tower: request.tower_id ? towerById.get(request.tower_id) : undefined,
      work_item: request.work_item_id ? workItemById.get(request.work_item_id) : undefined,
      requester_name: request.requested_by ? (userById.get(request.requested_by)?.name ?? null) : null,
    }));

    if (filters.pending_only) rows = rows.filter((r) => r.status === 'pending');
    if (filters.status && filters.status !== 'all') rows = rows.filter((r) => r.status === filters.status);
    if (filters.project_id) rows = rows.filter((r) => r.project_id === filters.project_id);
    if (filters.tower_id) rows = rows.filter((r) => r.tower_id === filters.tower_id);
    if (filters.requested_by && filters.requested_by !== 'all') {
      rows = rows.filter((r) => r.requested_by === filters.requested_by);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [
          r.code,
          r.notes,
          r.project?.name,
          r.tower?.name,
          r.work_item?.name,
          r.requester_name,
          ...r.items.map((i) => i.item_name),
        ]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /** `null` when the request is gone — see the note on the progress update. */
  async getWithRelations(id: string): Promise<MaterialRequestWithRelations | null> {
    const request = await this.getById(id);
    if (!request) return null;

    const [items, project, requester] = await Promise.all([
      materialRequestItemRepository.listForRequest(id),
      db.projects.get(request.project_id),
      request.requested_by ? db.users.get(request.requested_by) : Promise.resolve(undefined),
    ]);
    const tower = request.tower_id ? await db.towers.get(request.tower_id) : undefined;
    const work_item = request.work_item_id ? await db.tower_work_items.get(request.work_item_id) : undefined;
    const history = await materialRequestStatusEventRepository.listForRequest(id);

    return {
      ...request,
      items,
      history,
      project,
      tower,
      work_item,
      requester_name: requester?.name ?? null,
    };
  }

  /**
   * Moves the request along the Section 6.5 lifecycle. Approval is where the
   * approved quantities are settled, so they come in with the decision rather
   * than as a separate edit that could be forgotten.
   */
  async setStatus(
    id: string,
    status: MaterialRequestStatus,
    options: {
      decision_note?: string | null;
      approved_quantities?: Record<string, number | null>;
      /** who decided, and when it actually happened */
      decided_by?: string | null;
      event_date?: string;
    } = {},
  ): Promise<MaterialRequest | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    if (status === 'approved') {
      const items = await materialRequestItemRepository.listForRequest(id);
      for (const item of items) {
        const raw = options.approved_quantities?.[item.id];
        // blank means "all of it" — the quantity that was asked for
        const approved = raw === null || raw === undefined ? item.quantity_requested : raw;
        await materialRequestItemRepository.update(item.id, { quantity_approved: approved });
      }
    }

    if (status === 'rejected') {
      const items = await materialRequestItemRepository.listForRequest(id);
      for (const item of items) {
        await materialRequestItemRepository.update(item.id, { quantity_approved: 0 });
      }
    }

    // logged before the status moves, so a transition can never happen
    // without leaving a row behind
    await materialRequestStatusEventRepository.create(
      {
        request_id: id,
        from_status: current.status,
        to_status: status,
        event_date: options.event_date ?? new Date().toISOString().slice(0, 10),
        decided_by: options.decided_by ?? null,
        note: options.decision_note ?? null,
      },
      options.decided_by ?? null,
    );

    return this.update(id, {
      status,
      ...(options.decision_note !== undefined ? { decision_note: options.decision_note } : {}),
    });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await db.material_requests.toArray();
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  async removeCascade(id: string): Promise<void> {
    await materialRequestItemRepository.removeForRequest(id);
    const history = await db.material_request_status_history.where('request_id').equals(id).toArray();
    await db.material_request_status_history.bulkDelete(history.map((h) => h.id));
    await this.remove(id);
  }
}

class MaterialRequestItemRepository extends BaseRepository<MaterialRequestItem> {
  constructor() {
    super(() => db.material_request_items);
  }

  async listForRequest(requestId: string): Promise<MaterialRequestItem[]> {
    const rows = await db.material_request_items.where('request_id').equals(requestId).toArray();
    return rows.sort(lineOrder);
  }

  /**
   * Rewrites the lines of a request.
   *
   * A row that keeps its id is updated in place and KEEPS the quantity
   * Procurement approved, unless the caller passes a new one. The edit form
   * does not carry that field — it is a site-side form about what was asked
   * for — so taking its silence as `null` wiped the decision every time
   * somebody re-saved an approved request, leaving it marked Approved with
   * nothing actually approved.
   */
  async replaceForRequest(
    requestId: string,
    items: MaterialRequestItemInput[],
    createdBy: string | null = null,
  ): Promise<void> {
    const existing = await this.listForRequest(requestId);
    const byId = new Map(existing.map((row) => [row.id, row]));
    const keptIds = new Set(items.map((i) => i.id).filter(Boolean) as string[]);

    for (const row of existing) {
      if (!keptIds.has(row.id)) await this.remove(row.id);
    }

    for (const [index, item] of items.entries()) {
      const prior = item.id ? byId.get(item.id) : undefined;
      const payload = {
        request_id: requestId,
        item_id: item.item_id ?? null,
        item_name: item.item_name.trim(),
        unit: item.unit,
        quantity_requested: Number(item.quantity_requested) || 0,
        // undefined = "not my business", which is not the same as "clear it"
        quantity_approved: item.quantity_approved ?? prior?.quantity_approved ?? null,
        // the order the requisition was written in, not the order it saved in
        sort_order: index + 1,
      };
      if (prior) await this.update(item.id!, payload);
      else await this.create(payload, createdBy);
    }
  }

  async removeForRequest(requestId: string): Promise<void> {
    const rows = await this.listForRequest(requestId);
    await db.material_request_items.bulkDelete(rows.map((r) => r.id));
  }
}

/** Lifecycle trail for a material request (Section 6.5 + the addendum). */
class MaterialRequestStatusEventRepository extends BaseRepository<MaterialRequestStatusEvent> {
  constructor() {
    super(() => db.material_request_status_history);
  }

  /** Oldest first — this is a timeline. */
  async listForRequest(requestId: string): Promise<MaterialRequestStatusEvent[]> {
    const rows = await db.material_request_status_history
      .where('request_id')
      .equals(requestId)
      .toArray();
    return rows.sort(
      (a, b) => a.event_date.localeCompare(b.event_date) || a.created_at.localeCompare(b.created_at),
    );
  }
}

export const materialRequestStatusEventRepository = new MaterialRequestStatusEventRepository();
export const towerWorkItemRepository = new TowerWorkItemRepository();
export const siteProgressUpdateRepository = new SiteProgressUpdateRepository();
export const materialRequestRepository = new MaterialRequestRepository();
export const materialRequestItemRepository = new MaterialRequestItemRepository();

/* ------------------------------------------------------------------ *
 * Project progress board + activity stream
 *
 * Added after the Module 5 review. The first version of the Site Progress
 * page was a flat list of every reading ever taken, which answered "what was
 * typed in" but not "which project needs attention" — the question the page
 * is actually opened to answer. These read the same tables; nothing new is
 * stored.
 * ------------------------------------------------------------------ */

/** One project's row on the board. */
export interface ProjectProgressRow {
  project: Project;
  rollup: ProgressRollup;
  towers: Array<{ tower: Tower; rollup: ProgressRollup }>;
  /** work items whose actual is more than 5 points behind plan */
  behind_count: number;
  work_item_count: number;
  pending_requests: number;
  open_requests: number;
  update_count: number;
  last_update?: SiteProgressUpdate;
  last_update_by?: string | null;
  /** null when nothing has ever been logged */
  days_since_update: number | null;
  /** an active site that has gone quiet (see isSiteActive / STALE_AFTER_DAYS) */
  is_stale: boolean;
  series: ProgressPoint[];
}

export interface BoardFilters {
  search?: string;
  /** 'behind' | 'ahead' | 'on_track' | 'no_plan' | 'stale' | 'all' */
  state?: string;
  project_status?: string;
}

/** Aggregate counters for the "needs attention" strip. */
export interface AttentionSummary {
  behind_items: number;
  pending_requests: number;
  stale_projects: number;
  unbalanced_towers: number;
}

class ProjectProgressRepository {
  /**
   * Everything the board needs, in one pass over the tables. Building it per
   * project would re-read `tower_work_items` once per card.
   */
  async board(today: string, filters: BoardFilters = {}): Promise<ProjectProgressRow[]> {
    const [projects, towers, items, updates, requests, users] = await Promise.all([
      db.projects.toArray(),
      db.towers.toArray(),
      db.tower_work_items.toArray(),
      db.site_progress_updates.toArray(),
      db.material_requests.toArray(),
      db.users.toArray(),
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const towersByProject = groupBy(towers, (t) => t.project_id);
    const itemsByTower = groupBy(items, (i) => i.tower_id);
    const readingsByItem = groupBy(
      [...updates].sort((a, b) => a.update_date.localeCompare(b.update_date)),
      (u) => u.work_item_id,
    );
    const requestsByProject = groupBy(requests, (r) => r.project_id);

    let rows: ProjectProgressRow[] = projects.map((project) => {
      const projectTowers = (towersByProject.get(project.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
      const projectItems = projectTowers.flatMap((t) => itemsByTower.get(t.id) ?? []);
      const itemIds = new Set(projectItems.map((i) => i.id));

      const projectUpdates = updates
        .filter((u) => itemIds.has(u.work_item_id))
        .sort((a, b) => a.update_date.localeCompare(b.update_date));
      const last_update = projectUpdates.at(-1);

      const projectRequests = requestsByProject.get(project.id) ?? [];

      const behind_count = projectItems.filter((item) => {
        const variance = varianceOn(item, today);
        return variance !== null && variance < -5;
      }).length;

      const days_since_update = last_update ? daysBetween(last_update.update_date, today) : null;

      // the curve starts where the site did, not where the log happens to
      const from = projectUpdates[0]?.update_date ?? project.expected_start_date;
      const rollup = rollupAcrossTowers(projectItems, today);

      return {
        project,
        rollup,
        towers: projectTowers.map((tower) => ({
          tower,
          rollup: rollupProgress(itemsByTower.get(tower.id) ?? [], today),
        })),
        behind_count,
        work_item_count: projectItems.length,
        pending_requests: projectRequests.filter((r) => r.status === 'pending').length,
        open_requests: projectRequests.filter(
          (r) => r.status !== 'fulfilled' && r.status !== 'rejected',
        ).length,
        update_count: projectUpdates.length,
        last_update,
        last_update_by: last_update?.updated_by
          ? (userById.get(last_update.updated_by)?.name ?? null)
          : null,
        days_since_update,
        /*
         * Silence only counts against a site that still owes work. A project
         * at 100% in handover has nothing left to report, and flagging it
         * teaches people to ignore the badge.
         */
        is_stale:
          isSiteActive(project.status) &&
          rollup.actual_pct < 100 &&
          (days_since_update === null || days_since_update > STALE_AFTER_DAYS),
        series: progressSeries(projectItems, readingsByItem, from, today),
      };
    });

    if (filters.project_status && filters.project_status !== 'all') {
      rows = rows.filter((r) => r.project.status === filters.project_status);
    }
    if (filters.state && filters.state !== 'all') {
      rows =
        filters.state === 'stale'
          ? rows.filter((r) => r.is_stale)
          : rows.filter((r) => r.rollup.state === filters.state);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.project.code, r.project.name, r.project.location_summary]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    /*
     * Worst first. A board sorted by name makes you read every card to find
     * the one that needs you; this puts the answer in the top row.
     *
     * Variance alone is not enough: a finished project sits at exactly 0.0%
     * variance forever and would outrank a site that is actually being built.
     * So the board ranks by how much the project can still be acted on, and
     * only sorts by delay inside each band.
     */
    return rows.sort((a, b) => {
      const rank = boardRank(a) - boardRank(b);
      if (rank !== 0) return rank;
      return (a.rollup.variance ?? 999) - (b.rollup.variance ?? 999);
    });
  }

  async attention(today: string): Promise<AttentionSummary> {
    const rows = await this.board(today);
    const towerItems = groupBy(await db.tower_work_items.toArray(), (i) => i.tower_id);

    let unbalanced_towers = 0;
    for (const [, items] of towerItems) {
      if (items.length === 0) continue;
      const sum = items.reduce((s, i) => s + (Number(i.weight_pct) || 0), 0);
      if (Math.abs(sum - 100) > 0.01) unbalanced_towers += 1;
    }

    return {
      behind_items: rows.reduce((s, r) => s + r.behind_count, 0),
      pending_requests: rows.reduce((s, r) => s + r.pending_requests, 0),
      stale_projects: rows.filter((r) => r.is_stale).length,
      unbalanced_towers,
    };
  }

  /** One project's row — the header of its progress page. `null` if it is gone. */
  async forProject(projectId: string, today: string): Promise<ProjectProgressRow | null> {
    return (await this.board(today)).find((r) => r.project.id === projectId) ?? null;
  }

  /**
   * The merged site activity of one project, newest first.
   *
   * Readings, milestones, material requests and the project's own pipeline
   * steps all describe the same site; kept in four separate lists they read
   * as four unrelated logs.
   */
  async activity(projectId: string): Promise<ActivityEvent[]> {
    const towers = await db.towers.where('project_id').equals(projectId).toArray();
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const towerIds = new Set(towers.map((t) => t.id));

    const [allItems, allUpdates, requests, statusEvents, requestHistory, documents, users] =
      await Promise.all([
        db.tower_work_items.toArray(),
        db.site_progress_updates.toArray(),
        db.material_requests.where('project_id').equals(projectId).toArray(),
        db.project_status_history.where('project_id').equals(projectId).toArray(),
        db.material_request_status_history.toArray(),
        db.documents.toArray(),
        db.users.toArray(),
      ]);

    const items = allItems.filter((i) => towerIds.has(i.tower_id));
    const itemById = new Map(items.map((i) => [i.id, i]));
    const userById = new Map(users.map((u) => [u.id, u]));

    const photoCount = new Map<string, number>();
    for (const doc of documents) {
      if (doc.entity_type !== 'site_progress_update') continue;
      photoCount.set(doc.entity_id, (photoCount.get(doc.entity_id) ?? 0) + 1);
    }

    const events: ActivityEvent[] = [];

    // readings, oldest first so "what it moved from" is known
    const updates = allUpdates
      .filter((u) => itemById.has(u.work_item_id))
      .sort((a, b) => a.update_date.localeCompare(b.update_date) || a.created_at.localeCompare(b.created_at));

    const runningPct = new Map<string, number>();
    for (const update of updates) {
      const item = itemById.get(update.work_item_id)!;
      const previous = runningPct.get(item.id) ?? 0;
      runningPct.set(item.id, update.progress_pct);

      const kind = readingKind(previous, update.progress_pct);
      events.push({
        id: update.id,
        kind,
        date: update.update_date,
        at: `${update.update_date}T12:00:00.000Z`,
        title:
          kind === 'item_completed'
            ? `${item.name} completed`
            : kind === 'item_started'
              ? `${item.name} started`
              : `${item.name} — ${update.progress_pct}%`,
        detail: update.remarks,
        href: `/admin/site-progress/updates/${update.id}`,
        context: `${towerById.get(item.tower_id)?.name ?? 'Tower'} · ${item.name}`,
        actor: update.updated_by ? (userById.get(update.updated_by)?.name ?? null) : null,
        progress_pct: update.progress_pct,
        previous_pct: previous,
        photo_count: photoCount.get(update.id) ?? 0,
      });
    }

    for (const request of requests) {
      const item = request.work_item_id ? itemById.get(request.work_item_id) : undefined;
      const context = [
        request.tower_id ? (towerById.get(request.tower_id)?.name ?? null) : 'Whole site',
        item?.name,
      ]
        .filter(Boolean)
        .join(' · ');

      const lines = await db.material_request_items.where('request_id').equals(request.id).toArray();
      const headline = lines[0]?.item_name ?? request.code;

      events.push({
        id: `${request.id}-raised`,
        kind: 'request_raised',
        date: request.request_date,
        at: `${request.request_date}T09:00:00.000Z`,
        title: `Material requested — ${headline}${lines.length > 1 ? ` +${lines.length - 1}` : ''}`,
        detail: request.notes,
        href: `/admin/material-requests/${request.id}`,
        context,
        actor: request.requested_by ? (userById.get(request.requested_by)?.name ?? null) : null,
        status: request.code,
      });

      // every transition, not just the latest one
      for (const event of requestHistory.filter((h) => h.request_id === request.id)) {
        events.push({
          id: event.id,
          kind: 'request_decided',
          date: event.event_date,
          at: `${event.event_date}T10:00:00.000Z`,
          title: `${request.code} ${MATERIAL_REQUEST_STATUS_META[event.to_status].label.toLowerCase()}`,
          detail: event.note,
          href: `/admin/material-requests/${request.id}`,
          context,
          actor: event.decided_by ? (userById.get(event.decided_by)?.name ?? null) : null,
          status: MATERIAL_REQUEST_STATUS_META[event.to_status].label,
        });
      }
    }

    for (const event of statusEvents) {
      events.push({
        id: event.id,
        kind: 'project_status',
        date: event.event_date,
        at: `${event.event_date}T08:00:00.000Z`,
        title: `Project moved to ${event.to_status.replace(/_/g, ' ')}`,
        detail: event.remarks,
        href: `/admin/projects/${projectId}`,
        context: event.reference_no ? `Ref. ${event.reference_no}` : null,
        actor: event.performed_by ?? null,
      });
    }

    return events.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  }

  /** Every progress photo of a project, newest first (Sections 6.4 / 6.7). */
  async photos(projectId: string): Promise<
    Array<{ document: DocumentRecord; update?: SiteProgressUpdate; work_item?: TowerWorkItem; tower?: Tower }>
  > {
    const towers = await db.towers.where('project_id').equals(projectId).toArray();
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const towerIds = new Set(towers.map((t) => t.id));

    const [allItems, allUpdates, documents] = await Promise.all([
      db.tower_work_items.toArray(),
      db.site_progress_updates.toArray(),
      db.documents.toArray(),
    ]);

    const itemById = new Map(allItems.filter((i) => towerIds.has(i.tower_id)).map((i) => [i.id, i]));
    const updateById = new Map(
      allUpdates.filter((u) => itemById.has(u.work_item_id)).map((u) => [u.id, u]),
    );

    return documents
      .filter((d) => d.entity_type === 'site_progress_update' && updateById.has(d.entity_id))
      .map((document) => {
        const update = updateById.get(document.entity_id);
        const work_item = update ? itemById.get(update.work_item_id) : undefined;
        return {
          document,
          update,
          work_item,
          tower: work_item ? towerById.get(work_item.tower_id) : undefined,
        };
      })
      .sort((a, b) =>
        (b.update?.update_date ?? '').localeCompare(a.update?.update_date ?? ''),
      );
  }
}

/**
 * How much a project still needs somebody: a site gone quiet, then work in
 * progress, then work not begun, and finished projects last.
 */
function boardRank(row: ProjectProgressRow): number {
  if (row.is_stale) return 0;
  const pct = row.rollup.actual_pct;
  if (pct >= 100) return 3;
  if (pct > 0) return 1;
  return 2;
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

export const projectProgressRepository = new ProjectProgressRepository();
