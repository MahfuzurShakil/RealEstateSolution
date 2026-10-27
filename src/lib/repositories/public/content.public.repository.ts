'use client';

import { db } from '../../db/database';
import { whatsappLink } from '../../domain/public-portal';

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
};
