import type { ProjectStatus, ProjectType } from '@/lib/db/types';

/**
 * What each project stage move asks for (client feedback 2026-10-11).
 *
 * Moving a project on records the stage being left: leaving planning asks
 * for what planning produced, leaving design asks for the drawings, starting
 * construction asks for the permit. The answers are stored on the status
 * event (`project_status_history.details`) and the files are filed as project
 * documents linked to that event, so the Timeline shows each step with its
 * paperwork.
 *
 * Key documents are compulsory (decision 2026-10-11): the move is refused
 * without them. Everything else is asked for and optional.
 */

export interface StageField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

export interface StageDocument {
  /** the project document type it is filed under */
  type: string;
  label: string;
  required?: boolean;
}

export interface StageRequirements {
  fields: StageField[];
  documents: StageDocument[];
}

type Kind = 'built' | 'plot' | 'share';
const kindOf = (t: ProjectType): Kind =>
  t === 'land_share' ? 'share' : t === 'plot_development' ? 'plot' : 'built';

const YES_NO = ['Yes', 'No'];
const NONE: StageRequirements = { fields: [], documents: [] };

const BUILT: Partial<Record<ProjectStatus, StageRequirements>> = {
  // leaving planning
  design: {
    fields: [
      { key: 'feasibility_done', label: 'Feasibility study done?', type: 'select', options: YES_NO, required: true },
      { key: 'budget_approved_by', label: 'Budget approved by', type: 'text', placeholder: 'e.g. Board meeting 12 Oct' },
      { key: 'planned_storeys', label: 'Planned storeys', type: 'text', placeholder: 'e.g. G+9, 1 basement' },
    ],
    documents: [
      { type: 'soil_test_report', label: 'Soil test report' },
      { type: 'site_survey', label: 'Site survey / digital survey' },
    ],
  },
  // leaving design
  approval: {
    fields: [
      { key: 'built_up_area', label: 'Total built-up area (sqft)', type: 'number', required: true },
      { key: 'unit_count', label: 'Number of units', type: 'number' },
    ],
    documents: [
      { type: 'architectural_plan', label: 'Architectural drawing set', required: true },
      { type: 'structural_drawing', label: 'Structural design' },
    ],
  },
  // leaving approval
  under_construction: {
    fields: [
      { key: 'approval_date', label: 'Approval date', type: 'text', placeholder: 'e.g. 05 Oct 2026', required: true },
      { key: 'contractor', label: 'Main contractor', type: 'text', placeholder: 'e.g. Nirman Construction Services' },
    ],
    documents: [
      { type: 'rajuk_approval', label: 'Building plan approval / permit', required: true },
      { type: 'environmental_clearance', label: 'Environmental clearance' },
      { type: 'fire_safety_certificate', label: 'Fire service NOC' },
    ],
  },
  nearly_complete: {
    fields: [
      { key: 'structure_done', label: 'Structure (casting) complete?', type: 'select', options: YES_NO, required: true },
    ],
    documents: [{ type: 'other', label: 'Snag / finishing list' }],
  },
  handover_ongoing: {
    fields: [
      { key: 'utilities_connected', label: 'Electricity, water and gas connected?', type: 'select', options: YES_NO, required: true },
    ],
    documents: [{ type: 'occupancy_certificate', label: 'Occupancy certificate', required: true }],
  },
  closed: {
    fields: [{ key: 'flat_owner_association', label: 'Flat owners’ association formed?', type: 'select', options: YES_NO }],
    documents: [],
  },
};

const PLOT: Partial<Record<ProjectStatus, StageRequirements>> = {
  design: {
    fields: [
      { key: 'feasibility_done', label: 'Feasibility study done?', type: 'select', options: YES_NO, required: true },
      { key: 'planned_plots', label: 'Planned number of plots', type: 'number' },
    ],
    documents: [{ type: 'site_survey', label: 'Site survey / digital survey' }],
  },
  approval: {
    fields: [{ key: 'road_area_pct', label: 'Roads & common area (%)', type: 'number', required: true }],
    documents: [{ type: 'layout_plan', label: 'Layout plan', required: true }],
  },
  under_construction: {
    fields: [{ key: 'approval_date', label: 'Subdivision approval date', type: 'date', required: true }],
    documents: [{ type: 'subdivision_approval', label: 'Subdivision / layout approval', required: true }],
  },
  handover_ongoing: {
    fields: [{ key: 'roads_done', label: 'Roads, drains and utilities finished?', type: 'select', options: YES_NO, required: true }],
    documents: [{ type: 'other', label: 'Plot demarcation sheet' }],
  },
};

const SHARE: Partial<Record<ProjectStatus, StageRequirements>> = {
  handover_ongoing: {
    fields: [{ key: 'deed_lawyer', label: 'Lawyer preparing the share deeds', type: 'text', required: true }],
    documents: [{ type: 'share_deed', label: 'Vetted share deed format', required: true }],
  },
};

export function stageRequirements(target: ProjectStatus, type: ProjectType): StageRequirements {
  const table = { built: BUILT, plot: PLOT, share: SHARE }[kindOf(type)];
  return table[target] ?? NONE;
}
