'use client';

import { db } from '../db/database';
import type { BlogPost } from '../db/types';
import { todayLocal } from '../utils/format';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';

/** "Buying a flat in Uttara: 5 things to check" → "buying-a-flat-in-uttara-5-things-to-check" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export class DuplicateSlugError extends Error {
  constructor(slug: string) {
    super(`Another post already uses the address /blog/${slug}.`);
  }
}

/**
 * Blog posts (Public Portal v2.0 §2.3, W9). The slug is the post's public
 * address, so it is unique and checked here before Dexie's unique index would
 * throw a less helpful error.
 */
class BlogRepository extends BaseRepository<BlogPost> {
  constructor() {
    super(() => db.blog_posts);
  }

  /** Newest first: published by date, drafts by when they were last touched. */
  async list(): Promise<BlogPost[]> {
    const rows = await db.blog_posts.toArray();
    return rows.sort((a, b) => (b.published_at ?? b.updated_at).localeCompare(a.published_at ?? a.updated_at));
  }

  private async assertSlugFree(slug: string, exceptId?: string): Promise<void> {
    const other = await db.blog_posts.where('slug').equals(slug).first();
    if (other && other.id !== exceptId) throw new DuplicateSlugError(slug);
  }

  async create(input: NewRecord<BlogPost>, createdBy: string | null = null): Promise<BlogPost> {
    const slug = slugify(input.slug || input.title);
    await this.assertSlugFree(slug);
    return super.create(
      {
        ...input,
        slug,
        published_at: input.status === 'published' ? (input.published_at ?? todayLocal()) : (input.published_at ?? null),
      },
      createdBy,
    );
  }

  async update(id: string, changes: Partial<Omit<BlogPost, 'id' | 'created_at' | 'updated_at' | 'created_by'>>): Promise<BlogPost | undefined> {
    const next = { ...changes };
    if (next.slug !== undefined) {
      next.slug = slugify(next.slug);
      await this.assertSlugFree(next.slug, id);
    }
    return super.update(id, next);
  }

  /** Publishing stamps today's date the first time; unpublishing keeps it for the record. */
  async setStatus(id: string, status: BlogPost['status']): Promise<void> {
    const post = await this.getById(id);
    if (!post) return;
    await super.update(id, {
      status,
      published_at: status === 'published' ? (post.published_at ?? todayLocal()) : post.published_at,
    });
  }

  async removeCascade(id: string): Promise<void> {
    await documentRepository.removeForEntity('blog_post', id);
    await this.remove(id);
  }
}

export const blogRepository = new BlogRepository();
