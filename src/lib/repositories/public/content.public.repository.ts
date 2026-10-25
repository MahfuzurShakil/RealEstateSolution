'use client';

import { db } from '../../db/database';
import { whatsappLink } from '../../domain/public-portal';

/**
 * Public Portal P1 — the company as the website introduces it
 * (Public Portal v2.0 §2).
 *
 * `company_settings` also carries trade licence, tax id and the workflow gate
 * switches; only the contact facts below cross over. The website text fields
 * of §2.2 join this shape in batch PB6, when Settings gets its Website card.
 */
export interface PublicCompanyInfo {
  company_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** `wa.me` link, null when no WhatsApp number is set */
  whatsapp_url: string | null;
}

const clean = (value: string | null | undefined) => value?.trim() || null;

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
    };
  },
};
