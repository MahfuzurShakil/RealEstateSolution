import type { BadgeTone } from '@/components/ui/Badge';
import type { AcquisitionType, LandStatus } from '@/lib/db/types';

/**
 * Module 1 status pipeline (Scope v3.md, Section 2.2):
 *
 *   new → site_visit_done → legal_verification → negotiation → decision
 *         → acquired | jv_signed | rejected
 *         → linked_to_project
 *
 * `linked_to_project` is NOT chosen by hand — Module 2 sets it when the land is
 * mapped to a project, so it is excluded from the manual transition list.
 */
export const LAND_STATUS_META: Record<LandStatus, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'neutral' },
  site_visit_done: { label: 'Site Visit Done', tone: 'blue' },
  legal_verification: { label: 'Legal Verification', tone: 'blue' },
  negotiation: { label: 'Negotiation', tone: 'amber' },
  decision: { label: 'Decision', tone: 'amber' },
  acquired: { label: 'Acquired', tone: 'green' },
  jv_signed: { label: 'JV Signed', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  linked_to_project: { label: 'Linked to Project', tone: 'teal' },
};

/** Statuses a user may move to from `current`, given the acquisition type. */
export function allowedNextStatuses(
  current: LandStatus,
  acquisitionType: AcquisitionType,
): LandStatus[] {
  const outcome: LandStatus = acquisitionType === 'joint_venture' ? 'jv_signed' : 'acquired';

  const map: Record<LandStatus, LandStatus[]> = {
    new: ['site_visit_done', 'rejected'],
    site_visit_done: ['legal_verification', 'rejected'],
    legal_verification: ['negotiation', 'rejected'],
    negotiation: ['decision', 'rejected'],
    decision: [outcome, 'rejected'],
    acquired: [],
    jv_signed: [],
    // a rejected land can be reopened at the start of the pipeline
    rejected: ['new'],
    linked_to_project: [],
  };
  return map[current];
}

/** Pipeline order used by the detail-page progress trail. */
export const LAND_PIPELINE_STEPS: LandStatus[] = [
  'new',
  'site_visit_done',
  'legal_verification',
  'negotiation',
  'decision',
];

export const ACQUISITION_TYPE_LABEL: Record<AcquisitionType, string> = {
  direct_purchase: 'Direct Purchase',
  joint_venture: 'Joint Venture',
};

export const LAND_SIZE_UNIT_LABEL: Record<string, string> = {
  katha: 'Katha',
  bigha: 'Bigha',
  decimal: 'Decimal',
};

/** A land is "closed" once acquired/JV-signed/rejected or handed to a project. */
export function isTerminalStatus(status: LandStatus): boolean {
  return ['acquired', 'jv_signed', 'rejected', 'linked_to_project'].includes(status);
}

/**
 * What each pipeline step asks for before it is confirmed (feedback #6).
 * A wrong click should never move a land forward silently, and the details
 * captured here become the audit trail shown on the Timeline tab.
 */
export interface StatusStepField {
  key: 'event_date' | 'performed_by' | 'amount' | 'reference_no' | 'remarks';
  label: string;
  placeholder: string;
  type: 'date' | 'text' | 'number' | 'textarea';
  required?: boolean;
}

export interface StatusStepConfig {
  /** dialog copy */
  title: string;
  question: string;
  confirmLabel: string;
  tone: 'default' | 'danger' | 'success' | 'warning';
  fields: StatusStepField[];
}

const REMARKS = (required = false, placeholder = 'Anything worth remembering about this step'): StatusStepField => ({
  key: 'remarks',
  label: required ? 'Remarks (required)' : 'Remarks',
  placeholder,
  type: 'textarea',
  required,
});

export const STATUS_STEP_CONFIG: Record<LandStatus, StatusStepConfig> = {
  new: {
    title: 'Reopen this land',
    question: 'Move the land back to the start of the pipeline?',
    confirmLabel: 'Reopen',
    tone: 'warning',
    fields: [
      { key: 'event_date', label: 'Reopened on', placeholder: '', type: 'date', required: true },
      REMARKS(true, 'Why is this land being reconsidered?'),
    ],
  },
  site_visit_done: {
    title: 'Confirm site visit',
    question: 'Record that the site visit has been completed.',
    confirmLabel: 'Confirm visit',
    tone: 'default',
    fields: [
      { key: 'event_date', label: 'Visited on', placeholder: '', type: 'date', required: true },
      { key: 'performed_by', label: 'Visited by', placeholder: 'e.g. Kamal Hossain (Land Team)', type: 'text' },
      REMARKS(false, 'Road access, soil condition, boundary issues…'),
    ],
  },
  legal_verification: {
    title: 'Confirm legal verification',
    question: 'Record that the documents have been legally verified.',
    confirmLabel: 'Confirm verification',
    tone: 'default',
    fields: [
      { key: 'event_date', label: 'Verified on', placeholder: '', type: 'date', required: true },
      { key: 'performed_by', label: 'Verified by', placeholder: 'e.g. Adv. Nusrat Jahan', type: 'text' },
      { key: 'reference_no', label: 'Case / file reference', placeholder: 'e.g. LV-2026-014', type: 'text' },
      REMARKS(false, 'Title chain findings, encumbrance, pending mutation…'),
    ],
  },
  negotiation: {
    title: 'Move to negotiation',
    question: 'Record that price negotiation has started.',
    confirmLabel: 'Start negotiation',
    tone: 'default',
    fields: [
      { key: 'event_date', label: 'Negotiation started on', placeholder: '', type: 'date', required: true },
      { key: 'amount', label: 'Offered amount (BDT)', placeholder: 'e.g. 42000000', type: 'number' },
      { key: 'performed_by', label: 'Negotiated by', placeholder: 'e.g. Rifat Ahmed', type: 'text' },
      REMARKS(false, 'Owner expectation, payment terms discussed…'),
    ],
  },
  decision: {
    title: 'Move to decision',
    question: 'Record that the land is now awaiting a final decision.',
    confirmLabel: 'Move to decision',
    tone: 'default',
    fields: [
      { key: 'event_date', label: 'Decision meeting on', placeholder: '', type: 'date', required: true },
      { key: 'amount', label: 'Amount on the table (BDT)', placeholder: 'e.g. 40000000', type: 'number' },
      REMARKS(false, 'Board notes, conditions attached…'),
    ],
  },
  acquired: {
    title: 'Mark as acquired',
    question: 'Confirm the land has been purchased. This closes the pipeline.',
    confirmLabel: 'Mark acquired',
    tone: 'success',
    fields: [
      { key: 'event_date', label: 'Registration date', placeholder: '', type: 'date', required: true },
      { key: 'amount', label: 'Final agreed amount (BDT)', placeholder: 'e.g. 40000000', type: 'number', required: true },
      { key: 'reference_no', label: 'Deed / dolil number', placeholder: 'e.g. 4521/2026', type: 'text' },
      REMARKS(false, 'Registration office, handover notes…'),
    ],
  },
  jv_signed: {
    title: 'Mark JV as signed',
    question: 'Confirm the joint venture agreement has been signed.',
    confirmLabel: 'Mark JV signed',
    tone: 'success',
    fields: [
      { key: 'event_date', label: 'Agreement date', placeholder: '', type: 'date', required: true },
      { key: 'reference_no', label: 'Agreement reference', placeholder: 'e.g. JV-2026-003', type: 'text' },
      REMARKS(false, 'Signing venue, witnesses, conditions…'),
    ],
  },
  rejected: {
    title: 'Reject this land',
    question: 'The land will be dropped from the pipeline. A reason is required.',
    confirmLabel: 'Reject land',
    tone: 'danger',
    fields: [
      { key: 'event_date', label: 'Rejected on', placeholder: '', type: 'date', required: true },
      { key: 'performed_by', label: 'Decided by', placeholder: 'e.g. Management committee', type: 'text' },
      REMARKS(true, 'Why is this land being rejected? (required)'),
    ],
  },
  linked_to_project: {
    title: 'Linked to project',
    question: 'This status is set automatically when the land is mapped to a project.',
    confirmLabel: 'Confirm',
    tone: 'default',
    fields: [{ key: 'event_date', label: 'Linked on', placeholder: '', type: 'date', required: true }],
  },
};

/** Amount captured at the outcome step feeds `final_agreed_amount` on the land. */
export function amountUpdatesFinalAgreed(status: LandStatus): boolean {
  return status === 'acquired';
}
