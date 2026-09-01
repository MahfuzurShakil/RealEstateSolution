'use client';

import { db } from '../db/database';
import type {
  AllocationType,
  Land,
  LandJvDetails,
  LandProjectMapping,
  Landowner,
  Project,
  ProjectStatus,
  ProjectStatusEvent,
  ProjectType,
  Tower,
  Unit,
  UnitStatus,
} from '../db/types';
import {
  floorsInRange,
  jvAllocationSummary,
  priceFor,
  unitCode,
  type AllocationTotals,
  type JvAllocationSummary,
  type UnitPatternInput,
} from '../domain/project';
import { nextCode } from '../utils/id';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';
import { installmentPlanTemplateRepository } from './payment.repository';
import { materialRequestRepository, towerWorkItemRepository } from './site-progress.repository';

export interface ProjectFilters {
  search?: string;
  status?: ProjectStatus | 'all';
  project_type?: ProjectType | 'all';
  is_public?: boolean;
}

/** A project plus the lands, towers and unit roll-up the detail page needs. */
export interface ProjectWithRelations extends Project {
  lands: Land[];
  towers: Tower[];
  unit_counts: Record<UnitStatus, number>;
  unit_total: number;
}

/** Per-land JV terms attached to a project, for the allocation card. */
export interface ProjectJvLand {
  land: Land;
  jv: LandJvDetails;
}

export interface ProjectAllocation {
  totals: { developer: AllocationTotals; landowner: AllocationTotals };
  /** per landowner, for the "who got which flats" breakdown */
  by_owner: Array<{ owner: Landowner | undefined; owner_id: string } & AllocationTotals>;
  /** unallocated to any owner but marked landowner_share — a data gap worth showing */
  unassigned: AllocationTotals;
  jv_lands: ProjectJvLand[];
  /** only computed when exactly one JV land is mapped (see domain/project.ts) */
  summary: JvAllocationSummary | null;
}

const EMPTY_TOTALS = (): AllocationTotals => ({ flat_count: 0, total_sqft: 0 });

class ProjectRepository extends BaseRepository<Project> {
  constructor() {
    super(() => db.projects);
  }

  /** Next PRJ-YYYY-NNN code. */
  async generateCode(): Promise<string> {
    const codes = (await db.projects.toArray()).map((p) => p.code);
    return nextCode('PRJ', codes);
  }

  async create(input: NewRecord<Project>, createdBy: string | null = null): Promise<Project> {
    const code = input.code?.trim() ? input.code : await this.generateCode();
    const project = await super.create({ ...input, code }, createdBy);
    // every project starts on the system default payment plan (Section 8.2)
    await installmentPlanTemplateRepository.seedForProject(project.id, createdBy);
    return project;
  }

  async list(filters: ProjectFilters = {}): Promise<Project[]> {
    const { search, status, project_type, is_public } = filters;
    let rows = await db.projects.toArray();

    if (status && status !== 'all') rows = rows.filter((p) => p.status === status);
    if (project_type && project_type !== 'all') {
      rows = rows.filter((p) => p.project_type === project_type);
    }
    if (is_public !== undefined) rows = rows.filter((p) => p.is_public === is_public);
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((p) =>
        [p.code, p.name, p.location_summary, p.architect]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /*
   * `null`, not `undefined`, when the record is gone. `useLiveQuery` reports
   * its own pending state as `undefined`, so a repository returning
   * `undefined` for "no such row" leaves the detail page unable to tell a
   * deleted record from a query still in flight — it sat on "Loading…"
   * forever instead of saying the record no longer exists.
   */
  async getWithRelations(id: string): Promise<ProjectWithRelations | null> {
    const project = await this.getById(id);
    if (!project) return null;

    const lands = await landProjectMappingRepository.landsForProject(id);
    const towers = await towerRepository.listForProject(id);
    const units = await unitRepository.listForProject(id);

    const unit_counts = units.reduce(
      (acc, u) => {
        acc[u.status] = (acc[u.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<UnitStatus, number>,
    );

    return { ...project, lands, towers, unit_counts, unit_total: units.length };
  }

  /**
   * Moves the project AND logs the confirmation details together, so a status
   * can never change without leaving a trail (addendum, same as Module 1).
   * Moving to `under_construction` also stamps `actual_start_date` — that is
   * what the field is for, and asking twice for one date is noise.
   */
  async setStatus(
    id: string,
    status: ProjectStatus,
    event: Omit<NewRecord<ProjectStatusEvent>, 'project_id' | 'from_status' | 'to_status'>,
    createdBy: string | null = null,
  ): Promise<Project | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    await projectStatusEventRepository.create(
      {
        ...event,
        project_id: id,
        from_status: current.status,
        to_status: status,
      },
      createdBy,
    );

    return this.update(id, {
      status,
      ...(status === 'under_construction' ? { actual_start_date: event.event_date } : {}),
    });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await db.projects.toArray();
    return rows.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Target-vs-actual JV allocation for a project (see domain/project.ts).
   * Reads the units actually created and the JV terms of the mapped lands.
   */
  async allocation(projectId: string): Promise<ProjectAllocation> {
    const units = await unitRepository.listForProject(projectId);
    const lands = await landProjectMappingRepository.landsForProject(projectId);

    const totals = { developer: EMPTY_TOTALS(), landowner: EMPTY_TOTALS() };
    const perOwner = new Map<string, AllocationTotals>();
    const unassigned = EMPTY_TOTALS();

    for (const unit of units) {
      const bucket = unit.allocation_type === 'landowner_share' ? totals.landowner : totals.developer;
      bucket.flat_count += 1;
      bucket.total_sqft += Number(unit.size_sqft) || 0;

      if (unit.allocation_type !== 'landowner_share') continue;
      if (!unit.allocated_to_owner_id) {
        unassigned.flat_count += 1;
        unassigned.total_sqft += Number(unit.size_sqft) || 0;
        continue;
      }
      const entry = perOwner.get(unit.allocated_to_owner_id) ?? EMPTY_TOTALS();
      entry.flat_count += 1;
      entry.total_sqft += Number(unit.size_sqft) || 0;
      perOwner.set(unit.allocated_to_owner_id, entry);
    }

    const by_owner = await Promise.all(
      [...perOwner.entries()].map(async ([owner_id, t]) => ({
        owner_id,
        owner: await db.landowners.get(owner_id),
        ...t,
      })),
    );

    const jv_lands: ProjectJvLand[] = [];
    for (const land of lands) {
      if (land.acquisition_type !== 'joint_venture') continue;
      const jv = await db.land_jv_details.where('land_id').equals(land.id).first();
      if (jv) jv_lands.push({ land, jv });
    }

    // One JV land → a single agreed split the whole building can be checked
    // against. Several → the shares cannot be combined, so no automatic check.
    const summary = jv_lands.length === 1 ? jvAllocationSummary(totals, jv_lands[0].jv) : null;

    return { totals, by_owner: by_owner.sort((a, b) => b.flat_count - a.flat_count), unassigned, jv_lands, summary };
  }

  /** Removes the project with its land links, towers, units and documents. */
  async removeCascade(id: string): Promise<void> {
    const history = await db.project_status_history.where('project_id').equals(id).toArray();
    await db.project_status_history.bulkDelete(history.map((h) => h.id));

    const towers = await towerRepository.listForProject(id);
    for (const tower of towers) await towerRepository.removeCascade(tower.id);

    // clearing the land set also hands the lands back their acquired /
    // JV-signed status, which raw deletion of the mappings would not
    await landProjectMappingRepository.setLandsForProject(id, []);

    // material requests are raised against the project, not the tower, so the
    // tower cascade above does not reach them
    for (const request of await materialRequestRepository.list({ project_id: id })) {
      await materialRequestRepository.removeCascade(request.id);
    }

    await installmentPlanTemplateRepository.removeForProject(id);
    await documentRepository.removeForEntity('project', id);
    await this.remove(id);
  }
}

class LandProjectMappingRepository extends BaseRepository<LandProjectMapping> {
  constructor() {
    super(() => db.land_project_mapping);
  }

  async listForProject(projectId: string): Promise<LandProjectMapping[]> {
    return db.land_project_mapping.where('project_id').equals(projectId).toArray();
  }

  async landsForProject(projectId: string): Promise<Land[]> {
    const mappings = await this.listForProject(projectId);
    const lands = await Promise.all(mappings.map((m) => db.lands.get(m.land_id)));
    return lands.filter((l): l is Land => Boolean(l));
  }

  async projectsForLand(landId: string): Promise<Project[]> {
    const mappings = await db.land_project_mapping.where('land_id').equals(landId).toArray();
    const projects = await Promise.all(mappings.map((m) => db.projects.get(m.project_id)));
    return projects.filter((p): p is Project => Boolean(p));
  }

  /**
   * Rewrites the land set for a project. A land handed to a project moves to
   * `linked_to_project` (Module 1 leaves that transition to Module 2); a land
   * removed from its last project falls back to how it was acquired.
   */
  async setLandsForProject(projectId: string, landIds: string[]): Promise<void> {
    const existing = await this.listForProject(projectId);
    const previousIds = existing.map((m) => m.land_id);

    await db.land_project_mapping.bulkDelete(existing.map((m) => m.id));
    for (const land_id of landIds) await this.create({ land_id, project_id: projectId });

    for (const land_id of new Set([...previousIds, ...landIds])) {
      const land = await db.lands.get(land_id);
      if (!land) continue;

      const stillLinked = (await this.projectsForLand(land_id)).length > 0;
      if (stillLinked && land.status !== 'linked_to_project') {
        await db.lands.update(land_id, {
          status: 'linked_to_project',
          updated_at: new Date().toISOString(),
        });
      } else if (!stillLinked && land.status === 'linked_to_project') {
        await db.lands.update(land_id, {
          status: land.acquisition_type === 'joint_venture' ? 'jv_signed' : 'acquired',
          updated_at: new Date().toISOString(),
        });
      }
    }
  }
}

class TowerRepository extends BaseRepository<Tower> {
  constructor() {
    super(() => db.towers);
  }

  async listForProject(projectId: string): Promise<Tower[]> {
    const rows = await db.towers.where('project_id').equals(projectId).toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  /**
   * A new tower opens with the default WBS of Section 6.2, so Site Progress
   * has something to report against without anyone setting it up by hand.
   */
  async create(input: NewRecord<Tower>, createdBy: string | null = null): Promise<Tower> {
    const tower = await super.create({ current_progress_pct: 0, ...input }, createdBy);
    await towerWorkItemRepository.seedDefaultsForTower(tower.id, createdBy);
    return tower;
  }

  /** Deleting a tower takes its units and its WBS (with the site log) with it. */
  async removeCascade(id: string): Promise<void> {
    const units = await db.units.where('tower_id').equals(id).toArray();
    await db.units.bulkDelete(units.map((u) => u.id));
    await towerWorkItemRepository.removeForTower(id);
    await this.remove(id);
  }
}

export interface UnitFilters {
  tower_id?: string;
  status?: UnitStatus | 'all';
  allocation_type?: AllocationType | 'all';
  floor?: number | null;
  search?: string;
}

export interface BulkGenerateResult {
  created: Unit[];
  /** codes already in use, left untouched so a second run is safe */
  skipped: string[];
}

class UnitRepository extends BaseRepository<Unit> {
  constructor() {
    super(() => db.units);
  }

  async listForTower(towerId: string): Promise<Unit[]> {
    const rows = await db.units.where('tower_id').equals(towerId).toArray();
    return sortUnits(rows);
  }

  async listForProject(projectId: string, filters: UnitFilters = {}): Promise<Unit[]> {
    const towers = await towerRepository.listForProject(projectId);
    const towerIds = new Set(towers.map((t) => t.id));
    let rows = (await db.units.toArray()).filter((u) => towerIds.has(u.tower_id));

    if (filters.tower_id) rows = rows.filter((u) => u.tower_id === filters.tower_id);
    if (filters.status && filters.status !== 'all') rows = rows.filter((u) => u.status === filters.status);
    if (filters.allocation_type && filters.allocation_type !== 'all') {
      rows = rows.filter((u) => u.allocation_type === filters.allocation_type);
    }
    if (filters.floor !== null && filters.floor !== undefined) {
      rows = rows.filter((u) => u.floor === filters.floor);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((u) =>
        [u.code, u.unit_type, u.facing].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
      );
    }
    return sortUnits(rows);
  }

  /**
   * Bulk generation from one floor pattern (Section 3.6 + the 2026-09-01
   * decision). Codes that already exist are skipped rather than failing the
   * run, so a second pass for a penthouse floor range is safe.
   */
  async bulkGenerate(
    towerId: string,
    input: UnitPatternInput,
    createdBy: string | null = null,
  ): Promise<BulkGenerateResult> {
    const existing = new Set((await db.units.toArray()).map((u) => u.code));
    const floors = floorsInRange(input);

    const created: Unit[] = [];
    const skipped: string[] = [];

    for (const floor of floors) {
      for (const row of input.rows) {
        const code = unitCode(input.prefix, input.separator, floor, row.suffix);
        if (existing.has(code)) {
          skipped.push(code);
          continue;
        }
        existing.add(code);
        created.push(
          await this.create(
            {
              code,
              tower_id: towerId,
              floor,
              unit_type: row.unit_type,
              bedroom_count: numOrNull(row.bedroom_count),
              bathroom_count: numOrNull(row.bathroom_count),
              balcony_count: numOrNull(row.balcony_count),
              size_sqft: Number(row.size_sqft) || 0,
              facing: row.facing.trim() || null,
              base_price: priceFor(row),
              parking_allocated: Number(row.parking_allocated) || 0,
              status: 'available',
              allocation_type: 'developer_share',
              allocated_to_owner_id: null,
              for_sale_by: 'company',
            },
            createdBy,
          ),
        );
      }
    }

    return { created, skipped };
  }

  /**
   * Bulk allocation — the second half of the decision: select units, mark them
   * landowner share and pick the owner. This is what feeds the JV check.
   */
  async bulkAllocate(
    unitIds: string[],
    allocation: {
      allocation_type: AllocationType;
      allocated_to_owner_id: string | null;
      for_sale_by: Unit['for_sale_by'];
    },
  ): Promise<void> {
    for (const id of unitIds) {
      await this.update(id, {
        allocation_type: allocation.allocation_type,
        // a developer-share flat can never belong to a landowner
        allocated_to_owner_id:
          allocation.allocation_type === 'landowner_share' ? allocation.allocated_to_owner_id : null,
        for_sale_by: allocation.for_sale_by,
      });
    }
  }

  async bulkSetStatus(unitIds: string[], status: UnitStatus): Promise<void> {
    for (const id of unitIds) await this.update(id, { status });
  }

  async bulkRemove(unitIds: string[]): Promise<void> {
    await db.units.bulkDelete(unitIds);
  }

  async isCodeTaken(code: string, exceptId?: string): Promise<boolean> {
    const existing = await db.units.where('code').equals(code).first();
    return Boolean(existing && existing.id !== exceptId);
  }
}

function numOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

/** Floor first, then code — the order a price list is read in. */
function sortUnits(rows: Unit[]): Unit[] {
  return rows.sort(
    (a, b) => a.floor - b.floor || a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
}

/** Pipeline log for a project (Section 3.2 steps + the details captured). */
class ProjectStatusEventRepository extends BaseRepository<ProjectStatusEvent> {
  constructor() {
    super(() => db.project_status_history);
  }

  /** Oldest first — this is a timeline. */
  async listForProject(projectId: string): Promise<ProjectStatusEvent[]> {
    const rows = await db.project_status_history.where('project_id').equals(projectId).toArray();
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
}

export const projectStatusEventRepository = new ProjectStatusEventRepository();
export const projectRepository = new ProjectRepository();
export const landProjectMappingRepository = new LandProjectMappingRepository();
export const towerRepository = new TowerRepository();
export const unitRepository = new UnitRepository();
