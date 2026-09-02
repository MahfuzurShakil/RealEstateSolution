import type { CostCategory, SupplierPaymentMethod } from './types';

/**
 * Bangladesh-context demo dataset for Module 7 (Finance).
 *
 * Same rule as Modules 5 and 6: everything time-dependent is an offset in days
 * from the day the demo is loaded, never a fixed date — an overdue instalment
 * or a land instalment "paid last quarter" has to stay true whenever the demo
 * is opened.
 *
 * The instalment schedules themselves are NOT listed here. They are generated
 * by the real code path when a booking is confirmed (Section 8.2), from the
 * project's plan template and the buyer's negotiated tenure, and the receipts
 * in `demo-bookings.ts` are what fill them in. Writing them by hand would
 * demo a schedule the feature never actually produced.
 *
 * What is here is what has no other source:
 *
 *   expenses — every cost category, project-charged and company-level,
 *              land-linked and not, across a wide date spread
 *   refunds  — a cancelled booking settled with a cancellation charge kept
 */

export interface DemoExpense {
  /** omit for a company-level cost that no project carries */
  project_name?: string;
  /** the land this payment is against, for land_payment / land_extra_cost */
  land_name?: string;
  cost_category: CostCategory;
  cost_reason: string;
  amount: number;
  days_ago: number;
  paid_to: string;
  payment_method: SupplierPaymentMethod;
  reference_no?: string;
  paid_by_key: string;
  notes?: string;
}

export const DEMO_EXPENSES: DemoExpense[] = [
  /* ---------------------------------------------------------------- *
   * Land — the biggest single line on any developer's books, and the
   * reason `expenses.land_id` exists.
   * ---------------------------------------------------------------- */
  {
    project_name: 'Nokshi Dhanmondi Court',
    land_name: 'Dhanmondi Road 27 plot',
    cost_category: 'land_payment',
    cost_reason: 'Land purchase — first instalment against the sale deed',
    amount: 42000000,
    days_ago: 760,
    paid_to: 'Md. Rafiqul Islam',
    payment_method: 'cheque',
    reference_no: 'CHQ 0011204',
    paid_by_key: 'faruk',
    notes: 'Paid at the sub-registry office on the day of registration.',
  },
  {
    project_name: 'Nokshi Dhanmondi Court',
    land_name: 'Dhanmondi Road 27 plot',
    cost_category: 'land_payment',
    cost_reason: 'Land purchase — final instalment',
    amount: 28000000,
    days_ago: 640,
    paid_to: 'Md. Rafiqul Islam',
    payment_method: 'bank',
    reference_no: 'BEFTN 5510923',
    paid_by_key: 'faruk',
  },
  {
    project_name: 'Nokshi Dhanmondi Court',
    land_name: 'Dhanmondi Road 27 plot',
    cost_category: 'land_extra_cost',
    cost_reason: 'Registration fee, stamp duty and mutation',
    amount: 5850000,
    days_ago: 758,
    paid_to: 'Sub-Registry Office, Dhanmondi',
    payment_method: 'cash',
    paid_by_key: 'faruk',
    notes: 'Government fees — no negotiation, receipts filed with the deed.',
  },
  {
    project_name: 'Nokshi Green Residence',
    land_name: 'Bashundhara Block K corner plot',
    cost_category: 'land_extra_cost',
    cost_reason: 'Boundary wall and site clearing before mobilisation',
    amount: 1240000,
    days_ago: 520,
    paid_to: 'Amin Enterprise',
    payment_method: 'bank',
    reference_no: 'BEFTN 6120884',
    paid_by_key: 'faruk',
  },
  {
    project_name: 'Nokshi Green Residence',
    land_name: 'Bashundhara Block K corner plot',
    cost_category: 'land_extra_cost',
    cost_reason: 'Landowner advance against the JV agreement',
    amount: 7500000,
    days_ago: 610,
    paid_to: 'Jashim Uddin Bhuiyan',
    payment_method: 'cheque',
    reference_no: 'CHQ 0021873',
    paid_by_key: 'faruk',
    notes: 'Adjustable against the landowner’s share at handover.',
  },

  /* ---------------------------------------------------------------- *
   * Contractors — the labour side, which Procurement does not cover.
   * ---------------------------------------------------------------- */
  {
    project_name: 'Nokshi Green Residence',
    cost_category: 'contractor_payment',
    cost_reason: 'Piling subcontract — running bill 4',
    amount: 6200000,
    days_ago: 300,
    paid_to: 'Nirman Construction Services',
    payment_method: 'bank',
    reference_no: 'BEFTN 6633109',
    paid_by_key: 'faruk',
    notes: 'Measured and certified by the project manager before release.',
  },
  {
    project_name: 'Nokshi Green Residence',
    cost_category: 'contractor_payment',
    cost_reason: 'Superstructure labour — Tower A, 6th and 7th floor',
    amount: 3450000,
    days_ago: 45,
    paid_to: 'Nirman Construction Services',
    payment_method: 'bank',
    reference_no: 'BEFTN 8841220',
    paid_by_key: 'faruk',
  },
  {
    project_name: 'Nokshi Dhanmondi Court',
    cost_category: 'contractor_payment',
    cost_reason: 'Painting and finishing contract — final bill',
    amount: 2850000,
    days_ago: 70,
    paid_to: 'Rang Bilash Painters',
    payment_method: 'cheque',
    reference_no: 'CHQ 0043902',
    paid_by_key: 'faruk',
    notes: '10% retention held until the snag list is closed.',
  },
  {
    project_name: 'Nokshi Dhanmondi Court',
    cost_category: 'contractor_payment',
    cost_reason: 'Lift installation and commissioning',
    amount: 4100000,
    days_ago: 110,
    paid_to: 'Fuji Elevator Bangladesh',
    payment_method: 'bank',
    reference_no: 'BEFTN 7790155',
    paid_by_key: 'faruk',
  },

  /* ---------------------------------------------------------------- *
   * Marketing and admin — some project-charged, some company-level,
   * which is what makes the "unallocated cost" line on the dashboard
   * demonstrable rather than theoretical.
   * ---------------------------------------------------------------- */
  {
    project_name: 'Nokshi Green Residence',
    cost_category: 'marketing',
    cost_reason: 'Bashundhara site billboard — six-month rental',
    amount: 480000,
    days_ago: 90,
    paid_to: 'Shomoy Outdoor Media',
    payment_method: 'bank',
    reference_no: 'BEFTN 8102244',
    paid_by_key: 'faruk',
  },
  {
    project_name: 'Nokshi Dhanmondi Court',
    cost_category: 'marketing',
    cost_reason: 'Prothom Alo half-page advertisement, Friday edition',
    amount: 320000,
    days_ago: 55,
    paid_to: 'Prothom Alo',
    payment_method: 'online',
    reference_no: 'PA/AD/2026/8891',
    paid_by_key: 'faruk',
  },
  {
    cost_category: 'marketing',
    cost_reason: 'REHAB Housing Fair — stall booking and fit-out',
    amount: 950000,
    days_ago: 120,
    paid_to: 'REHAB Bangladesh',
    payment_method: 'cheque',
    reference_no: 'CHQ 0038812',
    paid_by_key: 'faruk',
    // no project on purpose: the fair sells the whole company, not one project
    notes: 'Company-wide — leads from the fair went to three different projects.',
  },
  {
    cost_category: 'admin',
    cost_reason: 'Head office rent — Banani, quarterly',
    amount: 1350000,
    days_ago: 35,
    paid_to: 'Banani Properties Ltd.',
    payment_method: 'bank',
    reference_no: 'BEFTN 8877901',
    paid_by_key: 'faruk',
  },
  {
    cost_category: 'admin',
    cost_reason: 'Office staff salary — last month',
    amount: 2240000,
    days_ago: 12,
    paid_to: 'Payroll',
    payment_method: 'bank',
    reference_no: 'BEFTN 8901337',
    paid_by_key: 'faruk',
  },

  /* ---------------------------------------------------------------- *
   * The irregular ones. Section 8.3 exists so these have somewhere to
   * go without inventing a module for each — `cost_reason` is what
   * makes them readable a year later.
   * ---------------------------------------------------------------- */
  {
    project_name: 'Nokshi Green Residence',
    cost_category: 'other',
    cost_reason: 'Emergency site generator repair after the storm',
    amount: 185000,
    days_ago: 28,
    paid_to: 'Karim Diesel Works',
    payment_method: 'cash',
    paid_by_key: 'faruk',
    notes: 'Two days of work stopped; repaired on site rather than replaced.',
  },
  {
    project_name: 'Nokshi Agrabad Trade Centre',
    cost_category: 'other',
    cost_reason: 'Legal consultancy — CDA approval objection hearing',
    amount: 275000,
    days_ago: 64,
    paid_to: 'Adv. Shahidul Haque',
    payment_method: 'cheque',
    reference_no: 'CHQ 0041006',
    paid_by_key: 'faruk',
  },
  {
    project_name: 'Nokshi Uttara Heights',
    cost_category: 'other',
    cost_reason: 'Soil test and survey before the RAJUK submission',
    amount: 420000,
    days_ago: 140,
    paid_to: 'Geotech Survey Bangladesh',
    payment_method: 'bank',
    reference_no: 'BEFTN 7452201',
    paid_by_key: 'faruk',
    notes: 'Report attached to the RAJUK file.',
  },
  {
    cost_category: 'other',
    cost_reason: 'Accounting software annual licence',
    amount: 165000,
    days_ago: 200,
    paid_to: 'Softworks BD',
    payment_method: 'online',
    reference_no: 'SW/INV/4471',
    paid_by_key: 'faruk',
  },
];

/**
 * Refunds (Section 8.2). Matched to a cancelled booking by its customer and
 * unit, because a demo booking has no stable code until it is seeded.
 */
export interface DemoRefund {
  customer_key: string;
  unit_code: string;
  /** gross amount coming off what the buyer paid */
  amount: number;
  /** cancellation charge withheld from the cheque */
  deduction: number;
  days_ago: number;
  payment_method: SupplierPaymentMethod;
  reference_no?: string;
  processed_by_key: string;
  notes?: string;
}

export const DEMO_REFUNDS: DemoRefund[] = [
  {
    customer_key: 'rownak',
    unit_code: 'D-5B',
    // the buyer paid 2,200,000 in total; a part refund, so the booking still
    // shows money owed back and the "left to refund" guard is demonstrable
    amount: 1500000,
    deduction: 220000,
    days_ago: 40,
    payment_method: 'cheque',
    reference_no: 'CHQ 0044820',
    processed_by_key: 'faruk',
    notes:
      'First tranche returned after the cancellation was approved. 10% cancellation charge withheld per the booking form; the balance follows once the unit is resold.',
  },
];
