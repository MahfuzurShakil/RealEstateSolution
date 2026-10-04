import type {
  AcquisitionType,
  JvShareBasis,
  LandSizeUnit,
  LandStatus,
  LandStatusEventSource,
} from './types';

/**
 * Bangladesh-context demo dataset for Module 1, so a fresh install never opens
 * on an empty screen. Names, mouzas, dag/khatian numbers and prices are made up
 * but shaped like real records; prices are BDT and sizes are katha/bigha.
 *
 * Every land in this list is a different combination on purpose: each pipeline
 * status, both acquisition types, single vs. multiple owners, JV terms with and
 * without a power of attorney, and lands with and without coordinates.
 */

export interface DemoOwner {
  key: string;
  name: string;
  phone: string;
  nid: string;
  address: string;
  notes?: string;
}

export interface DemoStatusEvent {
  to_status: LandStatus;
  /**
   * L7 — how the change happened. Left off for the history the old status
   * dialogs wrote, which is what that history was; the newer demo lands carry
   * `automatic` rows so the Status changes card shows all three kinds.
   */
  source?: LandStatusEventSource;
  event_date: string;
  performed_by?: string;
  amount?: number;
  reference_no?: string;
  remarks?: string;
}

/** One attached file in the demo (land or project). */
export interface DemoDocument {
  /** a value from LAND_DOCUMENT_TYPES / PROJECT_DOCUMENT_TYPES */
  type: string;
  /** the name shown in the list and drawn on the sample file */
  title: string;
  notes?: string;
  is_public?: boolean;
}

export interface DemoLand {
  name: string;
  location_division: string;
  location_district: string;
  location_upazila?: string;
  location_area: string;
  road?: string;
  road_access?: string;
  land_classification?: string;
  source?: string;
  mouza?: string;
  dag_number?: string;
  khatian_number?: string;
  land_size: number;
  land_size_unit: LandSizeUnit;
  asking_price: number;
  final_agreed_amount?: number;
  gps_lat?: number;
  gps_lng?: number;
  nearby_facilities?: string;
  acquisition_type: AcquisitionType;
  status: LandStatus;
  /**
   * Demo user key this land is assigned to (`lands.assigned_to`).
   *
   * Applied after the users exist — lands are seeded first — so this is a key,
   * not an id. See `applyDemoAssignments` in demo-seed.ts.
   */
  assigned_to_key?: string;
  remarks?: string;
  created_at: string;
  /**
   * Files on the Documents tab. `title` is what the user sees and what the
   * generated PNG is captioned with, so a demo shows named paperwork rather
   * than eight identical teal rectangles.
   */
  documents?: DemoDocument[];
  /**
   * Owner keys + their share of the plot. `area` is in the land's own
   * `land_size_unit` and `amount` is what was agreed with that owner
   * specifically (BRD LAND-002) — both are left off the lands where nobody
   * would have recorded them yet, so the Owners tab shows the "not recorded
   * for every owner" case as well as the reconciled one.
   */
  owners: {
    key: string;
    share: number;
    primary?: boolean;
    area?: number;
    amount?: number;
  }[];
  jv?: {
    developer_share_pct: number;
    landowner_share_pct: number;
    agreement_date: string;
    power_of_attorney: boolean;
    poa_reference?: string;
    jv_share_basis?: JvShareBasis;
  };
  /** pipeline trail; the last entry matches `status` */
  history: DemoStatusEvent[];
}

export const DEMO_OWNERS: DemoOwner[] = [
  {
    key: 'rafiqul',
    name: 'Md. Rafiqul Islam',
    phone: '01711 223344',
    nid: '1990123456789',
    address: 'House 42, Road 7, Dhanmondi, Dhaka',
    notes: 'Prefers phone calls after 6pm',
  },
  {
    key: 'nasima',
    name: 'Nasima Akter',
    phone: '01712 556677',
    nid: '1985098765432',
    address: 'Flat B4, Green View, Uttara Sector 7, Dhaka',
  },
  {
    key: 'abdul',
    name: 'Abdul Karim Bhuiyan',
    phone: '01819 334455',
    nid: '1978112233445',
    address: 'Village: Baliapur, Savar, Dhaka',
    notes: 'Elder brother of Shahida Begum — joint inheritance',
  },
  {
    key: 'shahida',
    name: 'Shahida Begum',
    phone: '01911 778899',
    nid: '1982334455667',
    address: 'Village: Baliapur, Savar, Dhaka',
  },
  {
    key: 'jashim',
    name: 'Jashim Uddin Chowdhury',
    phone: '01818 990011',
    nid: '1969445566778',
    address: 'Khulshi R/A, Chattogram',
    notes: 'Represented by his son for site visits',
  },
  {
    key: 'ruhul',
    name: 'Ruhul Amin Mia',
    phone: '01715 662211',
    nid: '1975667788990',
    address: 'Tongi, Gazipur',
  },
  {
    key: 'farhana',
    name: 'Farhana Yasmin',
    phone: '01677 445533',
    nid: '1992556677889',
    address: 'Zindabazar, Sylhet',
  },
  {
    key: 'monir',
    name: 'Monir Hossain Talukder',
    phone: '01521 334477',
    nid: '1981778899001',
    address: 'Fatullah, Narayanganj',
  },
  {
    key: 'sultana',
    name: 'Sultana Razia',
    phone: '01755 220099',
    nid: '1988990011223',
    address: 'Mirpur DOHS, Dhaka',
    notes: 'Not linked to any land yet — introduced by a broker',
  },
  {
    key: 'delwar',
    name: 'Delwar Hossain',
    phone: '01611 887766',
    nid: '1973221100998',
    address: 'Comilla Sadar, Cumilla',
    notes: 'Owns adjoining plots, open to future deals',
  },
  {
    key: 'anwara',
    name: 'Anwara Khatun',
    phone: '01822 445566',
    nid: '1968554433221',
    address: 'Mirzapur, Tangail',
    notes: 'Widow; her son Shahin handles the paperwork on her behalf',
  },
  {
    key: 'nazrul',
    name: 'Kazi Nazrul Haque',
    phone: '01533 998877',
    nid: '1981667788990',
    address: 'Madhabdi, Narsingdi',
    notes: 'Textile mill owner; sold to raise working capital',
  },
  {
    key: 'joynal',
    name: 'Md. Joynal Abedin',
    phone: '01715 662200',
    nid: '1964889977665',
    address: 'Kanchan, Rupganj, Narayanganj',
    notes: 'Sold the family tract in one deal; four brothers signed together',
  },
  {
    key: 'mosharraf',
    name: 'Mosharraf Hossain Khan',
    phone: '01711 909090',
    nid: '1971445566778',
    address: 'House 9, Road 12, Sector 4, Uttara, Dhaka',
    notes: 'Eldest of three siblings; signs for the family and keeps the original deeds',
  },
  {
    key: 'shireen',
    name: 'Shireen Akhter Khan',
    phone: '01811 909091',
    nid: '1975112233445',
    address: 'Sector 7, Uttara, Dhaka',
    notes: 'Second sibling; wanted the flat allocation in writing before signing',
  },
  {
    key: 'arifur',
    name: 'Arifur Rahman Khan',
    phone: '01911 909092',
    nid: '1979667788990',
    address: 'Toronto, Canada',
    notes: 'Youngest sibling, lives abroad — signed through a registered power of attorney',
  },
  {
    key: 'rehana',
    name: 'Rehana Parvin',
    phone: '01918 335577',
    nid: '1986223344556',
    address: 'Birulia, Savar, Dhaka',
    notes: 'Lives in Canada; her brother holds the power of attorney',
  },
];

export const DEMO_LANDS: DemoLand[] = [
  {
    name: 'Bashundhara Block K corner plot',
    land_classification: 'ভিটি (Bhiti — homestead)',
    source: 'Direct owner approach',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Vatara',
    location_area: 'Bashundhara R/A',
    road: 'Road 12, Block K',
    road_access: 'Two-road corner, 25 ft and 20 ft pucca',
    mouza: 'Baridhara',
    dag_number: '1245',
    khatian_number: '88/3',
    land_size: 10,
    land_size_unit: 'katha',
    // a joint venture has no asking price — the owner is paid in units
    asking_price: 0,
    // signing money agreed with the owner, on top of the unit share
    final_agreed_amount: 6_000_000,
    gps_lat: 23.8203,
    gps_lng: 90.4359,
    nearby_facilities:
      'Independent University 800m, Apollo Hospital 1.5km, 100ft road 400m, Bashundhara Mall 2km',
    acquisition_type: 'joint_venture',
    status: 'acquired',
    remarks: 'Corner plot, two-road facing. Owner wanted a JV from the first meeting.',
    created_at: '2026-01-14T09:20:00.000Z',
    owners: [{ key: 'rafiqul', share: 100, primary: true }],
    jv: {
      developer_share_pct: 55,
      landowner_share_pct: 45,
      agreement_date: '2026-04-18',
      power_of_attorney: true,
      poa_reference: 'POA-2026-014',
      jv_share_basis: 'flat_count',
    },
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-01-22',
        performed_by: 'Kamal Hossain (Land Team)',
        remarks: 'Road access good, boundary wall broken on the north side.',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-02-09',
        performed_by: 'Adv. Nusrat Jahan',
        reference_no: 'LV-2026-004',
        remarks: 'Title chain clear back to 1987. Mutation already done.',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-03-02',
        amount: 45000000,
        performed_by: 'Rifat Ahmed',
        remarks: 'Owner agreed to 45:55 sharing instead of an outright sale.',
      },
      {
        to_status: 'agreed',
        event_date: '2026-04-05',
        amount: 45000000,
        remarks: 'Board approved the JV structure.',
      },
      {
        to_status: 'acquired',
        event_date: '2026-04-18',
        reference_no: 'JV-2026-003',
        remarks: 'Signed at the Gulshan office. POA executed the same day.',
      },
    ],
  },
  {
    name: 'Uttara Sector 13 residential plot',
    land_classification: 'ভিটি (Bhiti — homestead)',
    source: 'Broker / Dalal',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Uttara',
    location_area: 'Uttara',
    road: 'Road 9, Sector 13',
    road_access: '60 ft sector road, direct frontage',
    mouza: 'Turag',
    dag_number: '3120',
    khatian_number: '412',
    land_size: 7.5,
    land_size_unit: 'katha',
    asking_price: 39000000,
    final_agreed_amount: 36000000,
    gps_lat: 23.8759,
    gps_lng: 90.3795,
    nearby_facilities: 'Uttara Metro Station 1.2km, Shaheed Monsur Ali Medical 900m, school 300m',
    acquisition_type: 'direct_purchase',
    status: 'acquired',
    remarks: 'Registration completed; mutation filing in progress.',
    created_at: '2026-01-06T05:45:00.000Z',
    owners: [{ key: 'nasima', share: 100, primary: true, area: 7.5, amount: 36_000_000 }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-01-11',
        performed_by: 'Kamal Hossain (Land Team)',
        remarks: 'Filled plot, ready for piling. Metro line within walking distance.',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-01-28',
        performed_by: 'Adv. Nusrat Jahan',
        reference_no: 'LV-2026-002',
        remarks: 'RAJUK plot, allotment papers verified. No encumbrance.',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-02-14',
        amount: 36500000,
        performed_by: 'Rifat Ahmed',
      },
      {
        to_status: 'agreed',
        event_date: '2026-03-01',
        amount: 36000000,
        remarks: 'Approved at BDT 36,000,000 with payment in three instalments.',
      },
      {
        to_status: 'acquired',
        event_date: '2026-03-19',
        amount: 36000000,
        reference_no: '4521/2026',
        remarks: 'Registered at Uttara sub-registry office.',
      },
    ],
  },
  {
    name: 'Savar highway-side land',
    // the signing money agreed in round 2 of the ladder (demo-negotiation.ts)
    final_agreed_amount: 5_000_000,
    land_classification: 'চালা (Chala — high land)',
    source: 'Reference',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Savar',
    location_area: 'Savar',
    road: 'Dhaka–Aricha Highway',
    road_access: 'Dhaka–Aricha highway frontage, 40 ft service road',
    mouza: 'Baliapur',
    dag_number: '778',
    khatian_number: '205/1',
    land_size: 1.5,
    land_size_unit: 'bigha',
    // a joint venture has no asking price — the owner is paid in units
    asking_price: 0,
    gps_lat: 23.8583,
    gps_lng: 90.2667,
    nearby_facilities: 'Savar Bazar 2km, Enam Medical College 3km, highway frontage 60ft',
    acquisition_type: 'joint_venture',
    status: 'agreed',
    remarks: 'Two siblings inherited the land; both must sign.',
    created_at: '2026-02-03T07:10:00.000Z',
    owners: [
      { key: 'abdul', share: 60, primary: true, area: 0.9, amount: 3_000_000 },
      { key: 'shahida', share: 40, area: 0.6, amount: 2_000_000 },
    ],
    jv: {
      developer_share_pct: 50,
      landowner_share_pct: 50,
      agreement_date: '2026-06-10',
      power_of_attorney: false,
    },
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-02-12',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Low land, will need about 4ft of filling. Highway frontage is the main value.',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-03-16',
        performed_by: 'Adv. Tanvir Alam',
        reference_no: 'LV-2026-011',
        remarks: 'Inheritance documents in order; partition deed pending between the siblings.',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-05-04',
        amount: 57000000,
        performed_by: 'Rifat Ahmed',
        remarks: 'Owners are asking for 50:50 sharing plus 2 parking spaces.',
      },
      {
        to_status: 'agreed',
        event_date: '2026-06-10',
        amount: 57000000,
        remarks: 'Awaiting board decision on the extra parking demand.',
      },
    ],
  },
  {
    name: 'Gazipur Tongi industrial-adjacent plot',
    land_classification: 'চালা (Chala — high land)',
    source: 'Broker / Dalal',
    location_division: 'Dhaka',
    location_district: 'Gazipur',
    location_upazila: 'Tongi',
    location_area: 'Tongi',
    road: 'Kamarpara Road',
    road_access: '30 ft approach road off Tongi–Ashulia road',
    mouza: 'Auchpara',
    dag_number: '5567',
    khatian_number: '1102',
    land_size: 2,
    land_size_unit: 'bigha',
    asking_price: 44000000,
    gps_lat: 23.8985,
    gps_lng: 90.4023,
    nearby_facilities: 'Tongi railway station 2.5km, BSCIC industrial area 1km',
    acquisition_type: 'direct_purchase',
    status: 'negotiation',
    remarks: 'Owner wants full payment within 60 days of the deed.',
    created_at: '2026-03-11T04:30:00.000Z',
    owners: [{ key: 'ruhul', share: 100, primary: true }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-03-18',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Boundary marked with pillars. Drainage on the east edge needs checking.',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-04-22',
        performed_by: 'Adv. Tanvir Alam',
        reference_no: 'LV-2026-019',
        remarks: 'Khatian and dag match the survey. Tax receipts up to date.',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-06-02',
        amount: 41000000,
        performed_by: 'Rifat Ahmed',
        remarks: 'Started at 44M, owner has come down to 41M.',
      },
    ],
  },
  {
    name: 'Chattogram Khulshi hillside plot',
    land_classification: 'ডাঙ্গা (Danga — dry raised land)',
    source: 'Own survey',
    location_division: 'Chattogram',
    location_district: 'Chattogram',
    location_upazila: 'Khulshi',
    location_area: 'Khulshi',
    road: 'Zakir Hossain Road',
    road_access: '20 ft hill road, steep for the last 60 m',
    mouza: 'Pahartali',
    dag_number: '901',
    khatian_number: '77',
    land_size: 12,
    land_size_unit: 'katha',
    asking_price: 54000000,
    gps_lat: 22.3617,
    gps_lng: 91.8113,
    nearby_facilities: 'Chattogram Medical 4km, Khulshi Mart 1km, foreign consulates nearby',
    acquisition_type: 'direct_purchase',
    status: 'dd_in_progress',
    remarks: 'Premium location; slope will raise the foundation cost.',
    created_at: '2026-04-08T06:00:00.000Z',
    owners: [{ key: 'jashim', share: 100, primary: true }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-04-15',
        performed_by: 'Imran Kabir (Chattogram)',
        remarks: 'Hill-cutting clearance will be needed. Approach road is narrow (16ft).',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-05-20',
        performed_by: 'Adv. Sabbir Rahman',
        reference_no: 'LV-2026-023',
        remarks: 'CDA approval history being collected from the owner.',
      },
    ],
  },
  {
    name: 'Narayanganj Fatullah plot',
    land_classification: 'নাল (Nal — paddy land)',
    source: 'Owner walk-in',
    location_division: 'Dhaka',
    location_district: 'Narayanganj',
    location_upazila: 'Fatullah',
    location_area: 'Fatullah',
    road: 'Pagla–Fatullah Road',
    road_access: 'Pagla–Fatullah road, 18 ft access lane',
    mouza: 'Kutubpur',
    dag_number: '2210',
    khatian_number: '630',
    land_size: 9,
    land_size_unit: 'katha',
    asking_price: 27000000,
    gps_lat: 23.6461,
    gps_lng: 90.4917,
    nearby_facilities: 'Fatullah Stadium 1.8km, launch terminal 3km, primary school 400m',
    acquisition_type: 'direct_purchase',
    status: 'under_review',
    created_at: '2026-05-19T08:15:00.000Z',
    owners: [{ key: 'monir', share: 100, primary: true }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-05-26',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Tenants currently on the land; vacancy timeline to be confirmed.',
      },
    ],
  },
  {
    name: 'Sylhet Zindabazar mixed-use plot',
    land_classification: 'বাণিজ্যিক (Commercial)',
    source: 'Reference',
    location_division: 'Sylhet',
    location_district: 'Sylhet',
    location_upazila: 'Sylhet Sadar',
    location_area: 'Zindabazar',
    road: 'Jail Road',
    road_access: 'Zindabazar main road frontage',
    mouza: 'Sylhet Sadar',
    dag_number: '145',
    khatian_number: '19/2',
    land_size: 6,
    land_size_unit: 'katha',
    // a joint venture has no asking price — the owner is paid in units
    asking_price: 0,
    nearby_facilities: 'Commercial hub, Sylhet MAG Osmani Medical 2km',
    acquisition_type: 'joint_venture',
    status: 'sourced',
    remarks: 'Referred by a broker; first meeting not held yet.',
    created_at: '2026-07-02T10:05:00.000Z',
    owners: [{ key: 'farhana', share: 100, primary: true }],
    history: [],
  },
  {
    name: 'Keraniganj riverside land',
    land_classification: 'ডোবা (Doba — ditch/pond)',
    source: 'Broker / Dalal',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Keraniganj',
    location_area: 'Keraniganj',
    road: 'Zinzira–Kaliganj Road',
    road_access: 'No pucca approach — 12 ft earthen track from the embankment',
    mouza: 'Zinzira',
    dag_number: '4402',
    khatian_number: '881',
    land_size: 18,
    land_size_unit: 'katha',
    asking_price: 41000000,
    gps_lat: 23.7002,
    gps_lng: 90.3961,
    nearby_facilities: 'Buriganga riverfront, Dhaka city 20 minutes via the second bridge',
    acquisition_type: 'direct_purchase',
    status: 'rejected',
    remarks: 'Dropped — flood risk and unresolved title.',
    created_at: '2026-02-20T03:50:00.000Z',
    owners: [{ key: 'delwar', share: 100, primary: true, area: 8, amount: 82_000_000 }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-02-27',
        performed_by: 'Kamal Hossain (Land Team)',
        remarks: 'Water logging visible even in the dry season.',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-03-30',
        performed_by: 'Adv. Tanvir Alam',
        reference_no: 'LV-2026-013',
        remarks: 'A civil suit is pending over part of the dag.',
      },
      {
        to_status: 'rejected',
        event_date: '2026-04-11',
        performed_by: 'Management committee',
        remarks:
          'Rejected: pending litigation on the title plus flood risk. Revisit only if the case is settled.',
      },
    ],
  },
  {
    name: 'Mirpur DOHS adjacent plot',
    land_classification: 'ভিটি (Bhiti — homestead)',
    source: 'Direct owner approach',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Mirpur',
    location_area: 'Mirpur',
    road: 'Avenue 5, Mirpur DOHS',
    road_access: '25 ft road, next to DOHS gate 2',
    mouza: 'Mirpur',
    dag_number: '667',
    khatian_number: '340',
    land_size: 5,
    land_size_unit: 'katha',
    // a joint venture has no asking price — the owner is paid in units
    asking_price: 0,
    gps_lat: 23.8223,
    gps_lng: 90.3654,
    nearby_facilities: 'DOHS gate 300m, Mirpur 12 metro 2km, school and mosque within 500m',
    acquisition_type: 'joint_venture',
    // the parked case (2026-09-18): a real plot nobody has dropped or chased
    status: 'on_hold',
    remarks: 'Owner is abroad; discussions happening over WhatsApp.',
    created_at: '2026-08-05T11:40:00.000Z',
    owners: [
      { key: 'sultana', share: 50, primary: true, area: 2.5 },
      { key: 'nasima', share: 50 },
    ],
    history: [
      {
        to_status: 'on_hold',
        event_date: '2026-08-20',
        performed_by: 'Land team lead',
        remarks:
          'Owner wants 30% above the Mirpur DOHS rate and will not move before the next mutation season. Parked, not dropped — worth asking again after Poush.',
      },
    ],
  },
  {
    name: 'Chattogram Agrabad commercial plot',
    land_classification: 'বাণিজ্যিক (Commercial)',
    source: 'Auction / Bank',
    location_division: 'Chattogram',
    location_district: 'Chattogram',
    location_upazila: 'Double Mooring',
    location_area: 'Agrabad C/A',
    road: 'Sheikh Mujib Road',
    road_access: 'Agrabad C/A main avenue, 80 ft frontage',
    mouza: 'Agrabad',
    dag_number: '2210',
    khatian_number: '512',
    land_size: 14,
    land_size_unit: 'katha',
    // a joint venture has no asking price — the owner is paid in units
    asking_price: 0,
    // signing money agreed with the owner, on top of the unit share
    final_agreed_amount: 4_500_000,
    gps_lat: 22.3268,
    gps_lng: 91.8093,
    nearby_facilities: 'Agrabad commercial hub, Customs House 700m, port access 3km',
    acquisition_type: 'joint_venture',
    status: 'acquired',
    remarks: 'Owner family wanted the share counted in square feet, not flat numbers.',
    created_at: '2026-02-02T10:05:00.000Z',
    owners: [{ key: 'jashim', share: 100, primary: true }],
    jv: {
      developer_share_pct: 60,
      landowner_share_pct: 40,
      agreement_date: '2026-05-12',
      power_of_attorney: true,
      poa_reference: 'POA-2026-021',
      jv_share_basis: 'total_sqft',
    },
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-02-11',
        performed_by: 'Kamal Hossain (Land Team)',
        remarks: 'Level plot, boundary intact, direct access from the main road.',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-03-04',
        performed_by: 'Adv. Nusrat Jahan',
        reference_no: 'LV-2026-011',
        remarks: 'Commercial land use confirmed with CDA.',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-03-26',
        amount: 91000000,
        performed_by: 'Rifat Ahmed',
      },
      {
        to_status: 'agreed',
        event_date: '2026-04-28',
        amount: 91000000,
        remarks: 'Board preferred a JV over an outright purchase at this price.',
      },
      {
        to_status: 'acquired',
        event_date: '2026-05-12',
        reference_no: 'JV-2026-007',
        remarks: 'Signed at the Agrabad office; two witnesses from the owner family.',
      },
    ],
  },
  {
    name: 'Dhanmondi Road 27 plot',
    land_classification: 'ভিটি (Bhiti — homestead)',
    source: 'Own survey',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Dhanmondi',
    location_area: 'Dhanmondi',
    road: 'Road 27 (old)',
    road_access: 'Road 27 (old), 60 ft, direct frontage',
    mouza: 'Dhanmondi',
    dag_number: '119',
    khatian_number: '44/1',
    land_size: 8,
    land_size_unit: 'katha',
    asking_price: 86000000,
    final_agreed_amount: 82000000,
    gps_lat: 23.7561,
    gps_lng: 90.3746,
    nearby_facilities: 'Dhanmondi Lake 400m, Square Hospital 1.2km, Sultana Kamal complex 600m',
    acquisition_type: 'direct_purchase',
    status: 'acquired',
    remarks: 'Bought outright — the family was settling an inheritance.',
    created_at: '2026-01-06T08:45:00.000Z',
    owners: [{ key: 'delwar', share: 100, primary: true }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-01-15',
        performed_by: 'Kamal Hossain (Land Team)',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-01-30',
        performed_by: 'Adv. Nusrat Jahan',
        reference_no: 'LV-2026-002',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-02-14',
        amount: 84000000,
        performed_by: 'Rifat Ahmed',
      },
      { to_status: 'agreed', event_date: '2026-02-27', amount: 82000000 },
      {
        to_status: 'acquired',
        event_date: '2026-03-10',
        amount: 82000000,
        reference_no: '1187/2026',
        remarks: 'Registered at the Dhanmondi sub-registry office.',
      },
    ],
  },

  /*
   * L7's two new held statuses need somewhere to be seen (2026-09-18). Both
   * are ours and neither is in a project yet: Ashulia is still being filled
   * (Under Development), and Block J needs no work at all (Ready for
   * Project). Their status is seeded as `acquired`; the pipeline moves them
   * from there off their own records, which is also a check that it does.
   */
  {
    name: 'Ashulia Zirabo industrial plot',
    land_classification: 'নাল (Nal — paddy land)',
    source: 'Broker / Dalal',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Savar',
    location_area: 'Zirabo',
    road: 'Zirabo–Bishmail Road',
    road_access: '24 ft road, truck access from the Ashulia highway',
    mouza: 'Zirabo',
    dag_number: '7781',
    khatian_number: '2210',
    land_size: 3,
    land_size_unit: 'bigha',
    asking_price: 52000000,
    final_agreed_amount: 49000000,
    gps_lat: 23.9188,
    gps_lng: 90.3121,
    nearby_facilities: 'Ashulia EPZ 4km, Zirabo bazar 900m, Dhaka–Aricha highway 3km',
    acquisition_type: 'direct_purchase',
    status: 'acquired',
    remarks: 'Bought for staff housing. Filling and the boundary wall are running now.',
    created_at: '2026-02-02T05:30:00.000Z',
    owners: [{ key: 'farhana', share: 100, primary: true, area: 3, amount: 49_000_000 }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-02-09',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Site visit recorded, led by Shafiq Rahman (Land Team).',
        source: 'automatic',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-03-04',
        remarks: 'Due diligence started — "Ownership confirmed" was taken up.',
        source: 'automatic',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-03-18',
        amount: 52000000,
        remarks: 'Negotiation round 1 recorded — the owner’s ask.',
        source: 'automatic',
      },
      {
        to_status: 'agreed',
        event_date: '2026-04-06',
        amount: 49000000,
        remarks: 'Round 2 accepted — this amount is now the agreed price.',
        source: 'automatic',
      },
      {
        to_status: 'acquired',
        event_date: '2026-05-14',
        amount: 49000000,
        reference_no: '2298/2026',
        remarks: 'Registered at the Savar sub-registry office.',
        source: 'manual',
      },
    ],
  },
  {
    name: 'Bashundhara Block J ready plot',
    land_classification: 'ভিটি (Bhiti — homestead)',
    source: 'Reference',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Badda',
    location_area: 'Bashundhara R/A',
    road: 'Block J main road',
    road_access: '40 ft internal road, services at the boundary',
    mouza: 'Bashundhara',
    dag_number: '1420',
    khatian_number: '318',
    land_size: 5,
    land_size_unit: 'katha',
    asking_price: 0,
    final_agreed_amount: 4_000_000,
    gps_lat: 23.8199,
    gps_lng: 90.4312,
    nearby_facilities: 'Bashundhara gate 1.5km, school 400m, hospital 2km',
    acquisition_type: 'joint_venture',
    status: 'acquired',
    remarks: 'Serviced plot — nothing to fill, so it is ready for a project as it stands.',
    created_at: '2026-03-12T06:15:00.000Z',
    owners: [{ key: 'sultana', share: 100, primary: true, area: 5, amount: 4_000_000 }],
    jv: {
      developer_share_pct: 58,
      landowner_share_pct: 42,
      agreement_date: '2026-06-22',
      power_of_attorney: true,
      poa_reference: 'POA-2026-011',
      jv_share_basis: 'flat_count',
    },
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-03-19',
        performed_by: 'Kamal Hossain (Land Team)',
        remarks: 'Site visit recorded, led by Kamal Hossain (Land Team).',
        source: 'automatic',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-04-08',
        remarks: 'Due diligence started — "Ownership confirmed" was taken up.',
        source: 'automatic',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-05-05',
        amount: 5000000,
        remarks: 'Negotiation round 1 recorded — the owner’s ask.',
        source: 'automatic',
      },
      {
        to_status: 'agreed',
        event_date: '2026-06-02',
        amount: 4000000,
        remarks: 'Round 2 accepted — terms agreed.',
        source: 'automatic',
      },
      {
        to_status: 'acquired',
        event_date: '2026-06-22',
        amount: 4000000,
        reference_no: 'JV-2026-011',
        remarks: 'JV agreement signed at the Bashundhara office.',
        source: 'manual',
      },
    ],
  },
  /*
   * The plain `acquired` case, and the reason it was added (review 2026-09-20).
   *
   * Every other held plot in this dataset either needs no development or has
   * activities on it, so the pipeline moved all of them straight past
   * `acquired` to Under Development or Ready for Project the moment the seed
   * ran - the status filter "Acquired" returned nothing, and the one thing a
   * land team actually looks at ("registered, and nobody has planned the
   * filling yet") had no example. This plot is registered, needs work, and has
   * none scheduled: it sits at Acquired waiting on land development.
   *
   * Deliberately has NO development activity in `demo-development.ts` and is
   * NOT in `DEMO_NO_DEVELOPMENT_LANDS`. Adding it to either breaks this case.
   */
  {
    name: 'Tangail Mirzapur roadside plot',
    land_classification: 'Nal (paddy land)',
    source: 'Direct Owner Contact',
    location_division: 'Dhaka',
    location_district: 'Tangail',
    location_upazila: 'Mirzapur',
    location_area: 'Mirzapur',
    road: 'Dhaka-Tangail Highway service road',
    road_access: '22 ft brick road off the highway service lane',
    mouza: 'Gorai',
    dag_number: '1183',
    khatian_number: '447',
    land_size: 24,
    land_size_unit: 'katha',
    asking_price: 33_000_000,
    final_agreed_amount: 30_500_000,
    gps_lat: 24.1033,
    gps_lng: 90.0997,
    nearby_facilities: 'Gorai bus stand 1km, Mirzapur Kumudini Hospital 6km, highway frontage',
    acquisition_type: 'direct_purchase',
    status: 'acquired',
    remarks:
      'Registered in July. Paddy land about 5ft below the service road - the filling estimate has not been taken yet, so no development is scheduled.',
    created_at: '2026-01-22T06:40:00.000Z',
    owners: [{ key: 'anwara', share: 100, primary: true, area: 24, amount: 30_500_000 }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2026-02-04',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Highway-adjacent and cheap per katha. Low land - fill depth is the open question.',
        source: 'automatic',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-03-02',
        performed_by: 'Adv. Tanvir Alam',
        remarks: 'Single owner, clean khatian. Mutation already in her name.',
        source: 'automatic',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-04-18',
        amount: 31_000_000,
        performed_by: 'Rifat Ahmed',
        source: 'automatic',
      },
      {
        to_status: 'agreed',
        event_date: '2026-05-26',
        amount: 30_500_000,
        remarks: 'Round 2 accepted, 25 lakh below asking.',
        source: 'automatic',
      },
      {
        to_status: 'acquired',
        event_date: '2026-07-09',
        amount: 30_500_000,
        reference_no: '4471/2026',
        performed_by: 'Sub-Registry Office, Mirzapur',
        remarks: 'Sale deed registered. Mutation applied for the same week.',
        source: 'manual',
      },
    ],
  },
  /*
   * The `disposed` case (review 2026-09-20) - a plot the company held and no
   * longer holds.
   *
   * Added because the status existed with no example, and because the wording
   * around it changed in the same review: this is an **exit from a plot, not a
   * sale of land**. Selling land to customers is a `land_share` or
   * `plot_development` project, and the Land module has no sale of its own.
   * Here the company bought the plot, the access road it was priced on was
   * cancelled in the revised DAP, and the plot was transferred to a local
   * developer at a loss.
   *
   * Not synced by the seeder: `landIsHeld('disposed')` is false, so the
   * pipeline leaves it where its history puts it.
   */
  {
    name: 'Narsingdi Madhabdi plot',
    land_classification: 'Bhiti (homestead land)',
    source: 'Broker / Dalal',
    location_division: 'Dhaka',
    location_district: 'Narayanganj',
    location_upazila: 'Madhabdi',
    location_area: 'Madhabdi',
    road: 'Madhabdi Bazar Road',
    road_access: '18 ft road, widening was promised and never happened',
    mouza: 'Nuralapur',
    dag_number: '2290',
    khatian_number: '813',
    land_size: 11,
    land_size_unit: 'katha',
    asking_price: 26_000_000,
    final_agreed_amount: 24_000_000,
    nearby_facilities: 'Madhabdi textile market 2km, Dhaka-Sylhet highway 4km',
    acquisition_type: 'direct_purchase',
    status: 'disposed',
    remarks:
      'Bought on the strength of a planned 40ft access road. The revised DAP dropped the road, the plot no longer supported the tower we had costed, and it was transferred on.',
    created_at: '2025-11-14T05:20:00.000Z',
    owners: [{ key: 'nazrul', share: 100, primary: true, area: 11, amount: 24_000_000 }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2025-11-28',
        performed_by: 'Shafiq Rahman (Land Team)',
        source: 'automatic',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2025-12-15',
        performed_by: 'Adv. Tanvir Alam',
        remarks: 'Title clean. The access road was checked against the then-current DAP and cleared.',
        source: 'automatic',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-01-09',
        amount: 25_000_000,
        performed_by: 'Rifat Ahmed',
        source: 'automatic',
      },
      {
        to_status: 'agreed',
        event_date: '2026-01-27',
        amount: 24_000_000,
        source: 'automatic',
      },
      {
        to_status: 'acquired',
        event_date: '2026-02-19',
        amount: 24_000_000,
        reference_no: '1104/2026',
        performed_by: 'Sub-Registry Office, Madhabdi',
        remarks: 'Sale deed registered.',
        source: 'manual',
      },
      {
        to_status: 'disposed',
        event_date: '2026-08-14',
        amount: 22_600_000,
        reference_no: '6620/2026',
        performed_by: 'Management committee',
        remarks:
          'Transferred to Shetu Builders Ltd. after the revised DAP dropped the 40ft access road. The board accepted a 14 lakh loss rather than hold a plot that could not carry the costed tower.',
        source: 'manual',
      },
    ],
  },
  /*
   * The tract a plot project needs (review 2026-09-21,
   * PROJECT-MODULE-PLAN.md section 2.4).
   *
   * Nothing in this dataset was big enough to cut plots out of — the largest
   * plot was 3 bigha, which is one apartment site, not a housing project. A
   * real Purbachal-fringe plot scheme starts from several bigha of farmland
   * that is filled, roaded and drained before a single plot is sold, which is
   * exactly the work the Land module's development activities already record.
   */
  {
    name: 'Rupganj Kanchan tract',
    land_classification: 'Nal (paddy land)',
    source: 'Direct Owner Contact',
    location_division: 'Dhaka',
    location_district: 'Narayanganj',
    location_upazila: 'Rupganj',
    location_area: 'Kanchan',
    road: 'Kanchan–Purbachal Link Road',
    road_access: '30 ft link road; 300ft Purbachal highway 2km',
    mouza: 'Golakandail',
    dag_number: '7742',
    khatian_number: '1908',
    land_size: 5,
    land_size_unit: 'bigha',
    asking_price: 96_000_000,
    final_agreed_amount: 90_000_000,
    gps_lat: 23.8103,
    gps_lng: 90.5372,
    nearby_facilities: 'Purbachal 300ft highway 2km, Kanchan bridge 3km, Dhaka–Sylhet highway 6km',
    acquisition_type: 'direct_purchase',
    status: 'acquired',
    remarks:
      'Bought for a plot scheme. Four brothers held it jointly and signed one deed; the eldest took the whole payment and settled with the others privately.',
    created_at: '2025-10-08T05:30:00.000Z',
    owners: [{ key: 'joynal', share: 100, primary: true, area: 5, amount: 90_000_000 }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2025-10-20',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Big enough for a scheme, and the link road is already built. Low land throughout.',
        source: 'automatic',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2025-11-11',
        performed_by: 'Adv. Tanvir Alam',
        remarks: 'Four co-owners; partition deed and all four NIDs verified.',
        source: 'automatic',
      },
      {
        to_status: 'negotiation',
        event_date: '2025-12-14',
        amount: 92_000_000,
        performed_by: 'Rifat Ahmed',
        source: 'automatic',
      },
      {
        to_status: 'agreed',
        event_date: '2026-01-06',
        amount: 90_000_000,
        source: 'automatic',
      },
      {
        to_status: 'acquired',
        event_date: '2026-02-11',
        amount: 90_000_000,
        reference_no: '0917/2026',
        performed_by: 'Sub-Registry Office, Rupganj',
        remarks: 'Deed registered with all four brothers present.',
        source: 'manual',
      },
    ],
  },
  /*
   * The plot a land-share project is sold out of (review 2026-09-21,
   * PROJECT-MODULE-PLAN.md section 2.5).
   *
   * Small, close to Dhaka and bought outright — which is what makes it worth
   * selling as twenty shares rather than building on. The follow-on case the
   * client described (the shareholders come back and commission construction)
   * is Phase 3; this land is what it will start from.
   */
  {
    name: 'Savar Birulia riverside plot',
    land_classification: 'Bhiti (homestead land)',
    source: 'Reference',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Savar',
    location_area: 'Birulia',
    road: 'Birulia–Ashulia Road',
    road_access: '24 ft road, Turag riverside',
    mouza: 'Birulia',
    dag_number: '3318',
    khatian_number: '702',
    land_size: 24,
    land_size_unit: 'katha',
    asking_price: 52_000_000,
    final_agreed_amount: 48_000_000,
    gps_lat: 23.8967,
    gps_lng: 90.3339,
    nearby_facilities: 'Birulia bridge 1km, Ashulia 5km, Uttara 12km',
    acquisition_type: 'direct_purchase',
    status: 'acquired',
    remarks:
      'Bought outright to sell on as shares rather than build — riverside land near Dhaka moves faster in small holdings than as flats.',
    created_at: '2025-12-02T06:00:00.000Z',
    owners: [{ key: 'rehana', share: 100, primary: true, area: 24, amount: 48_000_000 }],
    history: [
      {
        to_status: 'under_review',
        event_date: '2025-12-16',
        performed_by: 'Kamal Hossain (Land Team)',
        source: 'automatic',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2026-01-13',
        performed_by: 'Adv. Tanvir Alam',
        remarks: 'Owner abroad; power of attorney to her brother verified at the mission.',
        source: 'automatic',
      },
      {
        to_status: 'negotiation',
        event_date: '2026-02-09',
        amount: 49_500_000,
        performed_by: 'Rifat Ahmed',
        source: 'automatic',
      },
      {
        to_status: 'agreed',
        event_date: '2026-03-03',
        amount: 48_000_000,
        source: 'automatic',
      },
      {
        to_status: 'acquired',
        event_date: '2026-04-07',
        amount: 48_000_000,
        reference_no: '2240/2026',
        performed_by: 'Sub-Registry Office, Savar',
        remarks: 'Registered under the power of attorney.',
        source: 'manual',
      },
    ],
  },
  /*
   * The complete record (2026-10-04) — the land the Module 1 and Module 2 demo
   * is given on.
   *
   * Every other demo land is deliberately partial: each one sits at a
   * different status so the pipeline is covered, which means no single land
   * shows what a *finished* record looks like. This one does. Every optional
   * column on `lands` carries a value, there are three owners with shares,
   * areas and agreed amounts, full JV terms with a power of attorney, both
   * site-visit kinds, two feasibility versions, all seventeen due-diligence
   * items, a four-round offer ladder, every acquisition cost head, land
   * development with progress, per-owner settlement with payments, named
   * documents, and a status history that includes a correction.
   *
   * It ends at `linked_to_project` because the project built on it
   * (`Nokshi Lakeview Residence`) is the other half of the demo.
   *
   * Keep it complete. If a field is added to `lands`, add it here too — this
   * is the record that is supposed to answer "what can this module hold?".
   */
  {
    name: 'Uttara Sector 18 lake-facing site',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_upazila: 'Uttara',
    location_area: 'Sector 18, Uttara',
    road: 'Lake Drive Road',
    road_access: '60 ft blacktop frontage on Lake Drive, 100 ft RAJUK road 250m east',
    land_classification: 'Bhiti (homestead land)',
    source: 'Reference',
    mouza: 'Bauthar',
    dag_number: '4412',
    khatian_number: '2207',
    land_size: 18,
    land_size_unit: 'katha',
    asking_price: 215_000_000,
    final_agreed_amount: 18_000_000,
    gps_lat: 23.8759,
    gps_lng: 90.3795,
    nearby_facilities:
      'Uttara Lake frontage, Diabari bridge 1.2km, Metro Rail Diabari station 2km, Uttara Town College 900m, Shin-Shin Japan Hospital 1.5km, Sector 18 kitchen market 600m',
    acquisition_type: 'joint_venture',
    status: 'acquired',
    assigned_to_key: 'shafiq',
    remarks:
      'Three siblings inherited the plot from their father. The youngest lives in Canada and signed through a registered power of attorney. Agreed as a 52:48 joint venture on flat count, with 1,80,00,000 signing money paid to the owners against the agreement.',
    created_at: '2025-09-12T04:30:00.000Z',
    owners: [
      { key: 'mosharraf', share: 40, primary: true, area: 7.2, amount: 7_200_000 },
      { key: 'shireen', share: 35, area: 6.3, amount: 6_300_000 },
      { key: 'arifur', share: 25, area: 4.5, amount: 4_500_000 },
    ],
    jv: {
      developer_share_pct: 52,
      landowner_share_pct: 48,
      agreement_date: '2026-01-19',
      power_of_attorney: true,
      poa_reference: 'POA-2026/0144, Uttara Sub-Registry',
      jv_share_basis: 'flat_count',
    },
    documents: [
      { type: 'khatian_copy', title: 'BS Khatian 2207 — certified copy', notes: 'Collected from the AC Land office, Uttara.' },
      { type: 'dolil_deed', title: 'Inheritance deed 3310/1998 — father to three heirs' },
      { type: 'mutation_certificate', title: 'Namjari case 1142/2024 — mutation certificate' },
      { type: 'tax_receipt', title: 'Land development tax receipt 1432 Bangla' },
      { type: 'location_map', title: 'Mouza map with dag 4412 marked', is_public: false },
      { type: 'site_photo', title: 'Site photo — Lake Drive frontage, Feb 2026' },
      { type: 'jv_agreement', title: 'Joint venture agreement — 52:48 on flat count', notes: 'Signed 19 Jan 2026 at the Uttara office, all three owners present.' },
      { type: 'power_of_attorney', title: 'Registered POA — Arifur Rahman Khan', notes: 'Attested at the Bangladesh High Commission, Ottawa.' },
      { type: 'other', title: 'RAJUK DAP sheet — Sector 18 land use', notes: 'Shows the plot as residential, FAR 4.0 on a 60 ft road.' },
    ],
    history: [
      {
        to_status: 'under_review',
        event_date: '2025-09-24',
        performed_by: 'Shafiq Rahman (Land Team)',
        reference_no: 'SV-2025-088',
        remarks: 'Lake frontage and a 60 ft road. High land, no filling needed. Worth a full study.',
        source: 'automatic',
      },
      {
        to_status: 'dd_in_progress',
        event_date: '2025-10-28',
        performed_by: 'Adv. Tanvir Alam',
        reference_no: 'LV-2025-204',
        remarks: 'Inheritance title. Three heirs, one abroad — power of attorney will be needed.',
        source: 'automatic',
      },
      {
        to_status: 'negotiation',
        event_date: '2025-12-02',
        performed_by: 'Rifat Ahmed',
        amount: 198_000_000,
        reference_no: 'NEG-2025-061',
        remarks: 'Owners opened at 215,000,000 outright. Steered towards a joint venture instead.',
        source: 'automatic',
      },
      {
        to_status: 'agreed',
        event_date: '2026-01-12',
        performed_by: 'Rifat Ahmed',
        amount: 18_000_000,
        reference_no: 'NEG-2026-004',
        remarks: 'Round 4 accepted: 52:48 on flat count plus 1,80,00,000 signing money.',
        source: 'automatic',
      },
      {
        to_status: 'on_hold',
        event_date: '2026-01-15',
        performed_by: 'Management committee',
        remarks:
          'Parked for three days while the youngest sibling\u2019s power of attorney was attested in Ottawa.',
        source: 'manual',
      },
      {
        to_status: 'agreed',
        event_date: '2026-01-18',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Correction \u2014 the hold was recorded against the wrong land and is reversed here. POA received.',
        source: 'correction',
      },
      {
        to_status: 'acquired',
        event_date: '2026-01-19',
        performed_by: 'Uttara Sub-Registry Office',
        amount: 18_000_000,
        reference_no: 'JV-2026/0188',
        remarks: 'Joint venture agreement signed and registered. Signing money paid the same day.',
        source: 'manual',
      },
    ],
  },
];
