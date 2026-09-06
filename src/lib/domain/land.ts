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
/** Keys that land on the `land_status_history` row for this step. */
export type StatusEventFieldKey =
  | 'event_date'
  | 'performed_by'
  | 'amount'
  | 'reference_no'
  | 'remarks';

/**
 * Keys that are JV terms rather than event details — they are written to
 * `land_jv_details`, not to the status event, so the share is recorded at the
 * moment it is agreed rather than typed into the Edit Land form afterwards.
 */
export type JvTermsFieldKey =
  | 'developer_share_pct'
  | 'landowner_share_pct'
  | 'jv_share_basis';

export type StatusStepFieldKey = StatusEventFieldKey | JvTermsFieldKey;

export const JV_TERMS_FIELD_KEYS: JvTermsFieldKey[] = [
  'developer_share_pct',
  'landowner_share_pct',
  'jv_share_basis',
];

export function isJvTermsField(key: StatusStepFieldKey): key is JvTermsFieldKey {
  return (JV_TERMS_FIELD_KEYS as string[]).includes(key);
}

export interface StatusStepField {
  key: StatusStepFieldKey;
  label: string;
  placeholder: string;
  type: 'date' | 'text' | 'number' | 'textarea' | 'select';
  required?: boolean;
  /** `select` only */
  options?: { value: string; label: string }[];
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

const BASE_STATUS_STEP_CONFIG: Record<LandStatus, StatusStepConfig> = {
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

/**
 * What the middle of the pipeline asks for on a *joint venture*.
 *
 * The steps are the same five — a JV plot is still visited, verified,
 * negotiated and decided — so the pipeline is not forked. What differs is what
 * is being settled at each one, and the form asked the purchase question of
 * both: "Offered amount (BDT)" at negotiation and "Amount on the table" at
 * decision are the price of land, and in a JV there is no price. What is
 * negotiated is the *share split*, and what money there is is the signing
 * money — the advance paid to the owner against the agreement.
 *
 * The share itself lands in `land_jv_details` rather than on the status event,
 * because a share is a term of the deal and not a thing that happened on a
 * date. Capturing it here is the point: it was reachable only through the Edit
 * Land form, which is a strange place to record the outcome of the meeting the
 * pipeline is asking you to confirm.
 */
const SHARE_FIELDS: StatusStepField[] = [
  {
    key: 'developer_share_pct',
    label: 'Developer share %',
    placeholder: 'e.g. 55',
    type: 'number',
    required: true,
  },
  {
    key: 'landowner_share_pct',
    label: 'Landowner share %',
    placeholder: 'e.g. 45',
    type: 'number',
    required: true,
  },
  {
    key: 'jv_share_basis',
    label: 'Share of what',
    placeholder: '',
    type: 'select',
    required: true,
    options: [
      { value: 'flat_count', label: 'Number of flats' },
      { value: 'total_sqft', label: 'Total saleable sqft' },
    ],
  },
];

const JV_STATUS_STEP_CONFIG: Partial<Record<LandStatus, StatusStepConfig>> = {
  negotiation: {
    title: 'Move to negotiation',
    question: 'Record that the joint venture terms are being negotiated.',
    confirmLabel: 'Start negotiation',
    tone: 'default',
    fields: [
      { key: 'event_date', label: 'Negotiation started on', placeholder: '', type: 'date', required: true },
      ...SHARE_FIELDS.map((f) => ({ ...f, required: false })),
      {
        key: 'amount',
        label: 'Signing money discussed (BDT)',
        placeholder: 'e.g. 5000000',
        type: 'number',
      },
      { key: 'performed_by', label: 'Negotiated by', placeholder: 'e.g. Rifat Ahmed', type: 'text' },
      REMARKS(false, 'Owner expectation, rent during construction, extra demands…'),
    ],
  },
  decision: {
    title: 'Move to decision',
    question: 'Record that the joint venture is awaiting a final decision.',
    confirmLabel: 'Move to decision',
    tone: 'default',
    fields: [
      { key: 'event_date', label: 'Decision meeting on', placeholder: '', type: 'date', required: true },
      ...SHARE_FIELDS.map((f) => ({ ...f, required: false })),
      {
        key: 'amount',
        label: 'Signing money on the table (BDT)',
        placeholder: 'e.g. 5000000',
        type: 'number',
      },
      REMARKS(false, 'Board notes, conditions attached…'),
    ],
  },
  jv_signed: {
    title: 'Mark JV as signed',
    question: 'Confirm the joint venture agreement has been signed.',
    confirmLabel: 'Mark JV signed',
    tone: 'success',
    fields: [
      { key: 'event_date', label: 'Agreement date', placeholder: '', type: 'date', required: true },
      ...SHARE_FIELDS,
      {
        key: 'amount',
        // this is the whole cash side of a JV, and it is what the payment plan
        // is built from — a JV with no figure here can have no schedule at all
        label: 'Cash payable to the landowner (BDT)',
        placeholder: 'Signing money and any other cash agreed — 0 if none',
        type: 'number',
      },
      { key: 'reference_no', label: 'Agreement reference', placeholder: 'e.g. JV-2026-003', type: 'text' },
      REMARKS(false, 'Signing venue, witnesses, rent during construction…'),
    ],
  },
};

/**
 * What a step asks for, given what kind of acquisition this is.
 *
 * Same pipeline, different questions — see the note on `JV_STATUS_STEP_CONFIG`.
 */
export function statusStepConfig(
  status: LandStatus,
  acquisitionType: AcquisitionType,
): StatusStepConfig {
  if (acquisitionType === 'joint_venture') {
    return JV_STATUS_STEP_CONFIG[status] ?? BASE_STATUS_STEP_CONFIG[status];
  }
  return BASE_STATUS_STEP_CONFIG[status];
}

/**
 * The amount captured at the outcome step is the land's final agreed amount.
 *
 * `jv_signed` counts too, and did not before. `final_agreed_amount` is what the
 * payment schedule is generated from, so a JV plot could never have one — even
 * though a JV routinely carries real money to the owner: signing money, and
 * often rent for the duration of construction. Leaving it null did not mean
 * "no money", it meant the money could not be planned or chased.
 */
export function amountUpdatesFinalAgreed(status: LandStatus): boolean {
  return status === 'acquired' || status === 'jv_signed';
}
