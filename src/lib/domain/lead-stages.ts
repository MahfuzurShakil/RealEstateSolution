import { BUDGET_RANGE_OPTIONS, type LeadActivityType, type LeadStatus } from '@/lib/db/types';

/**
 * How a lead moves on (client, 2026-10-22) — the same idea as the project
 * status (`project-stages.ts`): the button under a stage *completes* that
 * stage and asks what happened in it, and the lead then moves to the next
 * one. "Mark Site Visit Done" asks who came, what they saw and how they took
 * it; it does not just flip a label.
 *
 * Answers are stored on the stage's activity in the follow-up log
 * (`lead_activities.details`), and a field with `updates` also keeps the lead's
 * own record current (budget, project, unit). Negotiation has no form: it is
 * completed by booking a unit.
 */

export interface LeadStageField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'money' | 'project' | 'unit';
  options?: readonly string[];
  placeholder?: string;
  required?: boolean;
  /** dates: may this one be in the future? (a visit being booked, a follow-up) */
  future?: boolean;
  /** also written onto the lead itself */
  updates?: 'budget_range' | 'interested_project_id' | 'interested_unit_id';
  /** this date is also the next follow-up, so it lands on the task list */
  followUp?: boolean;
}

export interface LeadStage {
  /** the stage this completes into */
  to: LeadStatus;
  title: string;
  button: string;
  meaning: string;
  dateLabel: string;
  /** how the stage shows in the follow-up log */
  activity: LeadActivityType | ((answers: Record<string, string>) => LeadActivityType);
  fields: LeadStageField[];
  notesPlaceholder: string;
  /** asks "next follow-up" on top of the fields */
  asksFollowUp?: boolean;
  followUpRequired?: boolean;
}

const CONTACT_WAYS = ['Phone call', 'WhatsApp', 'Email', 'Office visit'] as const;

export const LEAD_STAGES: Partial<Record<LeadStatus, LeadStage>> = {
  new: {
    to: 'contacted',
    title: 'Contact Made',
    button: 'Mark Contacted',
    meaning: 'You have spoken to the buyer. Record what they are looking for.',
    dateLabel: 'Contacted on',
    activity: (a) =>
      a.how === 'WhatsApp' ? 'whatsapp' : a.how === 'Email' ? 'email' : a.how === 'Office visit' ? 'meeting' : 'call',
    fields: [
      { key: 'how', label: 'How', type: 'select', options: CONTACT_WAYS, required: true },
      { key: 'requirement', label: 'Looking for', type: 'text', placeholder: 'e.g. 3 bed, 1,400–1,600 sqft, south facing' },
      { key: 'budget', label: 'Budget', type: 'select', options: BUDGET_RANGE_OPTIONS, updates: 'budget_range' },
      { key: 'project', label: 'Interested project', type: 'project', updates: 'interested_project_id' },
    ],
    notesPlaceholder: 'What was discussed, family size, when they want to move…',
    asksFollowUp: true,
  },
  contacted: {
    to: 'site_visit_scheduled',
    title: 'Site Visit Scheduled',
    button: 'Schedule Site Visit',
    meaning: 'The buyer agreed to see the site. The visit date goes on the task list.',
    dateLabel: 'Agreed on',
    activity: 'call',
    fields: [
      { key: 'visit_date', label: 'Visit date', type: 'date', required: true, future: true, followUp: true },
      { key: 'project', label: 'Project to visit', type: 'project', required: true, updates: 'interested_project_id' },
      { key: 'shown_by', label: 'Who will show the site', type: 'text', placeholder: 'e.g. Arif + site engineer' },
    ],
    notesPlaceholder: 'Pick-up arranged, who is coming with them…',
  },
  site_visit_scheduled: {
    to: 'site_visit_done',
    title: 'Site Visit Done',
    button: 'Mark Site Visit Done',
    meaning: 'The buyer has seen the site. Record what they saw and how they took it.',
    dateLabel: 'Visited on',
    activity: 'site_visit',
    fields: [
      { key: 'project', label: 'Project visited', type: 'project', required: true, updates: 'interested_project_id' },
      { key: 'unit', label: 'Unit they liked', type: 'unit', updates: 'interested_unit_id' },
      { key: 'came_with', label: 'Came with', type: 'text', placeholder: 'e.g. wife and father' },
      {
        key: 'feedback',
        label: 'How they took it',
        type: 'select',
        options: ['Liked it', 'Thinking it over', 'Price concern', 'Location concern', 'Not interested'],
        required: true,
      },
    ],
    notesPlaceholder: 'Questions they asked, what they compared it with…',
    asksFollowUp: true,
    followUpRequired: true,
  },
  site_visit_done: {
    to: 'negotiation',
    title: 'Negotiation Started',
    button: 'Start Negotiation',
    meaning: 'Price and terms for one unit are being discussed.',
    dateLabel: 'Started on',
    activity: 'meeting',
    fields: [
      { key: 'project', label: 'Project', type: 'project', required: true, updates: 'interested_project_id' },
      { key: 'unit', label: 'Unit under discussion', type: 'unit', required: true, updates: 'interested_unit_id' },
      { key: 'our_price', label: 'Our price (BDT)', type: 'money' },
      { key: 'buyer_offer', label: "Buyer's offer (BDT)", type: 'money' },
      { key: 'payment', label: 'How they want to pay', type: 'select', options: ['Full payment', 'Kisti'] },
    ],
    notesPlaceholder: 'Discount asked, parking, handover expectations…',
    asksFollowUp: true,
    followUpRequired: true,
  },
};

export const LOST_REASONS = [
  'Price too high',
  'Bought elsewhere',
  'Location not suitable',
  'Not responding',
  'Plan postponed',
  'Other',
] as const;

/** The form that completes the lead's current stage, or null (negotiation is completed by a booking). */
export function leadStage(current: LeadStatus): LeadStage | null {
  return LEAD_STAGES[current] ?? null;
}
