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
    visit_date: '2026-06-08',
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
    decision_note: 'Board approved 2026-04-02. Proceed on the 55:45 basis.',
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
    decision_note: 'Margin under 30% at the asking price. Re-study after negotiating.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    version_no: 2,
    est_acquisition_cost: 36_000_000,
    est_development_cost: 2_000_000,
    est_other_cost: 6_500_000,
    expected_revenue: 78_000_000,
    assumptions: 'Purchase at 36,000,000 after negotiation, 7 floors, BDT 9,800/sqft',
    risks: 'No gas connection in the block — buyers will ask, and the answer costs something',
    recommendation: 'proceed',
    status: 'approved',
    prepared_by: 'Rifat Ahmed (Land Team)',
    decision_note: 'Approved at the negotiated land price. Proceed to registration.',
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
      'Board agreed 2026-06-20 — the development cost is not recoverable at Keraniganj rates. Land rejected.',
  },
];
