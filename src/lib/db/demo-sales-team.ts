'use client';

import { addDays } from '../domain/share-sale';
import {
  commissionLineRepository,
  commissionPayoutRepository,
  commissionPlanRepository,
  customerRepository,
  orgMemberRepository,
  shareSaleRepository,
  syncCommissions,
  ORG_DESIGNATION,
} from '../repositories';
import { todayLocal } from '../utils/format';
import { getDb } from './database';
import type { CommissionLine, OrgMember } from './types';

/*
 * Sales Team demo (REVENUE-SHARE-PLAN.md §6–7, §12). Three founders — the
 * company's partners — with team leads under them and sales people under
 * those. The commission plan is the client's example: seller 10%, Team Lead
 * 1%, Founder 0.5%, released 20% at agreement + down payment, 30% at half
 * paid, 50% at fully paid. Sales Executive Tania (under Team Lead Imran,
 * under founder Karim) sold hotel shares, so her lines reproduce §12.
 *
 * Every line status shows up: pending (a reservation), earned (to approve),
 * approved (to pay), paid (CPO payouts), void and recovered (a Tongi purchase
 * cancelled after its first stage was paid; Sumon's next payout takes it
 * back), and a founder's recovery still waiting for his next payout. Arif
 * moved teams 60 days ago, so his older sale still pays his old lead.
 */

interface DemoMember {
  key: string;
  name: string;
  phone: string;
  designation: string;
  parent: string | null;
  user?: string;
  partner?: string;
  left_ago?: number;
}

const MEMBERS: DemoMember[] = [
  { key: 'karim', name: 'Karim Uddin', phone: '01711-223344', designation: 'Founder', parent: null, partner: 'Karim Uddin' },
  { key: 'rahim', name: 'Rahim Chowdhury', phone: '01819-556677', designation: 'Founder', parent: null, partner: 'Rahim Chowdhury' },
  { key: 'selina', name: 'Selina Akter', phone: '01912-889900', designation: 'Founder', parent: null, partner: 'Selina Akter' },
  { key: 'imran', name: 'Imran Kabir', phone: '01715-402233', designation: 'Team Lead', parent: 'karim', user: 'Imran Kabir' },
  { key: 'tanzila', name: 'Tanzila Rahman', phone: '01716-118899', designation: 'Team Lead', parent: 'karim', user: 'Tanzila Rahman' },
  { key: 'shakib', name: 'Shakib Al Mamun', phone: '01713-556644', designation: 'Team Lead', parent: 'rahim', user: 'Shakib Al Mamun' },
  { key: 'tania', name: 'Tania Sultana', phone: '01721-334455', designation: 'Sales Executive', parent: 'imran' },
  { key: 'sumon', name: 'Sumon Mia', phone: '01731-667788', designation: 'Freelance Agent', parent: 'imran' },
  // moved to Tanzila's team 60 days ago (below)
  { key: 'arif', name: 'Arif Mahmud', phone: '01717-220011', designation: 'Sales Executive', parent: 'shakib', user: 'Arif Mahmud' },
  { key: 'nishat', name: 'Nishat Tabassum', phone: '01718-990011', designation: 'Sales Executive', parent: 'tanzila', user: 'Nishat Tabassum' },
  { key: 'rakib', name: 'Rakibul Hasan', phone: '01719-445566', designation: 'Senior Sales', parent: 'shakib', user: 'Rakibul Hasan' },
  { key: 'habib', name: 'Habib Ullah', phone: '01741-778899', designation: 'Freelance Agent', parent: 'shakib', left_ago: 90 },
];

const HOTEL = 'Nokshi Lakeshore Hotel & Suites';
const TONGI = 'Nokshi Tongi Logistics Park';

/** Which demo share purchase each member sold: [project, buyer phone, seller]. */
const SOLD: [string, string, string][] = [
  [HOTEL, '01819001122', 'tania'], // Tanvir, 6 shares paid in full — every stage earned and paid
  [HOTEL, '01712908070', 'tania'], // Mahmudul, 59% paid — stages 1 and 2
  [HOTEL, '01913407788', 'sumon'], // Sabina, 36% paid — stage 1
  [HOTEL, '01711223344', 'arif'], // Farhana, sold while Arif was in Shakib's team
  [HOTEL, '01966445566', 'nishat'], // Afsana
  [TONGI, '01552778899', 'sumon'], // Rezaul — cancelled after stage 1 was paid
  [TONGI, '01819001122', 'rakib'], // Tanvir
  [TONGI, '01711223344', 'arif'],
  [TONGI, '01678334455', 'tania'], // Kamrul, still a reservation — pending
];

export async function seedDemoSalesTeam(createdBy: string | null): Promise<void> {
  const db = getDb();
  const today = todayLocal();
  const ago = (days: number) => addDays(today, -days);

  const designations = await db.lookup_values.where('category').equals(ORG_DESIGNATION).toArray();
  const designation = (name: string) => designations.find((d) => d.value === name)?.id;
  if (!designation('Founder') || !designation('Team Lead')) return;
  const [users, partners] = await Promise.all([db.users.toArray(), db.partners.toArray()]);

  // the organisation
  const ids = new Map<string, OrgMember>();
  for (const m of MEMBERS) {
    const saved = await orgMemberRepository.save(
      {
        name: m.name,
        phone: m.phone,
        designation_id: designation(m.designation) ?? designation('Sales Executive')!,
        parent_id: m.parent ? (ids.get(m.parent)?.id ?? null) : null,
        user_id: users.find((u) => u.name === m.user)?.id ?? null,
        partner_id: partners.find((p) => p.name === m.partner && !p.project_id)?.id ?? null,
        joined_on: ago(400),
        notes: null,
      },
      createdBy,
    );
    ids.set(m.key, saved);
  }
  const id = (key: string) => ids.get(key)!.id;
  await orgMemberRepository.move(id('arif'), id('tanzila'), ago(60), 'New team under Tanzila', createdBy);
  await orgMemberRepository.markLeft(id('habib'), ago(90));

  // the plans: the client's share-sale example, and a booking plan waiting for the client's figures
  await commissionPlanRepository.save(
    {
      name: 'Share sales — standard',
      applies_to: 'share_sale',
      project_id: null,
      offering_id: null,
      seller_basis: 'pct',
      seller_value: 10,
      stages: [
        { key: 'agreement', label: 'Agreement + down payment', trigger: 'agreement_down_payment', release_type: 'pct', release_value: 20 },
        { key: 'half', label: '50% paid', trigger: 'paid_pct', threshold_pct: 50, release_type: 'pct', release_value: 30 },
        { key: 'full', label: 'Fully paid', trigger: 'fully_paid', release_type: 'pct', release_value: 50 },
      ],
      overrides: [
        { designation_id: designation('Team Lead')!, basis: 'pct', value: 1 },
        { designation_id: designation('Founder')!, basis: 'pct', value: 0.5 },
      ],
      cancel_rule: 'recover',
      effective_from: ago(400),
      effective_to: null,
      status: 'active',
      notes: 'The client’s example (REVENUE-SHARE-PLAN.md §7.1).',
    },
    createdBy,
  );
  await commissionPlanRepository.save(
    {
      name: 'Unit bookings — standard',
      applies_to: 'booking',
      project_id: null,
      offering_id: null,
      seller_basis: 'pct',
      seller_value: 1,
      stages: [
        { key: 'confirmed', label: 'Booking confirmed', trigger: 'agreement', release_type: 'pct', release_value: 30 },
        { key: 'half', label: '50% paid', trigger: 'paid_pct', threshold_pct: 50, release_type: 'pct', release_value: 30 },
        { key: 'handover', label: 'Handover', trigger: 'handover', release_type: 'pct', release_value: 40 },
      ],
      overrides: [{ designation_id: designation('Team Lead')!, basis: 'pct', value: 0.25 }],
      cancel_rule: 'recover',
      effective_from: ago(400),
      effective_to: null,
      status: 'draft',
      notes: 'Switched on once the client confirms the booking rates (decision 11).',
    },
    createdBy,
  );

  // who sold what
  const projects = await db.projects.toArray();
  const projectId = (name: string) => projects.find((p) => p.name === name)?.id;
  const saleOf = async (project: string, phone: string) => {
    const customer = await customerRepository.findByPhone(phone);
    if (!customer) return undefined;
    return (await db.share_sales.where('customer_id').equals(customer.id).toArray()).find((s) => s.project_id === projectId(project));
  };
  for (const [project, phone, seller] of SOLD) {
    const sale = await saleOf(project, phone);
    if (sale) await orgMemberRepository.setSoldBy('share', sale.id, id(seller));
  }
  for (const b of await db.bookings.toArray()) {
    const m = await orgMemberRepository.forUser(b.booked_by);
    if (m) await orgMemberRepository.setSoldBy('booking', b.id, m.id);
  }
  await syncCommissions();

  const account = (await db.bank_accounts.toArray()).filter((a) => a.type === 'bank' && a.is_active).sort((a, b) => b.opening_balance - a.opening_balance)[0];
  if (!account) return;
  const on = (d: string) => (d < account.opening_balance_date ? account.opening_balance_date : d);
  const linesOf = async (project: string, phone: string, stages: number[]) => {
    const sale = await saleOf(project, phone);
    if (!sale) return [] as CommissionLine[];
    return (await db.commission_lines.where('share_sale_id').equals(sale.id).toArray()).filter((l) => stages.includes(l.stage_seq) && l.status === 'earned');
  };
  const approve = async (lines: CommissionLine[]) => {
    if (lines.length) await commissionLineRepository.approve(lines.map((l) => l.id), createdBy);
  };
  const pay = async (key: string, date: string, ref: string) => {
    const preview = await commissionPayoutRepository.preview(id(key));
    if (!preview?.lines.length) return;
    await commissionPayoutRepository.pay({ member_id: id(key), account_id: account.id, paid_on: on(date), tax_pct: 10, reference_no: ref }, createdBy);
  };

  // last month's payouts: Tanvir's hotel shares in full, the first stage of Mahmudul's and Rezaul's
  await approve([...(await linesOf(HOTEL, '01819001122', [0, 1, 2])), ...(await linesOf(HOTEL, '01712908070', [0])), ...(await linesOf(TONGI, '01552778899', [0]))]);
  await pay('tania', ago(20), 'CHQ 448120');
  await pay('imran', ago(20), 'CHQ 448121');
  await pay('karim', ago(20), 'Transfer');
  await pay('sumon', ago(20), 'bKash 01731667788');

  // since then: Mahmudul's half-paid stage approved, not yet paid
  await approve(await linesOf(HOTEL, '01712908070', [1]));

  // Rezaul cancels; Sumon's paid first stage is taken back from his next payout
  const rezaul = await saleOf(TONGI, '01552778899');
  if (rezaul?.status === 'agreement_signed') {
    await shareSaleRepository.cancelSale(rezaul.id, 'Customer withdrew; refunded as the agreement allows.');
    await syncCommissions();
  }
  await approve(await linesOf(HOTEL, '01913407788', [0]));
  await pay('sumon', ago(2), 'bKash 01731667788');
  await pay('imran', ago(2), 'CHQ 448190');
}

/**
 * Adds the Sales Team demo to a database that already holds the rest of the
 * demo (it arrived after them). Only while the organisation is empty and the
 * demo partners exist, so it never lands in a real company's data.
 */
export async function ensureDemoSalesTeam(): Promise<void> {
  const db = getDb();
  if ((await db.org_members.count()) > 0 || (await db.commission_plans.count()) > 0) return;
  const partners = await db.partners.toArray();
  if (!partners.some((p) => p.name === 'Karim Uddin') || (await db.share_sales.count()) === 0) return;
  await seedDemoSalesTeam(null);
}
