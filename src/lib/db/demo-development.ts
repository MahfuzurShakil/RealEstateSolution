import type { DevelopmentActivityStatus } from './types';

/**
 * Batch L6 demo data — land development (BRD section 11).
 *
 * Two plots, deliberately at opposite ends. Agrabad is the plot still being
 * worked on — demolition and fill, a boundary wall and drainage, half of it
 * unfinished — so gate G3 has a real reason to refuse a project on it. It is a
 * JV-signed plot because L7 allows development only on land the company holds. Uttara is the ready
 * plot, marked as needing no development at all, which is the other half of
 * DEV-004 and the reason that flag exists.
 */

export interface DemoDevelopmentActivity {
  land: string;
  activity_type: string;
  contractor?: string;
  unit?: string;
  planned_qty?: number;
  budget_amount: number;
  start_date?: string;
  target_date?: string;
  status: DevelopmentActivityStatus;
  notes?: string;
  /** progress reports, oldest first; each states running totals */
  progress?: Array<{
    progress_date: string;
    qty_done?: number;
    pct_complete: number;
    amount_incurred?: number;
    remarks?: string;
  }>;
}

/** Lands that need no development at all (BRD DEV-004). */
export const DEMO_NO_DEVELOPMENT_LANDS = [
  'Uttara Sector 13 residential plot',
  'Bashundhara Block K corner plot',
  // serviced from the day it was signed, so it goes straight to Ready for Project
  'Bashundhara Block J ready plot',
];

export const DEMO_DEVELOPMENT: DemoDevelopmentActivity[] = [
  {
    land: 'Chattogram Agrabad commercial plot',
    activity_type: 'Site clearing',
    contractor: 'Nirman Construction Services',
    unit: 'sft',
    planned_qty: 6500,
    budget_amount: 180_000,
    start_date: '2026-07-05',
    target_date: '2026-07-20',
    status: 'completed',
    notes: 'Scrub and two derelict sheds. Tenants had already left.',
    progress: [
      {
        progress_date: '2026-07-12',
        qty_done: 4000,
        pct_complete: 60,
        amount_incurred: 110_000,
        remarks: 'Sheds down, debris being carted out.',
      },
      {
        progress_date: '2026-07-19',
        qty_done: 6500,
        pct_complete: 100,
        amount_incurred: 176_500,
        remarks: 'Site clear. Came in slightly under budget.',
      },
    ],
  },
  {
    land: 'Chattogram Agrabad commercial plot',
    activity_type: 'Earth filling',
    contractor: 'Nirman Construction Services',
    unit: 'cft',
    planned_qty: 58_500,
    budget_amount: 2_400_000,
    start_date: '2026-07-22',
    target_date: '2026-09-30',
    status: 'in_progress',
    notes: '4 ft across 9 katha. Sand by barge from the Dhaleshwari.',
    progress: [
      {
        progress_date: '2026-08-10',
        qty_done: 18_000,
        pct_complete: 31,
        amount_incurred: 760_000,
        remarks: 'Two barges landed. Monsoon slowed the carting.',
      },
      {
        progress_date: '2026-09-06',
        qty_done: 33_000,
        pct_complete: 56,
        amount_incurred: 1_395_000,
        remarks: 'Rain stopped work for four days. Compaction starts next week.',
      },
    ],
  },
  {
    land: 'Chattogram Agrabad commercial plot',
    activity_type: 'Boundary wall',
    contractor: 'Nirman Construction Services',
    unit: 'rft',
    planned_qty: 340,
    budget_amount: 850_000,
    target_date: '2026-11-15',
    status: 'planned',
    notes: '5 ft brick wall with a 3 ft parapet. Cannot start before the fill settles.',
  },
  {
    land: 'Chattogram Agrabad commercial plot',
    activity_type: 'Drainage',
    unit: 'rft',
    planned_qty: 220,
    budget_amount: 460_000,
    status: 'on_hold',
    notes:
      'Held pending the WASA alignment — the municipal drain on this lane is being re-cut and the levels would have to be redone.',
  },

  /*
   * Ashulia is the plot still being worked on, and the only demo land whose
   * own development sets its status: filling and the wall are unfinished, so
   * the pipeline holds it at Under Development.
   */
  {
    land: 'Ashulia Zirabo industrial plot',
    activity_type: 'Site clearing',
    contractor: 'Nirman Construction Services',
    unit: 'sft',
    planned_qty: 21000,
    budget_amount: 260000,
    start_date: '2026-05-28',
    target_date: '2026-06-10',
    status: 'completed',
    progress: [
      {
        progress_date: '2026-06-08',
        qty_done: 21000,
        pct_complete: 100,
        amount_incurred: 248000,
        remarks: 'Crop stubble and two sheds cleared.',
      },
    ],
  },
  {
    land: 'Ashulia Zirabo industrial plot',
    activity_type: 'Earth filling',
    contractor: 'Nirman Construction Services',
    unit: 'cft',
    planned_qty: 96000,
    budget_amount: 3800000,
    start_date: '2026-06-15',
    target_date: '2026-10-30',
    status: 'in_progress',
    notes: 'Five feet across three bigha, dredger fill from the Turag.',
    progress: [
      { progress_date: '2026-07-20', qty_done: 28000, pct_complete: 29, amount_incurred: 1120000 },
      {
        progress_date: '2026-09-05',
        qty_done: 51000,
        pct_complete: 53,
        amount_incurred: 2050000,
        remarks: 'Monsoon slowed the barges; on track for the end of Kartik.',
      },
    ],
  },
  {
    land: 'Ashulia Zirabo industrial plot',
    activity_type: 'Boundary wall',
    unit: 'rft',
    planned_qty: 620,
    budget_amount: 1450000,
    target_date: '2026-12-15',
    status: 'planned',
    notes: 'Cannot start before the fill settles.',
  },
];
