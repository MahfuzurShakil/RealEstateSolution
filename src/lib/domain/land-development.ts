/**
 * What each kind of land development work is measured in (2026-10-21).
 *
 * One quantity-and-unit pair suited none of them: earth filling is planned as
 * an area and a depth, a boundary wall as a length and a height, a road as a
 * length and a width, and a utility connection is not a quantity at all. Each
 * kind declares its own fields; the activity's `planned_qty` and `unit` — what
 * progress is reported against — are worked out from them, so the progress
 * form still asks "how much of it is done" in the right unit.
 *
 * Keyed on the `lookup_values` label (category `land_development_activity`).
 * A kind added in Master Data that is not listed here falls back to a plain
 * quantity and unit, which is what every activity had before.
 */

export interface WorkSpecField {
  key: string;
  label: string;
  type: 'number' | 'select' | 'text';
  /** shown after the number, and in the summary line */
  unit?: string;
  placeholder?: string;
  options?: string[];
  hint?: string;
}

export interface WorkKind {
  fields: WorkSpecField[];
  /** one line on what to measure */
  hint: string;
  /** the planned quantity progress is reported against; null when not measured */
  quantity?: (specs: WorkSpecs) => { qty: number; unit: string } | null;
}

export type WorkSpecs = Record<string, string | number | null>;

const num = (v: WorkSpecs[string]) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const area = (s: WorkSpecs) => (num(s.area_sft) ? { qty: num(s.area_sft), unit: 'sft' } : null);
const length = (s: WorkSpecs) => (num(s.length_rft) ? { qty: num(s.length_rft), unit: 'rft' } : null);

const AREA: WorkSpecField = {
  key: 'area_sft',
  label: 'Area',
  type: 'number',
  unit: 'sft',
  placeholder: 'e.g. 7200',
  hint: '1 katha = 720 sft · 1 decimal = 435.6 sft',
};
const LENGTH: WorkSpecField = { key: 'length_rft', label: 'Length', type: 'number', unit: 'rft', placeholder: 'e.g. 420' };
const HEIGHT: WorkSpecField = { key: 'height_ft', label: 'Height', type: 'number', unit: 'ft', placeholder: 'e.g. 8' };

export const WORK_KINDS: Record<string, WorkKind> = {
  'Site clearing': {
    hint: 'How much ground is cleared, and what is on it.',
    fields: [
      AREA,
      { key: 'clearing', label: 'What is on site', type: 'select', options: ['Bushes & grass', 'Trees', 'Old structure', 'Debris & waste', 'Mixed'] },
    ],
    quantity: area,
  },
  'Earth filling': {
    hint: 'Area times the depth to fill gives the volume to bring in.',
    fields: [
      AREA,
      { key: 'depth_ft', label: 'Fill depth', type: 'number', unit: 'ft', placeholder: 'e.g. 4' },
      { key: 'material', label: 'Fill material', type: 'select', options: ['Sand', 'Earth', 'Sand & earth mixed'] },
    ],
    quantity: (s) =>
      num(s.area_sft) && num(s.depth_ft) ? { qty: Math.round(num(s.area_sft) * num(s.depth_ft)), unit: 'cft' } : null,
  },
  'Soil improvement': {
    hint: 'The area treated and how.',
    fields: [
      AREA,
      { key: 'method', label: 'Method', type: 'select', options: ['Sand compaction', 'Lime stabilisation', 'Pre-loading', 'Sand piles', 'Other'] },
    ],
    quantity: area,
  },
  'Boundary wall': {
    hint: 'Measured along the boundary; height sets the cost per foot.',
    fields: [
      LENGTH,
      HEIGHT,
      { key: 'wall_type', label: 'Wall type', type: 'select', options: ['5" brick', '10" brick', 'RCC precast panel', 'Brick with grill', 'Fence'] },
    ],
    quantity: length,
  },
  'Retaining wall': {
    hint: 'Length along the cut or the water edge, and the retained height.',
    fields: [
      LENGTH,
      HEIGHT,
      { key: 'material', label: 'Material', type: 'select', options: ['RCC', 'Brick', 'Stone', 'Sheet pile'] },
    ],
    quantity: length,
  },
  'Internal roads': {
    hint: 'Length times width gives the area to pave.',
    fields: [
      LENGTH,
      { key: 'width_ft', label: 'Width', type: 'number', unit: 'ft', placeholder: 'e.g. 20' },
      { key: 'surface', label: 'Surface', type: 'select', options: ['RCC', 'Bituminous', 'Herringbone brick', 'Brick soling'] },
    ],
    quantity: (s) =>
      num(s.length_rft) && num(s.width_ft) ? { qty: Math.round(num(s.length_rft) * num(s.width_ft)), unit: 'sft' } : null,
  },
  Drainage: {
    hint: 'Total drain length and its type.',
    fields: [
      LENGTH,
      { key: 'drain_type', label: 'Drain type', type: 'select', options: ['Open brick drain', 'RCC covered drain', 'Pipe drain'] },
    ],
    quantity: length,
  },
  'Utility connections': {
    hint: 'One activity per service — progress is the application moving through the authority.',
    fields: [
      { key: 'service', label: 'Service', type: 'select', options: ['Electricity', 'Water (WASA)', 'Gas', 'Sewer', 'Internet'] },
      { key: 'authority', label: 'Authority', type: 'text', placeholder: 'e.g. DESCO, DWASA, Titas' },
      { key: 'application_no', label: 'Application no.', type: 'text', placeholder: 'e.g. DESCO/NC/2026/1182' },
    ],
  },
  'Gate & guard post': {
    hint: 'How many gates and guard rooms.',
    fields: [
      { key: 'gates', label: 'Gates', type: 'number', unit: 'nos', placeholder: 'e.g. 1' },
      { key: 'guard_rooms', label: 'Guard rooms', type: 'number', unit: 'nos', placeholder: 'e.g. 1' },
    ],
    quantity: (s) => {
      const n = num(s.gates) + num(s.guard_rooms);
      return n ? { qty: n, unit: 'nos' } : null;
    },
  },
  'Security arrangement': {
    hint: 'Guards on the plot until construction takes over the site.',
    fields: [
      { key: 'guards', label: 'Guards', type: 'number', unit: 'persons', placeholder: 'e.g. 2' },
      { key: 'months', label: 'For', type: 'number', unit: 'months', placeholder: 'e.g. 6' },
    ],
    quantity: (s) => (num(s.months) ? { qty: num(s.months), unit: 'months' } : null),
  },
  Landscaping: {
    hint: 'The area planted, and roughly how many trees.',
    fields: [AREA, { key: 'trees', label: 'Trees', type: 'number', unit: 'nos', placeholder: 'e.g. 40' }],
    quantity: area,
  },
};

/** The fields for a kind, or null for one that only needs a plain quantity. */
export function workKind(type: string): WorkKind | null {
  return WORK_KINDS[type] ?? null;
}

/** "7,200 sft · 4 ft · Sand" — the specs as one line for the activity card. */
export function workSpecSummary(type: string, specs: WorkSpecs | null | undefined): string | null {
  const kind = workKind(type);
  if (!kind || !specs) return null;
  const parts = kind.fields
    .map((f) => {
      const v = specs[f.key];
      if (v == null || v === '') return null;
      if (f.type === 'number') {
        const n = Number(v);
        if (!(n > 0)) return null;
        return `${f.key === 'area_sft' || f.key === 'length_rft' ? '' : `${f.label} `}${n.toLocaleString('en-BD')}${f.unit ? ` ${f.unit}` : ''}`;
      }
      return String(v);
    })
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * The measurements an activity recorded before kinds had their own fields
 * can be recovered from: an area kind's sft is its area, a length kind's rft
 * its length. Anything else (a fill in cft) cannot be split back into area
 * and depth, and is left for the user to fill in.
 */
export function specsFromQuantity(
  type: string,
  qty: number | null | undefined,
  unit: string | null | undefined,
): WorkSpecs {
  const kind = workKind(type);
  if (!kind || !(Number(qty) > 0)) return {};
  const keys = new Set(kind.fields.map((f) => f.key));
  if (unit === 'sft' && keys.has('area_sft')) return { area_sft: Number(qty) };
  if (unit === 'rft' && keys.has('length_rft')) return { length_rft: Number(qty) };
  return {};
}
