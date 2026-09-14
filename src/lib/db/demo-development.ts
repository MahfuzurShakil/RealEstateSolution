import type { DevelopmentActivityStatus } from './types';

/**
 * Batch L6 demo data — land development (BRD section 11).
 *
 * Two plots, deliberately at opposite ends. Narayanganj is the lowland case:
 * four feet of fill, a boundary wall and drainage, half of it unfinished — so
 * gate G3 has a real reason to refuse a project on it. Uttara is the ready
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
];

export const DEMO_DEVELOPMENT: DemoDevelopmentActivity[] = [
  {
    land: 'Narayanganj Fatullah plot',
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
    land: 'Narayanganj Fatullah plot',
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
    land: 'Narayanganj Fatullah plot',
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
    land: 'Narayanganj Fatullah plot',
    activity_type: 'Drainage',
    unit: 'rft',
    planned_qty: 220,
    budget_amount: 460_000,
    status: 'on_hold',
    notes:
      'Held pending the WASA alignment — the municipal drain on this lane is being re-cut and the levels would have to be redone.',
  },
];
