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
  /*
   * The three buyers behind Tower A's booked and reserved flats (P-1). Those
   * units used to be forced into `booked` / `reserved` by
   * `unit_status_overrides` with no booking behind them, so the project's
   * Inventory rail said eight units were spoken for while its Finance tab
   * said one booking. A unit only reaches those two statuses because a
   * booking put it there, so now one did.
   */
  {
    key: 'saiful',
    name: 'Saiful Islam Khan',
    phone: '01977 334455',
    email: 'saiful.khan@gmail.com',
    nid: '1983664422110',
    address: 'Block D, Bashundhara R/A, Dhaka',
    profession: 'Civil Engineer',
    created_days_ago: 48,
  },
  {
    key: 'afsana',
    name: 'Afsana Karim',
    phone: '01966 445566',
    email: 'afsana.karim@gmail.com',
    nid: '1990553311220',
    address: 'Road 5, Nikunja 2, Dhaka 1229',
    profession: 'Pharmacist',
    created_days_ago: 41,
  },
  {
    key: 'tariq',
    name: 'Tariq Aziz',
    phone: '01911 223344',
    email: 'tariq.aziz@outlook.com',
    nid: '1987443322110',
    address: 'Sector 4, Uttara, Dhaka 1230',
    profession: 'IT Consultant',
    created_days_ago: 12,
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

  /*
   * An old confirmed booking, deliberately far enough back that its monthly
   * instalments have started falling due — without one of these the
   * collections queue and every overdue figure in Module 7 would be empty and
   * unprovable. Paid up to a point and then stopped, which is the realistic
   * shape of a late buyer.
   */
  {
    customer_key: 'zubair',
    project_name: 'Nokshi Dhanmondi Court',
    unit_code: 'D-4A',
    booked_by_key: 'nishat',
    days_ago: 400,
    floor_premium: 300000,
    facing_premium: 200000,
    parking_charge: 1000000,
    other_charges: 300000,
    discount_amount: 0,
    booking_amount: 1400000,
    installment_tenure_months: 24,
    payments: [
      {
        amount: 1400000,
        days_ago: 400,
        method: 'bank',
        reference_no: 'IBBL/TRF/220841',
        notes: 'Booking money',
      },
      {
        amount: 2400000,
        days_ago: 320,
        method: 'bank',
        reference_no: 'IBBL/TRF/231907',
        notes: 'Three monthly instalments together',
      },
      {
        amount: 1600000,
        days_ago: 250,
        method: 'cheque',
        reference_no: 'CHQ 0091244',
        notes: 'Two instalments',
      },
      {
        amount: 400000,
        days_ago: 180,
        method: 'mfs',
        reference_no: 'BKS4T8N02LP',
        notes: 'Part payment — said the rest would follow, and it has not',
      },
    ],
  },

  /*
   * Cancelled AFTER money was taken — the case Section 8.2's refunds table
   * exists for. The other cancelled booking below took nothing, so between
   * them both halves of a cancellation are demonstrable.
   */
  {
    customer_key: 'rownak',
    project_name: 'Nokshi Dhanmondi Court',
    unit_code: 'D-5B',
    booked_by_key: 'rakib',
    days_ago: 150,
    floor_premium: 250000,
    facing_premium: 150000,
    parking_charge: 1000000,
    other_charges: 250000,
    discount_amount: 0,
    booking_amount: 1300000,
    installment_tenure_months: 24,
    payments: [
      {
        amount: 1300000,
        days_ago: 150,
        method: 'bank',
        reference_no: 'BRAC/TRF/771903',
        notes: 'Booking money',
      },
      {
        amount: 900000,
        days_ago: 120,
        method: 'bank',
        reference_no: 'BRAC/TRF/779118',
        notes: 'First instalment',
      },
    ],
    cancel: {
      reason:
        'পরিবার নিয়ে কানাডা চলে যাচ্ছেন — বুকিং বাতিল করে টাকা ফেরত চেয়েছেন। চুক্তি অনুযায়ী cancellation charge কাটা হবে।',
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

  /*
   * Tower A's booked and reserved flats (P-1). These three replace
   * `unit_status_overrides` entries on Nokshi Green Residence: the status is
   * now produced by `createBooking` and `recordPayment` like every other
   * booking, so the Inventory rail and the Finance tab count the same events.
   *
   * A-4A and A-5B end up `booked` because the booking money is fully in;
   * A-6A ends up `reserved` because it is not, which is the Section 5.6 rule
   * doing the work rather than a status being typed in.
   */
  {
    customer_key: 'saiful',
    project_name: 'Nokshi Green Residence',
    unit_code: 'A-4A',
    booked_by_key: 'nishat',
    days_ago: 46,
    floor_premium: 300000,
    facing_premium: 200000,
    parking_charge: 800000,
    other_charges: 250000,
    discount_amount: 0,
    booking_amount: 1400000,
    installment_tenure_months: 24,
    payments: [
      {
        amount: 1400000,
        days_ago: 46,
        method: 'bank',
        reference_no: 'IBBL/TRF/220481',
        notes: 'Booking money, Islami Bank transfer',
      },
    ],
  },
  {
    customer_key: 'afsana',
    project_name: 'Nokshi Green Residence',
    unit_code: 'A-5B',
    booked_by_key: 'rakib',
    days_ago: 39,
    floor_premium: 350000,
    facing_premium: 150000,
    parking_charge: 800000,
    other_charges: 250000,
    discount_amount: 300000,
    booking_amount: 1300000,
    installment_tenure_months: 30,
    payments: [
      { amount: 800000, days_ago: 39, method: 'cheque', reference_no: 'CHQ 4471290' },
      {
        amount: 500000,
        days_ago: 33,
        method: 'bank',
        reference_no: 'CITY/TRF/889201',
        notes: 'Balance of the booking money',
      },
    ],
  },
  {
    /*
     * Deliberately part-paid: the booking money is 1,200,000 and only 400,000
     * has come in, so the unit stays `reserved` and the booking stays on hold.
     * That is the state the inventory rail used to show with nothing behind it.
     */
    customer_key: 'tariq',
    project_name: 'Nokshi Green Residence',
    unit_code: 'A-6A',
    booked_by_key: 'arif',
    days_ago: 10,
    floor_premium: 400000,
    facing_premium: 200000,
    parking_charge: 800000,
    other_charges: 250000,
    discount_amount: 0,
    booking_amount: 1200000,
    installment_tenure_months: 24,
    payments: [
      {
        amount: 400000,
        days_ago: 10,
        method: 'mfs',
        reference_no: 'NGD9K2P41ZX',
        notes: 'Part of the booking money over Nagad — balance promised this month',
      },
    ],
  },
];
