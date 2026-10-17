import type { ProjectStatus, ProjectType } from '@/lib/db/types';

/**
 * What each project status move records (PROJECT-STATUS-FLOW-PLAN.md).
 *
 * A status is the last milestone the project has **reached**. Moving to a
 * status records that milestone once it has happened: the date it was done,
 * the facts that prove it and its papers. Nothing is asked about the next
 * step — while that work goes on, the project stays where it is.
 *
 * Answers are stored on the status event (`project_status_history.details`),
 * the papers are filed as project documents linked to that event, and a field
 * marked `column` also fills the event's own column so the Timeline shows it.
 * Key papers are compulsory (decision 2026-10-11).
 */

export interface StageField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  /** also written to the status event's own column */
  column?: 'performed_by' | 'reference_no';
}

export interface StageDocument {
  /** the project document type it is filed under */
  type: string;
  label: string;
  required?: boolean;
}

export interface StageRequirements {
  /** "Mark Plan Approved" */
  title: string;
  /** one line on what this milestone means */
  meaning: string;
  /** the label of the milestone's own date */
  dateLabel: string;
  fields: StageField[];
  documents: StageDocument[];
  remarksPlaceholder: string;
  remarksRequired?: boolean;
}

type Kind = 'built' | 'plot' | 'share';
const kindOf = (t: ProjectType): Kind =>
  t === 'land_share' ? 'share' : t === 'plot_development' ? 'plot' : 'built';

const YES_NO = ['Yes', 'No'];

const BUILT: Partial<Record<ProjectStatus, StageRequirements>> = {
  design: {
    title: 'Design Complete',
    meaning: 'The architectural and structural drawings are finished and ready to submit.',
    dateLabel: 'Design completed on',
    fields: [
      { key: 'architect', label: 'Architect / firm', type: 'text', placeholder: 'e.g. Volumezero Ltd.', column: 'performed_by' },
      { key: 'drawing_ref', label: 'Drawing set reference', type: 'text', placeholder: 'e.g. ARCH-2026-014', column: 'reference_no' },
      { key: 'built_up_area', label: 'Total built-up area (sqft)', type: 'number', required: true },
      { key: 'unit_count', label: 'Number of units', type: 'number' },
      { key: 'feasibility_done', label: 'Feasibility study done?', type: 'select', options: YES_NO, required: true },
    ],
    documents: [
      { type: 'architectural_plan', label: 'Architectural drawing set', required: true },
      { type: 'structural_drawing', label: 'Structural design' },
      { type: 'soil_test_report', label: 'Soil test report' },
    ],
    remarksPlaceholder: 'Unit mix, storeys, anything changed from the plan…',
  },
  approval: {
    title: 'Plan Approved',
    meaning: 'RAJUK / CDA has approved the building plan and issued the permit.',
    dateLabel: 'Plan approved on',
    fields: [
      { key: 'authority', label: 'Authority', type: 'text', placeholder: 'e.g. RAJUK, CDA', column: 'performed_by' },
      { key: 'permit_no', label: 'Approval / permit no.', type: 'text', placeholder: 'e.g. RAJUK/2026/4471', required: true, column: 'reference_no' },
      { key: 'submitted_on', label: 'File submitted on', type: 'date' },
    ],
    documents: [
      { type: 'rajuk_approval', label: 'Building plan approval / permit', required: true },
      { type: 'environmental_clearance', label: 'Environmental clearance' },
      { type: 'fire_safety_certificate', label: 'Fire service NOC' },
    ],
    remarksPlaceholder: 'Conditions attached to the approval…',
  },
  under_construction: {
    title: 'Under Construction',
    meaning: 'Work has started on site. This date becomes the actual start.',
    dateLabel: 'Construction started on',
    fields: [
      { key: 'contractor', label: 'Main contractor', type: 'text', placeholder: 'e.g. Nirman Construction Services', column: 'performed_by' },
      { key: 'work_order', label: 'Work order no.', type: 'text', placeholder: 'e.g. WO-2026-008', column: 'reference_no' },
    ],
    documents: [],
    remarksPlaceholder: 'Piling started, site handed to the contractor…',
  },
  nearly_complete: {
    title: 'Structure Complete',
    meaning: 'The frame is finished — roof casting done. Finishing work follows.',
    dateLabel: 'Roof casting completed on',
    fields: [],
    documents: [{ type: 'other', label: 'Snag / finishing list' }],
    remarksPlaceholder: 'What is left: lifts, finishing, utility connections…',
  },
  handover_ongoing: {
    title: 'Ready for Handover',
    meaning: 'The building is finished and certified; units can now be handed to buyers.',
    dateLabel: 'Occupancy certificate received on',
    fields: [
      { key: 'oc_no', label: 'Occupancy certificate no.', type: 'text', placeholder: 'e.g. OC-2026-021', required: true, column: 'reference_no' },
      { key: 'utilities_connected', label: 'Electricity, water and gas connected?', type: 'select', options: YES_NO, required: true },
    ],
    documents: [{ type: 'occupancy_certificate', label: 'Occupancy certificate', required: true }],
    remarksPlaceholder: 'Anything buyers should know before taking keys…',
  },
  closed: {
    title: 'Closed',
    meaning: 'Every unit is handed over and the accounts are settled.',
    dateLabel: 'Closed on',
    fields: [{ key: 'flat_owner_association', label: 'Flat owners’ association formed?', type: 'select', options: YES_NO }],
    documents: [],
    remarksPlaceholder: 'Final accounts settled, warranty period…',
    remarksRequired: true,
  },
};

const PLOT: Partial<Record<ProjectStatus, StageRequirements>> = {
  design: {
    title: 'Layout Planned',
    meaning: 'The plot layout — blocks, roads, open space — is drawn up.',
    dateLabel: 'Layout finished on',
    fields: [
      { key: 'planner', label: 'Planner / surveyor', type: 'text', column: 'performed_by' },
      { key: 'road_area_pct', label: 'Roads & common area (%)', type: 'number', required: true },
      { key: 'planned_plots', label: 'Planned number of plots', type: 'number' },
    ],
    documents: [
      { type: 'layout_plan', label: 'Layout plan', required: true },
      { type: 'site_survey', label: 'Site survey / digital survey' },
    ],
    remarksPlaceholder: 'Plot sizes, road widths…',
  },
  approval: {
    title: 'Layout Approved',
    meaning: 'The subdivision / layout has been approved by the authority.',
    dateLabel: 'Layout approved on',
    fields: [
      { key: 'authority', label: 'Authority', type: 'text', placeholder: 'e.g. RAJUK', column: 'performed_by' },
      { key: 'approval_no', label: 'Approval no.', type: 'text', required: true, column: 'reference_no' },
    ],
    documents: [{ type: 'subdivision_approval', label: 'Subdivision / layout approval', required: true }],
    remarksPlaceholder: 'Conditions attached to the approval…',
  },
  under_construction: {
    title: 'Under Development',
    meaning: 'Filling, roads and drains have started on the ground.',
    dateLabel: 'Development started on',
    fields: [
      { key: 'contractor', label: 'Contractor', type: 'text', column: 'performed_by' },
      { key: 'work_order', label: 'Work order no.', type: 'text', column: 'reference_no' },
    ],
    documents: [],
    remarksPlaceholder: 'Filling started, boundary wall…',
  },
  nearly_complete: {
    title: 'Development Complete',
    meaning: 'Roads, drains and utilities are finished.',
    dateLabel: 'Development finished on',
    fields: [
      { key: 'roads_done', label: 'Roads, drains and utilities finished?', type: 'select', options: YES_NO, required: true },
    ],
    documents: [],
    remarksPlaceholder: 'Anything left on site…',
  },
  handover_ongoing: {
    title: 'Ready for Possession',
    meaning: 'Plots are marked on the ground and can be handed to buyers.',
    dateLabel: 'Plots demarcated on',
    fields: [],
    documents: [{ type: 'other', label: 'Plot demarcation sheet' }],
    remarksPlaceholder: 'Pillars set, measurement done…',
  },
  closed: {
    title: 'Closed',
    meaning: 'Every plot is handed over and the accounts are settled.',
    dateLabel: 'Closed on',
    fields: [],
    documents: [],
    remarksPlaceholder: 'Final accounts settled…',
    remarksRequired: true,
  },
};

const SHARE: Partial<Record<ProjectStatus, StageRequirements>> = {
  nearly_complete: {
    title: 'Sold Out',
    meaning: 'Every share has a buyer. Bookings stop.',
    dateLabel: 'Last share sold on',
    fields: [],
    documents: [],
    remarksPlaceholder: 'Anything to note about the sale…',
  },
  handover_ongoing: {
    title: 'Deeds Registered',
    meaning: 'Every buyer has paid in full and every share deed is registered.',
    dateLabel: 'Last deed registered on',
    fields: [
      { key: 'deed_lawyer', label: 'Lawyer who prepared the deeds', type: 'text', column: 'performed_by' },
      { key: 'registry_office', label: 'Sub-registry office', type: 'text', placeholder: 'e.g. Sub-Registry Office, Keraniganj' },
    ],
    documents: [{ type: 'share_deed', label: 'Vetted share deed format' }],
    remarksPlaceholder: 'Mutation (namjari) for the buyers, originals handed over…',
  },
  closed: {
    title: 'Closed',
    meaning: 'Deeds are done and the accounts are settled.',
    dateLabel: 'Closed on',
    fields: [],
    documents: [],
    remarksPlaceholder: 'Final accounts settled…',
    remarksRequired: true,
  },
};

const FALLBACK = (target: ProjectStatus): StageRequirements => ({
  title: target,
  meaning: '',
  dateLabel: 'Reached on',
  fields: [],
  documents: [],
  remarksPlaceholder: '',
});

/** What reaching `target` records on a project of this type. */
export function stageRequirements(target: ProjectStatus, type: ProjectType): StageRequirements {
  const table = { built: BUILT, plot: PLOT, share: SHARE }[kindOf(type)];
  return table[target] ?? FALLBACK(target);
}
