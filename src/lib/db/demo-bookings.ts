import type { PaymentMethod, UserRole } from './types';

/**
 * Bangladesh-context demo dataset for Module 4, built so every state in the
 * booking pipeline is visible on a fresh install:
 *
 *   - a confirmed booking with no discount at all
 *   - a confirmed booking whose discount was inside the seller's limit
 *   - one waiting on discount approval (money already in)
 *   - one on hold because the money has not arrived
 *   - one whose discount was rejected and is back on hold
 *   - a cancelled booking, with the unit released
 *   - a customer with two bookings, and one with none yet
 *
 * Bookings are created through the repository, so the side-effects of Section
 * 5.6 (unit reserved/booked/released, lead moved to booked) happen exactly as
 * they would in the app.
 */

/** Section 5.4 — what each role may give away without asking anyone. */
export const DEMO_DISCOUNT_RULES: Array<{ role: UserRole; max_discount_pct: number }> = [
  { role: 'sales_executive', max_discount_pct: 2 },
  { role: 'sales_manager', max_discount_pct: 5 },
  { role: 'head_of_sales', max_discount_pct: 8 },
  { role: 'management', max_discount_pct: 15 },
  { role: 'super_admin', max_discount_pct: 100 },
];

export interface DemoCustomer {
  key: string;
  name: string;
  phone: string;
  email?: string;
  nid?: string;
  address?: string;
  profession?: string;
  /** demo lead phone this customer was converted from */
  from_lead_phone?: string;
  /** days before today the customer record was created */
  created_days_ago: number;
}

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    key: 'kamrul',
    name: 'Kamrul Hasan Chowdhury',
    phone: '01866 990011',
    email: 'kamrul.chowdhury@gmail.com',
    nid: '1985447712390',
    address: 'House 42, Road 9/A, Dhanmondi, Dhaka 1209',
    profession: 'Garments Exporter',
    from_lead_phone: '01866 990011',
    created_days_ago: 34,
  },
  {
    key: 'nusrat',
    name: 'Nusrat Jahan Mim',
    phone: '01855 889900',
    email: 'nusrat.mim@gmail.com',
    nid: '1992336654120',
    address: 'Flat B4, House 17, Lalmatia, Dhaka 1207',
    profession: 'University Lecturer',
    from_lead_phone: '01855 889900',
    created_days_ago: 3,
  },
  {
    key: 'mahbub',
    name: 'Dr. Mahbub Alam',
    phone: '01933 556677',
    email: 'dr.mahbub@gmail.com',
    nid: '1978112245670',
    address: 'Green Road, Dhanmondi, Dhaka 1205',
    profession: 'Consultant Physician',
    from_lead_phone: '01933 556677',
    created_days_ago: 9,
  },
  {
    key: 'shahnaz',
    name: 'Shahnaz Parvin',
    phone: '01888 112233',
    email: 'shahnaz.parvin@gmail.com',
    nid: '1969884471230',
    address: 'Block C, Bashundhara R/A, Dhaka',
    profession: 'Homemaker',
    from_lead_phone: '01888 112233',
    created_days_ago: 4,
  },
  {
    key: 'zubair',
    name: 'Zubair Ahmed Siddiqui',
    phone: '01944 667788',
    email: 'zubair.siddiqui@gmail.com',
    nid: '1980775544330',
    address: 'Agrabad C/A, Chattogram',
    profession: 'Shipping Agent',
    // a walk-in buyer — never was a lead
    created_days_ago: 26,
  },
  {
    key: 'rownak',
    name: 'Rownak Jahan',
    phone: '01955 778899',
    email: 'rownak.jahan@outlook.com',
    nid: '1994220099880',
    address: 'Sector 7, Uttara, Dhaka 1230',
    profession: 'Banker',
    // no booking yet — the "nothing taken so far" case
    created_days_ago: 6,
  },
];

export interface DemoBooking {
  customer_key: string;
  /** demo project name + unit code the booking is against */
  project_name: string;
  unit_code: string;
  /** demo user key of the sales person */
  booked_by_key: string;
  days_ago: number;
  floor_premium: number;
  facing_premium: number;
  parking_charge: number;
  other_charges: number;
  discount_amount: number;
  booking_amount: number;
  /** months the monthly instalments are spread over for this buyer */
  installment_tenure_months?: number;
  /** receipts taken against this booking; empty means nothing received yet */
  payments?: Array<{
    amount: number;
    days_ago: number;
    method: PaymentMethod;
    reference_no?: string;
    notes?: string;
  }>;
  /** applied after creation, so the demo can show approved/rejected outcomes */
  discount_decision?: {
    decision: 'approved' | 'rejected';
    approver_key: string;
    note: string;
  };
  cancel?: { reason: string };
}

export const DEMO_BOOKINGS: DemoBooking[] = [
  // confirmed, no discount at all — the simplest happy path
  {
    customer_key: 'kamrul',
    project_name: 'Nokshi Dhanmondi Court',
    unit_code: 'D-6B',
    booked_by_key: 'nishat',
    days_ago: 30,
    floor_premium: 400000,
    facing_premium: 250000,
    parking_charge: 1000000,
    other_charges: 350000,
    discount_amount: 0,
    booking_amount: 1500000,
    installment_tenure_months: 24,
    payments: [
      {
        amount: 1500000,
        days_ago: 30,
        method: 'bank',
        reference_no: 'DBBL/TRF/449120',
        notes: 'Booking money, Dutch-Bangla transfer',
      },
    ],
  },

  // confirmed — 1.7% discount, inside a sales executive's 2% ceiling
  {
    customer_key: 'nusrat',
    project_name: 'Nokshi Dhanmondi Court',
    unit_code: 'D-7A',
    booked_by_key: 'arif',
    days_ago: 2,
    floor_premium: 350000,
    facing_premium: 200000,
    parking_charge: 500000,
    other_charges: 300000,
    discount_amount: 400000,
    booking_amount: 1200000,
    installment_tenure_months: 30,
    payments: [
      { amount: 700000, days_ago: 2, method: 'cash', notes: 'Cash taken at the sales office' },
      {
        amount: 500000,
        days_ago: 1,
        method: 'mfs',
        reference_no: 'BKS7H2M91QW',
        notes: 'Balance sent over bKash the next day',
      },
    ],
  },

  // pending approval — money is in, but 6.1% is over the manager's 5%
  {
    customer_key: 'mahbub',
    project_name: 'Nokshi Dhanmondi Court',
    unit_code: 'D-2A',
    booked_by_key: 'tanzila',
    days_ago: 5,
    floor_premium: 0,
    facing_premium: 300000,
    parking_charge: 0,
    other_charges: 450000,
    discount_amount: 820000,
    booking_amount: 1000000,
    installment_tenure_months: 36,
    payments: [
      {
        amount: 1000000,
        days_ago: 5,
        method: 'cheque',
        reference_no: 'CHQ 0043117',
        notes: 'Cheque cleared the same week',
      },
    ],
  },

  // on hold — discount is fine, but the booking money has not arrived
  {
    customer_key: 'shahnaz',
    project_name: 'Nokshi Green Residence',
    unit_code: 'A-9B',
    booked_by_key: 'tanzila',
    days_ago: 3,
    floor_premium: 300000,
    facing_premium: 150000,
    parking_charge: 500000,
    other_charges: 250000,
    discount_amount: 500000,
    booking_amount: 1000000,
    installment_tenure_months: 24,
    // nothing received yet - this is the booking that stays on hold
  },

  // rejected discount — back on hold, with the manager's note on the record
  {
    customer_key: 'zubair',
    project_name: 'Nokshi Agrabad Trade Centre',
    unit_code: 'AG-5A',
    booked_by_key: 'rakib',
    days_ago: 12,
    floor_premium: 0,
    facing_premium: 400000,
    parking_charge: 1000000,
    other_charges: 600000,
    discount_amount: 2900000,
    booking_amount: 2500000,
    installment_tenure_months: 18,
    payments: [
      {
        amount: 2500000,
        days_ago: 12,
        method: 'bank',
        reference_no: 'BRAC/TRF/771208',
      },
    ],
    discount_decision: {
      decision: 'rejected',
      approver_key: 'shakib',
      note: '10% ছাড় Agrabad-এ দেওয়া যাবে না — সর্বোচ্চ 5% পর্যন্ত আলোচনা করুন, তারপর আবার পাঠান।',
    },
  },

  // second booking for the same buyer — approved discount, confirmed
  {
    customer_key: 'zubair',
    project_name: 'Nokshi Agrabad Trade Centre',
    unit_code: 'AG-6B',
    booked_by_key: 'rakib',
    days_ago: 8,
    floor_premium: 0,
    facing_premium: 200000,
    parking_charge: 500000,
    other_charges: 300000,
    discount_amount: 900000,
    booking_amount: 1800000,
    installment_tenure_months: 18,
    payments: [
      {
        amount: 1800000,
        days_ago: 8,
        method: 'bank',
        reference_no: 'BRAC/TRF/778430',
        notes: 'Second unit, same account',
      },
    ],
    discount_decision: {
      decision: 'approved',
      approver_key: 'shakib',
      note: 'দুইটা ইউনিট একসাথে নিচ্ছেন, তাই 5.2% অনুমোদন করা হলো।',
    },
  },

  // cancelled — the unit goes back to available
  {
    customer_key: 'kamrul',
    project_name: 'Nokshi Green Residence',
    unit_code: 'A-8A',
    booked_by_key: 'arif',
    days_ago: 20,
    floor_premium: 250000,
    facing_premium: 150000,
    parking_charge: 500000,
    other_charges: 200000,
    discount_amount: 0,
    booking_amount: 1000000,
    installment_tenure_months: 24,
    // cancelled before any money was taken, so there is nothing to refund
    cancel: {
      reason: 'দ্বিতীয় ইউনিটের সিদ্ধান্ত বাতিল — ব্যবসার টাকা আটকে গেছে বলে জানিয়েছেন।',
    },
  },
];
