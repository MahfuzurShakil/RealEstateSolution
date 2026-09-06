import type { AcquisitionType, JvShareBasis, LandSizeUnit, LandStatus } from './types';

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
  event_date: string;
  performed_by?: string;
  amount?: number;
  reference_no?: string;
  remarks?: string;
}

export interface DemoLand {
  name: string;
  location_division: string;
  location_district: string;
  location_area: string;
  road?: string;
  mouza?: string;
  dag_number?: string;
  khatian_number?: string;
  land_size: number;
  land_size_unit: LandSizeUnit;
  asking_price: number;
  negotiated_price?: number;
  final_agreed_amount?: number;
  gps_lat?: number;
  gps_lng?: number;
  nearby_facilities?: string;
  acquisition_type: AcquisitionType;
  status: LandStatus;
  remarks?: string;
  created_at: string;
  /** owner keys + their share of the plot */
  owners: { key: string; share: number; primary?: boolean }[];
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
];

export const DEMO_LANDS: DemoLand[] = [
  {
    name: 'Bashundhara Block K corner plot',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_area: 'Bashundhara R/A',
    road: 'Road 12, Block K',
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
    status: 'jv_signed',
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
        to_status: 'site_visit_done',
        event_date: '2026-01-22',
        performed_by: 'Kamal Hossain (Land Team)',
        remarks: 'Road access good, boundary wall broken on the north side.',
      },
      {
        to_status: 'legal_verification',
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
        to_status: 'decision',
        event_date: '2026-04-05',
        amount: 45000000,
        remarks: 'Board approved the JV structure.',
      },
      {
        to_status: 'jv_signed',
        event_date: '2026-04-18',
        reference_no: 'JV-2026-003',
        remarks: 'Signed at the Gulshan office. POA executed the same day.',
      },
    ],
  },
  {
    name: 'Uttara Sector 13 residential plot',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_area: 'Uttara',
    road: 'Road 9, Sector 13',
    mouza: 'Turag',
    dag_number: '3120',
    khatian_number: '412',
    land_size: 7.5,
    land_size_unit: 'katha',
    asking_price: 39000000,
    negotiated_price: 36500000,
    final_agreed_amount: 36000000,
    gps_lat: 23.8759,
    gps_lng: 90.3795,
    nearby_facilities: 'Uttara Metro Station 1.2km, Shaheed Monsur Ali Medical 900m, school 300m',
    acquisition_type: 'direct_purchase',
    status: 'acquired',
    remarks: 'Registration completed; mutation filing in progress.',
    created_at: '2026-01-06T05:45:00.000Z',
    owners: [{ key: 'nasima', share: 100, primary: true }],
    history: [
      {
        to_status: 'site_visit_done',
        event_date: '2026-01-11',
        performed_by: 'Kamal Hossain (Land Team)',
        remarks: 'Filled plot, ready for piling. Metro line within walking distance.',
      },
      {
        to_status: 'legal_verification',
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
        to_status: 'decision',
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
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_area: 'Savar',
    road: 'Dhaka–Aricha Highway',
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
    status: 'decision',
    remarks: 'Two siblings inherited the land; both must sign.',
    created_at: '2026-02-03T07:10:00.000Z',
    owners: [
      { key: 'abdul', share: 60, primary: true },
      { key: 'shahida', share: 40 },
    ],
    jv: {
      developer_share_pct: 50,
      landowner_share_pct: 50,
      agreement_date: '2026-06-10',
      power_of_attorney: false,
    },
    history: [
      {
        to_status: 'site_visit_done',
        event_date: '2026-02-12',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Low land, will need about 4ft of filling. Highway frontage is the main value.',
      },
      {
        to_status: 'legal_verification',
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
        to_status: 'decision',
        event_date: '2026-06-10',
        amount: 57000000,
        remarks: 'Awaiting board decision on the extra parking demand.',
      },
    ],
  },
  {
    name: 'Gazipur Tongi industrial-adjacent plot',
    location_division: 'Dhaka',
    location_district: 'Gazipur',
    location_area: 'Tongi',
    road: 'Kamarpara Road',
    mouza: 'Auchpara',
    dag_number: '5567',
    khatian_number: '1102',
    land_size: 2,
    land_size_unit: 'bigha',
    asking_price: 44000000,
    negotiated_price: 41000000,
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
        to_status: 'site_visit_done',
        event_date: '2026-03-18',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Boundary marked with pillars. Drainage on the east edge needs checking.',
      },
      {
        to_status: 'legal_verification',
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
    location_division: 'Chattogram',
    location_district: 'Chattogram',
    location_area: 'Khulshi',
    road: 'Zakir Hossain Road',
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
    status: 'legal_verification',
    remarks: 'Premium location; slope will raise the foundation cost.',
    created_at: '2026-04-08T06:00:00.000Z',
    owners: [{ key: 'jashim', share: 100, primary: true }],
    history: [
      {
        to_status: 'site_visit_done',
        event_date: '2026-04-15',
        performed_by: 'Imran Kabir (Chattogram)',
        remarks: 'Hill-cutting clearance will be needed. Approach road is narrow (16ft).',
      },
      {
        to_status: 'legal_verification',
        event_date: '2026-05-20',
        performed_by: 'Adv. Sabbir Rahman',
        reference_no: 'LV-2026-023',
        remarks: 'CDA approval history being collected from the owner.',
      },
    ],
  },
  {
    name: 'Narayanganj Fatullah plot',
    location_division: 'Dhaka',
    location_district: 'Narayanganj',
    location_area: 'Fatullah',
    road: 'Pagla–Fatullah Road',
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
    status: 'site_visit_done',
    created_at: '2026-05-19T08:15:00.000Z',
    owners: [{ key: 'monir', share: 100, primary: true }],
    history: [
      {
        to_status: 'site_visit_done',
        event_date: '2026-05-26',
        performed_by: 'Shafiq Rahman (Land Team)',
        remarks: 'Tenants currently on the land; vacancy timeline to be confirmed.',
      },
    ],
  },
  {
    name: 'Sylhet Zindabazar mixed-use plot',
    location_division: 'Sylhet',
    location_district: 'Sylhet',
    location_area: 'Zindabazar',
    road: 'Jail Road',
    mouza: 'Sylhet Sadar',
    dag_number: '145',
    khatian_number: '19/2',
    land_size: 6,
    land_size_unit: 'katha',
    // a joint venture has no asking price — the owner is paid in units
    asking_price: 0,
    nearby_facilities: 'Commercial hub, Sylhet MAG Osmani Medical 2km',
    acquisition_type: 'joint_venture',
    status: 'new',
    remarks: 'Referred by a broker; first meeting not held yet.',
    created_at: '2026-07-02T10:05:00.000Z',
    owners: [{ key: 'farhana', share: 100, primary: true }],
    history: [],
  },
  {
    name: 'Keraniganj riverside land',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_area: 'Keraniganj',
    road: 'Zinzira–Kaliganj Road',
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
    owners: [{ key: 'delwar', share: 100, primary: true }],
    history: [
      {
        to_status: 'site_visit_done',
        event_date: '2026-02-27',
        performed_by: 'Kamal Hossain (Land Team)',
        remarks: 'Water logging visible even in the dry season.',
      },
      {
        to_status: 'legal_verification',
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
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_area: 'Mirpur',
    road: 'Avenue 5, Mirpur DOHS',
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
    status: 'new',
    remarks: 'Owner is abroad; discussions happening over WhatsApp.',
    created_at: '2026-08-05T11:40:00.000Z',
    owners: [
      { key: 'sultana', share: 50, primary: true },
      { key: 'nasima', share: 50 },
    ],
    history: [],
  },
  {
    name: 'Chattogram Agrabad commercial plot',
    location_division: 'Chattogram',
    location_district: 'Chattogram',
    location_area: 'Agrabad C/A',
    road: 'Sheikh Mujib Road',
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
    status: 'jv_signed',
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
        to_status: 'site_visit_done',
        event_date: '2026-02-11',
        performed_by: 'Kamal Hossain (Land Team)',
        remarks: 'Level plot, boundary intact, direct access from the main road.',
      },
      {
        to_status: 'legal_verification',
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
        to_status: 'decision',
        event_date: '2026-04-28',
        amount: 91000000,
        remarks: 'Board preferred a JV over an outright purchase at this price.',
      },
      {
        to_status: 'jv_signed',
        event_date: '2026-05-12',
        reference_no: 'JV-2026-007',
        remarks: 'Signed at the Agrabad office; two witnesses from the owner family.',
      },
    ],
  },
  {
    name: 'Dhanmondi Road 27 plot',
    location_division: 'Dhaka',
    location_district: 'Dhaka',
    location_area: 'Dhanmondi',
    road: 'Road 27 (old)',
    mouza: 'Dhanmondi',
    dag_number: '119',
    khatian_number: '44/1',
    land_size: 8,
    land_size_unit: 'katha',
    asking_price: 86000000,
    negotiated_price: 82000000,
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
        to_status: 'site_visit_done',
        event_date: '2026-01-15',
        performed_by: 'Kamal Hossain (Land Team)',
      },
      {
        to_status: 'legal_verification',
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
      { to_status: 'decision', event_date: '2026-02-27', amount: 82000000 },
      {
        to_status: 'acquired',
        event_date: '2026-03-10',
        amount: 82000000,
        reference_no: '1187/2026',
        remarks: 'Registered at the Dhanmondi sub-registry office.',
      },
    ],
  },
];
