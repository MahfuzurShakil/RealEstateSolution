import type { ProjectStatus, ProjectType, TowerStatus, UnitStatus } from './types';

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
  is_public: boolean;
  is_featured: boolean;
  created_at: string;
  /** demo land names this project is built on */
  land_names: string[];
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
}

export const DEMO_PROJECTS: DemoProject[] = [
  {
    name: 'Nokshi Green Residence',
    project_type: 'apartment',
    total_land_area: 10,
    location_summary: 'Bashundhara R/A, Dhaka',
    expected_start_date: '2026-06-01',
    expected_completion_date: '2029-05-31',
    actual_start_date: '2026-06-18',
    status: 'under_construction',
    architect: 'Volumezero Ltd.',
    surroundings:
      'Independent University 800m, Apollo Hospital 1.5km, 100ft road 400m, Bashundhara Mall 2km',
    amenities: ['Lift', 'Generator', 'Parking', 'Security', 'CCTV', 'Community Space', 'Rooftop Garden'],
    cover_image_url:
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=60',
    is_public: true,
    is_featured: true,
    created_at: '2026-05-04T10:15:00.000Z',
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
        event_date: '2026-05-18',
        performed_by: 'Volumezero Ltd.',
        reference_no: 'ARCH-2026-014',
        remarks: 'দুই টাওয়ারের layout চূড়ান্ত — Tower A আগে, Tower B পরে।',
      },
      {
        to_status: 'approval',
        event_date: '2026-05-29',
        performed_by: 'RAJUK',
        reference_no: 'RAJUK/2026/4471',
        remarks: 'Setback নিয়ে একটা query এসেছিল, drawing সংশোধন করে জমা দেওয়া হয়েছে।',
      },
      {
        to_status: 'under_construction',
        event_date: '2026-06-18',
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
    actual_start_date: '2026-04-15',
    status: 'handover_ongoing',
    surroundings: 'Birulia bridge 1km, Ashulia 5km, Uttara 12km, riverside frontage',
    amenities: [],
    is_public: true,
    is_featured: false,
    created_at: '2026-04-10T05:45:00.000Z',
    land_names: ['Savar Birulia riverside plot'],
    towers: [],
    share_register: {
      prefix: 'SHARE',
      separator: '-',
      count: 20,
      price_per_share: 100_000,
      unit_type: 'Land Share',
      total_land_size: 24,
    },
    history: [
      {
        to_status: 'design',
        event_date: '2026-04-15',
        remarks: 'Twenty equal shares agreed with the board. Nothing is built.',
      },
      {
        to_status: 'approval',
        event_date: '2026-04-28',
        remarks: 'Share deed drafted and vetted.',
      },
      {
        to_status: 'under_construction',
        event_date: '2026-05-04',
        remarks: 'Register opened for sale. No construction on this project.',
      },
      {
        to_status: 'nearly_complete',
        event_date: '2026-07-30',
        remarks: 'Most of the register sold.',
      },
      {
        to_status: 'handover_ongoing',
        event_date: '2026-08-25',
        remarks: 'Share deeds being registered buyer by buyer.',
      },
    ],
  },
];
