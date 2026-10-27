'use client';

import { db } from '../../db/database';
import type { BlogPost, DocumentRecord } from '../../db/types';
import { todayLocal } from '../../utils/format';
import { isPicture, pictureOf, type PublicImage } from './project.public.repository';

/**
 * Public Portal — the blog (v2.0 §2.3, W9). Only published posts dated today
 * or earlier; the author crosses over as a name and nothing else about the
 * user. Pictures follow the site-wide rule: a document reaches the website
 * only with its "Show on website" tick.
 */
export interface PublicPostCard {
  slug: string;
  title: string;
  excerpt: string;
  published_at: string;
  cover: PublicImage | null;
  author: string | null;
  reading_minutes: number;
}

export interface PublicPost extends PublicPostCard {
  paragraphs: string[];
  /** extra pictures (content_image), shown after the text */
  images: PublicImage[];
}

const live = (p: BlogPost, today: string) => p.status === 'published' && !!p.published_at && p.published_at <= today;

function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));
}

async function load(posts: BlogPost[]) {
  const ids = new Set(posts.map((p) => p.id));
  const docs = (await db.documents.where('entity_type').equals('blog_post').toArray()).filter(
    (d) => ids.has(d.entity_id) && d.is_public && isPicture(d),
  );
  const authorIds = [...new Set(posts.map((p) => p.author_id).filter((x): x is string => !!x))];
  const users = new Map((await db.users.bulkGet(authorIds)).filter((u) => !!u).map((u) => [u!.id, u!.name]));
  const docsFor = (id: string) => docs.filter((d) => d.entity_id === id);
  return { docsFor, author: (p: BlogPost) => (p.author_id ? (users.get(p.author_id) ?? null) : null) };
}

function toCard(p: BlogPost, docs: DocumentRecord[], author: string | null): PublicPostCard {
  const cover = docs.find((d) => d.document_type === 'cover_image');
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    published_at: p.published_at!,
    cover: cover ? pictureOf(cover, p.title) : null,
    author,
    reading_minutes: readingMinutes(p.content),
  };
}

export const publicBlogRepository = {
  /** Newest first. */
  async list(limit?: number): Promise<PublicPostCard[]> {
    const today = todayLocal();
    const posts = (await db.blog_posts.toArray())
      .filter((p) => live(p, today))
      .sort((a, b) => b.published_at!.localeCompare(a.published_at!) || b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
    const { docsFor, author } = await load(posts);
    return posts.map((p) => toCard(p, docsFor(p.id), author(p)));
  },

  /** One post by its slug, or null when it is not (or not yet) published. */
  async detail(slug: string): Promise<PublicPost | null> {
    const post = await db.blog_posts.where('slug').equals(slug).first();
    if (!post || !live(post, todayLocal())) return null;
    const { docsFor, author } = await load([post]);
    const docs = docsFor(post.id);
    return {
      ...toCard(post, docs, author(post)),
      paragraphs: post.content
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
      images: docs.filter((d) => d.document_type === 'content_image').map((d, i) => pictureOf(d, `${post.title} — picture ${i + 1}`)),
    };
  },
};
