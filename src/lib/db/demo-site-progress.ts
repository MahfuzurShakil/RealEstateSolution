import type { MaterialRequestStatus } from './types';

/**
 * Bangladesh-context demo dataset for Module 5 (Site Progress Update).
 *
 * Everything time-dependent is an offset in days from the day the demo is
 * loaded, never a fixed date — the whole point of the planned-vs-actual
 * comparison is where *today* falls between the planned start and end, and a
 * hard-coded 2026 date would make the Delay % nonsense a month later.
 *
 * The set is chosen so no screen opens empty and every state is reachable:
 *
 *   work item status  — not_started, in_progress, completed
 *   schedule state    — on track, behind schedule, ahead of plan, no plan dates
 *   request lifecycle — pending, approved, rejected, ordered, fulfilled
 *   staleness         — one active site deliberately past the 14-day threshold
 *
 * Towers not listed here keep the default WBS created with them (Section 6.2)
 * and no readings, which is exactly how a project still in design looks.
 */

export interface DemoReading {
  /** days before today; 0 is today */
  days_ago: number;
  progress_pct: number;
  remarks?: string;
  /** [lat, lng] — a site engineer standing on the plot */
  gps?: [number, number];
  /** attach a public site photo to this reading (Sections 6.4 / 6.7) */
  photo?: boolean;
  /** demo user key of the site engineer who reported it */
  by?: string;
}

export interface DemoWorkItem {
  /** matches a default WBS line, or adds a new one when it does not */
  name: string;
  weight_pct: number;
  /** offsets from today; null on both = deliberately no plan dates */
  planned_start_in_days: number | null;
  planned_end_in_days: number | null;
  readings?: DemoReading[];
}

export interface DemoTowerProgress {
  project_name: string;
  tower_name: string;
  items: DemoWorkItem[];
}

export const DEMO_TOWER_PROGRESS: DemoTowerProgress[] = [
  /* ---------------------------------------------------------------- *
   * Nokshi Green Residence — Tower A: the workhorse of the demo.
   * Structure is running behind, the services have not started, and
   * External Works deliberately has no plan dates at all.
   * ---------------------------------------------------------------- */
  {
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower A',
    items: [
      {
        name: 'Foundation',
        weight_pct: 12,
        planned_start_in_days: -400,
        planned_end_in_days: -300,
        readings: [
          { days_ago: 380, progress_pct: 25, remarks: 'Piling started — 18 of 64 piles cast.', by: 'jahangir' },
          { days_ago: 350, progress_pct: 60, remarks: 'Piling complete, pile cap excavation on.', by: 'jahangir' },
          {
            days_ago: 305,
            progress_pct: 100,
            remarks: 'Mat foundation cast and cured. Cube test results within limit.',
            gps: [23.8103, 90.4125],
            by: 'jahangir',
          },
        ],
      },
      {
        name: 'Ground Floor',
        weight_pct: 8,
        planned_start_in_days: -300,
        planned_end_in_days: -240,
        readings: [
          { days_ago: 280, progress_pct: 45, remarks: 'Column casting up to ground floor level.', by: 'jahangir' },
          { days_ago: 245, progress_pct: 100, remarks: 'Ground floor slab cast — parking level ready.', by: 'jahangir' },
        ],
      },
      {
        name: 'Superstructure',
        weight_pct: 30,
        planned_start_in_days: -240,
        planned_end_in_days: 120,
        readings: [
          { days_ago: 200, progress_pct: 12, remarks: '2nd floor slab cast.', by: 'jahangir' },
          { days_ago: 150, progress_pct: 28, remarks: '4th floor slab cast. Rod supply was short for a week.', by: 'jahangir' },
          {
            days_ago: 90,
            progress_pct: 42,
            remarks: '6th floor slab cast. Monsoon slowed the shuttering work.',
            gps: [23.8104, 90.4127],
            photo: true,
            by: 'jahangir',
          },
          {
            /*
             * Deliberately older than STALE_AFTER_DAYS (14): this is the only
             * project actually under construction, so it is the only one that
             * can demonstrate the "Gone quiet" badge — and a live site whose
             * numbers look fine but that nobody has reported on for three
             * weeks is exactly the case the badge exists for.
             */
            days_ago: 19,
            progress_pct: 55,
            remarks: '8th floor column rod binding done, slab shuttering in progress.',
            gps: [23.8104, 90.4126],
            photo: true,
            by: 'jahangir',
          },
        ],
      },
      { name: 'Roof', weight_pct: 6, planned_start_in_days: 120, planned_end_in_days: 180 },
      { name: 'Electrical', weight_pct: 10, planned_start_in_days: 150, planned_end_in_days: 300 },
      { name: 'Plumbing', weight_pct: 10, planned_start_in_days: 150, planned_end_in_days: 300 },
      { name: 'Finishing', weight_pct: 18, planned_start_in_days: 300, planned_end_in_days: 450 },
      // no plan dates on purpose — shows the "No Plan Dates" state
      { name: 'External Works', weight_pct: 6, planned_start_in_days: null, planned_end_in_days: null },
    ],
  },

  /* ---------------------------------------------------------------- *
   * Tower B — the same project running ahead of plan, so the two towers
   * of one project disagree and the roll-up has something to average.
   * ---------------------------------------------------------------- */
  {
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower B',
    items: [
      {
        name: 'Foundation',
        weight_pct: 12,
        planned_start_in_days: -360,
        planned_end_in_days: -280,
        readings: [
          { days_ago: 340, progress_pct: 55, remarks: 'Piling done, pile caps in progress.', by: 'salma' },
          { days_ago: 290, progress_pct: 100, remarks: 'Foundation complete ahead of schedule.', by: 'salma' },
        ],
      },
      {
        name: 'Ground Floor',
        weight_pct: 8,
        planned_start_in_days: -280,
        planned_end_in_days: -220,
        readings: [{ days_ago: 235, progress_pct: 100, remarks: 'Ground floor slab cast.', by: 'salma' }],
      },
      {
        name: 'Superstructure',
        weight_pct: 30,
        planned_start_in_days: -180,
        planned_end_in_days: 240,
        readings: [
          { days_ago: 120, progress_pct: 30, remarks: '3rd floor slab cast.', by: 'salma' },
          {
            days_ago: 20,
            progress_pct: 60,
            remarks: '6th floor slab cast — contractor added a second shuttering crew.',
            gps: [23.8098, 90.4131],
            photo: true,
            by: 'salma',
          },
        ],
      },
      { name: 'Roof', weight_pct: 6, planned_start_in_days: 240, planned_end_in_days: 300 },
      { name: 'Electrical', weight_pct: 10, planned_start_in_days: 260, planned_end_in_days: 400 },
      { name: 'Plumbing', weight_pct: 10, planned_start_in_days: 260, planned_end_in_days: 400 },
      { name: 'Finishing', weight_pct: 18, planned_start_in_days: 400, planned_end_in_days: 520 },
      { name: 'External Works', weight_pct: 6, planned_start_in_days: 500, planned_end_in_days: 560 },
    ],
  },

  /* ---------------------------------------------------------------- *
   * Nokshi Dhanmondi Court — finished. Every item completed, so the
   * tower reads 100% and the "Completed" badge is visible somewhere.
   * ---------------------------------------------------------------- */
  {
    project_name: 'Nokshi Dhanmondi Court',
    tower_name: 'Tower A',
    items: [
      {
        name: 'Foundation',
        weight_pct: 12,
        planned_start_in_days: -880,
        planned_end_in_days: -790,
        readings: [{ days_ago: 795, progress_pct: 100, remarks: 'Foundation complete.', by: 'salma' }],
      },
      {
        name: 'Ground Floor',
        weight_pct: 8,
        planned_start_in_days: -790,
        planned_end_in_days: -730,
        readings: [{ days_ago: 735, progress_pct: 100, remarks: 'Ground floor cast.', by: 'salma' }],
      },
      {
        name: 'Superstructure',
        weight_pct: 30,
        planned_start_in_days: -730,
        planned_end_in_days: -420,
        readings: [
          { days_ago: 560, progress_pct: 55, remarks: '5th floor slab cast.', by: 'salma' },
          { days_ago: 425, progress_pct: 100, remarks: 'All eight floors cast.', by: 'salma' },
        ],
      },
      {
        name: 'Roof',
        weight_pct: 6,
        planned_start_in_days: -420,
        planned_end_in_days: -370,
        readings: [{ days_ago: 372, progress_pct: 100, remarks: 'Roof slab and parapet done.', by: 'salma' }],
      },
      {
        name: 'Electrical',
        weight_pct: 10,
        planned_start_in_days: -400,
        planned_end_in_days: -200,
        readings: [{ days_ago: 195, progress_pct: 100, remarks: 'Substation energised, all flats wired.', by: 'jahangir' }],
      },
      {
        name: 'Plumbing',
        weight_pct: 10,
        planned_start_in_days: -400,
        planned_end_in_days: -200,
        readings: [{ days_ago: 190, progress_pct: 100, remarks: 'WASA connection live, overhead tank commissioned.', by: 'jahangir' }],
      },
      {
        name: 'Finishing',
        weight_pct: 18,
        planned_start_in_days: -260,
        planned_end_in_days: -90,
        readings: [
          { days_ago: 150, progress_pct: 70, remarks: 'Tiles and doors done, painting on.', by: 'jahangir' },
          {
            days_ago: 85,
            progress_pct: 100,
            remarks: 'Finishing complete — snag list cleared for handover.',
            photo: true,
            by: 'jahangir',
          },
        ],
      },
      {
        name: 'External Works',
        weight_pct: 6,
        planned_start_in_days: -120,
        planned_end_in_days: -40,
        readings: [{ days_ago: 45, progress_pct: 100, remarks: 'Driveway, boundary wall and landscaping done.', by: 'jahangir' }],
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * Nokshi Agrabad Trade Centre — barely begun, one early reading, so
   * the "in progress but nothing else" state is covered too.
   * ---------------------------------------------------------------- */
  {
    project_name: 'Nokshi Agrabad Trade Centre',
    tower_name: 'Block 1',
    items: [
      {
        name: 'Foundation',
        weight_pct: 15,
        planned_start_in_days: -20,
        planned_end_in_days: 150,
        readings: [
          {
            days_ago: 4,
            progress_pct: 15,
            remarks: 'Site cleared and test piles cast. Awaiting the load test report.',
            gps: [22.3269, 91.8123],
            by: 'salma',
          },
        ],
      },
      { name: 'Ground Floor', weight_pct: 8, planned_start_in_days: 150, planned_end_in_days: 210 },
      { name: 'Superstructure', weight_pct: 32, planned_start_in_days: 210, planned_end_in_days: 560 },
      { name: 'Roof', weight_pct: 5, planned_start_in_days: 560, planned_end_in_days: 600 },
      { name: 'Electrical', weight_pct: 10, planned_start_in_days: 580, planned_end_in_days: 720 },
      { name: 'Plumbing', weight_pct: 10, planned_start_in_days: 580, planned_end_in_days: 720 },
      { name: 'Finishing', weight_pct: 15, planned_start_in_days: 700, planned_end_in_days: 820 },
      { name: 'External Works', weight_pct: 5, planned_start_in_days: 800, planned_end_in_days: 860 },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Material requests (Sections 6.5 / 6.6)
 * ------------------------------------------------------------------ */

export interface DemoMaterialRequest {
  /** stable handle so the Module 6 demo can hang a purchase order off it */
  key: string;
  project_name: string;
  /** omit for a site-wide request — Section 6.5 makes both nullable */
  tower_name?: string;
  work_item_name?: string;
  requested_by_key: string;
  days_ago: number;
  notes?: string;
  status: MaterialRequestStatus;
  decision_note?: string;
  items: Array<{
    item_name: string;
    unit: string;
    quantity_requested: number;
    /** only meaningful once approved; blank means "all of it" */
    quantity_approved?: number;
  }>;
}

export const DEMO_MATERIAL_REQUESTS: DemoMaterialRequest[] = [
  {
    key: 'slab-cement',
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower A',
    work_item_name: 'Superstructure',
    requested_by_key: 'jahangir',
    days_ago: 2,
    status: 'pending',
    notes: '8th floor slab casting is on Thursday. Stock will not last past Wednesday.',
    items: [
      { item_name: 'Cement (Shah Special)', unit: 'bag', quantity_requested: 450 },
      { item_name: 'MS Rod 16mm (BSRM)', unit: 'ton', quantity_requested: 12 },
      { item_name: 'Sylhet Sand', unit: 'cft', quantity_requested: 1800 },
      { item_name: 'Stone Chips 3/4"', unit: 'cft', quantity_requested: 1200 },
    ],
  },
  {
    key: 'tower-b-bricks',
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower B',
    work_item_name: 'Superstructure',
    requested_by_key: 'salma',
    days_ago: 6,
    status: 'pending',
    notes: 'Partition wall work starting on the 4th and 5th floors.',
    items: [
      { item_name: 'First Class Bricks', unit: 'piece', quantity_requested: 40000 },
      { item_name: 'Cement (Fresh)', unit: 'bag', quantity_requested: 220 },
    ],
  },
  {
    key: 'shuttering-ply',
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower A',
    work_item_name: 'Superstructure',
    requested_by_key: 'jahangir',
    days_ago: 24,
    status: 'approved',
    notes: 'Shuttering ply for the 7th and 8th floors.',
    decision_note: 'Approved, but the ply count is trimmed — 60 sheets are still lying in the Tower B store.',
    items: [
      { item_name: 'Shuttering Ply 12mm', unit: 'piece', quantity_requested: 200, quantity_approved: 140 },
      { item_name: 'GI Wire 20 SWG', unit: 'kg', quantity_requested: 150 },
      { item_name: 'Shuttering Oil', unit: 'litre', quantity_requested: 80, quantity_approved: 80 },
    ],
  },
  {
    key: 'uttara-site-setup',
    project_name: 'Nokshi Uttara Heights',
    requested_by_key: 'salma',
    days_ago: 15,
    status: 'rejected',
    notes: 'Site office setup — furniture and safety gear before mobilisation.',
    decision_note:
      'Rejected for now — RAJUK approval is still pending, so the site cannot be mobilised. Raise it again once the design stage clears.',
    items: [
      { item_name: 'Safety Helmet', unit: 'piece', quantity_requested: 40 },
      { item_name: 'Site Office Container', unit: 'piece', quantity_requested: 2 },
    ],
  },
  {
    key: 'electrical-conduit',
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower A',
    work_item_name: 'Electrical',
    requested_by_key: 'jahangir',
    days_ago: 40,
    status: 'ordered',
    notes: 'Conduit and boxes to be cast into the slabs — needed before the next pour.',
    decision_note:
      'Approved in full. Bijoy Electric (Nawabpur) quoted the best rate — raising the order against them.',
    items: [
      { item_name: 'PVC Conduit Pipe 25mm', unit: 'bundle', quantity_requested: 120 },
      { item_name: 'Concealed Junction Box', unit: 'piece', quantity_requested: 600 },
    ],
  },
  {
    key: 'dhanmondi-paint',
    project_name: 'Nokshi Dhanmondi Court',
    tower_name: 'Tower A',
    work_item_name: 'Finishing',
    requested_by_key: 'jahangir',
    days_ago: 110,
    status: 'fulfilled',
    notes: 'Final coat before the snag inspection.',
    decision_note:
      'Approved in full for the final coat. Ordering from the Dhanmondi Berger dealer on the standing rate.',
    items: [
      { item_name: 'Berger Weathercoat (Exterior)', unit: 'litre', quantity_requested: 900 },
      { item_name: 'Wall Putty', unit: 'kg', quantity_requested: 400 },
      { item_name: 'Paint Roller Set', unit: 'piece', quantity_requested: 30 },
    ],
  },
];
