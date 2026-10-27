'use client';

import { db } from '../../db/database';
import {
  isBdMobile,
  isEmail,
  isIntlPhone,
  localIsoDate,
  shortDate,
  type CallbackTime,
  type Utm,
  type VisitSlot,
} from '../../domain/public-enquiry';
import { isPubliclyVisible, publicUnitStatus } from '../../domain/public-portal';
import { nowIso } from '../../utils/id';
import { LAND_OFFER_PAPERS, LAND_OFFER_TYPES, LAND_SIZE_UNITS, type LandOfferPaper, type LandOfferType, type LandSizeUnit } from '../../db/types';
import { landOfferRepository } from '../land-offer.repository';
import { leadActivityRepository, leadRepository } from '../lead.repository';

/**
 * Public Portal — the one write the website makes (master plan §8, §10.2).
 *
 * The site names a project and unit by their public codes; this wrapper
 * resolves them behind the visibility rules and hands the inquiry to
 * `leadRepository.captureInquiry` with source `website_form`. It answers only
 * `{ ok }`: a repeat phone number merges into somebody's existing lead, and
 * that lead — name, status, salesperson — is never the visitor's to see.
 */

interface Common {
  name: string;
  phone: string;
  /** honeypot — a person never fills it; a bot that does is told "ok" and dropped */
  website?: string;
  /** where the form was sent from, path and query only */
  page_url?: string;
  utm?: Utm;
}

export type PublicInquiryInput =
  | (Common & {
      kind: 'enquiry';
      email?: string;
      message?: string;
      budget?: string;
      project_code?: string;
      unit_code?: string;
    })
  | (Common & { kind: 'visit'; project_code: string; date: string; slot: VisitSlot })
  | (Common & { kind: 'callback'; country: string; best_time: CallbackTime; timezone?: string; message?: string; project_code?: string });

export type PublicInquiryError = 'name' | 'phone' | 'email' | 'project' | 'date';
export type PublicInquiryResult = { ok: true } | { ok: false; field: PublicInquiryError };

const BEST_TIME: Record<CallbackTime, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  any: 'any time',
};

async function resolve(projectCode?: string, unitCode?: string) {
  if (!projectCode) return { project: undefined, unit: undefined };
  const project = await db.projects.where('code').equals(projectCode).first();
  if (!project || !isPubliclyVisible(project)) return { project: undefined, unit: undefined };
  if (!unitCode) return { project, unit: undefined };
  const towerIds = new Set((await db.towers.where('project_id').equals(project.id).toArray()).map((t) => t.id));
  const unit = (await db.units.toArray()).find(
    (u) => towerIds.has(u.tower_id) && u.code === unitCode && publicUnitStatus(u) !== null,
  );
  return { project, unit };
}

/** A landowner's offer from /landowners (W8). */
export interface PublicLandOfferInput {
  owner_name: string;
  phone: string;
  location: string;
  land_size?: string;
  land_size_unit?: LandSizeUnit;
  front_road_width_ft?: string;
  offer_type: LandOfferType;
  papers: LandOfferPaper[];
  message?: string;
  website?: string;
  page_url?: string;
}
export type PublicLandOfferError = 'name' | 'phone' | 'location' | 'size' | 'road';

const positive = (v?: string) => {
  const n = Number(v?.trim());
  return v?.trim() ? (Number.isFinite(n) && n > 0 ? n : NaN) : null;
};

export const publicInquiryRepository = {
  /**
   * Writes a `land_offers` row for the Lands inbox, never a land: the land
   * team decides what enters the pipeline. Answers `{ ok }` only.
   */
  async submitLandOffer(input: PublicLandOfferInput): Promise<{ ok: true } | { ok: false; field: PublicLandOfferError }> {
    if (input.website?.trim()) return { ok: true };
    const owner_name = input.owner_name.trim();
    if (owner_name.length < 2) return { ok: false, field: 'name' };
    if (!isBdMobile(input.phone) && !isIntlPhone(input.phone)) return { ok: false, field: 'phone' };
    const location = input.location.trim();
    if (location.length < 3) return { ok: false, field: 'location' };
    const size = positive(input.land_size);
    if (Number.isNaN(size)) return { ok: false, field: 'size' };
    const road = positive(input.front_road_width_ft);
    if (Number.isNaN(road)) return { ok: false, field: 'road' };

    await landOfferRepository.create({
      code: '',
      owner_name,
      phone: input.phone.trim(),
      location: location.slice(0, 300),
      land_size: size,
      land_size_unit: size !== null && LAND_SIZE_UNITS.includes(input.land_size_unit as LandSizeUnit) ? input.land_size_unit! : null,
      front_road_width_ft: road,
      offer_type: LAND_OFFER_TYPES.includes(input.offer_type) ? input.offer_type : 'either',
      papers: input.papers.filter((p) => LAND_OFFER_PAPERS.includes(p)),
      message: input.message?.trim().slice(0, 2000) || null,
      status: 'new',
      land_id: null,
      notes: null,
      page_url: input.page_url?.slice(0, 300) || null,
    });
    return { ok: true };
  },

  async submit(input: PublicInquiryInput): Promise<PublicInquiryResult> {
    if (input.website?.trim()) return { ok: true };

    const name = input.name.trim();
    if (name.length < 2) return { ok: false, field: 'name' };
    const phoneOk = input.kind === 'callback' ? isIntlPhone(input.phone) : isBdMobile(input.phone);
    if (!phoneOk) return { ok: false, field: 'phone' };
    const email = input.kind === 'enquiry' ? input.email?.trim() || null : null;
    if (email && !isEmail(email)) return { ok: false, field: 'email' };

    const { project, unit } = await resolve(input.project_code, input.kind === 'enquiry' ? input.unit_code : undefined);
    if (input.kind === 'visit') {
      if (!project) return { ok: false, field: 'project' };
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < localIsoDate(tomorrow)) return { ok: false, field: 'date' };
    }

    let message: string | null;
    let budget: string | null = null;
    if (input.kind === 'enquiry') {
      message = input.message?.trim() || null;
      budget = input.budget?.trim() || null;
    } else if (input.kind === 'visit') {
      message = `Site visit requested for ${shortDate(input.date)}, ${input.slot}.`;
    } else {
      message = [
        `Callback requested from ${input.country.trim() || 'abroad'}, best time ${BEST_TIME[input.best_time]} their time`,
        input.timezone ? ` (time zone ${input.timezone}).` : '.',
        input.message?.trim() ? ` ${input.message.trim()}` : '',
      ].join('');
    }

    const { lead } = await leadRepository.captureInquiry({
      name,
      phone: input.phone.trim(),
      email,
      source: 'website_form',
      inquiry_message: message,
      interested_project_id: project?.id ?? null,
      interested_unit_id: unit?.id ?? null,
      budget_range: budget,
      page_url: input.page_url?.slice(0, 300) || null,
      utm_source: input.utm?.utm_source ?? null,
      utm_medium: input.utm?.utm_medium ?? null,
      utm_campaign: input.utm?.utm_campaign ?? null,
    });

    // the visit and the callback each go on the desk's list for today: someone rings to confirm
    if (input.kind !== 'enquiry') {
      await leadActivityRepository.create(
        {
          lead_id: lead.id,
          activity_type: 'other',
          activity_date: nowIso(),
          next_follow_up_date: localIsoDate(new Date()),
          notes:
            input.kind === 'visit'
              ? `Site visit requested ${shortDate(input.date)}, ${input.slot} — ${project!.name} (${project!.code}). Call to confirm.`
              : `Callback requested — ${BEST_TIME[input.best_time]} their time${input.timezone ? `, ${input.timezone}` : ''}, from ${input.country.trim() || 'abroad'}.`,
        },
        null,
      );
    }
    return { ok: true };
  },
};
