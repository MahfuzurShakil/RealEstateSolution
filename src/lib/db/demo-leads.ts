import type { LeadActivityType, LeadSource, LeadStatus, UserRole } from './types';

/**
 * Bangladesh-context demo dataset for Module 3, plus the staff leads are
 * assigned to (users, Section 9.4 — Module 8 will add the screens).
 *
 * The set is built so nothing opens empty and every combination is visible:
 * each pipeline status including lost and a revived lead, every source, leads
 * with and without a project/unit, assigned and unassigned, and follow-up dates
 * that land overdue, today and later this week.
 *
 * Follow-up dates are written as day offsets from "today" so the demo stays
 * live no matter when it is loaded — a fixed date would be stale by next week.
 */

export interface DemoUser {
  key: string;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
}

export const DEMO_USERS: DemoUser[] = [
  {
    key: 'shakib',
    name: 'Shakib Al Mamun',
    phone: '01712 445566',
    email: 'shakib@nokshiproperties.com.bd',
    role: 'head_of_sales',
    status: 'active',
  },
  {
    key: 'tanzila',
    name: 'Tanzila Rahman',
    phone: '01713 778899',
    email: 'tanzila@nokshiproperties.com.bd',
    role: 'sales_manager',
    status: 'active',
  },
  {
    key: 'arif',
    name: 'Arif Mahmud',
    phone: '01714 112233',
    email: 'arif@nokshiproperties.com.bd',
    role: 'sales_executive',
    status: 'active',
  },
  {
    key: 'nishat',
    name: 'Nishat Tabassum',
    phone: '01715 334455',
    email: 'nishat@nokshiproperties.com.bd',
    role: 'sales_executive',
    status: 'active',
  },
  {
    key: 'rakib',
    name: 'Rakibul Hasan',
    phone: '01716 556677',
    email: 'rakib@nokshiproperties.com.bd',
    role: 'sales_executive',
    status: 'active',
  },
  {
    key: 'shirin',
    name: 'Shirin Akhter',
    phone: '01717 889900',
    email: 'shirin@nokshiproperties.com.bd',
    role: 'project_manager',
    status: 'active',
  },
  {
    key: 'faruk',
    name: 'Faruk Ahmed',
    phone: '01718 223344',
    email: 'faruk@nokshiproperties.com.bd',
    role: 'accounts',
    status: 'active',
  },
  {
    key: 'imran',
    name: 'Imran Kabir',
    phone: '01719 667788',
    email: 'imran@nokshiproperties.com.bd',
    role: 'sales_executive',
    status: 'inactive',
  },
];

export interface DemoLeadActivity {
  activity_type: LeadActivityType;
  /** days before today; 0 is today */
  days_ago: number;
  notes: string;
  /** days from today; negative is overdue, 0 is due today */
  follow_up_in_days?: number;
}

export interface DemoLead {
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  inquiry_message?: string;
  /** demo project name; the unit is picked by code inside it */
  project_name?: string;
  unit_code?: string;
  budget_range?: string;
  /** demo user key */
  assigned_key?: string;
  status: LeadStatus;
  lost_reason?: string;
  /** days before today the inquiry first came in */
  created_days_ago: number;
  activities: DemoLeadActivity[];
}

export const DEMO_LEADS: DemoLead[] = [
  // --- overdue follow-up, mid-pipeline, unit picked -------------------------
  {
    name: 'Tanvir Hasan',
    phone: '01811 445566',
    email: 'tanvir.hasan@gmail.com',
    source: 'website_form',
    inquiry_message:
      'Bashundhara-তে 3 bedroom flat খুঁজছি, south facing হলে ভালো হয়। Loan facility আছে কিনা জানাবেন।',
    project_name: 'Nokshi Green Residence',
    unit_code: 'A-8A',
    budget_range: '1.5 – 2 Crore',
    assigned_key: 'arif',
    status: 'negotiation',
    created_days_ago: 34,
    activities: [
      {
        activity_type: 'call',
        days_ago: 33,
        notes: 'প্রথম কল। 3 bed, south facing চাইছেন। Ready হতে ২ বছর লাগবে শুনে সমস্যা নেই বলেছেন।',
      },
      {
        activity_type: 'whatsapp',
        days_ago: 26,
        notes: 'Floor plan আর price list পাঠানো হয়েছে। A-8A নিয়ে আগ্রহ দেখিয়েছেন।',
      },
      {
        activity_type: 'site_visit',
        days_ago: 18,
        notes: 'স্ত্রীকে নিয়ে সাইট দেখেছেন। Rooftop garden আর parking পছন্দ হয়েছে।',
      },
      {
        activity_type: 'meeting',
        days_ago: 9,
        notes:
          'অফিসে বসেছেন। 1.85 কোটি চাইছেন, আমরা 1.94 বলেছি। Payment 30% booking, বাকিটা 30 মাসে।',
        follow_up_in_days: -4,
      },
    ],
  },

  // --- due today, site visit scheduled -------------------------------------
  {
    name: 'Farhana Islam',
    phone: '01822 556677',
    email: 'farhana.islam@yahoo.com',
    source: 'facebook_ad',
    inquiry_message: 'Uttara-র প্রজেক্টের 2 bed flat-এর দাম কত? EMI-তে হবে?',
    project_name: 'Nokshi Uttara Heights',
    budget_range: '1 – 1.5 Crore',
    assigned_key: 'nishat',
    status: 'site_visit_scheduled',
    created_days_ago: 12,
    activities: [
      {
        activity_type: 'call',
        days_ago: 11,
        notes: 'Facebook ad দেখে ফোন। Uttara-তেই থাকেন, sector 13 হলে সবচেয়ে ভালো।',
      },
      {
        activity_type: 'whatsapp',
        days_ago: 6,
        notes: 'U-4A আর U-5B এর detail পাঠানো হয়েছে। স্বামীর সাথে আলোচনা করবেন বলেছেন।',
      },
      {
        activity_type: 'call',
        days_ago: 2,
        notes: 'সাইট ভিজিট ঠিক হয়েছে — আজ বিকেল ৪টায় অফিসে আসবেন, সেখান থেকে একসাথে যাব।',
        follow_up_in_days: 0,
      },
    ],
  },

  // --- brand new, unassigned, no project yet -------------------------------
  {
    name: 'Mizanur Rahman',
    phone: '01833 667788',
    source: 'phone_call',
    inquiry_message: 'Dhanmondi বা Bashundhara — যেকোনো একটায় flat আছে কিনা জানতে চাই।',
    budget_range: '2 – 3 Crore',
    status: 'new',
    created_days_ago: 1,
    activities: [],
  },

  // --- walk-in, contacted, overdue by a lot --------------------------------
  {
    name: 'Sabbir Ahmed Khan',
    phone: '01844 778899',
    email: 'sabbir.khan@outlook.com',
    source: 'walk_in',
    inquiry_message: 'অফিসে এসেছিলেন, Agrabad-এর commercial space নিয়ে জানতে চেয়েছেন।',
    project_name: 'Nokshi Agrabad Trade Centre',
    budget_range: 'Above 3 Crore',
    assigned_key: 'rakib',
    status: 'contacted',
    created_days_ago: 21,
    activities: [
      {
        activity_type: 'meeting',
        days_ago: 21,
        notes: 'Walk-in। নিজের ট্রেডিং ব্যবসার জন্য 2000+ sqft office খুঁজছেন।',
      },
      {
        activity_type: 'email',
        days_ago: 14,
        notes: 'AG-2A আর AG-3A এর layout মেইল করা হয়েছে। RAJUK approval কবে হবে জানতে চেয়েছেন।',
        follow_up_in_days: -7,
      },
    ],
  },

  // --- site visit done, upcoming follow-up ---------------------------------
  {
    name: 'Nusrat Jahan Mim',
    phone: '01855 889900',
    email: 'nusrat.mim@gmail.com',
    source: 'referral',
    inquiry_message: 'বান্ধবীর মাধ্যমে জেনেছি। Dhanmondi-র প্রজেক্টটা দেখতে চাই।',
    project_name: 'Nokshi Dhanmondi Court',
    unit_code: 'D-7A',
    budget_range: 'Above 3 Crore',
    assigned_key: 'arif',
    status: 'site_visit_done',
    created_days_ago: 16,
    activities: [
      {
        activity_type: 'call',
        days_ago: 15,
        notes: 'Referral — আগের কাস্টমার Delwar সাহেবের রেফারেন্স।',
      },
      {
        activity_type: 'site_visit',
        days_ago: 4,
        notes:
          'D-7A দেখেছেন। Handover-ready হওয়ায় খুশি। লেকের পাশে বলে location নিয়ে কোনো আপত্তি নেই।',
        follow_up_in_days: 3,
      },
    ],
  },

  // --- booked (Module 4 takes over) ----------------------------------------
  {
    name: 'Kamrul Hasan Chowdhury',
    phone: '01866 990011',
    email: 'kamrul.chowdhury@gmail.com',
    source: 'whatsapp',
    inquiry_message: 'WhatsApp-এ brochure দেখে যোগাযোগ। 4 bed লাগবে, family বড়।',
    project_name: 'Nokshi Dhanmondi Court',
    unit_code: 'D-6B',
    budget_range: 'Above 3 Crore',
    assigned_key: 'nishat',
    status: 'booked',
    created_days_ago: 62,
    activities: [
      { activity_type: 'whatsapp', days_ago: 61, notes: 'Brochure আর price list পাঠানো হয়েছে।' },
      {
        activity_type: 'site_visit',
        days_ago: 48,
        notes: 'পুরো পরিবার নিয়ে এসেছিলেন। D-6B (4 bed, 2050 sqft) পছন্দ হয়েছে।',
      },
      {
        activity_type: 'meeting',
        days_ago: 35,
        notes: 'দাম নিয়ে দুই দফা বসা হয়েছে। 3.05 কোটিতে রাজি হয়েছেন।',
      },
      {
        activity_type: 'call',
        days_ago: 30,
        notes: 'Booking money 15 লাখ দিয়েছেন। Booking module-এ customer record খোলা হবে।',
      },
    ],
  },

  // --- lost, with reason ---------------------------------------------------
  {
    name: 'Rezaul Karim',
    phone: '01877 001122',
    source: 'website_form',
    inquiry_message: 'Uttara-তে 3 bed, 1 কোটির মধ্যে হলে জানাবেন।',
    project_name: 'Nokshi Uttara Heights',
    budget_range: '50 Lakh – 1 Crore',
    assigned_key: 'rakib',
    status: 'lost',
    lost_reason:
      'Budget 1 কোটির বেশি যাবে না, আমাদের 3 bed শুরু 1.43 কোটি থেকে। অন্য ডেভেলপারের সাথে এগোচ্ছেন।',
    created_days_ago: 45,
    activities: [
      { activity_type: 'call', days_ago: 44, notes: 'Website form থেকে। 3 bed চাইছেন, বাজেট ১ কোটি।' },
      {
        activity_type: 'whatsapp',
        days_ago: 38,
        notes: '2 bed (U-2A, 1150 sqft) অফার করা হয়েছে — ছোট হয়ে যায় বলেছেন।',
      },
    ],
  },

  // --- revived from lost, now in negotiation --------------------------------
  {
    name: 'Shahnaz Parvin',
    phone: '01888 112233',
    email: 'shahnaz.parvin@gmail.com',
    source: 'phone_call',
    inquiry_message: 'ছেলে বিদেশ থেকে টাকা পাঠাবে, Bashundhara-তে flat কিনতে চাই।',
    project_name: 'Nokshi Green Residence',
    unit_code: 'A-9B',
    budget_range: '1.5 – 2 Crore',
    assigned_key: 'tanzila',
    status: 'negotiation',
    created_days_ago: 90,
    activities: [
      { activity_type: 'call', days_ago: 89, notes: 'ছেলের রেমিট্যান্স দিয়ে কিনবেন বলেছেন।' },
      {
        activity_type: 'site_visit',
        days_ago: 76,
        notes: 'সাইট দেখে পছন্দ হয়েছে, কিন্তু টাকা আসতে দেরি হবে বলেছেন।',
      },
      {
        activity_type: 'status_change',
        days_ago: 58,
        notes: 'Contacted → Lost. ছেলের ভিসা জটিলতায় টাকা আসছে না, আপাতত সিদ্ধান্ত স্থগিত।',
      },
      {
        activity_type: 'call',
        days_ago: 20,
        notes: 'নিজে থেকে ফোন করেছেন — ছেলের ভিসা হয়ে গেছে, আবার এগোতে চান।',
      },
      {
        activity_type: 'status_change',
        days_ago: 20,
        notes: 'Lost → Negotiation. Revived; আগের সব আলোচনা এখানেই আছে।',
      },
      {
        activity_type: 'meeting',
        days_ago: 5,
        notes: 'A-9B নিয়ে কথা হয়েছে। 15 লাখ ছাড় চাইছেন, ম্যানেজমেন্টে তুলতে হবে।',
        follow_up_in_days: 2,
      },
    ],
  },

  // --- duplicate case: same buyer came back through another channel --------
  {
    name: 'Anisur Rahman',
    phone: '01899 223344',
    email: 'anis.rahman@gmail.com',
    source: 'facebook_ad',
    inquiry_message: 'Agrabad-এর অফিস স্পেস নিয়ে জানতে চাই।',
    project_name: 'Nokshi Agrabad Trade Centre',
    budget_range: '2 – 3 Crore',
    assigned_key: 'rakib',
    status: 'contacted',
    created_days_ago: 28,
    activities: [
      { activity_type: 'call', days_ago: 27, notes: 'Facebook ad থেকে। Agrabad-এ অফিস খুঁজছেন।' },
      {
        activity_type: 'other',
        days_ago: 9,
        notes:
          'Repeat inquiry via website form under the name "Anis Rahman". একই নম্বর, তাই নতুন lead না খুলে এখানেই যোগ করা হয়েছে।',
      },
      {
        activity_type: 'whatsapp',
        days_ago: 3,
        notes: 'AG-4B এর floor plan পাঠানো হয়েছে। এই সপ্তাহে সাইটে আসবেন বলেছেন।',
        follow_up_in_days: 1,
      },
    ],
  },

  // --- unassigned website lead, no follow-up yet ---------------------------
  {
    name: 'Sadia Afrin',
    phone: '01911 334455',
    email: 'sadia.afrin@gmail.com',
    source: 'website_form',
    inquiry_message: 'Price range আর available unit-এর তালিকা পাঠাবেন প্লিজ।',
    project_name: 'Nokshi Green Residence',
    budget_range: '1 – 1.5 Crore',
    status: 'new',
    created_days_ago: 3,
    activities: [],
  },

  // --- other source, small budget, no project ------------------------------
  {
    name: 'Jamal Uddin',
    phone: '01922 445566',
    source: 'other',
    inquiry_message: 'পত্রিকার বিজ্ঞাপন দেখে এসেছি। ছোট flat আছে কিনা?',
    budget_range: 'Under 50 Lakh',
    assigned_key: 'nishat',
    status: 'contacted',
    created_days_ago: 8,
    activities: [
      {
        activity_type: 'call',
        days_ago: 7,
        notes:
          'পত্রিকার বিজ্ঞাপন থেকে। ৫০ লাখের নিচে কিছু নেই বলা হয়েছে; ভবিষ্যতের প্রজেক্টে জানাতে বলেছেন।',
        follow_up_in_days: 5,
      },
    ],
  },

  // --- referral, negotiation, high value, overdue --------------------------
  {
    name: 'Dr. Mahbub Alam',
    phone: '01933 556677',
    email: 'dr.mahbub@gmail.com',
    source: 'referral',
    inquiry_message: 'Square Hospital-এর কাছে হলে ভালো হয়, চেম্বারের সুবিধা হবে।',
    project_name: 'Nokshi Dhanmondi Court',
    unit_code: 'D-2A',
    budget_range: 'Above 3 Crore',
    assigned_key: 'tanzila',
    status: 'negotiation',
    created_days_ago: 40,
    activities: [
      { activity_type: 'call', days_ago: 39, notes: 'Referral। চেম্বারের জন্য নিচতলার shop চাইছেন।' },
      {
        activity_type: 'site_visit',
        days_ago: 25,
        notes: 'D-2A (640 sqft shop) দেখেছেন। রাস্তার দিকে মুখ থাকায় পছন্দ হয়েছে।',
      },
      {
        activity_type: 'meeting',
        days_ago: 11,
        notes: 'দাম 1.34 কোটি, উনি 1.20 বলছেন। Signage rights নিয়েও কথা হয়েছে।',
        follow_up_in_days: -2,
      },
    ],
  },
];
