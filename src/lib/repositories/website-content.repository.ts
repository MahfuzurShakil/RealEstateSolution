'use client';

import { db } from '../db/database';
import type { Award, FaqItem, TeamMember, Testimonial } from '../db/types';
import { BaseRepository, type NewRecord } from './base.repository';

/**
 * Website content (W7): testimonials, team, awards and FAQ. Four small lists
 * with the same shape of work — ordered by `sort_order`, published or not,
 * moved up and down — so one class serves all four.
 */
type Ordered = Testimonial | TeamMember | Award | FaqItem;

class OrderedContentRepository<T extends Ordered> extends BaseRepository<T> {
  /** Every row, in display order (oldest first on a tie). */
  async listOrdered(): Promise<T[]> {
    const rows = await this.table().toArray();
    return rows.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  }

  /** New rows go to the end of the list. */
  async add(input: Omit<NewRecord<T>, 'sort_order'>, createdBy: string | null = null): Promise<T> {
    const rows = await this.table().toArray();
    const last = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    return this.create({ ...input, sort_order: last + 1 } as NewRecord<T>, createdBy);
  }

  /** Swaps a row with its neighbour; the order is renumbered 1…n so gaps never build up. */
  async move(id: string, direction: -1 | 1): Promise<void> {
    const rows = await this.listOrdered();
    const i = rows.findIndex((r) => r.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    await Promise.all(rows.map((r, n) => (r.sort_order === n + 1 ? null : this.update(r.id, { sort_order: n + 1 } as never))));
  }
}

export const testimonialRepository = new OrderedContentRepository<Testimonial>(() => db.testimonials);
export const teamMemberRepository = new OrderedContentRepository<TeamMember>(() => db.team_members);
export const awardRepository = new OrderedContentRepository<Award>(() => db.awards);
export const faqItemRepository = new OrderedContentRepository<FaqItem>(() => db.faq_items);
