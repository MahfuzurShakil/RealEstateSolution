import type { BadgeTone } from '@/components/ui/Badge';
import type {
  AcquisitionType,
  FeasibilityRecommendation,
  FeasibilityStatus,
  LandStatus,
} from '@/lib/db/types';

/**
 * Module 1 status pipeline, in the BRD's vocabulary (BRD v2.0 LAND-004):
 *
 *   sourced → under_review → dd_in_progress → negotiation → agreed
 *           → acquired | jv_signed | rejected
 *           → disposed | linked_to_project
 *
 * `linked_to_project` is NOT chosen by hand — Module 2 sets it when the land is
 * mapped to a project, so it is excluded from the manual transition list.
 */
export const LAND_STATUS_META: Record<LandStatus, { label: string; tone: BadgeTone }> = {
  sourced: { label: 'Sourced', tone: 'neutral' },
  under_review: { label: 'Under Review', tone: 'blue' },
  dd_in_progress: { label: 'Due Diligence', tone: 'blue' },
  negotiation: { label: 'Negotiation', tone: 'amber' },
  agreed: { label: 'Agreed', tone: 'amber' },
  acquired: { label: 'Acquired', tone: 'green' },
  jv_signed: { label: 'JV Signed', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  disposed: { label: 'Disposed', tone: 'neutral' },
  linked_to_project: { label: 'Linked to Project', tone: 'teal' },
};

/**
 * Statuses a user may move to *by hand* from `current` (L7 — one way in).
 *
 * Only the five real-world events are here: Acquired and JV Signed (a deed or
 * an agreement is signed), Rejected and Disposed (a decision), and Reopen. The
 * four middle steps are not, because they are consequences of work the system
 * already records — see `nextAutomaticStep`. Asking a user to confirm "site
 * visit done" beside a site visit they have just saved was two records of one
 * afternoon, and nothing reconciled them.
 *
 * A land that is simply in the wrong place is fixed with a correction
 * (`correctableStatuses`), which is deliberately not a transition.
 */
export function allowedNextStatuses(
  current: LandStatus,
  acquisitionType: AcquisitionType,
): LandStatus[] {
  const outcome: LandStatus = acquisitionType === 'joint_venture' ? 'jv_signed' : 'acquired';

  const map: Record<LandStatus, LandStatus[]> = {
    sourced: ['rejected'],
    under_review: ['rejected'],
    dd_in_progress: ['rejected'],
    negotiation: ['rejected'],
    agreed: [outcome, 'rejected'],
    /*
     * A land we own can be sold on (BRD LAND-004 DISPOSED). It is not offered
     * from `linked_to_project`: a plot a project is being built on is not
     * something to dispose of from the land screen, and if it genuinely is,
     * the project has to let go of it first.
     */
    acquired: ['disposed'],
    jv_signed: ['disposed'],
    // a rejected land can be reopened at the start of the pipeline
    rejected: ['sourced'],
    disposed: [],
    linked_to_project: [],
  };
  return map[current];
}

/* ------------------------------------------------------------------ *
 * L7 — the work moves the pipeline (LAND-UX-REVIEW.md section 4)
 * ------------------------------------------------------------------ */

/** The four steps that follow the work, keyed by the status they leave. */
export const AUTOMATIC_TRANSITIONS: Partial<Record<LandStatus, LandStatus>> = {
  sourced: 'under_review',
  under_review: 'dd_in_progress',
  dd_in_progress: 'negotiation',
  negotiation: 'agreed',
};

/**
 * What the records on a land say has happened — the input to
 * `nextAutomaticStep`. Read by `landPipelineRepository`, kept plain here so
 * the rule can be read without a database.
 */
export interface LandWorkFacts {
  /** the earliest visit — the one that put the land under review */
  firstVisit?: { visit_date: string; visited_by?: string | null };
  /** the highest version, whatever its status */
  currentStudy?: { version_no: number; status: FeasibilityStatus };
  /** the newest approved version */
  latestApproved?: {
    version_no: number;
    recommendation: FeasibilityRecommendation;
    decided_at?: string | null;
  };
  /** the lowest-numbered round — negotiation started when it was made */
  firstRound?: { round_no: number; offer_date: string; amount: number; party: 'us' | 'owner' };
  acceptedRound?: { round_no: number; amount: number; accepted_on: string };
}

export interface AutomaticStep {
  to: LandStatus;
  event_date: string;
  performed_by: string | null;
  amount: number | null;
  /** says what moved the land, so the change is never a silent one */
  remarks: string;
}

const dateOnly = (iso: string | null | undefined) => (iso ?? '').slice(0, 10);

/**
 * The next status the work on this land has earned, or `null` when it has
 * earned nothing more.
 *
 * One step at a time, so a caller that loops (`syncFromWork`) writes one
 * history row per step — a round accepted on a plot still marked Due
 * Diligence records both "negotiation started" and "agreed", each with its
 * own cause and date, rather than one jump that explains neither.
 *
 * The feasibility step reuses gate G1's rule verbatim: an approved study that
 * recommends hold or reject does not move a land, because approving the
 * paperwork is not approving the deal.
 */
export function nextAutomaticStep(
  status: LandStatus,
  facts: LandWorkFacts,
  acquisitionType: AcquisitionType,
): AutomaticStep | null {
  const to = AUTOMATIC_TRANSITIONS[status];
  if (!to) return null;

  switch (status) {
    case 'sourced': {
      const v = facts.firstVisit;
      if (!v) return null;
      return {
        to,
        event_date: v.visit_date,
        performed_by: v.visited_by ?? null,
        amount: null,
        // the date is the event's own, so the sentence does not repeat it
        remarks: v.visited_by ? `Site visit recorded, led by ${v.visited_by}.` : 'Site visit recorded.',
      };
    }
    case 'under_review': {
      const approved = facts.latestApproved;
      if (
        !approved ||
        feasibilityGateBlockReason({ current: facts.currentStudy, latestApproved: approved }) !== null
      ) {
        return null;
      }
      return {
        to,
        event_date: dateOnly(approved.decided_at) || new Date().toISOString().slice(0, 10),
        performed_by: null,
        amount: null,
        remarks: `Feasibility study version ${approved.version_no} approved, recommending Proceed.`,
      };
    }
    case 'dd_in_progress': {
      const r = facts.firstRound;
      if (!r) return null;
      const who = r.party === 'us' ? 'our offer' : 'the owner’s ask';
      return {
        to,
        event_date: r.offer_date,
        performed_by: null,
        amount: r.amount,
        remarks: `Negotiation round ${r.round_no} recorded — ${who}.`,
      };
    }
    case 'negotiation': {
      const r = facts.acceptedRound;
      if (!r) return null;
      return {
        to,
        event_date: r.accepted_on,
        performed_by: null,
        amount: r.amount,
        remarks:
          acquisitionType === 'joint_venture'
            ? `Round ${r.round_no} accepted — signing money agreed.`
            : `Round ${r.round_no} accepted — this amount is now the agreed price.`,
      };
    }
    default:
      return null;
  }
}

/**
 * Where a correction may put a land (review section 7, question 2).
 *
 * Anywhere except where it is, and never `linked_to_project` — that one belongs
 * to Module 2, which knows *which* project, and a land page claiming a link
 * with no project behind it is a broken record. A linked land is not corrected
 * here for the same reason: the project has to let go of it first.
 */
export function correctableStatuses(
  current: LandStatus,
  acquisitionType: AcquisitionType,
): LandStatus[] {
  if (current === 'linked_to_project') return [];
  // a joint venture is never "acquired", and a purchase never "JV signed"
  const wrongOutcome: LandStatus = acquisitionType === 'joint_venture' ? 'acquired' : 'jv_signed';
  return (Object.keys(LAND_STATUS_META) as LandStatus[]).filter(
    (s) => s !== current && s !== 'linked_to_project' && s !== wrongOutcome,
  );
}

/* ------------------------------------------------------------------ *
 * Pipeline gates (BRD-ALIGNMENT-PLAN.md section 5.3)
 * ------------------------------------------------------------------ */

/**
 * Gate G1 (BRD SITE-003) — no due diligence until the numbers are approved.
 *
 * The lawyers are the expensive part of sourcing a plot, and the point of a
 * feasibility study is to decide whether to spend that money. Sending land to
 * due diligence with no approved study is how a firm pays for a title search
 * on a plot it was never going to buy.
 *
 * Returns the reason it is shut, or `null` when it is open. A sentence rather
 * than a boolean because the dialog has to say *what is missing* — "blocked"
 * on its own sends the user hunting.
 */
export interface FeasibilityGateInput {
  /** the highest version, whatever its status — what the land is working from */
  current?: { version_no: number; status: FeasibilityStatus } | undefined;
  /** the newest approved version, which is the only one that opens the gate */
  latestApproved?:
    | { version_no: number; recommendation: FeasibilityRecommendation }
    | undefined;
}

export function feasibilityGateBlockReason({
  current,
  latestApproved,
}: FeasibilityGateInput): string | null {
  /*
   * An approved study that says hold or reject is a decision, not a
   * formality — approving the paperwork is not approving the deal, and the
   * gate would be pointless if it let a "reject" through. Checked first
   * because it is the case where a study *exists and was approved*, which is
   * the most confusing one to be blocked by.
   */
  if (latestApproved && latestApproved.recommendation !== 'proceed') {
    return `Version ${latestApproved.version_no} was approved but recommends "${latestApproved.recommendation}", not proceeding. Record a new version recommending Proceed if the decision has changed.`;
  }
  if (latestApproved) return null;

  /*
   * Nothing approved. The message names what the land *does* have, because
   * "no approved study" sends someone to create a second one when the first
   * is sitting in front of an approver.
   */
  if (!current) {
    return 'No feasibility study has been recorded for this land. Add one on the Feasibility tab and get it approved before due diligence starts.';
  }
  if (current.status === 'submitted') {
    return `Version ${current.version_no} has been submitted and is waiting for approval. Approve it on the Feasibility tab to move this land on.`;
  }
  if (current.status === 'draft') {
    return `Version ${current.version_no} is still a draft. Submit it and have it approved before this land goes to due diligence.`;
  }
  // rejected
  return `Version ${current.version_no} was rejected. Record a new version before this land goes to due diligence.`;
}

/**
 * Gate G2 (BRD DD-004, BR-001) — no acquisition on unfinished due diligence.
 *
 * The BRD's hardest rule: "Acquisition cannot complete until mandatory due
 * diligence passes or an authorized waiver exists." Registration is the point
 * of no return on a land purchase, and an unchecked encumbrance found
 * afterwards is not a problem anybody can fix.
 *
 * Only *mandatory* items block. An optional item left pending is a note, not a
 * defect — which is exactly why the master checklist makes `is_mandatory` a
 * decision rather than a default.
 */
export function ddGateBlockReason(progress: {
  mandatoryTotal: number;
  mandatoryOutstanding: number;
  mandatoryFailed: number;
} | undefined): string | null {
  if (!progress) return null;

  if (progress.mandatoryTotal === 0) {
    return 'No due-diligence checklist has been started for this land. Open the Due Diligence tab before completing the acquisition.';
  }
  if (progress.mandatoryFailed > 0) {
    const n = progress.mandatoryFailed;
    return `${n} mandatory due-diligence ${n === 1 ? 'check has' : 'checks have'} failed. Resolve ${n === 1 ? 'it' : 'them'} or record an authorised waiver before completing the acquisition.`;
  }
  if (progress.mandatoryOutstanding > 0) {
    const n = progress.mandatoryOutstanding;
    return `${n} mandatory due-diligence ${n === 1 ? 'check is' : 'checks are'} still outstanding. Every mandatory check must pass, be waived, or be marked not applicable first.`;
  }
  return null;
}

/** Which transitions G2 guards: the two that close a land purchase. */
export function transitionNeedsDueDiligence(from: LandStatus, to: LandStatus): boolean {
  return from === 'agreed' && (to === 'acquired' || to === 'jv_signed');
}

/**
 * Gate G3 (BRD DEV-004) — no project on land that is still being worked on.
 *
 * A project planned over a plot that is still being filled has a schedule
 * nobody can meet: piling cannot start on ground that is four feet short, and
 * the dates on the plan are wrong from the day they are drawn.
 *
 * Enforced where the link is actually made — `ProjectForm` — rather than on the
 * land page, because `linked_to_project` is set by Module 2 and never chosen by
 * hand.
 */
export function developmentGateBlockReason(
  land: { name: string; no_development_required?: boolean | null } | undefined,
  readiness: { total: number; outstanding: number; onHold: number } | undefined,
): string | null {
  if (!land || !readiness) return null;
  // a ready plot is ready; the flag is the whole answer
  if (land.no_development_required) return null;

  /*
   * No activities at all is not the same as no work needed. A plot nobody has
   * assessed is the case this gate exists for, and letting it through because
   * the list happens to be empty would make the gate a formality.
   */
  if (readiness.total === 0) {
    return `${land.name} has no land-development record. Add the activities it needs on the Development tab, or mark the plot as needing no development.`;
  }
  if (readiness.outstanding > 0) {
    const held = readiness.onHold > 0 ? ` (${readiness.onHold} on hold)` : '';
    return `${land.name} has ${readiness.outstanding} development ${readiness.outstanding === 1 ? 'activity' : 'activities'} still unfinished${held}.`;
  }
  return null;
}

/** Pipeline order used by the detail-page progress trail. */
export const LAND_PIPELINE_STEPS: LandStatus[] = [
  'sourced',
  'under_review',
  'dd_in_progress',
  'negotiation',
  'agreed',
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

/** A land is "closed" once acquired/JV-signed/rejected/disposed or handed to a project. */
export function isTerminalStatus(status: LandStatus): boolean {
  return ['acquired', 'jv_signed', 'rejected', 'disposed', 'linked_to_project'].includes(status);
}

/**
 * What each manual pipeline step asks for before it is confirmed (feedback #6).
 * A wrong click should never move a land forward silently, and the details
 * captured here become the audit trail shown on the Lifecycle feed.
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

/**
 * What paperwork a step collects, and what to file it as (client feedback,
 * 2026-09-14).
 *
 * Evidence turns up at the moment the step is confirmed — the surveyor comes
 * back from the plot with twenty photos, the lawyer comes back with the search
 * report — and until now the only way to store it was the Documents tab, as a
 * separate errand after the dialog was closed. So the photos lived on a phone.
 *
 * Each step therefore files its uploads under a sensible land document type,
 * chosen here rather than asked for in the dialog: the step already says what
 * the file is. The Documents tab still lists them, because they are land
 * documents like any other — this only decides the label and records which step
 * they arrived at.
 */
export interface StatusStepAttachment {
  /** one of LAND_DOCUMENT_TYPES */
  documentType: string;
  /** required when documentType is 'other' — becomes `custom_type_name` */
  customName?: string;
  /** what the dropzone invites the user to attach */
  prompt: string;
}

/*
 * Only the statuses a person still confirms have an entry. The four that
 * follow the work (L7) collect their evidence where the work is recorded — a
 * site visit carries its own photos, a DD item its own search report.
 */
const ATTACHMENTS: Partial<Record<LandStatus, StatusStepAttachment>> = {
  sourced: { documentType: 'other', customName: 'Reopening note', prompt: 'Anything supporting the decision to reconsider this land' },
  acquired: { documentType: 'dolil_deed', prompt: 'Registered deed, mutation papers, registration receipt' },
  jv_signed: { documentType: 'jv_agreement', prompt: 'Signed JV agreement, power of attorney' },
  rejected: { documentType: 'other', customName: 'Rejection note', prompt: 'Anything that records why this was dropped' },
  disposed: { documentType: 'other', customName: 'Disposal record', prompt: 'Transfer deed, sale agreement, board approval' },
};

const NO_ATTACHMENT: StatusStepAttachment = {
  documentType: 'other',
  customName: 'Status note',
  prompt: 'Anything supporting this change',
};

export function statusStepAttachment(status: LandStatus): StatusStepAttachment {
  return ATTACHMENTS[status] ?? NO_ATTACHMENT;
}

const REMARKS = (required = false, placeholder = 'Anything worth remembering about this step'): StatusStepField => ({
  key: 'remarks',
  label: required ? 'Remarks (required)' : 'Remarks',
  placeholder,
  type: 'textarea',
  required,
});

/*
 * L7 removed four entries from here — "Confirm site visit", "Confirm legal
 * verification", "Move to negotiation" and "Move to decision". Each asked for
 * a thin summary of work a tab now records in full, and the status follows that
 * work instead (`nextAutomaticStep`). What is left is the real-world events.
 */
const BASE_STATUS_STEP_CONFIG: Partial<Record<LandStatus, StatusStepConfig>> = {
  sourced: {
    title: 'Reopen this land',
    question: 'Move the land back to the start of the pipeline?',
    confirmLabel: 'Reopen',
    tone: 'warning',
    fields: [
      { key: 'event_date', label: 'Reopened on', placeholder: '', type: 'date', required: true },
      REMARKS(true, 'Why is this land being reconsidered?'),
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
  /*
   * BRD LAND-004 DISPOSED — land the company owned and has sold on.
   *
   * The amount is what was *received*, and deliberately does NOT write
   * `final_agreed_amount` (see `amountUpdatesFinalAgreed`): that field is what
   * we paid for the plot, and the land's cost ledger and payment schedule are
   * both built from it. Overwriting it with a sale price would make an
   * acquisition that was settled years ago appear to have cost whatever the
   * buyer paid.
   */
  disposed: {
    title: 'Mark as disposed',
    question: 'Record that this land has been sold on. A reason is required.',
    confirmLabel: 'Mark disposed',
    tone: 'warning',
    fields: [
      { key: 'event_date', label: 'Disposed on', placeholder: '', type: 'date', required: true },
      { key: 'amount', label: 'Amount received (BDT)', placeholder: 'e.g. 52000000', type: 'number' },
      { key: 'reference_no', label: 'Deed / transfer reference', placeholder: 'e.g. 8812/2026', type: 'text' },
      { key: 'performed_by', label: 'Approved by', placeholder: 'e.g. Management committee', type: 'text' },
      REMARKS(true, 'Why was this land disposed of, and to whom?'),
    ],
  },
};

/**
 * What signing asks for on a *joint venture*.
 *
 * A JV has no price, so the purchase question does not fit it. What is agreed
 * is the *share split*, and what money there is is the signing money — the
 * advance paid to the owner against the agreement.
 *
 * The share lands in `land_jv_details` rather than on the status event, because
 * a share is a term of the deal and not a thing that happened on a date.
 * Negotiation and decision used to ask for it too; since L7 those steps follow
 * the negotiation ladder, so signing is the one place the split is confirmed.
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
): StatusStepConfig | null {
  if (acquisitionType === 'joint_venture' && JV_STATUS_STEP_CONFIG[status]) {
    return JV_STATUS_STEP_CONFIG[status];
  }
  return BASE_STATUS_STEP_CONFIG[status] ?? null;
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

/* ------------------------------------------------------------------ *
 * What a plot's money means, given how it is being acquired
 * ------------------------------------------------------------------ */

/**
 * A purchase and a joint venture do not have the same commercials.
 *
 * A purchase has an asking price, a negotiated price and a final agreed
 * amount — three stages of one number. A joint venture has none of them: the
 * owner is not asking a price, nothing is being haggled down, and what they
 * receive is a share of the building. Asking Price was nevertheless *required*
 * on every land, so every JV plot in the system carries a purchase price that
 * was never asked and never agreed, and the list sorts by it.
 *
 * What a JV does have is a cash side, and `final_agreed_amount` now holds it
 * (see `amountUpdatesFinalAgreed`): signing money against the agreement, and
 * often rent for the owner while the building goes up. That is the one money
 * question worth asking, and the payment plan is built from it.
 */
export function landUsesPurchasePricing(acquisitionType: AcquisitionType): boolean {
  return acquisitionType === 'direct_purchase';
}

/** Label for `final_agreed_amount`, which means different things on the two. */
export function finalAmountLabel(acquisitionType: AcquisitionType): string {
  return acquisitionType === 'joint_venture'
    ? 'Cash payable to the landowner'
    : 'Final Agreed Amount';
}

export function finalAmountHint(acquisitionType: AcquisitionType): string {
  return acquisitionType === 'joint_venture'
    ? 'Signing money, and any rent agreed for the owner during construction. Leave at 0 if the owner is paid only in units — the payment plan is built from this.'
    : 'Reference only — payments are tracked in the Finance module';
}

/**
 * The one figure worth putting on a card or a list row.
 *
 * For a purchase that is what it will cost; for a JV it is the cash side, and
 * saying so is the point — a JV row showing "BDT 57,000,000" reads as the price
 * of the land, which nobody has agreed to pay.
 *
 * `null` means there is no figure yet, and is not the same as zero. A joint
 * venture still in the pipeline has agreed no cash, and rendering that as
 * "BDT 0" reads as a broken record rather than a deal not yet struck — which
 * is also what put two different answers on one page, the commercials row
 * showing "—" beside a summary showing zero.
 */
export function landHeadlineAmount(land: {
  acquisition_type: AcquisitionType;
  asking_price: number;
  final_agreed_amount?: number | null;
}): { label: string; amount: number | null } {
  /*
   * A purchase used to fall back through `negotiated_price` on its way to the
   * asking price. That field is gone (see the note on `Land`), and the agreed
   * amount is the better figure anyway: before anything is settled the row
   * shows what is being asked, and the moment the pipeline records a deal the
   * row shows what was actually agreed.
   */
  const value =
    land.acquisition_type === 'joint_venture'
      ? land.final_agreed_amount
      : (land.final_agreed_amount ?? land.asking_price);
  const amount = Number(value);
  return {
    label: land.acquisition_type === 'joint_venture' ? 'Cash to owner' : 'Price',
    amount: value == null || Number.isNaN(amount) ? null : amount,
  };
}
