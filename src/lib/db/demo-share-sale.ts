'use client';

import { addDays } from '../domain/share-sale';
import {
  customerRepository,
  customerUploadRepository,
  projectRepository,
  shareOfferingRepository,
  shareRequestRepository,
  shareSaleRepository,
  type OfferingInput,
} from '../repositories';
import { getDb } from './database';
import type { Customer, CustomerUploadKind, ProjectStatus, SharePaymentMethod } from './types';
import { SHARE_DOC_META } from '../domain/share-documents';
import { newId, nextCode, nowIso } from '../utils/id';
import { todayLocal } from '../utils/format';

/*
 * Share Sale demo (PROJECT-SHARE-SALE-PLAN.md). Everything goes through the
 * repositories, so the demo obeys the same rules as a person: an open
 * offering, shares within the per-customer limits, a schedule written at
 * signing, payments applied late fees first. Dates are relative to today so
 * the demo always shows people on track, late, reserved and fully paid.
 *
 * Tongi Logistics Park, Round 1: NAV ৳90 crore + premium ৳30 crore =
 * ৳120 crore; 40% on the market in 400 shares → 0.1% and ৳12 lakh a share.
 * Uttara Heights has a draft waiting to be opened.
 *
 * Three projects exist only for share sale — a hotel (two rounds), an eco
 * resort (open) and an office tower (round closed, buyers paid up). The Customer Portal
 * demo login, Farhana Rahman (01711223344, code 123456), holds shares in
 * three projects: Tongi overdue with a late fee, the hotel part-paid inside
 * the grace days, and the office tower paid in full with a certificate.
 */

const CRORE = 10_000_000;
const unsplash = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=70`;

interface DemoBuyer {
  name: string;
  phone: string;
  email: string;
  shares: number;
  down_pct: number;
  installments: number;
  reserved_ago: number;
  /** days ago the agreement was signed; null = still reserved */
  signed_ago: number | null;
  /** pay every installment up to this seq on its due date (-1 = nothing) */
  paid_through: number;
  method: SharePaymentMethod;
  certificate?: boolean;
  /** a part payment on the next installment, [amount, days ago] */
  part?: [number, number];
}

/** father's or spouse's name and present address, as the agreements name the buyers */
const FAMILY: Record<string, string> = {
  '01711223344': 'Arif Rahman',
  '01819001122': 'Mosharraf Hossain',
  '01915224466': 'Abdul Jalil',
  '01552778899': 'Fazlul Karim',
  '01712908070': 'Nurul Hasan',
  '01913407788': 'Jahangir Alam',
};
const ADDRESS: Record<string, string> = {
  '01711223344': 'House 27, Road 104, Gulshan 2, Dhaka 1212',
  '01819001122': 'Flat 6B, House 12, Road 7, Dhanmondi, Dhaka 1205',
  '01915224466': 'House 45, Sector 7, Uttara, Dhaka 1230',
  '01552778899': 'Holding 112, College Road, Gazipur',
  '01712908070': 'House 9, Road 11, Banani, Dhaka 1213',
  '01913407788': 'House 3, Block C, Bashundhara R/A, Dhaka 1229',
};

const FARHANA = { name: 'Farhana Rahman', phone: '01711223344', email: 'farhana.rahman@example.com' };

const TONGI_BUYERS: DemoBuyer[] = [
  { ...FARHANA, shares: 5, down_pct: 20, installments: 20, reserved_ago: 140, signed_ago: 138, paid_through: 3, method: 'bkash' },
  { name: 'Tanvir Hossain', phone: '01819001122', email: 'tanvir.h@example.com', shares: 10, down_pct: 30, installments: 12, reserved_ago: 124, signed_ago: 120, paid_through: 3, method: 'cheque' },
  { name: 'Nusrat Jahan', phone: '01915224466', email: 'nusrat.jahan@example.com', shares: 3, down_pct: 100, installments: 0, reserved_ago: 104, signed_ago: 100, paid_through: 0, method: 'bank_transfer', certificate: true },
  { name: 'Rezaul Karim', phone: '01552778899', email: 'rezaul.karim@example.com', shares: 6, down_pct: 20, installments: 15, reserved_ago: 133, signed_ago: 130, paid_through: 1, method: 'bkash' },
  { name: 'Kamrul Islam', phone: '01678334455', email: 'kamrul.islam@example.com', shares: 4, down_pct: 25, installments: 16, reserved_ago: 3, signed_ago: null, paid_through: -1, method: 'bank_transfer' },
  { name: 'Shahana Akter', phone: '01399887766', email: 'shahana.akter@example.com', shares: 2, down_pct: 20, installments: 20, reserved_ago: 12, signed_ago: null, paid_through: -1, method: 'bank_transfer' },
];

const HOTEL_BUYERS: DemoBuyer[] = [
  // inside the grace days: the latest installment was due a few days ago and is part paid
  { ...FARHANA, shares: 5, down_pct: 20, installments: 20, reserved_ago: 158, signed_ago: 155, paid_through: 4, method: 'bkash', part: [100_000, 1] },
  { name: 'Mahmudul Hasan', phone: '01712908070', email: 'mahmudul.hasan@example.com', shares: 20, down_pct: 30, installments: 12, reserved_ago: 175, signed_ago: 170, paid_through: 5, method: 'bank_transfer' },
  { name: 'Sabina Yasmin', phone: '01913407788', email: 'sabina.yasmin@example.com', shares: 8, down_pct: 20, installments: 20, reserved_ago: 150, signed_ago: 146, paid_through: 4, method: 'nagad' },
  { name: 'Tanvir Hossain', phone: '01819001122', email: 'tanvir.h@example.com', shares: 6, down_pct: 100, installments: 0, reserved_ago: 140, signed_ago: 138, paid_through: 0, method: 'cheque' },
];

const TOWER_BUYERS: DemoBuyer[] = [
  { ...FARHANA, shares: 2, down_pct: 50, installments: 3, reserved_ago: 295, signed_ago: 290, paid_through: 3, method: 'bank_transfer', certificate: true },
  { name: 'Mahmudul Hasan', phone: '01712908070', email: 'mahmudul.hasan@example.com', shares: 10, down_pct: 100, installments: 0, reserved_ago: 280, signed_ago: 276, paid_through: 0, method: 'bank_transfer', certificate: true },
];

interface DemoShareProject {
  name: string;
  location_summary: string;
  surroundings: string;
  status: ProjectStatus;
  cover_image_url: string;
  expected_start_date: string;
  expected_completion_date: string;
}

const SHARE_PROJECTS: DemoShareProject[] = [
  {
    name: 'Nokshi Lakeshore Hotel & Suites',
    location_summary: 'Gulshan Lake, Dhaka',
    surroundings: 'Gulshan Lake Park, the diplomatic zone and Gulshan 2 circle',
    status: 'under_construction',
    cover_image_url: unsplash('photo-1566073771259-6a8506099945'),
    expected_start_date: '2026-01-15',
    expected_completion_date: '2028-12-31',
  },
  {
    name: 'Nokshi Tea Valley Resort',
    location_summary: 'Sreemangal, Moulvibazar',
    surroundings: 'the tea gardens, Lawachara National Park and Sreemangal rail station',
    status: 'design',
    cover_image_url: unsplash('photo-1520250497591-112f2f40a3f4'),
    expected_start_date: '2027-03-01',
    expected_completion_date: '2029-06-30',
  },
  {
    name: 'Nokshi Banani Business Centre',
    location_summary: 'Kemal Ataturk Avenue, Banani, Dhaka',
    surroundings: 'Banani 11, Gulshan 1 and the airport road',
    status: 'closed',
    cover_image_url: unsplash('photo-1486406146926-c627a92ad1ab'),
    expected_start_date: '2023-01-01',
    expected_completion_date: '2025-10-31',
  },
];

/** Offering terms shared by the demo rounds; each round overrides what differs. */
const TERMS: Omit<OfferingInput, 'project_id' | 'net_asset_value' | 'premium_value' | 'valuation_date' | 'offered_pct' | 'total_shares' | 'validity_days'> = {
  min_shares: 1,
  max_shares: 20,
  min_down_payment_pct: 20,
  max_installments: 20,
  installment_frequency: 'monthly',
  late_fee_pct: 2,
  grace_days: 7,
  hold_days: 7,
  notes: null,
};

export async function seedDemoShareSale(projectIds: Map<string, string>, createdBy: string | null): Promise<void> {
  const today = todayLocal();
  const ago = (days: number) => addDays(today, -days);
  const tongi = projectIds.get('Nokshi Tongi Logistics Park');
  const uttara = projectIds.get('Nokshi Uttara Heights');
  if (!tongi) return;

  // the share-sale-only projects
  const ids = new Map<string, string>();
  for (const p of SHARE_PROJECTS) {
    const project = await projectRepository.create(
      {
        code: '',
        name: p.name,
        project_type: 'commercial',
        total_land_area: null,
        total_land_area_unit: 'katha',
        location_summary: p.location_summary,
        expected_start_date: p.expected_start_date,
        expected_completion_date: p.expected_completion_date,
        actual_start_date: p.status === 'design' ? null : p.expected_start_date,
        status: p.status,
        project_manager: null,
        architect: null,
        surroundings: p.surroundings,
        amenities: ['Generator', 'Lift', 'Parking', 'Security'],
        cover_image_url: p.cover_image_url,
        is_public: false,
        is_featured: false,
        sales_status: 'not_open',
        construction_after_sale: null,
      },
      createdBy,
    );
    ids.set(p.name, project.id);
  }

  /** customers by phone, so a buyer in several rounds stays one customer */
  const customers = new Map<string, string>();
  const filed = new Set<string>();

  /** A scanned paper the office put on the file that day. */
  async function file(customerId: string, saleId: string | null, kind: CustomerUploadKind, on: string) {
    const label = SHARE_DOC_META[kind].label;
    const row = await customerUploadRepository.officeUpload(
      { customer_id: customerId, sale_id: saleId, kind, file: samplePdf(label), file_name: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf` },
      createdBy,
    );
    await getDb().customer_uploads.update(row.id, { uploaded_at: `${on}T11:00:00.000Z`, reviewed_on: on });
  }

  /** Customer papers are filed once and serve every purchase. */
  async function fileOnce(customerId: string, kind: CustomerUploadKind, on: string) {
    if (filed.has(`${customerId}:${kind}`)) return;
    filed.add(`${customerId}:${kind}`);
    await file(customerId, null, kind, on);
  }

  async function sell(offeringId: string, buyers: DemoBuyer[]) {
    for (const b of buyers) {
      const known = customers.get(b.phone);
      const sale = await shareSaleRepository.reserve(
        {
          offering_id: offeringId,
          customer_id: known ?? null,
          new_customer: known ? null : { name: b.name, phone: b.phone, email: b.email },
          shares: b.shares,
          down_payment_pct: b.down_pct,
          installment_count: b.installments,
          reserved_on: ago(b.reserved_ago),
        },
        createdBy,
      );
      customers.set(b.phone, sale.customer_id);
      if (b.signed_ago === null) {
        // a reservation half filed: the NID is in, the photo and the signed agreement are not
        await fileOnce(sale.customer_id, 'id_document', ago(b.reserved_ago));
        continue;
      }
      // what the office scans at the signing table (plan §4a)
      const signedOn = ago(b.signed_ago);
      await fileOnce(sale.customer_id, 'id_document', signedOn);
      await fileOnce(sale.customer_id, 'photo', signedOn);
      await file(sale.customer_id, sale.id, 'signed_copy', signedOn);
      await file(sale.customer_id, sale.id, 'allotment_letter', signedOn);
      await shareSaleRepository.signAgreement(
        sale.id,
        {
          agreement_date: signedOn,
          first_due_date: addDays(signedOn, 30),
          customer: { father_or_spouse_name: FAMILY[b.phone] ?? 'Abdul Karim', nid: `19${b.phone.slice(-11)}`, address: ADDRESS[b.phone] ?? 'Dhaka', kyc_verified_on: signedOn },
          signing: {
            place: 'Company office, Gulshan Avenue, Dhaka',
            company_signatory: 'Mahfuzur Rahman',
            company_signatory_title: 'Managing Director',
            witnesses: [
              { name: 'Shirin Sultana', id_or_phone: '01711-556600', address: 'Company office, Gulshan' },
              { name: 'Kamal Hossain', id_or_phone: '01819-447700', address: 'Banani, Dhaka' },
            ],
            stamp_value: 300,
            stamp_serial: `NJ-${sale.code.slice(-3)}${b.signed_ago}`,
            notarized_on: signedOn,
            notary_name: 'Adv. Rafiqul Islam, Notary Public, Dhaka',
          },
        },
        createdBy,
      );
      const view = await shareSaleRepository.view(sale.id);
      for (const i of view!.schedule.filter((x) => x.seq <= b.paid_through && x.due_date <= today)) {
        const online = i.seq > 0 && (b.method === 'bkash' || b.method === 'nagad');
        await shareSaleRepository.recordPayment(
          {
            sale_id: sale.id,
            paid_on: i.due_date,
            amount: i.amount,
            method: i.seq === 0 ? 'bank_transfer' : b.method,
            reference: online ? `${b.method === 'bkash' ? 'BK' : 'NG'}${sale.code.slice(-3)}${i.seq}X7Q` : `DEMO-${sale.code}-${i.seq}`,
            channel: online ? 'online' : 'office',
            method_detail: online ? `${b.method === 'bkash' ? 'bKash' : 'Nagad'} ${b.phone.slice(0, 5)}•••${b.phone.slice(-3)}` : null,
          },
          createdBy,
        );
      }
      if (b.part) {
        await shareSaleRepository.recordPayment(
          { sale_id: sale.id, paid_on: ago(b.part[1]), amount: b.part[0], method: 'bkash', reference: `BK${sale.code.slice(-3)}PART`, channel: 'online', method_detail: `bKash ${b.phone.slice(0, 5)}•••${b.phone.slice(-3)}` },
          createdBy,
        );
      }
      if (b.certificate) {
        // a few days after the last payment came in
        const last = (await shareSaleRepository.view(sale.id))!.schedule.at(-1)!.due_date;
        const issued = addDays(last, 5);
        await shareSaleRepository.issueCertificate(sale.id, issued < today ? issued : today);
        await file(sale.customer_id, sale.id, 'deed', issued < today ? issued : today);
      }
    }
  }

  // Tongi Logistics Park — Round 1, open
  const round1 = await shareOfferingRepository.save(
    {
      ...TERMS,
      project_id: tongi,
      net_asset_value: 90 * CRORE,
      premium_value: 30 * CRORE,
      valuation_date: ago(160),
      offered_pct: 40,
      total_shares: 400,
      validity_days: 180,
      notes: 'First offering. Warehouses let to two logistics tenants from handover.',
    },
    createdBy,
  );
  await shareOfferingRepository.open(round1.id, ago(150));
  await sell(round1.id, TONGI_BUYERS);

  // Lakeshore Hotel — Round 1 sold and closed, Round 2 open at a higher valuation
  const hotel = ids.get('Nokshi Lakeshore Hotel & Suites')!;
  const hotel1 = await shareOfferingRepository.save(
    { ...TERMS, project_id: hotel, net_asset_value: 80 * CRORE, premium_value: 20 * CRORE, valuation_date: ago(190), offered_pct: 50, total_shares: 500, validity_days: 200, max_shares: 25, notes: 'Founding round for the hotel.' },
    createdBy,
  );
  await shareOfferingRepository.open(hotel1.id, ago(180));
  await sell(hotel1.id, HOTEL_BUYERS);
  await shareOfferingRepository.close(hotel1.id);
  const hotel2 = await shareOfferingRepository.save(
    { ...TERMS, project_id: hotel, net_asset_value: 92 * CRORE, premium_value: 28 * CRORE, valuation_date: ago(20), offered_pct: 20, total_shares: 200, validity_days: 120, max_installments: 24, notes: 'Second round after the structure topped out.' },
    createdBy,
  );
  await shareOfferingRepository.open(hotel2.id, ago(15));

  // Tea Valley Resort — Round 1, open, quarterly plan
  const resort = ids.get('Nokshi Tea Valley Resort')!;
  const resort1 = await shareOfferingRepository.save(
    { ...TERMS, project_id: resort, net_asset_value: 36 * CRORE, premium_value: 9 * CRORE, valuation_date: ago(10), offered_pct: 40, total_shares: 400, validity_days: 60, max_shares: 15, min_down_payment_pct: 25, max_installments: 8, installment_frequency: 'quarterly', grace_days: 10 },
    createdBy,
  );
  await shareOfferingRepository.open(resort1.id, ago(5));

  // Banani Business Centre — buyers paid up, round closed
  const tower = ids.get('Nokshi Banani Business Centre')!;
  const tower1 = await shareOfferingRepository.save(
    { ...TERMS, project_id: tower, net_asset_value: 65 * CRORE, premium_value: 15 * CRORE, valuation_date: ago(310), offered_pct: 30, total_shares: 300, validity_days: 330, max_shares: 10, min_down_payment_pct: 50, max_installments: 4, installment_frequency: 'quarterly' },
    createdBy,
  );
  await shareOfferingRepository.open(tower1.id, ago(300));
  await sell(tower1.id, TOWER_BUYERS);
  await shareOfferingRepository.close(tower1.id);

  if (uttara) {
    await shareOfferingRepository.save(
      {
        ...TERMS,
        project_id: uttara,
        net_asset_value: 60 * CRORE,
        premium_value: 15 * CRORE,
        valuation_date: ago(5),
        offered_pct: 25,
        total_shares: 250,
        validity_days: 90,
        max_shares: 15,
        min_down_payment_pct: 25,
        max_installments: 8,
        installment_frequency: 'quarterly',
        grace_days: 10,
        notes: 'Draft for the board meeting — premium still under discussion.',
      },
      createdBy,
    );
  }

  await seedPortalActivity(customers, { hotel2: hotel2.id, resort1: resort1.id, round1: round1.id }, ago, createdBy);
}

/**
 * What customers sent from the Customer Portal: the demo login's KYC record,
 * purchase requests at each stage, and uploaded documents to review.
 */
async function seedPortalActivity(
  customers: Map<string, string>,
  rounds: { hotel2: string; resort1: string; round1: string },
  ago: (days: number) => string,
  createdBy: string | null,
) {
  const db = getDb();
  const farhana = customers.get(FARHANA.phone)!;
  await customerRepository.update(farhana, {
    nid: '1984263504821',
    tin: '583920147730',
    date_of_birth: '1984-03-14',
    address: 'House 27, Road 104, Gulshan 2, Dhaka 1212',
    kyc_verified_on: ago(300),
    nominee_name: 'Arif Rahman',
    nominee_relation: 'Spouse',
    nominee_phone: '01819556677',
    bank_name: 'Eastern Bank PLC',
    bank_branch: 'Gulshan Branch',
    bank_account: '1041060246402',
  } satisfies Partial<Customer>);

  // requests: a new one, one the office called about, one turned into a reservation
  const codes: string[] = [];
  const request = async (phone: string, offering: string, shares: number, installments: number, note: string | null, daysAgo: number) => {
    const o = (await db.share_offerings.get(offering))!;
    const ts = `${ago(daysAgo)}T10:30:00.000Z`;
    const code = nextCode('SRQ', codes);
    codes.push(code);
    const row = {
      id: newId(),
      code,
      offering_id: offering,
      project_id: o.project_id,
      customer_id: customers.get(phone)!,
      shares,
      installments,
      note,
      requested_at: ts,
      status: 'new' as const,
      sale_id: null,
      office_note: null,
      created_at: ts,
      updated_at: ts,
      created_by: null,
    };
    await db.share_requests.add(row);
    return row;
  };
  await request('01819001122', rounds.hotel2, 10, 12, 'Please call after 5pm.', 1);
  const contacted = await request('01913407788', rounds.resort1, 6, 8, null, 3);
  await shareRequestRepository.markContacted(contacted.id, 'Spoke on the phone — agreement meeting at our Gulshan office on Sunday, 11am.');
  const reserved = await request('01552778899', rounds.hotel2, 4, 20, 'Same plan as my Tongi shares, please.', 4);
  await shareRequestRepository.reserve(reserved.id, { shares: 4, down_payment_pct: 20, installment_count: 20 }, createdBy);

  // documents: the demo login's NID accepted; a payment slip waiting for review
  const upload = async (phone: string, saleOffering: string | null, kind: CustomerUploadKind, title: string, note: string | null, daysAgo: number, accepted: boolean) => {
    const customerId = customers.get(phone)!;
    const sale = saleOffering ? (await db.share_sales.where('customer_id').equals(customerId).toArray()).find((s) => s.offering_id === saleOffering)! : null;
    const ts = `${ago(daysAgo)}T09:15:00.000Z`;
    const id = newId();
    await db.customer_uploads.add({
      id,
      customer_id: customerId,
      sale_id: sale?.id ?? null,
      source: 'customer',
      kind,
      title,
      note,
      file_name: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
      file_type: 'application/pdf',
      file_size: 0,
      uploaded_at: ts,
      status: 'under_review',
      reviewed_on: null,
      review_note: null,
      created_at: ts,
      updated_at: nowIso(),
      created_by: null,
    });
    const blob = samplePdf(title);
    await db.customer_upload_files.add({ id, blob });
    await db.customer_uploads.update(id, { file_size: blob.size });
    if (accepted) await customerUploadRepository.accept(id);
  };
  await upload(FARHANA.phone, null, 'tin', 'e-TIN certificate', 'Downloaded from the NBR site.', 3, false);
  await upload('01819001122', rounds.round1, 'payment_proof', 'Bank deposit slip', 'Installment 4 paid at City Bank, Gulshan.', 2, false);
}

/** A one-page PDF with a line of text, so a demo upload opens like a real one. */
function samplePdf(text: string): Blob {
  const line = `Sample document: ${text}`.replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${line}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: 'application/pdf' });
}
