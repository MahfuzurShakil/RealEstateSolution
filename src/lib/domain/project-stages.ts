import type { ProjectStatus, ProjectType } from '@/lib/db/types';

/**
 * How a project moves on (PROJECT-STATUS-FLOW-PLAN.md, client 2026-10-17).
 *
 * A status is the phase the project is **in**. The button under it completes
 * that phase: "Mark Planning Complete" asks what planning produced, and the
 * project then moves into the next phase. Nothing is asked about the next
 * phase — it has not happened yet.
 *
 * The form is keyed by the phase being completed. Answers are stored on the
 * status event (`project_status_history.details`), papers are filed as project
 * documents linked to the event, and a field with `column` also fills the
 * event's own column so the Timeline shows it. Key papers are compulsory.
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
  /** the dialog title: "Planning Complete" */
  title: string;
  /** the button: "Mark Planning Complete" */
  button: string;
  /** one line on what completing this phase means */
  meaning: string;
  /** the label of the completion date */
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

const phase = (title: string, rest: Omit<StageRequirements, 'title' | 'button'> & { button?: string }): StageRequirements => ({
  title,
  button: rest.button ?? `Mark ${title}`,
  ...rest,
});

const BUILT: Partial<Record<ProjectStatus, StageRequirements>> = {
  planning: phase('Planning Complete', {
    meaning: 'The feasibility, budget and brief are settled. The project moves into Design.',
    dateLabel: 'Planning completed on',
    fields: [
      { key: 'feasibility_done', label: 'Feasibility study done?', type: 'select', options: YES_NO, required: true },
      { key: 'budget_approved_by', label: 'Budget approved by', type: 'text', placeholder: 'e.g. Board meeting 12 Oct', column: 'performed_by' },
      { key: 'planned_storeys', label: 'Planned storeys', type: 'text', placeholder: 'e.g. G+9, 1 basement' },
    ],
    documents: [
      { type: 'soil_test_report', label: 'Soil test report' },
      { type: 'site_survey', label: 'Site survey / digital survey' },
    ],
    remarksPlaceholder: 'Decisions taken in planning…',
  }),
  design: phase('Design Complete', {
    meaning: 'The drawings are finished and go to RAJUK / CDA. The project moves into Approval.',
    dateLabel: 'Design completed on',
    fields: [
      { key: 'architect', label: 'Architect / firm', type: 'text', placeholder: 'e.g. Volumezero Ltd.', column: 'performed_by' },
      { key: 'drawing_ref', label: 'Drawing set reference', type: 'text', placeholder: 'e.g. ARCH-2026-014', column: 'reference_no' },
      { key: 'built_up_area', label: 'Total built-up area (sqft)', type: 'number', required: true },
      { key: 'unit_count', label: 'Number of units', type: 'number' },
    ],
    documents: [
      { type: 'architectural_plan', label: 'Architectural drawing set', required: true },
      { type: 'structural_drawing', label: 'Structural design' },
    ],
    remarksPlaceholder: 'Unit mix, anything changed from the plan…',
  }),
  approval: phase('Approval Complete', {
    meaning: 'The building plan is approved and the permit issued. The project moves into Construction.',
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
  }),
  under_construction: phase('Construction Complete', {
    meaning: 'The structure is finished — roof casting done. Finishing work follows.',
    dateLabel: 'Roof casting completed on',
    fields: [
      { key: 'contractor', label: 'Main contractor', type: 'text', column: 'performed_by' },
    ],
    documents: [{ type: 'other', label: 'Snag / finishing list' }],
    remarksPlaceholder: 'What is left: lifts, finishing, utility connections…',
  }),
  nearly_complete: phase('Finishing Complete', {
    meaning: 'The building is finished and certified. Handover to buyers begins.',
    dateLabel: 'Occupancy certificate received on',
    fields: [
      { key: 'oc_no', label: 'Occupancy certificate no.', type: 'text', placeholder: 'e.g. OC-2026-021', required: true, column: 'reference_no' },
      { key: 'utilities_connected', label: 'Electricity, water and gas connected?', type: 'select', options: YES_NO, required: true },
    ],
    documents: [{ type: 'occupancy_certificate', label: 'Occupancy certificate', required: true }],
    remarksPlaceholder: 'Anything buyers should know before taking keys…',
  }),
  handover_ongoing: phase('Handover Complete', {
    button: 'Close Project',
    meaning: 'Every unit is handed over and the accounts are settled. The project closes.',
    dateLabel: 'Last unit handed over on',
    fields: [{ key: 'flat_owner_association', label: 'Flat owners’ association formed?', type: 'select', options: YES_NO }],
    documents: [],
    remarksPlaceholder: 'Final accounts settled, warranty period…',
    remarksRequired: true,
  }),
};

const PLOT: Partial<Record<ProjectStatus, StageRequirements>> = {
  planning: phase('Planning Complete', {
    meaning: 'The feasibility is done. The project moves into layout design.',
    dateLabel: 'Planning completed on',
    fields: [
      { key: 'feasibility_done', label: 'Feasibility study done?', type: 'select', options: YES_NO, required: true },
      { key: 'planned_plots', label: 'Planned number of plots', type: 'number' },
    ],
    documents: [{ type: 'site_survey', label: 'Site survey / digital survey' }],
    remarksPlaceholder: 'Decisions taken in planning…',
  }),
  design: phase('Layout Design Complete', {
    meaning: 'The layout is drawn and goes for subdivision approval.',
    dateLabel: 'Layout finished on',
    fields: [
      { key: 'planner', label: 'Planner / surveyor', type: 'text', column: 'performed_by' },
      { key: 'road_area_pct', label: 'Roads & common area (%)', type: 'number', required: true },
    ],
    documents: [{ type: 'layout_plan', label: 'Layout plan', required: true }],
    remarksPlaceholder: 'Plot sizes, road widths…',
  }),
  approval: phase('Subdivision Approval Complete', {
    meaning: 'The layout is approved. Development on the ground begins.',
    dateLabel: 'Layout approved on',
    fields: [
      { key: 'authority', label: 'Authority', type: 'text', placeholder: 'e.g. RAJUK', column: 'performed_by' },
      { key: 'approval_no', label: 'Approval no.', type: 'text', required: true, column: 'reference_no' },
    ],
    documents: [{ type: 'subdivision_approval', label: 'Subdivision / layout approval', required: true }],
    remarksPlaceholder: 'Conditions attached to the approval…',
  }),
  under_construction: phase('Development Complete', {
    meaning: 'Filling, roads, drains and utilities are finished.',
    dateLabel: 'Development finished on',
    fields: [
      { key: 'roads_done', label: 'Roads, drains and utilities finished?', type: 'select', options: YES_NO, required: true },
      { key: 'contractor', label: 'Contractor', type: 'text', column: 'performed_by' },
    ],
    documents: [],
    remarksPlaceholder: 'Anything left on site…',
  }),
  nearly_complete: phase('Final Works Complete', {
    meaning: 'Plots are marked on the ground. Possession to buyers begins.',
    dateLabel: 'Plots demarcated on',
    fields: [],
    documents: [{ type: 'other', label: 'Plot demarcation sheet' }],
    remarksPlaceholder: 'Pillars set, measurement done…',
  }),
  handover_ongoing: phase('Possession Complete', {
    button: 'Close Project',
    meaning: 'Every plot is handed over and the accounts are settled. The project closes.',
    dateLabel: 'Last plot handed over on',
    fields: [],
    documents: [],
    remarksPlaceholder: 'Final accounts settled…',
    remarksRequired: true,
  }),
};

const SHARE: Partial<Record<ProjectStatus, StageRequirements>> = {
  planning: phase('Sold Out', {
    meaning: 'Every share has a buyer. Bookings stop and deed registration begins.',
    dateLabel: 'Last share sold on',
    fields: [],
    documents: [],
    remarksPlaceholder: 'Anything to note about the sale…',
  }),
  nearly_complete: phase('Deeds Registered', {
    meaning: 'Every buyer has paid in full and every share deed is registered.',
    dateLabel: 'Last deed registered on',
    fields: [
      { key: 'deed_lawyer', label: 'Lawyer who prepared the deeds', type: 'text', column: 'performed_by' },
      { key: 'registry_office', label: 'Sub-registry office', type: 'text', placeholder: 'e.g. Sub-Registry Office, Keraniganj' },
    ],
    documents: [{ type: 'share_deed', label: 'Vetted share deed format' }],
    remarksPlaceholder: 'Mutation (namjari) for the buyers, originals handed over…',
  }),
  handover_ongoing: phase('Project Closed', {
    button: 'Close Project',
    meaning: 'Deeds are done and the accounts are settled.',
    dateLabel: 'Closed on',
    fields: [],
    documents: [],
    remarksPlaceholder: 'Final accounts settled…',
    remarksRequired: true,
  }),
};

/**
 * What completing the phase `current` records on a project of this type, or
 * null when there is nothing left to complete (closed).
 */
export function stageRequirements(current: ProjectStatus, type: ProjectType): StageRequirements | null {
  const table = { built: BUILT, plot: PLOT, share: SHARE }[kindOf(type)];
  return table[current] ?? null;
}
