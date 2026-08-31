'use client';

import { db } from '../db/database';
import type {
  AcquisitionType,
  Land,
  LandJvDetails,
  LandOwnerMapping,
  LandStatus,
  LandStatusEvent,
  Landowner,
} from '../db/types';
import { nextCode } from '../utils/id';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';

export interface LandFilters {
  search?: string;
  status?: LandStatus | 'all';
  acquisition_type?: AcquisitionType | 'all';
  district?: string;
}

/** A land plus everything hanging off it — used by the detail page. */
export interface LandWithRelations extends Land {
  owners: Array<LandOwnerMapping & { owner: Landowner | undefined }>;
  jv: LandJvDetails | undefined;
}

class LandRepository extends BaseRepository<Land> {
  constructor() {
    super(() => db.lands);
  }

  /** Next LND-YYYY-NNN code. */
  async generateCode(): Promise<string> {
    const codes = (await db.lands.toArray()).map((l) => l.code);
    return nextCode('LND', codes);
  }

  async create(input: NewRecord<Land>, createdBy: string | null = null): Promise<Land> {
    const code = input.code?.trim() ? input.code : await this.generateCode();
    return super.create({ ...input, code }, createdBy);
  }

  async list(filters: LandFilters = {}): Promise<Land[]> {
    const { search, status, acquisition_type, district } = filters;
    let rows = await db.lands.toArray();

    if (status && status !== 'all') rows = rows.filter((l) => l.status === status);
    if (acquisition_type && acquisition_type !== 'all') {
      rows = rows.filter((l) => l.acquisition_type === acquisition_type);
    }
    if (district) rows = rows.filter((l) => l.location_district === district);
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((l) =>
        [l.code, l.name, l.location_area, l.location_district, l.mouza, l.dag_number]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getWithRelations(id: string): Promise<LandWithRelations | undefined> {
    const land = await this.getById(id);
    if (!land) return undefined;

    const mappings = await db.land_owner_mapping.where('land_id').equals(id).toArray();
    const owners = await Promise.all(
      mappings.map(async (m) => ({ ...m, owner: await db.landowners.get(m.owner_id) })),
    );
    const jv = await db.land_jv_details.where('land_id').equals(id).first();
    return { ...land, owners, jv };
  }

  /**
   * Moves the land to a new status AND logs the confirmation details the user
   * supplied. The two always happen together, so callers cannot record one
   * without the other.
   */
  async setStatus(
    id: string,
    status: LandStatus,
    event: Omit<
      NewRecord<LandStatusEvent>,
      'land_id' | 'from_status' | 'to_status'
    >,
  ): Promise<Land | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    await landStatusEventRepository.create({
      ...event,
      land_id: id,
      from_status: current.status,
      to_status: status,
    });
    return this.update(id, { status });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await db.lands.toArray();
    return rows.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  /** Removes the land together with its mappings, JV row and documents. */
  async removeCascade(id: string): Promise<void> {
    const mappings = await db.land_owner_mapping.where('land_id').equals(id).toArray();
    await db.land_owner_mapping.bulkDelete(mappings.map((m) => m.id));
    const jv = await db.land_jv_details.where('land_id').equals(id).first();
    if (jv) await db.land_jv_details.delete(jv.id);
    const history = await db.land_status_history.where('land_id').equals(id).toArray();
    await db.land_status_history.bulkDelete(history.map((h) => h.id));
    await documentRepository.removeForEntity('land', id);
    await this.remove(id);
  }
}

class LandownerRepository extends BaseRepository<Landowner> {
  constructor() {
    super(() => db.landowners);
  }

  async search(query: string): Promise<Landowner[]> {
    const rows = await db.landowners.toArray();
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((o) =>
      [o.name, o.phone, o.nid].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
    );
  }

  /** Lands this owner is attached to (an owner is reusable across lands). */
  async landsFor(ownerId: string): Promise<Land[]> {
    const mappings = await db.land_owner_mapping.where('owner_id').equals(ownerId).toArray();
    const lands = await Promise.all(mappings.map((m) => db.lands.get(m.land_id)));
    return lands.filter((l): l is Land => Boolean(l));
  }
}

class LandOwnerMappingRepository extends BaseRepository<LandOwnerMapping> {
  constructor() {
    super(() => db.land_owner_mapping);
  }

  async listForLand(landId: string): Promise<LandOwnerMapping[]> {
    return db.land_owner_mapping.where('land_id').equals(landId).toArray();
  }

  /** Sum of ownership_share_pct — a full land should total 100. */
  async totalSharePct(landId: string): Promise<number> {
    const rows = await this.listForLand(landId);
    return rows.reduce((sum, r) => sum + (Number(r.ownership_share_pct) || 0), 0);
  }
}

class LandJvRepository extends BaseRepository<LandJvDetails> {
  constructor() {
    super(() => db.land_jv_details);
  }

  async getForLand(landId: string): Promise<LandJvDetails | undefined> {
    return db.land_jv_details.where('land_id').equals(landId).first();
  }

  /** One JV row per land — creates it or updates the existing one. */
  async upsertForLand(
    landId: string,
    values: Omit<NewRecord<LandJvDetails>, 'land_id'>,
  ): Promise<LandJvDetails | undefined> {
    const existing = await this.getForLand(landId);
    if (existing) return this.update(existing.id, values);
    return this.create({ ...values, land_id: landId } as NewRecord<LandJvDetails>);
  }
}

/** Pipeline log for a land (Section 2.2 steps + the details captured with them). */
class LandStatusEventRepository extends BaseRepository<LandStatusEvent> {
  constructor() {
    super(() => db.land_status_history);
  }

  /** Oldest first — this is a timeline. */
  async listForLand(landId: string): Promise<LandStatusEvent[]> {
    const rows = await db.land_status_history.where('land_id').equals(landId).toArray();
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async latestForStatus(landId: string, status: LandStatus): Promise<LandStatusEvent | undefined> {
    const rows = await this.listForLand(landId);
    return rows.filter((r) => r.to_status === status).at(-1);
  }
}

export const landStatusEventRepository = new LandStatusEventRepository();
export const landRepository = new LandRepository();
export const landownerRepository = new LandownerRepository();
export const landOwnerMappingRepository = new LandOwnerMappingRepository();
export const landJvRepository = new LandJvRepository();
