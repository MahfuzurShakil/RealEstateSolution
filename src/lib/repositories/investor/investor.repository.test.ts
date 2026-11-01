import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { viewPortfolio } from '@/lib/domain/investor-portal';
import { investorRepository } from './investor.repository';

/*
 * The Customer Portal reads the admin Share Sale tables, so it has to
 * whitelist like the website does (AGENTS.md): the net asset value and
 * premium, the office's notes, other customers and any column added later
 * must never reach it. Private fields hold a "LEAK" marker or a 777xxx
 * number, and every row carries a column no repository knows (`leak_probe`).
 */

const LEAK = /LEAK|leak_probe|777\d{3}/;
const NOW = '2026-01-01T00:00:00.000Z';
const base = (id: string) => ({ id, created_at: NOW, updated_at: NOW, created_by: 'LEAK-creator', leak_probe: 'LEAK-new-column' });
// rows carry columns the types do not know about, on purpose
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (list: object[]) => list as any[];

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

beforeAll(async () => {
  const w = window as unknown as Record<string, unknown>;
  w.localStorage = memoryStorage();
  w.sessionStorage = memoryStorage();
  w.dispatchEvent = () => true;
  await Promise.all(db.tables.map((t) => t.clear()));

  await db.customers.bulkAdd(rows([
    { ...base('c1'), code: 'CUST-2026-001', name: 'Farhana Rahman', phone: '01711223344', email: 'f@example.com', nid: '1984263504821', customer_type: 'investor', lead_id: 'LEAK-lead', profession: 'LEAK-profession' },
    { ...base('c2'), code: 'CUST-2026-002', name: 'LEAK-other-customer', phone: '01819001122', customer_type: 'investor' },
  ]));
  await db.projects.bulkAdd(rows([
    { ...base('p1'), code: 'PRJ-2026-001', name: 'Sample Hotel', project_type: 'commercial', status: 'under_construction', amenities: [], is_public: false, is_featured: false, sales_status: 'not_open', location_summary: 'Gulshan', architect: 'LEAK-architect', est_avg_rate: 777111, contingency_pct: 777 },
  ]));
  const offering = {
    project_id: 'p1', round_no: 1, net_asset_value: 777001, premium_value: 777002, valuation: 1_554_003, valuation_date: '2025-12-01',
    offered_pct: 40, total_shares: 400, share_pct: 0.1, price_per_share: 1_554, validity_days: 365, opens_on: '2025-12-01', closes_on: '2099-12-31',
    min_shares: 1, max_shares: 20, min_down_payment_pct: 20, max_installments: 20, installment_frequency: 'monthly', late_fee_pct: 2, grace_days: 7, hold_days: 7,
    status: 'open', notes: 'LEAK-offering-notes',
  };
  await db.share_offerings.bulkAdd(rows([{ ...base('o1'), code: 'SHO-2026-001', ...offering }]));
  const sale = {
    offering_id: 'o1', project_id: 'p1', shares: 5, share_pct: 0.5, price_per_share: 1_554, total_price: 7_770, down_payment: 1_554, installment_count: 4,
    installment_frequency: 'monthly', reserved_on: '2025-12-02', hold_until: '2025-12-09', agreement_no: 'AGR-2026-001', agreement_date: '2025-12-05',
    first_due_date: '2026-01-05', status: 'agreement_signed', status_note: 'LEAK-status-note', notes: 'LEAK-sale-notes',
    signing: {
      place: 'Gulshan office', company_signatory: 'Signatory', company_signatory_title: null, stamp_value: 300, stamp_serial: 'LEAK-stamp-serial',
      notarized_on: '2025-12-05', notary_name: 'LEAK-notary', attorney_name: null,
      witnesses: [{ name: 'Witness One', id_or_phone: 'LEAK-777321', address: 'LEAK-witness-address' }, { name: 'Witness Two', id_or_phone: null, address: null }],
    },
  };
  await db.share_sales.bulkAdd(rows([
    { ...base('s1'), code: 'SHR-2026-001', customer_id: 'c1', ...sale },
    { ...base('s2'), code: 'SHR-2026-002', customer_id: 'c2', ...sale, agreement_no: 'AGR-2026-002' },
  ]));
  await db.share_installments.bulkAdd(rows([
    { ...base('i0'), sale_id: 's1', seq: 0, due_date: '2025-12-05', amount: 1_554 },
    { ...base('i1'), sale_id: 's1', seq: 1, due_date: '2026-01-05', amount: 1_554 },
    { ...base('j0'), sale_id: 's2', seq: 0, due_date: '2025-12-05', amount: 1_554 },
  ]));
  await db.share_payments.bulkAdd(rows([
    { ...base('pay1'), code: 'SRC-2026-001', sale_id: 's1', paid_on: '2025-12-05', amount: 1_554, principal: 1_554, late_fee: 0, method: 'bank_transfer', reference: 'DEP-1', allocations: [{ installment_id: 'i0', principal: 1_554, late_fee: 0 }], notes: 'LEAK-payment-notes' },
    { ...base('pay2'), code: 'SRC-2026-002', sale_id: 's2', paid_on: '2025-12-05', amount: 1_554, principal: 1_554, late_fee: 0, method: 'cash', reference: 'LEAK-other-ref', allocations: [{ installment_id: 'j0', principal: 1_554, late_fee: 0 }] },
  ]));
  await db.share_requests.bulkAdd(rows([
    { ...base('r1'), code: 'SRQ-2026-001', offering_id: 'o1', project_id: 'p1', customer_id: 'c1', shares: 2, installments: 10, note: null, requested_at: NOW, status: 'new', office_note: 'LEAK-internal-remark' },
  ]));
  await db.customer_uploads.bulkAdd(rows([
    { ...base('u1'), customer_id: 'c1', sale_id: 's1', kind: 'id_document', title: 'NID copy', note: null, file_name: 'nid.pdf', file_type: 'application/pdf', file_size: 10, uploaded_at: NOW, status: 'accepted', review_note: 'LEAK-review' },
    { ...base('u2'), customer_id: 'c1', sale_id: null, source: 'office', kind: 'photo', title: 'Photograph', note: null, file_name: 'photo.pdf', file_type: 'application/pdf', file_size: 10, uploaded_at: NOW, status: 'accepted', review_note: null },
    { ...base('u3'), customer_id: 'c2', sale_id: null, source: 'office', kind: 'photo', title: 'LEAK-other-customer-photo', note: null, file_name: 'x.pdf', file_type: 'application/pdf', file_size: 10, uploaded_at: NOW, status: 'accepted', review_note: null },
  ]));
});

describe('Customer Portal repository', () => {
  it('signs in only customers it knows', async () => {
    expect((await investorRepository.requestCode('01999999999')).ok).toBe(false);
    expect((await investorRepository.requestCode('+880 1711-223344')).ok).toBe(true);
    expect((await investorRepository.verifyCode('000000')).ok).toBe(false);
    expect((await investorRepository.verifyCode(investorRepository.demoLogin.otp)).ok).toBe(true);
  });

  it('shows only the signed-in customer’s own data, field by field', async () => {
    const snap = (await investorRepository.snapshot())!;
    expect(snap.customer.full_name).toBe('Farhana Rahman');
    expect(snap.customer.nid_masked).toBe('•••• •••• 4821');
    expect(snap.holdings.map((h) => h.code)).toEqual(['SHR-2026-001']);
    expect(snap.payments.map((p) => p.receipt_no)).toEqual(['SRC-2026-001']);
    expect(snap.payments[0].allocations[0].installment_id).toBe('SHR-2026-001-0');
    expect(snap.rounds[0].valuation).toBe(1_554_003);
    expect(snap.share_requests[0].office_note).toBeNull();
    expect(viewPortfolio(snap).paid).toBe(1_554);
    expect(snap.holdings[0].signing?.witnesses).toEqual(['Witness One', 'Witness Two']);
    expect(snap.uploads.find((u) => u.id === 'u2')).toMatchObject({ holding_code: null, source: 'office' });
    expect(JSON.stringify(snap)).not.toMatch(LEAK);
  });
});
