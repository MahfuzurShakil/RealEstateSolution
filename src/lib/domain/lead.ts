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
 * `booked` is where Module 4 (Booking & Customer) takes over, so nothing moves
 * out of it here.
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
  return [...(next ? [next] : []), 'lost'];
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

/**
 * What each status change asks for before it is confirmed. Every move is
 * logged as a `status_change` activity, so the trail explains itself later.
 */
export interface LeadStepConfig {
  title: string;
  question: string;
  confirmLabel: string;
  tone: 'default' | 'danger' | 'success' | 'warning';
  /** prompts for the note that goes into the logged activity */
  notesPlaceholder: string;
  notesRequired?: boolean;
  /** whether the dialog offers a next follow-up date */
  asksFollowUp?: boolean;
}

export const LEAD_STEP_CONFIG: Record<LeadStatus, LeadStepConfig> = {
  new: {
    title: 'Move back to new',
    question: 'Put the lead back at the start of the pipeline.',
    confirmLabel: 'Move to new',
    tone: 'warning',
    notesPlaceholder: 'Why is this lead being reset?',
    asksFollowUp: true,
  },
  contacted: {
    title: 'Mark as contacted',
    question: 'Record that the buyer has been reached.',
    confirmLabel: 'Mark contacted',
    tone: 'default',
    notesPlaceholder: 'What did they say? Budget, preferred size, timeline…',
    asksFollowUp: true,
  },
  site_visit_scheduled: {
    title: 'Schedule a site visit',
    question: 'Record that a site visit has been fixed with the buyer.',
    confirmLabel: 'Schedule visit',
    tone: 'default',
    notesPlaceholder: 'Which project, which day, who is taking them…',
    asksFollowUp: true,
  },
  site_visit_done: {
    title: 'Confirm site visit',
    question: 'Record that the buyer has visited the site.',
    confirmLabel: 'Confirm visit',
    tone: 'default',
    notesPlaceholder: 'Which units were shown, what did they react to…',
    asksFollowUp: true,
  },
  negotiation: {
    title: 'Move to negotiation',
    question: 'Record that price and terms are being discussed.',
    confirmLabel: 'Start negotiation',
    tone: 'default',
    notesPlaceholder: 'Unit under discussion, price expectation, payment terms…',
    asksFollowUp: true,
  },
  booked: {
    title: 'Mark as booked',
    question:
      'The buyer has committed. Booking, payment schedule and the customer record are handled in the Booking module.',
    confirmLabel: 'Mark booked',
    tone: 'success',
    notesPlaceholder: 'Unit booked, agreed price, booking money taken…',
    notesRequired: true,
  },
  lost: {
    title: 'Mark as lost',
    question: 'The lead is dropping out. A reason is required — it is reported on later.',
    confirmLabel: 'Mark lost',
    tone: 'danger',
    notesPlaceholder: 'Why is this lead lost? (required)',
    notesRequired: true,
  },
};

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
