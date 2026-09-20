import type { FeasibilityRecommendation, FeasibilityStatus } from './types';

/**
 * Batch L2 demo data — site visits and feasibility studies (BRD section 8).
 *
 * Keyed on the land's `name` rather than an id, because ids are generated at
 * seed time. Only the lands that have actually reached Under Review or beyond
 * get a visit: a plot recorded yesterday and not yet looked at should show an
 * empty Site Visits tab, because that is the honest state and somebody needs to
 * see what it looks like.
 *
 * The feasibility rows are deliberately not all approved. One is a draft, one
 * was rejected and re-studied, and the Narayanganj plot is sitting at
 * `submitted` — which is exactly the state gate G1 blocks on, so the gate has
 * something to demonstrate itself against.
 */

export interface DemoSiteVisit {
  land: string;
  /**
   * L7 — a planned visit (BRD SITE-001 "visit plans"). Dated from load day,
   * so the plan is always upcoming rather than a stale past date.
   */
  planned_in_days?: number;
  visit_date: string;
  visited_by?: string;
  participants?: string;
  access_note?: string;
  road_width_ft?: number;
  has_electricity?: boolean | null;
  has_gas?: boolean | null;
  has_water?: boolean | null;
  has_sewerage?: boolean | null;
  utilities_note?: string;
  drainage?: string;
  soil_condition?: string;
  is_lowland?: boolean;
  filling_required_ft?: number;
  surroundings?: string;
  price_observation?: string;
  remarks?: string;
}

export interface DemoFeasibility {
  land: string;
  version_no: number;
  est_acquisition_cost: number;
  est_development_cost: number;
  est_other_cost: number;
  expected_revenue: number;
  assumptions?: string;
  risks?: string;
  recommendation: FeasibilityRecommendation;
  status: FeasibilityStatus;
  prepared_by?: string;
  decision_note?: string;
  /** real days, so the timeline reads in order — negotiation follows approval (SITE-003) */
  prepared_on: string;
  submitted_on?: string;
  decided_on?: string;
}

export const DEMO_SITE_VISITS: DemoSiteVisit[] = [
  {
    land: 'Bashundhara Block K corner plot',
    visit_date: '2026-01-22',
    visited_by: 'Kamal Hossain (Land Team)',
    participants: 'Eng. Sabbir Rahman',
    access_note: 'Car right up to the plot from Block K main road',
    road_width_ft: 25,
    has_electricity: true,
    has_gas: true,
    has_water: true,
    has_sewerage: true,
    utilities_note: 'All four connections live on the adjoining plot',
    drainage: 'Covered drain on both road faces, no waterlogging reported',
    soil_condition: 'Filled and settled, firm. Neighbouring tower piled to 65 ft.',
    is_lowland: false,
    surroundings: 'Six-storey residential either side, 100 ft road 400 m west',
    price_observation: 'Neighbours quote 62–68 lakh per katha for corner plots',
    remarks: 'Boundary wall broken on the north side. Owner says a tenant vacates in March.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    visit_date: '2026-03-28',
    visited_by: 'Rifat Ahmed',
    participants: 'Owner (Md. Rafiqul Islam), Adv. Nusrat Jahan',
    access_note: 'Same as before',
    road_width_ft: 25,
    has_electricity: true,
    has_gas: true,
    has_water: true,
    has_sewerage: true,
    drainage: 'Confirmed with the city corporation office',
    soil_condition: 'Soil test quoted; owner agreed to share the 2019 report',
    is_lowland: false,
    surroundings: 'Unchanged',
    remarks: 'Second visit to walk the boundary with the owner before signing. Tenant had left.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    visit_date: '2026-01-12',
    visited_by: 'Kamal Hossain (Land Team)',
    access_note: 'Direct frontage on the 60 ft sector road',
    road_width_ft: 60,
    has_electricity: true,
    has_gas: false,
    has_water: true,
    has_sewerage: true,
    utilities_note: 'No gas line in this block — Titas has stopped new residential connections',
    drainage: 'RAJUK drain along the sector road, adequate',
    soil_condition: 'Sandy fill over clay, standard for the sector',
    is_lowland: false,
    surroundings: 'Plots on three sides already built, metro station 1.2 km',
    price_observation: 'Sector 13 asking 48–52 lakh per katha',
    remarks: 'Clean plot, nothing standing on it. Owner motivated — moving abroad.',
  },
  {
    land: 'Narayanganj Fatullah plot',
    visit_date: '2026-05-26',
    visited_by: 'Shafiq Rahman (Land Team)',
    participants: 'Eng. Sabbir Rahman',
    access_note: '18 ft lane off the Pagla–Fatullah road; a truck can turn but not easily',
    road_width_ft: 18,
    has_electricity: true,
    has_gas: false,
    has_water: false,
    has_sewerage: false,
    utilities_note: 'Electricity only. WASA line ends 600 m away; deep tube well would be needed.',
    drainage: 'Open kacha drain, overflows in monsoon',
    soil_condition: 'Soft clay, high water table. Piling will be deep.',
    is_lowland: true,
    filling_required_ft: 4,
    surroundings: 'Single-storey houses, a small mosque, open paddy to the south',
    price_observation: 'Local brokers quote 28–32 lakh per katha; owner asking above that',
    remarks:
      'Tenants currently on the land; vacancy timeline to be confirmed. The fill depth is the number that decides this plot.',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    visit_date: '2026-04-14',
    visited_by: 'Jashim Uddin (Chattogram office)',
    access_note: 'Hill road narrows and steepens for the last 60 m — a mixer truck will not make it',
    road_width_ft: 20,
    has_electricity: true,
    has_gas: true,
    has_water: true,
    has_sewerage: null,
    utilities_note: 'Sewerage arrangement on the hill not confirmed with CDA yet',
    drainage: 'Natural fall down the slope; retaining wall will be required',
    soil_condition: 'Hill cut, rocky. Cutting permission from CDA is the open question.',
    is_lowland: false,
    surroundings: 'Khulshi residential, low density, views over the city',
    price_observation: 'Khulshi hillside 45–55 lakh per katha depending on cutting permission',
    remarks: 'Access is the real constraint — concrete would have to be pumped or mixed on site.',
  },
  {
    land: 'Keraniganj riverside land',
    visit_date: '2026-03-05',
    visited_by: 'Shafiq Rahman (Land Team)',
    access_note: 'No pucca approach. 12 ft earthen track from the embankment, impassable after rain.',
    road_width_ft: 12,
    has_electricity: false,
    has_gas: false,
    has_water: false,
    has_sewerage: false,
    utilities_note: 'Nothing on site. Nearest connection point is at the embankment road.',
    drainage: 'Floods from the river side in monsoon',
    soil_condition: 'Silt, very soft. Substantial fill and deep piling both required.',
    is_lowland: true,
    filling_required_ft: 9,
    surroundings: 'Brickfields upriver, scattered settlement, no services',
    price_observation: 'Cheap at 23 lakh per katha, and the reason is visible from the plot',
    remarks:
      'The fill alone would be most of the land price. Recommended against before due diligence money was spent.',
  },

  /*
   * L7 — every land that reached negotiation had its plot walked first, so
   * the Site Visit step is ticked on each of them.
   */
  {
    land: 'Gazipur Tongi industrial-adjacent plot',
    visit_date: '2026-03-18',
    visited_by: 'Shafiq Rahman (Land Team)',
    access_note: '30 ft approach road off the Tongi–Ashulia road',
    road_width_ft: 30,
    has_electricity: true,
    has_gas: true,
    has_water: false,
    has_sewerage: false,
    utilities_note: 'Gas and power at the boundary; no WASA line, deep tube-well needed',
    drainage: 'East edge collects water in heavy rain',
    soil_condition: 'Red clay, firm',
    is_lowland: false,
    surroundings: 'Garment factories north and east, BSCIC estate 1 km',
    price_observation: 'Brokers quote 2.1–2.3 crore per bigha on this road',
    remarks: 'Boundary pillars in place. Drainage on the east edge needs a survey.',
  },
  {
    land: 'Savar highway-side land',
    visit_date: '2026-02-12',
    visited_by: 'Kamal Hossain (Land Team)',
    participants: 'Both heirs',
    access_note: 'Direct frontage on the Dhaka–Aricha highway service lane',
    road_width_ft: 40,
    has_electricity: true,
    has_gas: false,
    has_water: false,
    has_sewerage: false,
    drainage: 'Highway drain along the front',
    soil_condition: 'Low at the back — about 4 ft of fill behind the highway frontage',
    is_lowland: true,
    filling_required_ft: 4,
    surroundings: 'Shops on the highway, housing behind',
    price_observation: 'Highway-facing land asking 60–70 lakh per katha',
    remarks: 'A tin shed on the east strip belongs to a neighbour — raise it in legal checks.',
  },
  {
    land: 'Chattogram Agrabad commercial plot',
    visit_date: '2026-02-11',
    visited_by: 'Imran Kabir (Chattogram)',
    access_note: 'Frontage on Agrabad Access Road',
    road_width_ft: 50,
    has_electricity: true,
    has_gas: true,
    has_water: true,
    has_sewerage: true,
    drainage: 'CCC drain, adequate',
    soil_condition: 'Old building footprint, soil test needed',
    is_lowland: false,
    surroundings: 'Banks and offices both sides',
    price_observation: 'Commercial plots here quote above 1.5 crore per katha',
    remarks: 'A single-storey structure stands on the plot and has to be demolished.',
  },
  {
    land: 'Dhanmondi Road 27 plot',
    visit_date: '2026-01-15',
    visited_by: 'Kamal Hossain (Land Team)',
    access_note: 'Road 27 (old), 60 ft frontage',
    road_width_ft: 60,
    has_electricity: true,
    has_gas: true,
    has_water: true,
    has_sewerage: true,
    drainage: 'City drain, no waterlogging reported',
    soil_condition: 'Old house footprint',
    is_lowland: false,
    surroundings: 'Residential towers on both sides, lake 400 m',
    price_observation: 'Dhanmondi asking above 1 crore per katha',
    remarks: 'Family wants to close quickly to settle the inheritance.',
  },

  /* a plan, not a visit — the Sylhet plot has not been looked at yet */
  {
    land: 'Sylhet Zindabazar mixed-use plot',
    planned_in_days: 5,
    visit_date: '',
    visited_by: 'Imran Kabir (Chattogram)',
    participants: 'Owner’s representative',
    remarks: 'Walk the frontage on Jail Road and check the building setback with the owner.',
  },
  {
    land: 'Tangail Mirzapur roadside plot',
    visit_date: '2026-01-31',
    visited_by: 'Shafiq Rahman (Land Team)',
    participants: 'Owner represented by her son, Shahin',
    access_note: '22 ft brick road off the highway service lane',
    road_width_ft: 22,
    has_electricity: true,
    has_gas: false,
    has_water: false,
    has_sewerage: false,
    utilities_note: 'REB line at the road; no titas gas and no WASA line in Mirzapur',
    drainage: 'Field drain along the north edge, silted',
    soil_condition: 'Paddy land, soft to at least 8 ft',
    is_lowland: true,
    filling_required_ft: 5,
    surroundings: 'Paddy on three sides, highway service road to the east',
    price_observation: 'Highway-side land at Gorai quoting 13-15 lakh per katha',
    remarks:
      'Cheap per katha because of the fill. Nobody has taken a fill quantity yet - that is the number the development plan is waiting on.',
  },
  {
    land: 'Narsingdi Madhabdi plot',
    visit_date: '2025-11-25',
    visited_by: 'Kamal Hossain (Land Team)',
    access_note: '18 ft bazar road; the 40 ft widening is marked on the DAP sheet',
    road_width_ft: 18,
    has_electricity: true,
    has_gas: true,
    has_water: false,
    has_sewerage: false,
    drainage: 'Bazar drain, overflows in monsoon',
    soil_condition: 'Homestead land, firm',
    is_lowland: false,
    surroundings: 'Textile mill sheds south, bazar north',
    price_observation: 'Madhabdi quoting 20-24 lakh per katha on the bazar road',
    remarks:
      'The whole case rests on the 40ft road on the DAP sheet. Without it a tower here has no approach.',
  },
  {
    land: 'Ashulia Zirabo industrial plot',
    visit_date: '2026-02-09',
    visited_by: 'Shafiq Rahman (Land Team)',
    access_note: '24 ft road, trucks can reach the plot',
    road_width_ft: 24,
    has_electricity: true,
    has_gas: false,
    has_water: false,
    has_sewerage: false,
    drainage: 'Field drain along the west edge',
    soil_condition: 'Paddy land, soft — fill and piling both needed',
    is_lowland: true,
    filling_required_ft: 5,
    surroundings: 'Garment sheds north, open paddy south',
    price_observation: 'Zirabo asking 1.6–1.8 crore per bigha',
    remarks: 'Bought for staff housing; five feet of fill assumed in the study.',
  },
  {
    land: 'Bashundhara Block J ready plot',
    visit_date: '2026-03-19',
    visited_by: 'Kamal Hossain (Land Team)',
    access_note: '40 ft internal road, no obstruction',
    road_width_ft: 40,
    has_electricity: true,
    has_gas: true,
    has_water: true,
    has_sewerage: true,
    drainage: 'RAJUK drain, adequate',
    soil_condition: 'Filled and compacted years ago',
    is_lowland: false,
    surroundings: 'Built plots on three sides',
    price_observation: 'Block J quoting 55–60 lakh per katha',
    remarks: 'Serviced plot — nothing to fill or wall.',
  },
];

export const DEMO_FEASIBILITY: DemoFeasibility[] = [
  {
    land: 'Bashundhara Block K corner plot',
    version_no: 1,
    est_acquisition_cost: 6_000_000,
    est_development_cost: 4_500_000,
    est_other_cost: 9_000_000,
    expected_revenue: 145_000_000,
    assumptions:
      '55:45 JV split on flat count, 9 floors approved, BDT 11,000/sqft achievable in Block K, 34 months to handover',
    risks:
      'RAJUK FAR review pending for the block; corner plot setback may cost one unit per floor',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Rifat Ahmed (Land Team)',
    decision_note: 'Board approved 2026-02-27. Proceed on the 55:45 basis.',
    prepared_on: '2026-02-18',
    submitted_on: '2026-02-22',
    decided_on: '2026-02-27',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    version_no: 1,
    est_acquisition_cost: 39_000_000,
    est_development_cost: 2_000_000,
    est_other_cost: 6_500_000,
    expected_revenue: 78_000_000,
    assumptions: 'Outright purchase at asking, 7 floors, BDT 9,800/sqft',
    risks: 'Asking price leaves a thin margin if the achievable rate slips',
    recommendation: 'hold',
    status: 'rejected',
    prepared_by: 'Rifat Ahmed (Land Team)',
    decision_note: 'Margin under 30% at the asking price. Re-study at a lower land price.',
    prepared_on: '2026-01-13',
    submitted_on: '2026-01-15',
    decided_on: '2026-01-17',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    version_no: 2,
    est_acquisition_cost: 36_000_000,
    est_development_cost: 2_000_000,
    est_other_cost: 6_500_000,
    expected_revenue: 78_000_000,
    assumptions: 'Purchase capped at 36,000,000 — the owner has signalled room below asking. 7 floors, BDT 9,800/sqft',
    risks: 'No gas connection in the block — buyers will ask, and the answer costs something',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Rifat Ahmed (Land Team)',
    decision_note: 'Approved with the land price capped at 36,000,000. Proceed to negotiation.',
    prepared_on: '2026-01-20',
    submitted_on: '2026-01-22',
    decided_on: '2026-01-26',
  },
  {
    land: 'Narayanganj Fatullah plot',
    version_no: 1,
    est_acquisition_cost: 27_000_000,
    est_development_cost: 11_000_000,
    est_other_cost: 4_000_000,
    expected_revenue: 58_000_000,
    assumptions: '4 ft fill across 9 katha, 6 floors, BDT 6,800/sqft achievable in Fatullah',
    risks:
      'Fill depth is a site-visit estimate, not a survey. Sitting tenants — vacancy date not agreed. No WASA line.',
    recommendation: 'proceed',
    status: 'submitted',
    prepared_by: 'Shafiq Rahman (Land Team)',
    prepared_on: '2026-05-30',
    submitted_on: '2026-06-03',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    version_no: 1,
    est_acquisition_cost: 54_000_000,
    est_development_cost: 16_000_000,
    est_other_cost: 7_000_000,
    expected_revenue: 118_000_000,
    assumptions:
      'CDA hill-cutting permission granted, retaining wall in the development cost, premium pricing for the view',
    risks:
      'Hill-cutting permission is the whole deal. Access will not take a mixer truck — on-site batching assumed.',
    recommendation: 'hold',
    status: 'draft',
    prepared_by: 'Jashim Uddin (Chattogram office)',
    prepared_on: '2026-04-20',
  },
  {
    land: 'Keraniganj riverside land',
    version_no: 1,
    est_acquisition_cost: 41_000_000,
    est_development_cost: 34_000_000,
    est_other_cost: 5_000_000,
    expected_revenue: 82_000_000,
    assumptions: '9 ft fill across 18 katha, approach road to be built, services brought in',
    risks: 'Annual flooding from the river. No utilities. The fill alone is most of the land price.',
    recommendation: 'reject',
    status: 'approved',
    prepared_by: 'Shafiq Rahman (Land Team)',
    decision_note:
      'Board agreed 2026-04-08 — the development cost is not recoverable at Keraniganj rates. Land rejected.',
    prepared_on: '2026-03-20',
    submitted_on: '2026-03-25',
    decided_on: '2026-04-08',
  },

  /* L7 — approved before each of these lands went to negotiation (SITE-003) */
  {
    land: 'Gazipur Tongi industrial-adjacent plot',
    version_no: 1,
    est_acquisition_cost: 42_000_000,
    est_development_cost: 6_000_000,
    est_other_cost: 5_000_000,
    expected_revenue: 82_000_000,
    assumptions: 'Outright purchase near 41 crore, industrial-worker housing, 8 floors',
    risks: 'No WASA line; the east-edge drainage may need a retaining drain',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Shafiq Rahman (Land Team)',
    decision_note: 'Approved. Negotiate below 41,000,000.',
    prepared_on: '2026-05-10',
    submitted_on: '2026-05-14',
    decided_on: '2026-05-25',
  },
  {
    land: 'Savar highway-side land',
    version_no: 1,
    est_acquisition_cost: 5_000_000,
    est_development_cost: 3_000_000,
    est_other_cost: 6_000_000,
    expected_revenue: 96_000_000,
    assumptions: 'JV 60:40 on flat count, 6 floors, highway-facing shops on the ground floor',
    risks: 'Two heirs must both sign; tin shed on the east strip',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Rifat Ahmed (Land Team)',
    decision_note: 'Approved. Proceed on a 60:40 JV.',
    prepared_on: '2026-04-15',
    submitted_on: '2026-04-20',
    decided_on: '2026-04-28',
  },
  {
    land: 'Chattogram Agrabad commercial plot',
    version_no: 1,
    est_acquisition_cost: 8_000_000,
    est_development_cost: 5_000_000,
    est_other_cost: 9_000_000,
    expected_revenue: 210_000_000,
    assumptions: 'JV on commercial floor area, 10 floors, bank tenants for the podium',
    risks: 'Demolition of the existing structure; soil not yet tested',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Jashim Uddin (Chattogram office)',
    decision_note: 'Approved. Strong location — proceed.',
    prepared_on: '2026-03-10',
    submitted_on: '2026-03-14',
    decided_on: '2026-03-20',
  },
  {
    land: 'Dhanmondi Road 27 plot',
    version_no: 1,
    est_acquisition_cost: 86_000_000,
    est_development_cost: 4_000_000,
    est_other_cost: 9_000_000,
    expected_revenue: 150_000_000,
    assumptions: 'Outright purchase around 82–84 crore, 9 floors, BDT 17,000/sqft',
    risks: 'Price is high; the margin depends on the Dhanmondi rate holding',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Rifat Ahmed (Land Team)',
    decision_note: 'Approved if the price is agreed at or under 84,000,000.',
    prepared_on: '2026-01-25',
    submitted_on: '2026-02-01',
    decided_on: '2026-02-10',
  },
  {
    land: 'Ashulia Zirabo industrial plot',
    version_no: 1,
    est_acquisition_cost: 52_000_000,
    est_development_cost: 9_000_000,
    est_other_cost: 6_000_000,
    expected_revenue: 105_000_000,
    assumptions: 'Staff housing, 6 floors, 5 ft fill across 3 bigha',
    risks: 'Paddy land — fill depth is an estimate; no WASA line',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Shafiq Rahman (Land Team)',
    decision_note: 'Approved. Negotiate at or below 49,000,000.',
    prepared_on: '2026-02-20',
    submitted_on: '2026-02-25',
    decided_on: '2026-03-06',
  },
  {
    land: 'Bashundhara Block J ready plot',
    version_no: 1,
    est_acquisition_cost: 4_000_000,
    est_development_cost: 0,
    est_other_cost: 3_000_000,
    expected_revenue: 68_000_000,
    assumptions: 'JV 58:42 on flat count, 8 floors, serviced plot needs no development',
    risks: 'Single owner abroad — power of attorney needed for signing',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Rifat Ahmed (Land Team)',
    decision_note: 'Approved on a 58:42 basis.',
    prepared_on: '2026-04-01',
    submitted_on: '2026-04-06',
    decided_on: '2026-04-20',
  },
  {
    land: 'Tangail Mirzapur roadside plot',
    version_no: 1,
    est_acquisition_cost: 30_500_000,
    est_development_cost: 7_500_000,
    est_other_cost: 3_200_000,
    expected_revenue: 71_000_000,
    assumptions:
      'Outright purchase at 30,500,000, 5 ft fill across 24 katha, plots sold rather than built on',
    risks:
      'The fill depth is a site estimate, not a survey. A foot more across 24 katha is roughly 1,500,000.',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Shafiq Rahman (Land Team)',
    decision_note: 'Approved. Negotiate at or below 31,000,000 and take a fill quantity before scheduling work.',
    prepared_on: '2026-03-28',
    submitted_on: '2026-04-02',
    decided_on: '2026-04-11',
  },
  {
    land: 'Narsingdi Madhabdi plot',
    version_no: 1,
    est_acquisition_cost: 24_000_000,
    est_development_cost: 1_000_000,
    est_other_cost: 2_900_000,
    expected_revenue: 58_000_000,
    assumptions: 'Outright purchase, 7 floors, 40ft access road as shown on the DAP sheet',
    risks: 'The access road is planned, not built. The whole revenue assumes it.',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Rifat Ahmed (Land Team)',
    decision_note: 'Approved. The road risk was noted and accepted.',
    prepared_on: '2025-12-20',
    submitted_on: '2025-12-24',
    decided_on: '2026-01-04',
  },
];
