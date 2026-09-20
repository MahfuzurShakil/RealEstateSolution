import type { BadgeTone } from '@/components/ui/Badge';
import type {
  AcquisitionType,
  FeasibilityRecommendation,
  FeasibilityStatus,
  LandStatus,
} from '@/lib/db/types';
import { localDay, todayLocal } from '@/lib/utils/format';

/**
 * Module 1 status pipeline (BRD v2.0 LAND-004, extended 2026-09-18):
 *
 *   sourced → under_review → dd_in_progress → negotiation → agreed
 *           → acquired → under_development → ready_for_project
 *           → linked_to_project
 *   any of those → on_hold | rejected;  ours → disposed
 *
 * `linked_to_project` is NOT chosen by hand — Module 2 sets it when the land is
 * mapped to a project. See `LAND_STATUSES` for why `jv_signed` is gone.
 */
export const LAND_STATUS_META: Record<LandStatus, { label: string; tone: BadgeTone }> = {
  sourced: { label: 'Sourced', tone: 'neutral' },
  under_review: { label: 'Under Review', tone: 'blue' },
  dd_in_progress: { label: 'Due Diligence', tone: 'blue' },
  negotiation: { label: 'Negotiation', tone: 'amber' },
  agreed: { label: 'Agreed', tone: 'amber' },
  acquired: { label: 'Acquired', tone: 'green' },
  under_development: { label: 'Under Development', tone: 'blue' },
  ready_for_project: { label: 'Ready for Project', tone: 'green' },
  linked_to_project: { label: 'Linked to Project', tone: 'teal' },
  on_hold: { label: 'On Hold', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'red' },
  disposed: { label: 'Divested', tone: 'neutral' },
};

/**
 * What to call `acquired` on screen: a joint venture was signed, not bought.
 *
 * One status, two words for it — the status says the land is ours and
 * `acquisition_type` says how, which is why `jv_signed` stopped being a status
 * of its own (Dexie v24).
 */
export function landStatusLabel(status: LandStatus, acquisitionType: AcquisitionType): string {
  if (status === 'acquired' && acquisitionType === 'joint_venture') return 'JV Signed';
  return LAND_STATUS_META[status].label;
}

/* ------------------------------------------------------------------ *
 * Stages — the coarse filter the land list opens with
 * ------------------------------------------------------------------ */

export const LAND_STAGES = ['sourcing', 'legal', 'deal', 'owned', 'closed'] as const;
export type LandStage = (typeof LAND_STAGES)[number];

export const LAND_STAGE_META: Record<LandStage, { label: string; statuses: LandStatus[] }> = {
  sourcing: { label: 'Sourcing', statuses: ['sourced', 'under_review'] },
  legal: { label: 'Legal', statuses: ['dd_in_progress'] },
  deal: { label: 'Deal', statuses: ['negotiation', 'agreed'] },
  owned: {
    label: 'Owned',
    statuses: ['acquired', 'under_development', 'ready_for_project', 'linked_to_project'],
  },
  closed: { label: 'Closed', statuses: ['on_hold', 'rejected', 'disposed'] },
};

export function landStage(status: LandStatus): LandStage {
  return (
    LAND_STAGES.find((stage) => LAND_STAGE_META[stage].statuses.includes(status)) ?? 'closed'
  );
}

/**
 * The *decisions* a user may record from `current` (L7, LAND-L7-PLAN.md).
 *
 * Status otherwise follows the work: the four middle steps move when a visit,
 * a due-diligence check, a round or an accepted round is recorded
 * (`nextAutomaticStep`), and Acquired / JV Signed are recorded where the deal
 * is closed — registration on the Negotiation & Acquisition timeline, signing
 * on the Joint Venture tab. What is left here is what only a person can
 * decide: drop the land, sell it on, or reconsider it.
 */
export function allowedNextStatuses(current: LandStatus): LandStatus[] {
  const map: Record<LandStatus, LandStatus[]> = {
    // anything still being chased can be parked or dropped
    sourced: ['on_hold', 'rejected'],
    under_review: ['on_hold', 'rejected'],
    dd_in_progress: ['on_hold', 'rejected'],
    negotiation: ['on_hold', 'rejected'],
    agreed: ['on_hold', 'rejected'],
    /*
     * A land we own can be let go of (BRD LAND-004 DISPOSED) — transferred on,
     * or the JV unwound. This is the only exit the land screen offers, and it
     * is not a sale: selling a plot means linking it to a `land_share` or
     * `plot_development` project, which is where units and bookings live.
     *
     * Not offered from `linked_to_project`: a plot a project already stands on
     * is not something to let go of from the land screen, and if it genuinely
     * is, the project has to release it first.
     */
    acquired: ['disposed'],
    under_development: ['disposed'],
    ready_for_project: ['disposed'],
    linked_to_project: [],
    // a parked land is resumed (back to where it was) or dropped
    on_hold: ['rejected'],
    // a rejected land can be reopened at the start of the pipeline
    rejected: ['sourced'],
    disposed: [],
  };
  return map[current];
}

/* ------------------------------------------------------------------ *
 * Pipeline gates (BRD-ALIGNMENT-PLAN.md section 5.3)
 * ------------------------------------------------------------------ */

/**
 * BRD SITE-003 — no negotiation until the numbers are approved.
 *
 * The BRD puts the approval before *acquisition negotiation*, and L7 moved the
 * gate there (it used to guard due diligence). Nobody should be talking price
 * with an owner on a plot the board has not agreed is worth buying. Always on.
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
    return 'No feasibility study has been recorded for this land. Add one under Site Visit & Feasibility and get it approved before negotiating.';
  }
  if (current.status === 'submitted') {
    return `Version ${current.version_no} has been submitted and is waiting for approval. Approve it under Site Visit & Feasibility before negotiating.`;
  }
  if (current.status === 'draft') {
    return `Version ${current.version_no} is still a draft. Submit it and have it approved before negotiating.`;
  }
  // rejected
  return `Version ${current.version_no} was rejected. Record a new version before negotiating.`;
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
    return 'No due-diligence checklist has been started for this land. Start it under Legal Due Diligence before completing the acquisition.';
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
    return `${land.name} has no land-development record. Add the activities it needs under Land Development, or mark the plot as needing no development.`;
  }
  if (readiness.outstanding > 0) {
    const held = readiness.onHold > 0 ? ` (${readiness.onHold} on hold)` : '';
    return `${land.name} has ${readiness.outstanding} development ${readiness.outstanding === 1 ? 'activity' : 'activities'} still unfinished${held}.`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * L7 — status follows the work (LAND-L7-PLAN.md)
 * ------------------------------------------------------------------ */

/**
 * Which status each piece of work sets, for the Progress card to show beside
 * the step. `null` means the step moves nothing — it is a gate or a record.
 */
export const STEP_SETS_STATUS: Record<string, LandStatus | null> = {
  visit: 'under_review',
  feasibility: null,
  dd: 'dd_in_progress',
  negotiation: 'agreed',
  settlement: null,
  closing: 'acquired',
  development: 'ready_for_project',
};

/**
 * The statuses that move on their own, and where they go next. `acquired` has
 * two possible next steps (see `nextAutomaticStep`), so it maps to the first.
 */
export const AUTOMATIC_TRANSITIONS: Partial<Record<LandStatus, LandStatus>> = {
  sourced: 'under_review',
  under_review: 'dd_in_progress',
  dd_in_progress: 'negotiation',
  negotiation: 'agreed',
  acquired: 'under_development',
  under_development: 'ready_for_project',
  ready_for_project: 'under_development',
};

/* ------------------------------------------------------------------ *
 * What each land is waiting on — the land list's second line and filter
 * ------------------------------------------------------------------ */

export const WAITING_KEYS = [
  'visit',
  'feasibility',
  'dd',
  'negotiation',
  'settlement',
  'registration',
  'development',
  'project',
  'decision',
  'nothing',
] as const;
export type WaitingKey = (typeof WAITING_KEYS)[number];

export const WAITING_LABEL: Record<WaitingKey, string> = {
  visit: 'A site visit',
  feasibility: 'Feasibility approval',
  dd: 'Due diligence',
  negotiation: 'A negotiation round',
  settlement: 'A settlement schedule',
  registration: 'Registration / signing',
  development: 'Land development',
  project: 'A project',
  decision: 'A decision',
  nothing: 'Nothing',
};

export interface LandWaitingInput {
  status: LandStatus;
  acquisitionType: AcquisitionType;
  doneVisits: number;
  feasibility: FeasibilityGateInput;
  dd?: { mandatoryTotal: number; mandatoryOutstanding: number; mandatoryFailed: number };
  openRound?: { round_no: number };
  roundCount: number;
  hasSchedule: boolean;
  development?: { total: number; outstanding: number };
  noDevelopmentRequired?: boolean;
}

/**
 * The one thing this land needs next, in a few words.
 *
 * Status says which stage a land is in; this says what is holding it there,
 * which is the question a land team actually asks — "which plots are sitting
 * with the lawyer", "which are waiting on the board". It is derived, never
 * stored, so it cannot drift from the records.
 */
export function landWaitingOn(input: LandWaitingInput): { key: WaitingKey; text: string } {
  const isJv = input.acquisitionType === 'joint_venture';
  switch (input.status) {
    case 'sourced':
      return { key: 'visit', text: 'A first site visit' };
    case 'under_review': {
      if (input.doneVisits === 0) return { key: 'visit', text: 'A site visit' };
      const reason = feasibilityGateBlockReason(input.feasibility);
      if (!reason) return { key: 'dd', text: 'Due diligence to start' };
      const current = input.feasibility.current;
      if (!current) return { key: 'feasibility', text: 'A feasibility study' };
      if (current.status === 'submitted')
        return { key: 'feasibility', text: `Approval of feasibility v${current.version_no}` };
      if (current.status === 'draft')
        return { key: 'feasibility', text: `Feasibility v${current.version_no} to be submitted` };
      return { key: 'feasibility', text: 'A new feasibility study' };
    }
    case 'dd_in_progress': {
      if (feasibilityGateBlockReason(input.feasibility)) {
        return { key: 'feasibility', text: 'Feasibility approval before negotiating' };
      }
      const dd = input.dd;
      if (dd && dd.mandatoryFailed > 0)
        return { key: 'dd', text: `${dd.mandatoryFailed} failed legal check${dd.mandatoryFailed === 1 ? '' : 's'}` };
      return { key: 'negotiation', text: 'A first negotiation round' };
    }
    case 'negotiation':
      return input.openRound
        ? { key: 'negotiation', text: `A reply to round ${input.openRound.round_no}` }
        : { key: 'negotiation', text: `A new round (${input.roundCount} so far)` };
    case 'agreed': {
      const dd = input.dd;
      if (dd && (dd.mandatoryOutstanding > 0 || dd.mandatoryTotal === 0)) {
        return {
          key: 'dd',
          text: dd.mandatoryTotal === 0 ? 'Due diligence to start' : `${dd.mandatoryOutstanding} legal checks`,
        };
      }
      if (!isJv && !input.hasSchedule) return { key: 'settlement', text: 'A settlement schedule' };
      return { key: 'registration', text: isJv ? 'JV signing' : 'Registration' };
    }
    case 'acquired':
      return {
        key: 'development',
        text: 'Development to be planned, or marked as not needed',
      };
    case 'under_development': {
      const n = input.development?.outstanding ?? 0;
      return { key: 'development', text: `${n} development ${n === 1 ? 'activity' : 'activities'}` };
    }
    case 'ready_for_project':
      return { key: 'project', text: 'A project to be planned on it' };
    case 'linked_to_project':
      return { key: 'nothing', text: 'In a project' };
    case 'on_hold':
      return { key: 'decision', text: 'A decision to resume or drop it' };
    case 'rejected':
      return { key: 'nothing', text: 'Dropped' };
    case 'disposed':
      return { key: 'nothing', text: 'Sold on' };
  }
}

/** What the records on a land say has happened — read by `landPipelineRepository`. */
export interface LandWorkFacts {
  /** the earliest visit that actually happened (a planned visit is not work) */
  firstVisit?: { visit_date: string; visited_by?: string | null };
  /** the earliest moment anybody worked a due-diligence item */
  firstDdWork?: { at: string; label: string };
  firstRound?: { round_no: number; offer_date: string; amount: number; party: 'us' | 'owner' };
  acceptedRound?: { round_no: number; amount: number; accepted_on: string };
  /** land development, which moves a held plot on (DEV-001…004) */
  development?: { total: number; outstanding: number; firstStartedOn?: string | null };
  noDevelopmentRequired?: boolean;
}

export interface AutomaticStep {
  to: LandStatus;
  event_date: string;
  performed_by: string | null;
  amount: number | null;
  /** says what moved the land, so the change is never a silent one */
  remarks: string;
}

/**
 * The next status the work on this land has earned, or `null`.
 *
 * One step at a time, so a caller that loops writes one history row per step,
 * each with its own cause and date.
 */
export function nextAutomaticStep(
  status: LandStatus,
  facts: LandWorkFacts,
  acquisitionType: AcquisitionType,
): AutomaticStep | null {
  const to = AUTOMATIC_TRANSITIONS[status];
  if (!to) return null;

  switch (status) {
    /*
     * After acquisition the plot itself is worked on, and that work moves it
     * too: a plot being filled is not a plot a project can be planned over.
     * `ready_for_project` is what gate G3 and the project form look for.
     */
    case 'acquired': {
      const dev = facts.development;
      if (facts.noDevelopmentRequired) {
        return {
          to: 'ready_for_project',
          event_date: todayLocal(),
          performed_by: null,
          amount: null,
          remarks: 'Marked as needing no development work — ready for a project.',
        };
      }
      if (!dev || dev.total === 0) return null;
      if (dev.outstanding === 0) {
        return {
          to: 'ready_for_project',
          event_date: todayLocal(),
          performed_by: null,
          amount: null,
          remarks: `All ${dev.total} development ${dev.total === 1 ? 'activity is' : 'activities are'} complete — ready for a project.`,
        };
      }
      return {
        to: 'under_development',
        event_date: localDay(dev.firstStartedOn) || todayLocal(),
        performed_by: null,
        amount: null,
        remarks: `Land development started — ${dev.total} ${dev.total === 1 ? 'activity' : 'activities'} planned.`,
      };
    }
    /*
     * Backwards, and deliberately: new development work on a plot that was
     * ready means it is not ready any more. The two rules are mutually
     * exclusive (outstanding > 0 against outstanding === 0), so this cannot
     * oscillate.
     */
    case 'ready_for_project': {
      const dev = facts.development;
      if (facts.noDevelopmentRequired || !dev || dev.outstanding === 0) return null;
      return {
        to: 'under_development',
        event_date: todayLocal(),
        performed_by: null,
        amount: null,
        remarks: `Development work reopened — ${dev.outstanding} ${dev.outstanding === 1 ? 'activity' : 'activities'} unfinished.`,
      };
    }
    case 'under_development': {
      const dev = facts.development;
      if (facts.noDevelopmentRequired) {
        return {
          to: 'ready_for_project',
          event_date: todayLocal(),
          performed_by: null,
          amount: null,
          remarks: 'Marked as needing no development work — ready for a project.',
        };
      }
      if (!dev || dev.total === 0 || dev.outstanding > 0) return null;
      return {
        to: 'ready_for_project',
        event_date: todayLocal(),
        performed_by: null,
        amount: null,
        remarks: `All ${dev.total} development ${dev.total === 1 ? 'activity is' : 'activities are'} complete — ready for a project.`,
      };
    }
    case 'sourced': {
      const v = facts.firstVisit;
      if (!v) return null;
      return {
        to,
        event_date: v.visit_date,
        performed_by: v.visited_by ?? null,
        amount: null,
        remarks: v.visited_by ? `Site visit recorded, led by ${v.visited_by}.` : 'Site visit recorded.',
      };
    }
    case 'under_review': {
      const d = facts.firstDdWork;
      if (!d) return null;
      return {
        to,
        event_date: localDay(d.at) || todayLocal(),
        performed_by: null,
        amount: null,
        remarks: `Due diligence started — "${d.label}" was taken up.`,
      };
    }
    case 'dd_in_progress': {
      const r = facts.firstRound;
      if (!r) return null;
      return {
        to,
        event_date: r.offer_date,
        performed_by: null,
        amount: r.amount,
        remarks: `Negotiation round ${r.round_no} recorded — ${r.party === 'us' ? 'our offer' : 'the owner’s ask'}.`,
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
            ? `Round ${r.round_no} accepted — terms agreed.`
            : `Round ${r.round_no} accepted — this amount is now the agreed price.`,
      };
    }
    default:
      return null;
  }
}

/**
 * Where "Correct this status" may put a land — for land bought before this
 * system existed, or moved by mistake. Never `linked_to_project` (Module 2
 * owns it), and never the other acquisition type's outcome.
 */
export function correctableStatuses(current: LandStatus): LandStatus[] {
  if (current === 'linked_to_project') return [];
  return (Object.keys(LAND_STATUS_META) as LandStatus[]).filter(
    // a project sets `linked_to_project`; parking and dropping are decisions
    (s) => s !== current && s !== 'linked_to_project' && s !== 'on_hold',
  );
}

/**
 * What a status expects to be true, shown beside it when correcting one.
 *
 * A correction skips the rules, so the dialog says what the status normally
 * means — otherwise "Agreed" is just a word in a dropdown, and the land ends
 * up somewhere its records do not support.
 */
export const STATUS_EXPECTS: Record<LandStatus, string> = {
  sourced: 'Nothing recorded yet.',
  under_review: 'A site visit has happened.',
  dd_in_progress: 'The legal checklist is being worked through.',
  negotiation: 'An offer is on the table.',
  agreed: 'A price (or JV terms) is agreed, but nothing is registered.',
  acquired: 'The deed is registered, or the JV agreement is signed.',
  under_development: 'The plot is ours and development work is running.',
  ready_for_project: 'The plot is ours and needs no further development.',
  linked_to_project: 'Set by Module 2 when a project takes the land.',
  on_hold: 'Parked — recorded from the page header, with a reason.',
  rejected: 'Dropped. Never bought.',
  disposed: 'Was ours and is no longer held.',
};

/* ---------------------------- validations ---------------------------- */

/** Statuses at which the company holds the land — development happens here. */
export function landIsHeld(status: LandStatus): boolean {
  return (
    status === 'acquired' ||
    status === 'under_development' ||
    status === 'ready_for_project' ||
    status === 'linked_to_project'
  );
}

/**
 * Land development only on land the company holds. Filling somebody else's
 * plot is money spent on land that may never be bought.
 */
export function developmentBlockReason(status: LandStatus): string | null {
  if (landIsHeld(status)) return null;
  return `Land development starts once the land is ours — registered, or the JV signed. This land is ${LAND_STATUS_META[status].label}.`;
}

/**
 * BRD ACQ-003 — the owner settlement schedule.
 *
 * Opens at Agreed rather than at Acquired: in this market the bayna (advance)
 * is paid before registration, and a plan that could only be recorded after
 * the deed would leave that payment with nothing to settle against.
 */
export function paymentPlanBlockReason(status: LandStatus, agreedAmount: number): string | null {
  if (!(status === 'agreed' || landIsHeld(status))) {
    return 'The settlement schedule is recorded once a price is agreed — accept a negotiation round first.';
  }
  if (agreedAmount <= 0) {
    return 'There is no agreed amount on this land to schedule.';
  }
  return null;
}

/**
 * What stops registration (direct purchase) or JV signing.
 *
 * DD-004 is always on (it was a Settings switch). A purchase also needs its
 * settlement schedule first (ACQ-003), so every payment made at and after the
 * deed has a line to settle.
 */
export function closingBlockReason(input: {
  status: LandStatus;
  acquisitionType: AcquisitionType;
  dd: { mandatoryTotal: number; mandatoryOutstanding: number; mandatoryFailed: number } | undefined;
  hasSchedule: boolean;
}): string | null {
  if (input.status !== 'agreed') {
    return input.acquisitionType === 'joint_venture'
      ? 'Signing is recorded once the JV terms are agreed — accept a negotiation round first.'
      : 'Registration is recorded once a price is agreed — accept a negotiation round first.';
  }
  const dd = ddGateBlockReason(input.dd);
  if (dd) return dd;
  if (input.acquisitionType === 'direct_purchase' && !input.hasSchedule) {
    return 'Record the owner settlement schedule (payment plan) before registration.';
  }
  return null;
}

/**
 * BRD LAND-002 / ACQ-003 — what each owner gets of an agreed amount, by share.
 *
 * Whole taka, and the rounding lands on the last owner so the parts always add
 * up to the whole — a split that is off by one taka shows as a mismatch on the
 * Owners tab. With no shares recorded it divides evenly; one owner takes all.
 */
export function splitAmountByShare(
  total: number,
  owners: Array<{ id: string; share: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (owners.length === 0) return out;
  const shareSum = owners.reduce((s, o) => s + (Number(o.share) || 0), 0);
  let given = 0;
  owners.forEach((o, i) => {
    if (i === owners.length - 1) {
      out[o.id] = Math.round(total - given);
      return;
    }
    const part =
      shareSum > 0 ? Math.round((total * (Number(o.share) || 0)) / shareSum) : Math.round(total / owners.length);
    out[o.id] = part;
    given += part;
  });
  return out;
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
  return (
    landIsHeld(status) || status === 'rejected' || status === 'disposed' || status === 'on_hold'
  );
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

const ATTACHMENTS: Partial<Record<LandStatus, StatusStepAttachment>> = {
  sourced: { documentType: 'other', customName: 'Reopening note', prompt: 'Anything supporting the decision to reconsider this land' },
  acquired: { documentType: 'dolil_deed', prompt: 'Registered deed, mutation papers, registration receipt' },
  on_hold: { documentType: 'other', customName: 'Hold note', prompt: 'Anything that records why this is parked' },
  rejected: { documentType: 'other', customName: 'Rejection note', prompt: 'Anything that records why this was dropped' },
  disposed: { documentType: 'other', customName: 'Divestment record', prompt: 'Transfer deed, cancellation deed, board approval' },
};

export function statusStepAttachment(
  status: LandStatus,
  acquisitionType: AcquisitionType = 'direct_purchase',
): StatusStepAttachment {
  // a JV closes with an agreement, not a deed
  if (status === 'acquired' && acquisitionType === 'joint_venture') {
    return { documentType: 'jv_agreement', prompt: 'Signed JV agreement, power of attorney' };
  }
  return (
    ATTACHMENTS[status] ?? {
      documentType: 'other',
      customName: 'Status note',
      prompt: 'Anything supporting this change',
    }
  );
}

const REMARKS = (required = false, placeholder = 'Anything worth remembering about this step'): StatusStepField => ({
  key: 'remarks',
  label: required ? 'Remarks (required)' : 'Remarks',
  placeholder,
  type: 'textarea',
  required,
});

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
  /*
   * Parking a land (2026-09-18). A plot whose owner has gone quiet, or whose
   * price is wrong this season, used to be either rejected — which says we
   * turned it down — or left looking active. The reason is required because
   * it is the whole content of the status, and "Resume" puts the land back
   * where it was.
   */
  on_hold: {
    title: 'Put this land on hold',
    question: 'The land stays on the list but stops being chased. A reason is required.',
    confirmLabel: 'Put on hold',
    tone: 'warning',
    fields: [
      { key: 'event_date', label: 'On hold from', placeholder: '', type: 'date', required: true },
      { key: 'performed_by', label: 'Decided by', placeholder: 'e.g. Land team lead', type: 'text' },
      REMARKS(true, 'Why is this parked, and what would restart it?'),
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
   * BRD LAND-004 DISPOSED — the company no longer holds this plot.
   *
   * This is an **exit from a plot, not a sale of land** (client decision
   * 2026-09-20). The Land module sells nothing: a plot the company wants to
   * sell is linked to a project first, and a `land_share` or
   * `plot_development` project is what carries the units, the bookings and the
   * customers. What is left here is the other thing that happens to land the
   * company holds — it is transferred to another developer, the JV is
   * cancelled, the deal is unwound — and that had nowhere to sit.
   *
   * Worded accordingly: "Divested" on screen, consideration optional, because
   * a cancelled JV returns the plot for nothing.
   *
   * The amount is what was *received*, and deliberately does NOT write
   * `final_agreed_amount` (see `amountUpdatesFinalAgreed`): that field is what
   * we paid for the plot, and the land's cost ledger and payment schedule are
   * both built from it. Overwriting it with an exit price would make an
   * acquisition that was settled years ago appear to have cost whatever the
   * other side paid.
   */
  disposed: {
    title: 'Transfer or divest this land',
    question:
      'Record that the company no longer holds this land — transferred to another party, or the agreement unwound. To sell this land to customers, link it to a Land Share or Plot Development project instead. A reason is required.',
    confirmLabel: 'Mark divested',
    tone: 'warning',
    fields: [
      { key: 'event_date', label: 'Divested on', placeholder: '', type: 'date', required: true },
      {
        key: 'amount',
        label: 'Consideration received (BDT)',
        placeholder: 'leave blank if nothing was received',
        type: 'number',
      },
      { key: 'reference_no', label: 'Deed / transfer reference', placeholder: 'e.g. 8812/2026', type: 'text' },
      { key: 'performed_by', label: 'Approved by', placeholder: 'e.g. Management committee', type: 'text' },
      REMARKS(true, 'Why is the company letting this land go, and to whom?'),
    ],
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
  acquired: {
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
    return JV_STATUS_STEP_CONFIG[status] ?? null;
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
  return status === 'acquired';
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
