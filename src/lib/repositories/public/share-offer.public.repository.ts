'use client';

import { db } from '../../db/database';
import type { DocumentRecord, Project, ShareOffering, ShareRequest } from '../../db/types';
import type { InvestorProject, ShareRound } from '../../domain/investor-portal';
import { PROJECT_TYPE_LABEL } from '../../domain/project';
import { offeringAvailability, offeringState } from '../../domain/share-sale';
import { newId, nextCode, nowIso } from '../../utils/id';
import { todayLocal } from '../../utils/format';
import { normalizePhone } from '../lead.repository';
import { coverFor } from './project.public.repository';

/*
 * Share Sale on the website (BUYER-PORTAL-PLAN.md §6): open share offerings
 * on /invest, and a "request to buy" a visitor can send without an account.
 *
 * Shown only while Settings → Website "Show share offerings" is on — it is off
 * by default, because a public offer of shares may need regulatory sign-off.
 * Every field is picked one by one: never the valuation's make-up (NAV,
 * premium), who bought, the owner's retained part or anything internal.
 */

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=70';
const imageUrls = new Map<string, string>();

function imageOf(project: Project, docs: DocumentRecord[]): string {
  const cover = coverFor(project, docs);
  if (!cover) return FALLBACK_IMAGE;
  if (cover.kind === 'url') return cover.url;
  if (!imageUrls.has(cover.id)) imageUrls.set(cover.id, URL.createObjectURL(cover.blob));
  return imageUrls.get(cover.id)!;
}

export interface PublicShareOffer {
  round: ShareRound;
  project: InvestorProject;
}

async function switchedOn(): Promise<boolean> {
  return (await db.company_settings.limit(1).toArray())[0]?.public_show_share_sale === true;
}

function toPublicRound(o: ShareOffering, projectCode: string, available: number, today: string): ShareRound {
  return {
    code: o.code,
    project_code: projectCode,
    round_no: o.round_no,
    // the valuation behind the price stays with the office
    valuation: 0,
    offered_pct: o.offered_pct,
    total_shares: o.total_shares,
    share_pct: o.share_pct,
    price_per_share: o.price_per_share,
    shares_available: available,
    opens_on: o.opens_on ?? today,
    closes_on: o.closes_on ?? today,
    is_open: true,
    min_shares: o.min_shares,
    max_shares: o.max_shares,
    down_payment_pct: o.min_down_payment_pct,
    max_installments: o.max_installments,
    frequency: o.installment_frequency,
    late_fee_pct: o.late_fee_pct,
    grace_days: o.grace_days,
  };
}

function toPublicProject(p: Project, image: string): InvestorProject {
  const type = PROJECT_TYPE_LABEL[p.project_type];
  return {
    code: p.code,
    name: p.name,
    category: type,
    location: p.location_summary?.trim() || '—',
    image,
    summary: `${type} project in ${p.location_summary?.trim() || 'Bangladesh'}.`,
    valuation: 0,
    valuation_date: '',
    construction_progress_pct: 0,
  };
}

/** The open offerings a visitor can ask to buy into; empty while the switch is off. */
async function openOffers(today = todayLocal()): Promise<PublicShareOffer[]> {
  if (!(await switchedOn())) return [];
  const offerings = (await db.share_offerings.toArray()).filter((o) => offeringState(o, today) === 'open');
  if (!offerings.length) return [];
  const [sales, projects, docs] = await Promise.all([
    db.share_sales.where('offering_id').anyOf(offerings.map((o) => o.id)).toArray(),
    db.projects.bulkGet(offerings.map((o) => o.project_id)),
    db.documents.where('entity_type').equals('project').toArray(),
  ]);
  return offerings.flatMap((o, i) => {
    const p = projects[i];
    const available = offeringAvailability(o, sales).available;
    if (!p || available <= 0) return [];
    return [
      {
        round: toPublicRound(o, p.code, available, today),
        project: toPublicProject(p, imageOf(p, docs.filter((d) => d.entity_id === p.id))),
      },
    ];
  });
}

export interface VisitorShareRequest {
  round_code: string;
  shares: number;
  installments: number;
  note: string;
  name: string;
  phone: string;
  email: string;
}

/**
 * A visitor asks to buy shares. Nothing is reserved and no account is made:
 * the office sees it under Share Sale → Customer Requests marked "Website",
 * calls, and reserving it makes the customer.
 */
async function requestShares(input: VisitorShareRequest): Promise<{ code: string }> {
  if (!(await switchedOn())) throw new Error('Share offerings are not open on the website right now.');
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  if (!name) throw new Error('Please enter your name.');
  if (!/^01\d{9}$/.test(phone)) throw new Error('Please enter an 11-digit mobile number, like 01711 223344.');
  const email = input.email.trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('That email address does not look right.');
  const today = todayLocal();
  const o = await db.share_offerings.where('code').equals(input.round_code).first();
  if (!o || offeringState(o, today) !== 'open') throw new Error('This offering is no longer open.');
  const sales = await db.share_sales.where('offering_id').equals(o.id).toArray();
  const most = Math.min(o.max_shares, offeringAvailability(o, sales).available);
  const shares = Math.floor(Number(input.shares) || 0);
  if (shares < o.min_shares || shares > most) throw new Error(`Choose ${o.min_shares} to ${most} shares.`);
  const installments = Math.max(0, Math.min(o.max_installments, Math.floor(Number(input.installments) || 0)));

  const ts = nowIso();
  // the same number asking again about the same offering updates the open request
  const open = (await db.share_requests.where('offering_id').equals(o.id).toArray()).find(
    (r) => r.source === 'website' && r.prospect_phone === phone && (r.status === 'new' || r.status === 'contacted'),
  );
  if (open) {
    await db.share_requests.update(open.id, { shares, installments, note: input.note.trim() || null, prospect_name: name, prospect_email: email || null, requested_at: ts, updated_at: ts });
    return { code: open.code };
  }
  const row: ShareRequest = {
    id: newId(),
    code: nextCode('SRQ', (await db.share_requests.toArray()).map((r) => r.code)),
    offering_id: o.id,
    project_id: o.project_id,
    customer_id: null,
    source: 'website',
    prospect_name: name,
    prospect_phone: phone,
    prospect_email: email || null,
    shares,
    installments,
    note: input.note.trim() || null,
    requested_at: ts,
    status: 'new',
    sale_id: null,
    office_note: null,
    created_at: ts,
    updated_at: ts,
    created_by: null,
  };
  await db.share_requests.add(row);
  return { code: row.code };
}

/** The open offering of one project, for the strip on its website page (BUYER-PORTAL-PLAN.md §10, F1). */
async function offerForProject(projectCode: string): Promise<PublicShareOffer | null> {
  return (await openOffers()).find((o) => o.project.code === projectCode) ?? null;
}

export const publicShareOfferRepository = { openOffers, offerForProject, requestShares };
