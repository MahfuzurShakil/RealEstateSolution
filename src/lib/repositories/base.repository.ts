'use client';

import type { EntityTable } from 'dexie';
import type { BaseEntity } from '../db/types';
import { newId, nowIso } from '../utils/id';

/**
 * Generic data-access base (Section 0 — "Architecture rule").
 *
 * UI components never call Dexie directly; they call a repository. When Phase B
 * swaps IndexedDB for Postgres + REST/tRPC, only this layer is rewritten.
 */
export type NewRecord<T extends BaseEntity> = Omit<T, keyof BaseEntity> &
  Partial<Pick<BaseEntity, 'id' | 'created_by'>>;

export type UpdateRecord<T extends BaseEntity> = Partial<Omit<T, keyof BaseEntity>>;

export class BaseRepository<T extends BaseEntity> {
  constructor(protected readonly table: () => EntityTable<T, 'id'>) {}

  async getAll(): Promise<T[]> {
    return this.table().toArray();
  }

  async getById(id: string): Promise<T | undefined> {
    return this.table().get(id as never);
  }

  async count(): Promise<number> {
    return this.table().count();
  }

  async create(input: NewRecord<T>, createdBy: string | null = null): Promise<T> {
    const ts = nowIso();
    const record = {
      ...input,
      id: input.id ?? newId(),
      created_at: ts,
      updated_at: ts,
      created_by: input.created_by ?? createdBy,
    } as unknown as T;
    await this.table().add(record);
    return record;
  }

  async update(id: string, changes: UpdateRecord<T>): Promise<T | undefined> {
    await this.table().update(id as never, { ...changes, updated_at: nowIso() } as never);
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.table().delete(id as never);
  }

  async bulkCreate(inputs: NewRecord<T>[], createdBy: string | null = null): Promise<T[]> {
    const created: T[] = [];
    for (const input of inputs) created.push(await this.create(input, createdBy));
    return created;
  }
}
