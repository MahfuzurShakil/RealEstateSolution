import type { AcquisitionCostHead, NegotiationParty, NegotiationRoundStatus } from './types';

/**
 * Batch L4 demo data — negotiation rounds and acquisition cost estimates
 * (BRD section 10).
 *
 * Rounds are listed oldest first and seeded in that order, so the ladder reads
 * the way it happened. Only the lands that actually got to a price have one — a
 * plot still under review has nothing to show, and that is the honest state.
 */

export interface DemoNegotiationRound {
  land: string;
  party: NegotiationParty;
  amount: number;
  offer_date: string;
  terms?: string;
  conditions?: string;
  broker_name?: string;
  broker_commission?: number;
  status: NegotiationRoundStatus;
  remarks?: string;
}

export interface DemoAcquisitionCost {
  land: string;
  cost_head: AcquisitionCostHead;
  estimated_amount: number;
  remarks?: string;
}

export const DEMO_NEGOTIATION_ROUNDS: DemoNegotiationRound[] = [
  /* Tangail - the plot that is registered and still waiting on a fill plan. */
  {
    land: 'Tangail Mirzapur roadside plot',
    party: 'us',
    amount: 29_000_000,
    offer_date: '2026-04-18',
    terms: 'Bayna 20%, balance at registration within 90 days',
    status: 'superseded',
    remarks: 'Opened below the feasibility ceiling to leave room for the fill.',
  },
  {
    land: 'Tangail Mirzapur roadside plot',
    party: 'us',
    amount: 30_500_000,
    offer_date: '2026-05-26',
    terms: 'Bayna 6,100,000, balance at registration',
    status: 'accepted',
    remarks: 'Accepted. Under the 31,000,000 the board approved.',
  },
  /* Madhabdi - agreed, registered, and later transferred on. */
  {
    land: 'Narsingdi Madhabdi plot',
    party: 'us',
    amount: 23_000_000,
    offer_date: '2026-01-09',
    status: 'superseded',
    remarks: 'Owner wanted 26,000,000 and came down over two weeks.',
  },
  {
    land: 'Narsingdi Madhabdi plot',
    party: 'us',
    amount: 24_000_000,
    offer_date: '2026-01-27',
    terms: 'Full payment at registration; the owner needed the money in one go',
    status: 'accepted',
  },
  /* Uttara — a straightforward purchase talked down over three rounds. The
     accepted amount is 36,000,000, which is what the land already carries. */
  {
    land: 'Uttara Sector 13 residential plot',
    party: 'owner',
    amount: 39_000_000,
    offer_date: '2026-01-18',
    terms: 'Full payment at registration',
    conditions: 'Registration within 60 days',
    broker_name: 'Uttara Land Link',
    broker_commission: 400_000,
    status: 'superseded',
    remarks: 'Owner opened at the asking price. Moving abroad, wants a quick close.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    party: 'us',
    amount: 35_000_000,
    offer_date: '2026-01-29',
    terms: '30% at agreement, 70% at registration within 90 days',
    conditions: 'Registration within 90 days; seller clears all dues first',
    broker_name: 'Uttara Land Link',
    broker_commission: 400_000,
    status: 'superseded',
    remarks: 'Opened low on the missing gas connection and the 90-day timeline.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    party: 'owner',
    amount: 36_000_000,
    offer_date: '2026-02-11',
    terms: '30% at agreement, 70% at registration within 75 days',
    conditions: 'Registration within 75 days; seller clears holding tax before the deed',
    broker_name: 'Uttara Land Link',
    broker_commission: 400_000,
    status: 'accepted',
    remarks: 'Split the difference and shortened the timeline. Board approved the same week.',
  },

  /* Gazipur Tongi — still on the table. The land sits at Negotiation, so the
     ladder has a live round and no accepted one, which is what a land team
     actually looks at. */
  {
    land: 'Gazipur Tongi industrial-adjacent plot',
    party: 'owner',
    amount: 44_000_000,
    offer_date: '2026-06-14',
    terms: 'Full payment at registration',
    conditions: 'No conditions offered',
    broker_name: 'Tongi Property Bazar',
    status: 'superseded',
    remarks: 'Asking price. Owner claims two other parties are interested.',
  },
  {
    land: 'Gazipur Tongi industrial-adjacent plot',
    party: 'us',
    amount: 39_500_000,
    offer_date: '2026-07-02',
    terms: '20% at agreement, 80% at registration within 120 days',
    conditions: 'Subject to the mutation being completed by the seller; access lane widened to 24 ft',
    broker_name: 'Tongi Property Bazar',
    broker_commission: 450_000,
    status: 'open',
    remarks: 'Offer made after the site visit. Waiting on the owner since the first week of July.',
  },

  /* Savar JV — a joint venture negotiates a share, but the signing money is
     still a number that moves. Two rounds, one live. */
  {
    land: 'Savar highway-side land',
    party: 'owner',
    amount: 8_000_000,
    offer_date: '2026-05-20',
    terms: 'Signing money on the day of the agreement',
    conditions: '50:50 split; owner keeps the two front units on every floor',
    status: 'superseded',
    remarks: 'Two siblings own it jointly; the elder does the talking.',
  },
  {
    land: 'Savar highway-side land',
    party: 'us',
    amount: 5_000_000,
    offer_date: '2026-06-08',
    terms: 'Signing money at agreement, rent for 30 months from the date of possession',
    conditions: '50:50 split; unit allocation to be drawn on the approved plan, not promised now',
    status: 'accepted',
    remarks: 'Countered on the signing money and offered rent instead. Accepted — the land is agreed.',
  },

  /*
   * L7 — the three closed deals reached their price through the ladder too, so
   * "Price agreed" is ticked on every land that got past negotiation.
   */
  {
    land: 'Bashundhara Block K corner plot',
    party: 'owner',
    amount: 8_000_000,
    offer_date: '2026-03-02',
    terms: 'Signing money on the day of the agreement',
    conditions: '50:50 split',
    status: 'superseded',
  },
  {
    land: 'Bashundhara Block K corner plot',
    party: 'us',
    amount: 6_000_000,
    offer_date: '2026-03-30',
    terms: 'Signing money at agreement',
    conditions: '55:45 split on flat count',
    status: 'accepted',
    remarks: 'Owner took the lower signing money for the better split.',
  },
  {
    land: 'Chattogram Agrabad commercial plot',
    party: 'us',
    amount: 4_000_000,
    offer_date: '2026-03-26',
    terms: 'Signing money at agreement',
    conditions: 'Split on commercial floor area; developer demolishes the existing structure',
    status: 'superseded',
  },
  {
    land: 'Chattogram Agrabad commercial plot',
    party: 'owner',
    amount: 4_500_000,
    offer_date: '2026-04-20',
    terms: 'Signing money at agreement',
    conditions: 'Split on commercial floor area; developer demolishes the existing structure',
    status: 'accepted',
  },
  {
    land: 'Dhanmondi Road 27 plot',
    party: 'owner',
    amount: 86_000_000,
    offer_date: '2026-02-14',
    terms: 'Full payment within 90 days',
    status: 'superseded',
    remarks: 'Family opened at the asking price.',
  },
  {
    land: 'Dhanmondi Road 27 plot',
    party: 'us',
    amount: 82_000_000,
    offer_date: '2026-02-24',
    terms: 'Advance at agreement, balance before registration',
    status: 'accepted',
    remarks: 'Accepted — the family wanted a quick close to settle the inheritance.',
  },
  {
    land: 'Ashulia Zirabo industrial plot',
    party: 'owner',
    amount: 52_000_000,
    offer_date: '2026-03-18',
    terms: 'Full payment within 60 days',
    status: 'superseded',
    remarks: 'Owner opened at the asking price.',
  },
  {
    land: 'Ashulia Zirabo industrial plot',
    party: 'us',
    amount: 49_000_000,
    offer_date: '2026-04-04',
    terms: '40% at agreement, balance at registration',
    conditions: 'Seller clears the crop before handover',
    status: 'accepted',
    remarks: 'Accepted at 49,000,000 — the fill cost was the argument.',
  },
  {
    land: 'Bashundhara Block J ready plot',
    party: 'owner',
    amount: 5_000_000,
    offer_date: '2026-05-05',
    terms: 'Signing money at agreement',
    conditions: '55:45 split',
    status: 'superseded',
  },
  {
    land: 'Bashundhara Block J ready plot',
    party: 'us',
    amount: 4_000_000,
    offer_date: '2026-05-31',
    terms: 'Signing money at agreement',
    conditions: '58:42 split on flat count',
    status: 'accepted',
    remarks: 'Owner took the lower signing money for the better split.',
  },
];

export const DEMO_ACQUISITION_COSTS: DemoAcquisitionCost[] = [
  /* Uttara — acquired, so the sheet has a full estimate to compare the ledger
     against. */
  { land: 'Uttara Sector 13 residential plot', cost_head: 'land_price', estimated_amount: 36_000_000 },
  {
    land: 'Uttara Sector 13 residential plot',
    cost_head: 'registration_fee',
    estimated_amount: 360_000,
    remarks: '1% of deed value',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    cost_head: 'stamp_duty',
    estimated_amount: 540_000,
    remarks: '1.5% of deed value',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    cost_head: 'vat_tax',
    estimated_amount: 720_000,
    remarks: '2% gain tax at source',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    cost_head: 'mutation_cost',
    estimated_amount: 45_000,
    remarks: 'Namjari fee plus the DCR',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    cost_head: 'legal_fee',
    estimated_amount: 180_000,
    remarks: 'Search, drafting and the registration day',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    cost_head: 'broker_commission',
    estimated_amount: 400_000,
    remarks: 'Agreed with Uttara Land Link at the first meeting',
  },

  /* Dhanmondi — acquired at a much larger figure; the sheet shows what a
     high-value registration actually costs on top of the land. */
  { land: 'Dhanmondi Road 27 plot', cost_head: 'land_price', estimated_amount: 82_000_000 },
  {
    land: 'Dhanmondi Road 27 plot',
    cost_head: 'registration_fee',
    estimated_amount: 820_000,
    remarks: '1% of deed value',
  },
  {
    land: 'Dhanmondi Road 27 plot',
    cost_head: 'stamp_duty',
    estimated_amount: 1_230_000,
    remarks: '1.5% of deed value',
  },
  {
    land: 'Dhanmondi Road 27 plot',
    cost_head: 'vat_tax',
    estimated_amount: 1_640_000,
    remarks: '2% gain tax at source',
  },
  {
    land: 'Dhanmondi Road 27 plot',
    cost_head: 'legal_fee',
    estimated_amount: 250_000,
  },
  {
    land: 'Dhanmondi Road 27 plot',
    cost_head: 'survey_fee',
    estimated_amount: 60_000,
    remarks: 'Amin survey before the deed',
  },
  /*
   * Tangail carries a full cost sheet because it is the plot whose true cost
   * is still open: the acquisition is settled and the development is not, so
   * the sheet is the one place the two sit side by side.
   */
  {
    land: 'Tangail Mirzapur roadside plot',
    cost_head: 'land_price',
    estimated_amount: 30_500_000,
  },
  {
    land: 'Tangail Mirzapur roadside plot',
    cost_head: 'registration_fee',
    estimated_amount: 305_000,
    remarks: '1% of deed value',
  },
  {
    land: 'Tangail Mirzapur roadside plot',
    cost_head: 'stamp_duty',
    estimated_amount: 458_000,
    remarks: '1.5% of deed value',
  },
  {
    land: 'Tangail Mirzapur roadside plot',
    cost_head: 'vat_tax',
    estimated_amount: 610_000,
    remarks: '2% gain tax at source',
  },
  {
    land: 'Tangail Mirzapur roadside plot',
    cost_head: 'legal_fee',
    estimated_amount: 180_000,
  },
  {
    land: 'Tangail Mirzapur roadside plot',
    cost_head: 'survey_fee',
    estimated_amount: 45_000,
    remarks: 'Amin survey; the fill quantity survey is still outstanding',
  },
];
