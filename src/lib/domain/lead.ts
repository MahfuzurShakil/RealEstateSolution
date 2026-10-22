import type { BadgeTone } from '@/components/ui/Badge';
import type { LeadActivityType, LeadSource, LeadStatus, UserRole } from '@/lib/db/types';

/**
 * Module 3 status pipeline (Scope v3.md, Section 4.2):
 *
 *   new → contacted → site_visit_scheduled → site_visit_done
 *       → negotiation → booked
 *
 *   [any stage] → lost
 *   lost → revived back to an earlier active status, history intact
 *
 * `booked` is never set by hand (client, 2026-10-22): it follows a real
 * booking. "Book a unit" on the lead opens the booking form, saving it makes
 * the customer from the lead and moves the lead to `booked`; cancelling the
 * last live booking puts the lead back in `negotiation`. So a booked lead
 * always has a customer and a booking behind it.
 */
export const LEAD_STATUS_META: Record<LeadStatus, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'neutral' },
  contacted: { label: 'Contacted', tone: 'blue' },
  site_visit_scheduled: { label: 'Site Visit Scheduled', tone: 'blue' },
  site_visit_done: { label: 'Site Visit Done', tone: 'amber' },
  negotiation: { label: 'Negotiation', tone: 'amber' },
  booked: { label: 'Booked', tone: 'green' },
  lost: { label: 'Lost', tone: 'red' },
};

/** The active pipeline, in order — `lost` sits outside it. */
export const LEAD_PIPELINE_STEPS: LeadStatus[] = [
  'new',
  'contacted',
  'site_visit_scheduled',
  'site_visit_done',
  'negotiation',
  'booked',
];

/**
 * Statuses reachable from `current`. Any active stage can go forward one step
 * or be marked lost; a lost lead is revived into any earlier active status
 * (Section 4.6 — "যেখান থেকে যুক্তিসঙ্গত"), not forced back to `new`.
 */
export function allowedNextLeadStatuses(current: LeadStatus): LeadStatus[] {
  if (current === 'booked') return [];
  if (current === 'lost') {
    return ['contacted', 'site_visit_scheduled', 'site_visit_done', 'negotiation'];
  }
  const next = LEAD_PIPELINE_STEPS[LEAD_PIPELINE_STEPS.indexOf(current) + 1];
  // `booked` comes from saving a booking, never from a status button
  return [...(next && next !== 'booked' ? [next] : []), 'lost'];
}

export function isLeadClosed(status: LeadStatus): boolean {
  return status === 'booked' || status === 'lost';
}

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  website_form: 'Website Form',
  whatsapp: 'WhatsApp',
  facebook_ad: 'Facebook Ad',
  walk_in: 'Walk-in',
  referral: 'Referral',
  phone_call: 'Phone Call',
  other: 'Other',
};

export const LEAD_ACTIVITY_META: Record<LeadActivityType, { label: string; tone: BadgeTone }> = {
  call: { label: 'Call', tone: 'blue' },
  whatsapp: { label: 'WhatsApp', tone: 'green' },
  email: { label: 'Email', tone: 'neutral' },
  site_visit: { label: 'Site Visit', tone: 'teal' },
  meeting: { label: 'Meeting', tone: 'amber' },
  status_change: { label: 'Status Change', tone: 'teal' },
  other: { label: 'Other', tone: 'neutral' },
};

/** Activity types a user can log by hand — `status_change` is written by code. */
export const MANUAL_ACTIVITY_TYPES: LeadActivityType[] = [
  'call',
  'whatsapp',
  'email',
  'site_visit',
  'meeting',
  'other',
];

/** Roles that carry leads. Assignment is manual (Section 4.7). */
export const SALES_ROLES: UserRole[] = ['sales_executive', 'sales_manager', 'head_of_sales'];

/* ------------------------------------------------------------------ *
 * Follow-up helpers — the sales team's daily task list (Section 4.4)
 * ------------------------------------------------------------------ */

export type FollowUpState = 'overdue' | 'today' | 'upcoming' | 'none';

export function followUpState(date: string | null | undefined, today: string): FollowUpState {
  if (!date) return 'none';
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  return 'upcoming';
}

export const FOLLOW_UP_META: Record<Exclude<FollowUpState, 'none'>, { label: string; tone: BadgeTone }> = {
  overdue: { label: 'Overdue', tone: 'red' },
  today: { label: 'Due today', tone: 'amber' },
  upcoming: { label: 'Upcoming', tone: 'blue' },
};
