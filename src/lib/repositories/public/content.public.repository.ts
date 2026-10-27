'use client';

import { db } from '../../db/database';
import type { AwardKind, FaqCategory } from '../../db/types';
import { isPubliclyVisible, whatsappLink } from '../../domain/public-portal';

/**
 * Public Portal P1 — the company as the website introduces it
 * (Public Portal v2.0 §2).
 *
 * `company_settings` also carries tax id and the workflow gate switches; only
 * the contact facts, logo, trade licence and the Website card (§2.2) cross over.
 */
export interface PublicCompanyInfo {
  company_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** `wa.me` link, null when no WhatsApp number is set */
  whatsapp_url: string | null;
  /** the number as typed — the site shows it anyway, and links with a message need it */
  whatsapp_number: string | null;
  /** brand logo (Settings → Company); null → the site draws a monogram tile */
  logo_url: string | null;
  /** shown in the footer as a trust line */
  trade_license_no: string | null;
  tagline: string | null;
  /** About page body, already split on blank lines */
  about_paragraphs: string[];
  office_hours: string | null;
  office_map_url: string | null;
  /** only the networks that are set, in a fixed order */
  social: { network: 'facebook' | 'youtube' | 'instagram' | 'linkedin'; url: string }[];
  established_year: number | null;
  rehab_member_no: string | null;
  /** false → every price on the site reads "Price on request" */
  show_prices: boolean;
}

const HTTP = /^https?:\/\//i;
/** Only web links reach an `href` — a typo'd "javascript:" in Settings never becomes a link. */
const webUrl = (value: string | null | undefined) => {
  const v = clean(value);
  return v && HTTP.test(v) ? v : null;
};

const clean = (value: string | null | undefined) => value?.trim() || null;

/** Whether the website shows prices (Website card switch); absent means yes. */
export async function publicShowsPrices(): Promise<boolean> {
  const settings = (await db.company_settings.limit(1).toArray())[0];
  return settings?.public_show_prices !== false;
}

/* W7 website content — built field by field, published rows only. */
export interface PublicTestimonial {
  id: string;
  buyer_name: string;
  buyer_detail: string | null;
  quote: string;
  rating: number | null;
  photo_url: string | null;
  /** only while that project is itself on the website */
  project: { name: string; code: string } | null;
}
export interface PublicTeamMember {
  id: string;
  name: string;
  title: string;
  bio: string | null;
  photo_url: string | null;
}
export interface PublicAward {
  id: string;
  kind: AwardKind;
  title: string;
  issuer: string | null;
  year: number | null;
}
export interface PublicFaq {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
}

const byOrder = (a: { sort_order: number; created_at: string }, b: { sort_order: number; created_at: string }) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

export const publicContentRepository = {
  async company(): Promise<PublicCompanyInfo> {
    const settings = (await db.company_settings.limit(1).toArray())[0];
    const whatsapp = clean(settings?.whatsapp_number);
    return {
      company_name: clean(settings?.company_name) ?? 'Our Company',
      address: clean(settings?.address),
      phone: clean(settings?.phone),
      email: clean(settings?.email),
      website: clean(settings?.website),
      whatsapp_url: whatsapp ? whatsappLink(whatsapp) : null,
      whatsapp_number: whatsapp,
      logo_url: clean(settings?.logo_url),
      trade_license_no: clean(settings?.trade_license_no),
      tagline: clean(settings?.website_tagline),
      about_paragraphs: (settings?.about_text ?? '')
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
      office_hours: clean(settings?.office_hours),
      office_map_url: webUrl(settings?.office_map_url),
      social: (
        [
          ['facebook', settings?.facebook_url],
          ['youtube', settings?.youtube_url],
          ['instagram', settings?.instagram_url],
          ['linkedin', settings?.linkedin_url],
        ] as const
      ).flatMap(([network, url]) => (webUrl(url) ? [{ network, url: webUrl(url)! }] : [])),
      established_year: settings?.established_year ?? null,
      rehab_member_no: clean(settings?.rehab_member_no),
      show_prices: settings?.public_show_prices !== false,
    };
  },

  async testimonials(): Promise<PublicTestimonial[]> {
    const rows = (await db.testimonials.toArray()).filter((r) => r.is_published && r.quote.trim()).sort(byOrder);
    const projects = new Map((await db.projects.toArray()).filter(isPubliclyVisible).map((p) => [p.id, p]));
    return rows.map((r) => {
      const p = r.project_id ? projects.get(r.project_id) : undefined;
      return {
        id: r.id,
        buyer_name: r.buyer_name,
        buyer_detail: clean(r.buyer_detail),
        quote: r.quote.trim(),
        rating: r.rating && r.rating >= 1 && r.rating <= 5 ? Math.round(r.rating) : null,
        photo_url: webUrl(r.photo_url),
        project: p ? { name: p.name, code: p.code } : null,
      };
    });
  },

  async team(): Promise<PublicTeamMember[]> {
    return (await db.team_members.toArray())
      .filter((r) => r.is_published)
      .sort(byOrder)
      .map((r) => ({ id: r.id, name: r.name, title: r.title, bio: clean(r.bio), photo_url: webUrl(r.photo_url) }));
  },

  async awards(): Promise<PublicAward[]> {
    return (await db.awards.toArray())
      .filter((r) => r.is_published)
      .sort(byOrder)
      .map((r) => ({ id: r.id, kind: r.kind, title: r.title, issuer: clean(r.issuer), year: r.year ?? null }));
  },

  /** Published FAQ items; empty means the site falls back to its built-in questions. */
  async faqs(category?: FaqCategory): Promise<PublicFaq[]> {
    return (await db.faq_items.toArray())
      .filter((r) => r.is_published && (!category || r.category === category))
      .sort(byOrder)
      .map((r) => ({ id: r.id, category: r.category, question: r.question, answer: r.answer }));
  },
};
