import type { ForSaleBy, ProjectSalesStatus, ProjectStatus, ProjectType, UnitStatus } from '../db/types';
import type { ProjectShape } from './project';
import { projectSalesStatus } from './project';

/* ------------------------------------------------------------------ *
 * Public Portal presentation rules (Public Portal v2.0 §3)
 *
 * Pure mappings from admin vocabulary to what a buyer reads. Kept apart from
 * the repositories so the listing, the detail page and (later) the inquiry
 * popup all say the same word for the same state.
 * ------------------------------------------------------------------ */

/**
 * v2.0 §3.1 — the gate for the whole portal.
 *
 * The admin Sales card already refuses to publish a project whose sales have
 * not opened, but rows written before that rule (or imported later) can carry
 * `is_public` on their own, so the public side checks both halves itself.
 */
export function isPubliclyVisible(project: {
  is_public: boolean;
  sales_status?: ProjectSalesStatus | null;
}): boolean {
  return project.is_public === true && projectSalesStatus(project) !== 'not_open';
}

export type PublicSalesBadge = 'on_sale' | 'paused' | 'sold_out';

export const PUBLIC_SALES_BADGE_LABEL: Record<PublicSalesBadge, string> = {
  on_sale: 'On Sale',
  paused: 'Bookings Paused',
  sold_out: 'Sold Out',
};

/** v2.0 §3.2 — only called on a visible project, so `not_open` cannot reach it. */
export function publicSalesBadge(sales: ProjectSalesStatus): PublicSalesBadge {
  if (sales === 'sold_out') return 'sold_out';
  if (sales === 'paused') return 'paused';
  return 'on_sale';
}

/**
 * What each type means to a buyer. `PROJECT_TYPE_HINT` is written for the
 * person filling in the admin form ("nothing is built"), not for someone
 * deciding what to buy.
 */
export const PUBLIC_TYPE_BLURB: Record<ProjectType, string> = {
  apartment: 'Ready-to-live flats in well-planned buildings.',
  commercial: 'Shops and office space in busy locations.',
  mixed: 'Shops below, homes above — one address for both.',
  plot_development: 'Serviced plots with roads and utilities, ready for your own house.',
  land_share: 'Own a registered share of a plot, at a fraction of the whole price.',
};

export type PublicStage ='upcoming' | 'ongoing' | 'ready' | 'completed';

export const PUBLIC_STAGE_LABEL: Record<PublicStage, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  ready: 'Ready',
  completed: 'Completed',
};

/**
 * v2.0 §3.3 — the build stage in three words a buyer understands.
 *
 * A share project is never built, so it is "ongoing" while its register is
 * open and "completed" from Sold Out on. A plot has no finishing phase, so
 * possession reads as Ready like a flat's handover does.
 */
export function publicStage(status: ProjectStatus, shape: ProjectShape): PublicStage {
  if (status === 'closed') return 'completed';
  if (shape.item === 'share') return status === 'planning' ? 'ongoing' : 'completed';
  if (status === 'planning' || status === 'design' || status === 'approval') return 'upcoming';
  if (status === 'handover_ongoing') return 'ready';
  return 'ongoing';
}

export type PublicUnitStatus = 'available' | 'booked' | 'sold';

export const PUBLIC_UNIT_STATUS_LABEL: Record<PublicUnitStatus, string> = {
  available: 'Available',
  booked: 'Booked',
  sold: 'Sold',
};

/**
 * v2.0 §3.6. `null` means the unit is not shown at all (`draft` — generated
 * with details still missing). An owner-direct unit always reads Sold: the
 * building stays whole on screen without saying who is selling that flat.
 */
export function publicUnitStatus(unit: { status: UnitStatus; for_sale_by: ForSaleBy }): PublicUnitStatus | null {
  if (unit.status === 'draft') return null;
  if (unit.for_sale_by === 'owner_direct') return 'sold';
  if (unit.status === 'available') return 'available';
  if (unit.status === 'sold' || unit.status === 'handed_over') return 'sold';
  return 'booked';
}

/**
 * v2.0 §3.4 — the listing's price filter, in the same bands as the lead
 * form's `BUDGET_RANGE_OPTIONS`, so a buyer who picks "50 Lakh – 1 Crore" here
 * reads the same words a salesperson sees on their lead. Lower bound
 * inclusive, upper bound exclusive.
 */
export const PUBLIC_PRICE_BANDS = [
  { key: 'under_50l', label: 'Under 50 Lakh', min: 0, max: 5_000_000 },
  { key: '50l_1cr', label: '50 Lakh – 1 Crore', min: 5_000_000, max: 10_000_000 },
  { key: '1_1_5cr', label: '1 – 1.5 Crore', min: 10_000_000, max: 15_000_000 },
  { key: '1_5_2cr', label: '1.5 – 2 Crore', min: 15_000_000, max: 20_000_000 },
  { key: '2_3cr', label: '2 – 3 Crore', min: 20_000_000, max: 30_000_000 },
  { key: 'above_3cr', label: 'Above 3 Crore', min: 30_000_000, max: Infinity },
] as const;
export type PublicPriceBand = (typeof PUBLIC_PRICE_BANDS)[number]['key'];

export function priceInBand(price: number, band: PublicPriceBand): boolean {
  const b = PUBLIC_PRICE_BANDS.find((x) => x.key === band);
  return !!b && price >= b.min && price < b.max;
}

/** "৳ 1.25 Cr" / "৳ 85 Lakh" — how Bangladeshi buyers read a property price. */
export function formatPublicPrice(amount: number): string {
  if (amount >= 10_000_000) return `৳ ${trim(amount / 10_000_000)} Cr`;
  if (amount >= 100_000) return `৳ ${trim(amount / 100_000)} Lakh`;
  return `৳ ${amount.toLocaleString('en-IN')}`;
}

function trim(n: number): string {
  return String(Number(n.toFixed(2)));
}

/** A Google Maps link from coordinates; no API key, no embed. */
export function mapLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** `wa.me` wants digits only, with the country code. A local 01… number gets 880. */
export function whatsappLink(number: string, message?: string): string | null {
  let digits = number.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) digits = `88${digits}`;
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}
