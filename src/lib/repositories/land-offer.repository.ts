'use client';

import { db } from '../db/database';
import type { LandOffer, LandOfferStatus } from '../db/types';
import { nextCode } from '../utils/id';
import { BaseRepository, type NewRecord } from './base.repository';

/**
 * Land offers (W8): the inbox under Lands. Offers arrive from the public
 * website through `publicInquiryRepository.submitLandOffer`; the land team
 * works them here and either declines one or adds it as a land.
 */
class LandOfferRepository extends BaseRepository<LandOffer> {
  constructor() {
    super(() => db.land_offers);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.land_offers.toArray()).map((o) => o.code);
    return nextCode('LOF', codes);
  }

  async create(input: NewRecord<LandOffer>, createdBy: string | null = null): Promise<LandOffer> {
    const code = input.code?.trim() ? input.code : await this.generateCode();
    return super.create({ ...input, code }, createdBy);
  }

  /** Newest first; `open` = new + contacted, the ones still waiting on the team. */
  async list(status: LandOfferStatus | 'open' | 'all' = 'open'): Promise<LandOffer[]> {
    const rows = await db.land_offers.toArray();
    return rows
      .filter((o) => status === 'all' || (status === 'open' ? o.status === 'new' || o.status === 'contacted' : o.status === status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async countNew(): Promise<number> {
    return db.land_offers.where('status').equals('new').count();
  }

  async setStatus(id: string, status: Exclude<LandOfferStatus, 'converted'>, notes?: string): Promise<void> {
    const changes: Partial<LandOffer> = { status };
    if (notes !== undefined) changes.notes = notes.trim() || null;
    await this.update(id, changes);
  }

  /** Called once the land is saved from this offer. */
  async markConverted(id: string, landId: string): Promise<void> {
    await this.update(id, { status: 'converted', land_id: landId });
  }

  /** The offer a land was added from, for the link back on the land page. */
  async forLand(landId: string): Promise<LandOffer | undefined> {
    return (await db.land_offers.toArray()).find((o) => o.land_id === landId);
  }
}

export const landOfferRepository = new LandOfferRepository();
