'use client';

import { db } from '../db/database';
import type { DocumentRecord, EntityType } from '../db/types';
import { BaseRepository } from './base.repository';

class DocumentRepository extends BaseRepository<DocumentRecord> {
  constructor() {
    super(() => db.documents);
  }

  /** All documents attached to one record (its detail-page "Documents" tab). */
  async listForEntity(entityType: EntityType, entityId: string): Promise<DocumentRecord[]> {
    return db.documents.where('[entity_type+entity_id]').equals([entityType, entityId]).toArray();
  }

  async listPublicForEntity(entityType: EntityType, entityId: string): Promise<DocumentRecord[]> {
    const all = await this.listForEntity(entityType, entityId);
    return all.filter((d) => d.is_public);
  }

  async removeForEntity(entityType: EntityType, entityId: string): Promise<void> {
    const docs = await this.listForEntity(entityType, entityId);
    await db.documents.bulkDelete(docs.map((d) => d.id));
  }
}

export const documentRepository = new DocumentRepository();
