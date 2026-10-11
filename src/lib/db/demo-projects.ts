import type { DemoDocument } from './demo-data';
import type {
  ConstructionAfterSale,
  ProjectSalesStatus,
  ProjectStatus,
  ProjectType,
  TowerStatus,
  UnitStatus,
} from './types';

export interface DemoProjectEvent {
  to_status: ProjectStatus;
  event_date: string;
  performed_by?: string;
  reference_no?: string;
  remarks?: string;
}

/**
 * Bangladesh-context demo dataset for Module 2, so the project screens open
 * with something realistic instead of empty lists.
 *
 * The set is deliberately varied: several pipeline statuses, all three project
 * types, single- and multi-tower buildings, JV and outright-purchase land, and
 * — on purpose — one project whose landowner allocation does NOT match the
 * signed agreement, so the JV mismatch warning is visible in the demo.
 *
 * Lands are referenced by their demo name (see demo-data.ts).
 */

export interface DemoUnitPattern {
  /** unit codes come out as `${prefix}${separator}${floor}${suffix}` */
  prefix: string;
  separator: string;
  floor_from: number;
  floor_to: number;
  excluded_floors?: number[];
  /** what each floor up adds; defaults to 1.5% a floor when omitted */
  floor_premium_mode?: 'none' | 'amount' | 'percent';
  floor_premium_value?: string;
  rows: Array<{
    suffix: string;
    unit_type: string;
    bedroom_count: number;
    bathroom_count: number;
    balcony_count: number;
    size_sqft: number;
    facing: string;
    rate_per_sqft: number;
    parking_allocated: number;
  }>;
}

/**
 * A numbered run of plots inside one block (v26).
 *
 * Mirrors `PlotPatternInput` rather than the floor pattern above, because a
 * plot schedule has no floors to repeat over — it is a run of numbers, and a
 * block with two plot sizes is two runs.
 */
export interface DemoPlotPattern {
  prefix: string;
  separator: string;
  start_number: number;
  count: number;
  unit_type: string;
  land_size: number;
  rate_per_katha: number;
  road_width_ft: number;
  corner_numbers?: number[];
  corner_premium?: number;
  facing: string;
}

/** A land-share register (v26) — how many shares, and the price of one. */
export interface DemoShareRegister {
  prefix: string;
  separator: string;
  count: number;
  price_per_share: number;
  unit_type: string;
  total_land_size: number;
}

export interface DemoTower {
  name: string;
  floor_count: number;
  status: TowerStatus;
  building_type?: string;
  unit_per_floor?: number;
  lift_count?: number;
  electricity_backup?: boolean;
  front_road_width_ft?: number;
  patterns: DemoUnitPattern[];
  /** v26 — a block of plots instead of floors of flats */
  plot_patterns?: DemoPlotPattern[];
}

export interface DemoProject {
  name: string;
  project_type: ProjectType;
  total_land_area?: number;
  location_summary: string;
  expected_start_date: string;
  expected_completion_date: string;
  actual_start_date?: string;
  status: ProjectStatus;
  architect?: string;
  surroundings?: string;
  amenities: string[];
  cover_image_url?: string;
  /**
   * Title of one of this project's `documents` to use as the display image
   * (`projects.cover_image_document_id`). Resolved after the files are
   * created, because the id does not exist until then.
   */
  cover_image_document_title?: string;
  /** demo user key for `projects.project_manager` — applied once users exist */
  project_manager_key?: string;
  is_public: boolean;
  is_featured: boolean;
  /** v29 — whether bookings are being taken (PLATFORM-REPLAN.md §1.1) */
  sales_status: ProjectSalesStatus;
  /** v29 — land_share only */
  construction_after_sale?: ConstructionAfterSale;
  created_at: string;
  /** demo land names this project is built on */
  land_names: string[];
  /**
   * Files on the Documents tab. Omitted, the seeder still attaches the usual
   * two (architectural plan and brochure) so no project's tab is empty.
   */
  documents?: DemoDocument[];
  towers: DemoTower[];
  /**
   * v26 — a land-share project's register.
   *
   * Sits on the project rather than inside a tower because a share register
   * has no container: the single hidden row its units hang off is created by
   * `towerRepository.ensureShareRegister`, exactly as the UI does it.
   */
  share_register?: DemoShareRegister;
  /**
   * Flats handed to the landowner: which unit codes, and which demo owner key
   * they belong to. Everything else stays developer share / company sale.
   */
  landowner_allocation?: { owner_key: string; unit_codes: string[] };
  /** unit codes that are not `available` any more */
  unit_status_overrides?: Partial<Record<UnitStatus, string[]>>;
  /** pipeline trail; the last entry matches `status` */
  history?: DemoProjectEvent[];
  /**
   * v29 — the Costing tab's estimate (PLATFORM-REPLAN.md §1.5): budget per
   * head as [cost category code, amount], the contingency, and the quick
   * revenue figures used before units exist.
   */
  costing?: {
    heads: Array<[string, number]>;
    contingency_pct?: number;
    est_saleable_area?: number;
    est_avg_rate?: number;
  };
}

/** A construction estimate split the way the Costing editor splits it (60/40). */
/**
 * A date this many days before the demo is loaded. Nokshi Green's site log is
 * written relative to load day, so its stage dates are too — fixed dates had
 * the first piling reading a year before the recorded construction start
 * (Construction review 2026-10-11).
 */
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function construction(sqft: number, rate: number): Array<[string, number]> {
  const total = sqft * rate;
  return [
    ['_procurement', Math.round(total * 0.6)],
    ['contractor_payment', Math.round(total * 0.4)],
  ];
}

export const DEMO_PROJECTS: DemoProject[] = [
  {
    name: 'Nokshi Green Residence',
    project_type: 'apartment',
    total_land_area: 10,
    location_summary: 'Bashundhara R/A, Dhaka',
    expected_start_date: daysAgo(395),
    expected_completion_date: '2029-05-31',
    actual_start_date: daysAgo(385),
    status: 'under_construction',
    architect: 'Volumezero Ltd.',
    surroundings:
      'Independent University 800m, Apollo Hospital 1.5km, 100ft road 400m, Bashundhara Mall 2km',
    amenities: ['Lift', 'Generator', 'Parking', 'Security', 'CCTV', 'Community Space', 'Rooftop Garden'],
    cover_image_url:
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=60',
    is_public: true,
    is_featured: true,
    sales_status: 'open',
    costing: {
      heads: [
        ['land_estimate', 7_500_000],
        ['design_approval', 3_000_000],
        ...construction(30_000, 3_400),
        ['utility_connection', 2_800_000],
        // deliberately low: selling has already run past it, so the demo shows an overrun,
        ['marketing', 300_000],
        ['sales_commission', 1_500_000],
      ],
      contingency_pct: 5,
      est_saleable_area: 15_000,
      est_avg_rate: 9_500,
    },
    created_at: `${daysAgo(450)}T10:15:00.000Z`,
    land_names: ['Bashundhara Block K corner plot'],
    towers: [
      {
        name: 'Tower A',
        floor_count: 11,
        status: 'under_construction',
        building_type: 'B+G+10',
        unit_per_floor: 2,
        lift_count: 2,
        electricity_backup: true,
        front_road_width_ft: 40,
        patterns: [
          {
            prefix: 'A',
            separator: '-',
            floor_from: 2,
            floor_to: 10,
            rows: [
              {
                suffix: 'A',
                unit_type: '3 Bed',
                bedroom_count: 3,
                bathroom_count: 3,
                balcony_count: 2,
                size_sqft: 1580,
                facing: 'South',
                rate_per_sqft: 11500,
                parking_allocated: 1,
              },
              {
                suffix: 'B',
                unit_type: '3 Bed',
                bedroom_count: 3,
                bathroom_count: 2,
                balcony_count: 2,
                size_sqft: 1420,
                facing: 'South-East',
                rate_per_sqft: 11000,
                parking_allocated: 1,
              },
            ],
          },
        ],
      },
      {
        name: 'Tower B',
        floor_count: 9,
        status: 'planning',
        building_type: 'B+G+8',
        unit_per_floor: 2,
        lift_count: 2,
        electricity_backup: true,
        front_road_width_ft: 25,
        patterns: [
          {
            prefix: 'B',
            separator: '-',
            floor_from: 2,
            floor_to: 8,
            rows: [
              {
                suffix: 'A',
                unit_type: '2 Bed',
                bedroom_count: 2,
                bathroom_count: 2,
                balcony_count: 1,
                size_sqft: 1120,
                facing: 'North-East',
                rate_per_sqft: 10200,
                parking_allocated: 1,
              },
              {
                suffix: 'B',
                unit_type: '3 Bed',
                bedroom_count: 3,
                bathroom_count: 2,
                balcony_count: 2,
                size_sqft: 1380,
                facing: 'West',
                rate_per_sqft: 10600,
                parking_allocated: 1,
              },
            ],
          },
        ],
      },
    ],
    // 55/45 on flat count over 32 flats → the owner should hold ~14
    landowner_allocation: {
      owner_key: 'rafiqul',
      unit_codes: [
        'A-3A', 'A-4B', 'A-5A', 'A-6B', 'A-7A', 'A-8B', 'A-9A', 'A-10B',
        'B-2B', 'B-3A', 'B-4B', 'B-5A', 'B-6B', 'B-7A',
      ],
    },
    /*
     * A-4A, A-5B and A-6A are no longer forced here (P-1). Module 4's demo
     * bookings cover them, so `booked` and `reserved` are produced by
     * `createBooking` and the Section 5.6 receipt rule rather than typed in —
     * the Inventory rail and the Finance tab now count the same events.
     *
     * `sold` and `hold` are left as overrides on purpose. A flat sold before
     * this software existed genuinely has no booking record, and that is the
     * inventory a developer actually starts with; `hold` is a sales hold with
     * no paperwork behind it yet. Both are states the application does not
     * claim to own. See OPEN-ITEMS for the note on back-filling them.
     */
    unit_status_overrides: {
      sold: ['A-2A', 'A-2B', 'A-3B'],
      hold: ['A-7B'],
    },
    history: [
      {
        to_status: 'design',
        event_date: daysAgo(440),
        performed_by: 'Volumezero Ltd.',
        reference_no: 'ARCH-2026-014',
        remarks: 'দুই টাওয়ারের layout চূড়ান্ত — Tower A আগে, Tower B পরে।',
      },
      {
        to_status: 'approval',
        event_date: daysAgo(420),
        performed_by: 'RAJUK',
        reference_no: 'RAJUK/2026/4471',
        remarks: 'Setback নিয়ে একটা query এসেছিল, drawing সংশোধন করে জমা দেওয়া হয়েছে।',
      },
      {
        to_status: 'under_construction',
        event_date: daysAgo(385),
        performed_by: 'Base Tech Engineering',
        reference_no: 'WO-2026-008',
        remarks: 'Piling শুরু হয়েছে। সাইট ঠিকাদারকে বুঝিয়ে দেওয়া হয়েছে।',
      },
    ],
  },
  {
    name: 'Nokshi Uttara Heights',
    project_type: 'apartment',
    total_land_area: 7.5,
    location_summary: 'Sector 13, Uttara, Dhaka',
    expected_start_date: '2026-11-01',
    expected_completion_date: '2029-10-31',
    status: 'design',
    architect: 'Shatotto Architecture',
    surroundings: 'Uttara metro station 1km, Rajuk Uttara Model College 600m, Sector 13 park 200m',
    amenities: ['Lift', 'Generator', 'Parking', 'Security', 'Children Play Area', 'Prayer Room'],
    cover_image_url:
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=60',
    is_public: true,
    is_featured: false,
    sales_status: 'open',
    costing: {
      heads: [
        ['land_estimate', 38_500_000],
        ['design_approval', 3_500_000],
        ...construction(22_000, 3_500),
        ['utility_connection', 3_000_000],
        ['marketing', 1_200_000],
        ['sales_commission', 1_800_000],
      ],
      contingency_pct: 5,
      est_saleable_area: 18_500,
      est_avg_rate: 9_400,
    },
    created_at: '2026-07-21T09:30:00.000Z',
    land_names: ['Uttara Sector 13 residential plot'],
    towers: [
      {
        name: 'Main Building',
        floor_count: 9,
        status: 'planning',
        building_type: 'G+8',
        unit_per_floor: 2,
        lift_count: 1,
        electricity_backup: true,
        front_road_width_ft: 30,
        patterns: [
          {
            prefix: 'U',
            separator: '-',
            floor_from: 2,
            floor_to: 8,
            rows: [
              {
                suffix: 'A',
                unit_type: '2 Bed',
                bedroom_count: 2,
                bathroom_count: 2,
                balcony_count: 1,
                size_sqft: 1150,
                facing: 'North',
                rate_per_sqft: 9200,
                parking_allocated: 1,
              },
              {
                suffix: 'B',
                unit_type: '3 Bed',
                bedroom_count: 3,
                bathroom_count: 3,
                balcony_count: 2,
                size_sqft: 1490,
                facing: 'South',
                rate_per_sqft: 9600,
                parking_allocated: 1,
              },
            ],
          },
        ],
      },
    ],
    unit_status_overrides: { hold: ['U-2A'] },
    history: [
      {
        to_status: 'design',
        event_date: '2026-08-04',
        performed_by: 'Shatotto Architecture',
        reference_no: 'ARCH-2026-031',
        remarks: 'G+8, প্রতি তলায় দুইটা ইউনিট। Sector 13-এর height limit মাথায় রেখে।',
      },
    ],
  },
  {
    name: 'Nokshi Agrabad Trade Centre',
    project_type: 'commercial',
    total_land_area: 14,
    location_summary: 'Agrabad C/A, Chattogram',
    expected_start_date: '2026-09-15',
    expected_completion_date: '2029-03-31',
    status: 'approval',
    architect: 'Vitti Sthapati Brindo',
    surroundings: 'Customs House 700m, Agrabad commercial hub, port access 3km',
    amenities: ['Lift', 'Generator', 'Parking', 'Security', 'CCTV', 'Fire Fighting System', 'Substation'],
    cover_image_url:
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=60',
    is_public: false,
    is_featured: false,
    // it holds bookings, so its sales are open (QA audit P-05)
    sales_status: 'open',
    costing: {
      heads: [
        ['land_estimate', 2_500_000],
        ['design_approval', 5_000_000],
        ...construction(48_000, 3_300),
        ['utility_connection', 9_000_000],
        ['marketing', 2_500_000],
        ['sales_commission', 3_000_000],
      ],
      contingency_pct: 7,
      est_saleable_area: 24_000,
      est_avg_rate: 14_000,
    },
    created_at: '2026-06-09T14:00:00.000Z',
    land_names: ['Chattogram Agrabad commercial plot'],
    towers: [
      {
        name: 'Block 1',
        floor_count: 13,
        status: 'planning',
        building_type: 'B+G+12',
        unit_per_floor: 3,
        lift_count: 3,
        electricity_backup: true,
        front_road_width_ft: 60,
        patterns: [
          {
            prefix: 'AG',
            separator: '-',
            floor_from: 2,
            floor_to: 12,
            // the 1st floor is a retail arcade, handled separately
            excluded_floors: [7],
            rows: [
              {
                suffix: 'A',
                unit_type: 'Office Space',
                bedroom_count: 0,
                bathroom_count: 2,
                balcony_count: 0,
                size_sqft: 2100,
                facing: 'West',
                rate_per_sqft: 13500,
                parking_allocated: 2,
              },
              {
                suffix: 'B',
                unit_type: 'Office Space',
                bedroom_count: 0,
                bathroom_count: 1,
                balcony_count: 0,
                size_sqft: 1350,
                facing: 'East',
                rate_per_sqft: 12800,
                parking_allocated: 1,
              },
            ],
          },
        ],
      },
    ],
    /**
     * Deliberately short: the agreement gives the landowner 40% of the total
     * sqft, but only a handful of floors were marked — the project page shows
     * the mismatch warning, which is the whole point of the check.
     */
    landowner_allocation: {
      owner_key: 'jashim',
      unit_codes: ['AG-2A', 'AG-3A', 'AG-4B'],
    },
    history: [
      {
        to_status: 'design',
        event_date: '2026-06-22',
        performed_by: 'Vitti Sthapati Brindo',
        reference_no: 'ARCH-2026-022',
        remarks: 'Commercial tower, নিচে retail arcade আর উপরে office floor।',
      },
      {
        to_status: 'approval',
        event_date: '2026-07-30',
        performed_by: 'CDA',
        reference_no: 'CDA/2026/1180',
        remarks: 'Fire safety clearance আলাদা করে জমা দিতে হবে — প্রক্রিয়াধীন।',
      },
    ],
  },
  {
    name: 'Nokshi Dhanmondi Court',
    project_type: 'mixed',
    total_land_area: 8,
    location_summary: 'Road 27, Dhanmondi, Dhaka',
    expected_start_date: '2024-04-01',
    expected_completion_date: '2026-12-31',
    actual_start_date: '2024-04-22',
    status: 'handover_ongoing',
    architect: 'Nakshabid Architects',
    surroundings: 'Dhanmondi Lake 400m, Square Hospital 1.2km, Sultana Kamal complex 600m',
    amenities: ['Lift', 'Generator', 'Parking', 'Security', 'CCTV', 'Gymnasium', 'Community Space'],
    cover_image_url:
      'https://images.unsplash.com/photo-1481253127861-534498168948?auto=format&fit=crop&w=1200&q=60',
    is_public: true,
    is_featured: true,
    sales_status: 'open',
    costing: {
      heads: [
        ['land_estimate', 76_000_000],
        ['design_approval', 3_500_000],
        ...construction(18_000, 3_500),
        ['utility_connection', 2_500_000],
        ['marketing', 900_000],
        ['sales_commission', 2_000_000],
      ],
      contingency_pct: 5,
      est_saleable_area: 12_000,
      est_avg_rate: 24_000,
    },
    created_at: '2024-03-11T11:20:00.000Z',
    land_names: ['Dhanmondi Road 27 plot'],
    towers: [
      {
        name: 'Tower A',
        floor_count: 8,
        status: 'complete',
        building_type: 'B+G+7',
        unit_per_floor: 2,
        lift_count: 2,
        electricity_backup: true,
        front_road_width_ft: 40,
        patterns: [
          {
            prefix: 'D',
            separator: '-',
            floor_from: 3,
            floor_to: 7,
            rows: [
              {
                suffix: 'A',
                unit_type: '3 Bed',
                bedroom_count: 3,
                bathroom_count: 3,
                balcony_count: 2,
                size_sqft: 1680,
                facing: 'South-West',
                rate_per_sqft: 14500,
                parking_allocated: 1,
              },
              {
                suffix: 'B',
                unit_type: '4 Bed',
                bedroom_count: 4,
                bathroom_count: 4,
                balcony_count: 3,
                size_sqft: 2050,
                facing: 'South',
                rate_per_sqft: 15000,
                parking_allocated: 2,
              },
            ],
          },
          {
            // second run, different layout — exactly how the generator is meant
            // to be used for a penthouse floor
            prefix: 'D',
            separator: '-',
            floor_from: 2,
            floor_to: 2,
            rows: [
              {
                suffix: 'A',
                unit_type: 'Shop',
                bedroom_count: 0,
                bathroom_count: 1,
                balcony_count: 0,
                size_sqft: 640,
                facing: 'East',
                rate_per_sqft: 21000,
                parking_allocated: 0,
              },
              {
                suffix: 'B',
                unit_type: 'Shop',
                bedroom_count: 0,
                bathroom_count: 1,
                balcony_count: 0,
                size_sqft: 720,
                facing: 'East',
                rate_per_sqft: 21000,
                parking_allocated: 0,
              },
            ],
          },
        ],
      },
    ],
    /*
     * D-6B, D-7A and D-2A are deliberately left alone here — Module 4's demo
     * bookings cover those, and a unit's status should come from its booking
     * rather than being set twice and disagreeing.
     */
    /*
     * `reserved` is a status only a booking can produce (Section 5.6), so
     * D-2B is a sales hold instead — the manual state that means "spoken for,
     * nothing signed". Leaving it as `reserved` left one unit in the whole
     * demo claiming a booking that does not exist, which is the same
     * inconsistency the Tower A overrides were replaced to remove.
     */
    unit_status_overrides: {
      handed_over: ['D-3A', 'D-3B', 'D-4A', 'D-4B', 'D-5A'],
      sold: ['D-5B', 'D-6A'],
      hold: ['D-2B'],
    },
    history: [
      {
        to_status: 'design',
        event_date: '2024-03-20',
        performed_by: 'Nakshabid Architects',
        reference_no: 'ARCH-2024-009',
        remarks: 'নিচতলায় দুইটা shop, উপরে residential — mixed use।',
      },
      {
        to_status: 'approval',
        event_date: '2024-03-28',
        performed_by: 'RAJUK',
        reference_no: 'RAJUK/2024/2210',
      },
      {
        to_status: 'under_construction',
        event_date: '2024-04-22',
        performed_by: 'Concord Construction',
        reference_no: 'WO-2024-003',
      },
      {
        to_status: 'nearly_complete',
        event_date: '2026-06-10',
        remarks: 'Structure শেষ, lift বসানো আর finishing চলছে।',
      },
      {
        to_status: 'handover_ongoing',
        event_date: '2026-08-15',
        reference_no: 'OC-2026-021',
        remarks: 'Occupancy certificate পাওয়া গেছে, প্রথম পাঁচটা ফ্ল্যাট হস্তান্তর হয়েছে।',
      },
    ],
  },
  /*
   * The plot scheme (review 2026-09-21, PROJECT-MODULE-PLAN.md section 2.4).
   *
   * Five bigha at Rupganj, filled and roaded, cut into two blocks of plots and
   * sold by the katha. Everything that makes it a different kind of project is
   * visible here: no floors, no flats, a rate per katha rather than per sqft,
   * and the corner plots carrying a premium. Its "construction progress" is the
   * filling and the roads, which are recorded against the land in Module 1 —
   * so the project page shows no Site Progress tab at all.
   */
  {
    name: 'Nokshi Kanchan Model Town',
    project_type: 'plot_development',
    total_land_area: 100,
    location_summary: 'Kanchan, Rupganj — 2km off the Purbachal 300ft highway',
    expected_start_date: '2026-02-20',
    expected_completion_date: '2027-06-30',
    actual_start_date: '2026-02-20',
    status: 'nearly_complete',
    surroundings:
      'Purbachal 300ft highway 2km, Kanchan bridge 3km, Dhaka–Sylhet highway 6km, Kanchan Bazar 1km',
    amenities: ['Security', 'CCTV', 'Parking'],
    is_public: true,
    is_featured: false,
    sales_status: 'open',
    // the filling and roads are costed on the land, as land development
    costing: {
      heads: [
        ['land_estimate', 36_000_000],
        // the filling and roads are costed on the land, as land development,
        ['design_approval', 2_000_000],
        ['utility_connection', 6_000_000],
        ['marketing', 2_500_000],
        ['sales_commission', 1_500_000],
      ],
      contingency_pct: 3,
      est_saleable_area: 60,
      est_avg_rate: 1_250_000,
    },
    created_at: '2026-02-14T06:00:00.000Z',
    land_names: ['Rupganj Kanchan tract'],
    towers: [
      {
        name: 'Block A',
        floor_count: 0,
        status: 'complete',
        front_road_width_ft: 40,
        patterns: [],
        plot_patterns: [
          {
            prefix: 'A',
            separator: '-',
            start_number: 1,
            count: 8,
            unit_type: 'Residential Plot',
            land_size: 5,
            rate_per_katha: 1_450_000,
            road_width_ft: 40,
            corner_numbers: [1, 8],
            corner_premium: 700_000,
            facing: 'South',
          },
        ],
      },
      {
        name: 'Block B',
        floor_count: 0,
        status: 'complete',
        front_road_width_ft: 25,
        patterns: [],
        plot_patterns: [
          /* the cheaper block: a narrower road, and the smaller plots that
             actually sell on it */
          {
            prefix: 'B',
            separator: '-',
            start_number: 1,
            count: 10,
            unit_type: 'Residential Plot',
            land_size: 3,
            rate_per_katha: 1_200_000,
            road_width_ft: 25,
            corner_numbers: [1, 10],
            corner_premium: 400_000,
            facing: 'East',
          },
        ],
      },
    ],
    history: [
      { to_status: 'design', event_date: '2026-02-18', remarks: 'Layout drawn: two blocks, 18 plots.' },
      {
        to_status: 'approval',
        event_date: '2026-03-22',
        reference_no: 'RAJUK/LSD/2026/4471',
        remarks: 'Land subdivision approval applied for.',
      },
      {
        to_status: 'under_construction',
        event_date: '2026-02-20',
        remarks: 'Filling started — development work is the construction here.',
      },
      {
        to_status: 'nearly_complete',
        event_date: '2026-09-12',
        remarks: 'Roads and drains finished. Plots being pegged out for handover.',
      },
    ],
  },
  /*
   * The share register (review 2026-09-21, PROJECT-MODULE-PLAN.md section 2.5).
   *
   * The client's own example, to the number: one plot, 20 shares, 100,000 taka
   * each. A buyer owns a twentieth of the whole — nothing is built and nothing
   * is demarcated — so there is no block, no floor, no size in sqft, and no
   * site progress. What each share shows is its percentage and the 1.2 katha
   * that percentage represents, because that is how buyers picture it.
   *
   * The follow-on the client described — the shareholders come back and
   * commission construction on the land they now co-own — is Phase 3
   * (`projects.succeeds_project_id`).
   */
  {
    name: 'Birulia Riverside Share Project',
    project_type: 'land_share',
    total_land_area: 24,
    location_summary: 'Birulia, Savar — on the Turag',
    expected_start_date: '2026-04-15',
    expected_completion_date: '2026-12-31',
    // 4 of 20 shares sold: the register is still open (client walkthrough 2026-10-10)
    status: 'planning',
    surroundings: 'Birulia bridge 1km, Ashulia 5km, Uttara 12km, riverside frontage',
    amenities: [],
    is_public: true,
    is_featured: false,
    // 4 of 20 shares sold so far; the buyers have already asked about a building
    sales_status: 'open',
    construction_after_sale: 'planned',
    costing: {
      heads: [
        ['land_estimate', 49_500_000],
        ['design_approval', 120_000],
        ['marketing', 150_000],
        ['sales_commission', 100_000],
      ],
      est_saleable_area: 20,
      est_avg_rate: 2_900_000,
    },
    created_at: '2026-04-10T05:45:00.000Z',
    land_names: ['Savar Birulia riverside plot'],
    towers: [],
    share_register: {
      prefix: 'SHARE',
      separator: '-',
      count: 20,
      // 1.2 katha a share at about 24 lakh a katha; the land cost 20 lakh a katha
      price_per_share: 2_900_000,
      unit_type: 'Land Share',
      total_land_size: 24,
    },
    history: [],
  },
  /*
   * The complete record (2026-10-04) — the project the Module 2 demo is given
   * on, built on the land of the same name in demo-data.ts.
   *
   * Every optional column on `projects` carries a value, including the two
   * that nothing else in the demo sets: `project_manager` and
   * `cover_image_document_id`. Two towers with every tower field, a full unit
   * grid, the landowner's 48% settled in named flats sold both ways, a status
   * history through to Under Construction, and nine named documents.
   *
   * Keep it complete — same rule as the land it stands on.
   */
  {
    name: 'Nokshi Lakeview Residence',
    project_type: 'apartment',
    total_land_area: 18,
    location_summary: 'Sector 18, Uttara — lake-facing on Lake Drive Road',
    expected_start_date: '2026-05-01',
    expected_completion_date: '2029-04-30',
    actual_start_date: '2026-05-18',
    status: 'under_construction',
    architect: 'Shatotto Architecture for Green Living',
    project_manager_key: 'shirin',
    surroundings:
      'Uttara Lake directly west, Diabari bridge 1.2km, Metro Rail Diabari station 2km, Uttara Town College 900m, Shin-Shin Japan Hospital 1.5km, Sector 18 kitchen market 600m, 100 ft RAJUK road 250m',
    amenities: [
      'Lift',
      'Generator',
      'Parking',
      'Security',
      'CCTV',
      'Community Space',
      'Rooftop Garden',
      'Gymnasium',
      'Prayer Room',
    ],
    cover_image_url:
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=60',
    cover_image_document_title: 'Lakeview Residence — front elevation render',
    is_public: true,
    is_featured: true,
    sales_status: 'open',
    costing: {
      heads: [
        ['land_estimate', 22_400_000],
        ['design_approval', 6_000_000],
        ...construction(52_000, 3_600),
        ['utility_connection', 7_500_000],
        ['marketing', 3_000_000],
        ['sales_commission', 4_000_000],
        ['other', 1_200_000],
      ],
      contingency_pct: 5,
      est_saleable_area: 27_600,
      est_avg_rate: 14_000,
    },
    created_at: '2026-02-02T09:00:00.000Z',
    land_names: ['Uttara Sector 18 lake-facing site'],
    documents: [
      { type: 'architectural_plan', title: 'Architectural plan set — Rev C (approved)', notes: 'Shatotto, issued 11 Mar 2026. Supersedes Rev B.' },
      { type: 'structural_drawing', title: 'Structural drawings — raft foundation & columns', notes: 'Based on the three-hole soil report taken in Nov 2025.' },
      { type: 'rajuk_approval', title: 'RAJUK approval memo 2026/UTT/0914', notes: '12 floors at FAR 4.0 approved 28 Apr 2026.' },
      { type: 'environmental_clearance', title: 'DoE environmental clearance — orange-B category' },
      { type: 'fire_safety_certificate', title: 'Fire Service & Civil Defence clearance' },
      { type: 'layout_floor_plan', title: 'Typical floor layout — Tower A levels 3–12', is_public: true },
      { type: 'brochure', title: 'Nokshi Lakeview Residence — sales brochure', notes: 'The only file on this project the public website may show.', is_public: true },
      { type: 'gallery_image', title: 'Lakeview Residence — front elevation render', is_public: true },
      { type: 'other', title: 'Soil investigation report — 3 bore holes to 100 ft', notes: 'Engr. Nazmul Huda, Nov 2025. The raft design rests on this.' },
    ],
    towers: [
      {
        name: 'Tower A',
        floor_count: 12,
        status: 'under_construction',
        building_type: 'B+G+12',
        unit_per_floor: 2,
        lift_count: 2,
        electricity_backup: true,
        front_road_width_ft: 60,
        patterns: [
          {
            prefix: 'LA',
            separator: '-',
            floor_from: 3,
            floor_to: 12,
            floor_premium_mode: 'percent',
            floor_premium_value: '1.8',
            rows: [
              {
                suffix: 'A',
                unit_type: '3 Bed',
                bedroom_count: 3,
                bathroom_count: 3,
                balcony_count: 2,
                size_sqft: 1680,
                facing: 'West',
                rate_per_sqft: 14200,
                parking_allocated: 1,
              },
              {
                suffix: 'B',
                unit_type: '3 Bed',
                bedroom_count: 3,
                bathroom_count: 2,
                balcony_count: 2,
                size_sqft: 1450,
                facing: 'South',
                rate_per_sqft: 13500,
                parking_allocated: 1,
              },
            ],
          },
        ],
      },
      {
        name: 'Tower B',
        floor_count: 12,
        status: 'planning',
        building_type: 'B+G+12',
        unit_per_floor: 2,
        lift_count: 2,
        electricity_backup: true,
        front_road_width_ft: 60,
        patterns: [
          {
            prefix: 'LB',
            separator: '-',
            floor_from: 3,
            floor_to: 8,
            floor_premium_mode: 'amount',
            floor_premium_value: '150000',
            rows: [
              {
                suffix: 'A',
                unit_type: '4 Bed',
                bedroom_count: 4,
                bathroom_count: 4,
                balcony_count: 3,
                size_sqft: 2150,
                facing: 'South-West',
                rate_per_sqft: 13800,
                parking_allocated: 2,
              },
              {
                suffix: 'B',
                unit_type: '2 Bed',
                bedroom_count: 2,
                bathroom_count: 2,
                balcony_count: 1,
                size_sqft: 1120,
                facing: 'North',
                rate_per_sqft: 12600,
                parking_allocated: 1,
              },
            ],
          },
        ],
      },
    ],
    /*
     * The owners' 48% on flat count, settled in named flats — which is how a
     * JV is actually settled here, and what the JV Allocation tab checks the
     * split against.
     */
    landowner_allocation: {
      owner_key: 'mosharraf',
      /*
       * Fifteen of thirty-two. The target is 48% of 32 = 15.36 flats, and the
       * allocation check reconciles to within one flat — so this reads as a
       * settled JV. The deliberate mismatch is the Agrabad project's job.
       */
      unit_codes: [
        'LA-3A', 'LA-4B', 'LA-5A', 'LA-6B', 'LA-7A', 'LA-8B', 'LA-9A', 'LA-10B',
        'LA-11B', 'LA-12B',
        'LB-3A', 'LB-4B', 'LB-5A', 'LB-6B', 'LB-7A',
      ],
    },
    unit_status_overrides: {
      hold: ['LA-11A'],
      reserved: ['LA-12A'],
      booked: ['LA-3B'],
      sold: ['LA-4A'],
    },
    history: [
      {
        to_status: 'design',
        event_date: '2026-02-09',
        performed_by: 'Shatotto Architecture for Green Living',
        reference_no: 'DWG-REV-A',
        remarks: 'Concept and massing agreed — two towers, 12 floors, 2 units a floor.',
      },
      {
        to_status: 'approval',
        event_date: '2026-03-16',
        performed_by: 'Shirin Sultana (Project Manager)',
        reference_no: 'RAJUK/2026/UTT/0914',
        remarks: 'Rev C drawings submitted to RAJUK with the soil report and the JV deed.',
      },
      {
        to_status: 'under_construction',
        event_date: '2026-05-18',
        performed_by: 'Shirin Sultana (Project Manager)',
        reference_no: 'MOB-2026-11',
        remarks: 'Approval received 28 Apr. Piling rig mobilised on site 18 May.',
      },
    ],
  },
  /*
   * v29 — the project-first cases (PLATFORM-REPLAN.md §1.7).
   */
  {
    // on land entered as already owned: sales opened at Approval, not built yet
    name: 'Nokshi Shyamoli Residence',
    project_type: 'apartment',
    total_land_area: 6,
    location_summary: 'Ring Road, Shyamoli, Dhaka',
    expected_start_date: '2027-01-15',
    expected_completion_date: '2029-12-31',
    status: 'approval',
    architect: 'Vitti Sthapati Brindo',
    surroundings: 'Shyamoli Square 500m, Shishu Mela 800m, Ring Road frontage',
    amenities: ['Lift', 'Generator', 'Parking', 'Security', 'Rooftop Garden'],
    is_public: true,
    is_featured: false,
    sales_status: 'open',
    created_at: '2026-09-29T06:00:00.000Z',
    land_names: ['Shyamoli Ring Road plot'],
    towers: [
      {
        name: 'Main Building',
        floor_count: 10,
        status: 'planning',
        building_type: 'G+9',
        unit_per_floor: 2,
        lift_count: 1,
        electricity_backup: true,
        front_road_width_ft: 40,
        patterns: [
          {
            prefix: 'S',
            separator: '-',
            floor_from: 2,
            floor_to: 9,
            rows: [
              {
                suffix: 'A',
                unit_type: '3 Bed',
                bedroom_count: 3,
                bathroom_count: 3,
                balcony_count: 2,
                size_sqft: 1250,
                facing: 'South',
                rate_per_sqft: 11_500,
                parking_allocated: 1,
              },
              {
                suffix: 'B',
                unit_type: '3 Bed',
                bedroom_count: 3,
                bathroom_count: 2,
                balcony_count: 2,
                size_sqft: 1180,
                facing: 'North',
                rate_per_sqft: 11_000,
                parking_allocated: 1,
              },
            ],
          },
        ],
      },
    ],
    history: [
      {
        to_status: 'design',
        event_date: '2026-10-01',
        performed_by: 'Vitti Sthapati Brindo',
        reference_no: 'ARCH-2026-044',
        remarks: 'Land already ours since 2016, so design started the week the project was opened.',
      },
      {
        to_status: 'approval',
        event_date: '2026-10-05',
        performed_by: 'RAJUK',
        reference_no: 'RAJUK/LUC/2026/1871',
        remarks: 'Land use clearance in hand; building plan submitted.',
      },
    ],
    costing: {
      heads: [
        ['land_estimate', 37_000_000],
        ['design_approval', 4_500_000],
        ...construction(26_000, 3_600),
        ['utility_connection', 3_500_000],
        ['marketing', 1_500_000],
        ['sales_commission', 2_300_000],
      ],
      contingency_pct: 5,
      est_saleable_area: 19_400,
      est_avg_rate: 11_300,
    },
  },
  {
    // inherited family land sold as shares; whether to build later is open
    name: 'Zinzira Riverside Land Share',
    project_type: 'land_share',
    total_land_area: 30,
    location_summary: 'Zinzira, Keraniganj — across the Buriganga',
    expected_start_date: '2026-10-10',
    expected_completion_date: '2027-06-30',
    status: 'planning',
    surroundings: 'Zinzira bazar 600m, Babubazar bridge 3km, Buriganga riverfront',
    amenities: [],
    is_public: true,
    is_featured: false,
    sales_status: 'open',
    construction_after_sale: 'undecided',
    created_at: '2026-10-01T05:30:00.000Z',
    land_names: ['Zinzira riverside family land'],
    towers: [],
    share_register: {
      prefix: 'ZS',
      separator: '-',
      count: 30,
      price_per_share: 900_000,
      unit_type: 'Land Share',
      total_land_size: 30,
    },
    costing: {
      heads: [
        ['land_estimate', 150_000],
        ['design_approval', 150_000],
        ['marketing', 600_000],
        ['sales_commission', 800_000],
        ['other', 200_000],
      ],
      contingency_pct: 3,
      est_saleable_area: 30,
      est_avg_rate: 900_000,
    },
  },
  {
    // planned on land still in negotiation: sales not open, construction blocked
    name: 'Nokshi Tongi Logistics Park',
    project_type: 'commercial',
    total_land_area: 40,
    location_summary: 'Tongi BSCIC area, Gazipur',
    expected_start_date: '2027-06-01',
    expected_completion_date: '2029-12-31',
    status: 'planning',
    surroundings: 'Dhaka–Mymensingh highway 1.2km, Tongi rail station 2km, BSCIC industrial area',
    amenities: ['Generator', 'Parking', 'Security', 'Fire Fighting System'],
    is_public: false,
    is_featured: false,
    sales_status: 'not_open',
    created_at: '2026-10-03T08:00:00.000Z',
    land_names: ['Gazipur Tongi industrial-adjacent plot'],
    towers: [],
    costing: {
      heads: [
        ['land_estimate', 46_000_000],
        ['design_approval', 6_000_000],
        ...construction(70_000, 3_000),
        ['utility_connection', 12_000_000],
        ['marketing', 3_000_000],
      ],
      contingency_pct: 7,
      est_saleable_area: 60_000,
      est_avg_rate: 6_500,
    },
  },
];
