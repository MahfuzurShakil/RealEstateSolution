import type {
  CustomerDocument,
  Installment,
  InvestorCustomer,
  InvestorProject,
  PaymentMethod,
  PaymentRecord,
  ShareHolding,
  ShareRound,
} from '@/lib/domain/investor-portal';

/*
 * Mock data for the Customer Portal demo. Nothing here touches Dexie or the
 * admin side. Dates are laid out relative to "today" so the demo always shows
 * one overdue installment, one coming due and one fully paid holding — the
 * numbers match PROJECT-SHARE-SALE-PLAN.md §7 (5 shares, ৳50 lakh, ৳2 lakh a month).
 */

const unsplash = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=70`;

export const DEMO_LOGIN = { phone: '01711223344', email: 'farhana.rahman@example.com', otp: '123456' };

const LAKH = 100_000;
const CRORE = 10_000_000;

/** `base` (YYYY-MM-DD) moved by whole months, on a fixed day of the month. */
function monthDay(base: string, months: number, day: number): string {
  const [y, m] = base.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, day));
  return d.toISOString().slice(0, 10);
}
const minusDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

const METHOD_DETAIL: Record<PaymentMethod, string> = {
  bkash: 'bKash 01711•••344',
  nagad: 'Nagad 01711•••344',
  rocket: 'Rocket 01711•••3440',
  card: 'Visa •••• 4242',
  internet_banking: 'Eastern Bank PLC internet banking',
  bank_transfer: 'Deposit at Eastern Bank PLC',
  cheque: 'Cheque, Eastern Bank PLC',
};

/** A stable, provider-looking transaction ID from a seed string. */
export function demoReference(method: PaymentMethod, seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const alnum = (len: number) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    let x = h;
    for (let i = 0; i < len; i++) {
      x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
      s += chars[x % chars.length];
    }
    return s;
  };
  const digits = (len: number) => String(h).padStart(len, '7').slice(-len);
  switch (method) {
    case 'bkash':
      return alnum(10);
    case 'nagad':
      return `7${alnum(7)}`;
    case 'rocket':
      return digits(10);
    case 'card':
      return `AUTH ${digits(6)}`;
    case 'internet_banking':
      return `IB${digits(10)}`;
    case 'cheque':
      return `CHQ ${digits(7)}`;
    default:
      return `DEP-${digits(8)}`;
  }
}

export interface DemoData {
  customer: InvestorCustomer;
  projects: InvestorProject[];
  rounds: ShareRound[];
  holdings: ShareHolding[];
  installments: Installment[];
  payments: PaymentRecord[];
  documents: CustomerDocument[];
}

export function buildDemoData(today: string): DemoData {
  const at = (months: number, day: number) => monthDay(today, months, day);

  const customer: InvestorCustomer = {
    code: 'CUS-2026-0148',
    customer_type: 'investor',
    full_name: 'Farhana Rahman',
    email: DEMO_LOGIN.email,
    phone: DEMO_LOGIN.phone,
    nid_masked: '•••• •••• 4821',
    tin_masked: '•••••••• 7730',
    date_of_birth: '1984-03-14',
    address: 'House 27, Road 104, Gulshan 2, Dhaka 1212',
    kyc_verified_on: at(-16, 3),
    joined_on: at(-16, 1),
    nominee: { name: 'Arif Rahman', relation: 'Spouse', phone: '01819556677', share_pct: 100 },
    bank: { bank_name: 'Eastern Bank PLC', branch: 'Gulshan Branch', account_masked: '•••• •••• 6402' },
  };

  const projects: InvestorProject[] = [
    {
      code: 'PRJ-2026-007',
      name: 'Lakeview Grand Hotel & Suites',
      category: '5-star hotel',
      location: 'Gulshan Lake, Dhaka',
      image: unsplash('photo-1566073771259-6a8506099945'),
      summary: 'A 280-key five-star hotel with conference halls, rooftop dining and serviced suites on Gulshan Lake.',
      valuation: 120 * CRORE,
      valuation_date: at(-1, 15),
      construction_progress_pct: 38,
    },
    {
      code: 'PRJ-2026-011',
      name: 'Ocean Pearl Resort',
      category: 'Beach resort',
      location: 'Kolatoli, Cox’s Bazar',
      image: unsplash('photo-1571896349842-33c89424de2d'),
      summary: 'A sea-facing resort with 160 rooms, private villas and a spa on Kolatoli beach.',
      valuation: 60 * CRORE,
      valuation_date: at(-6, 1),
      construction_progress_pct: 21,
    },
    {
      code: 'PRJ-2025-004',
      name: 'Banani Business Center',
      category: 'Commercial tower',
      location: 'Kemal Ataturk Avenue, Banani, Dhaka',
      image: unsplash('photo-1486406146926-c627a92ad1ab'),
      summary: 'A 16-storey Grade-A office tower, fully let to corporate tenants.',
      valuation: 90 * CRORE,
      valuation_date: at(-2, 1),
      construction_progress_pct: 100,
    },
  ];

  const rounds: ShareRound[] = [
    { code: 'RND-2026-007-1', project_code: 'PRJ-2026-007', round_no: 1, valuation: 100 * CRORE, offered_pct: 50, total_shares: 500, share_pct: 0.1, price_per_share: 10 * LAKH, shares_available: 0, opens_on: at(-7, 1), closes_on: at(-2, 0), is_open: false },
    { code: 'RND-2026-007-2', project_code: 'PRJ-2026-007', round_no: 2, valuation: 120 * CRORE, offered_pct: 20, total_shares: 200, share_pct: 0.1, price_per_share: 12 * LAKH, shares_available: 143, opens_on: at(-1, 15), closes_on: at(3, 0), is_open: true },
    { code: 'RND-2026-011-1', project_code: 'PRJ-2026-011', round_no: 1, valuation: 60 * CRORE, offered_pct: 40, total_shares: 400, share_pct: 0.1, price_per_share: 6 * LAKH, shares_available: 86, opens_on: at(-7, 1), closes_on: at(2, 0), is_open: true },
    { code: 'RND-2025-004-1', project_code: 'PRJ-2025-004', round_no: 1, valuation: 80 * CRORE, offered_pct: 30, total_shares: 300, share_pct: 0.1, price_per_share: 8 * LAKH, shares_available: 0, opens_on: at(-18, 1), closes_on: at(-15, 0), is_open: false },
  ];

  const holdings: ShareHolding[] = [
    {
      code: 'SHR-2026-0041', project_code: 'PRJ-2026-007', round_code: 'RND-2026-007-1',
      agreement_no: 'AGR-2026-0041', agreement_date: at(-5, 8),
      shares: 5, share_pct: 0.5, price_per_share: 10 * LAKH, total_price: 50 * LAKH,
      down_payment: 10 * LAKH, installment_count: 20, frequency: 'monthly', status: 'paying', certificate_no: null,
    },
    {
      code: 'SHR-2026-0067', project_code: 'PRJ-2026-011', round_code: 'RND-2026-011-1',
      agreement_no: 'AGR-2026-0067', agreement_date: at(-6, 12),
      shares: 3, share_pct: 0.3, price_per_share: 6 * LAKH, total_price: 18 * LAKH,
      down_payment: 4.5 * LAKH, installment_count: 6, frequency: 'quarterly', status: 'paying', certificate_no: null,
    },
    {
      code: 'SHR-2025-0012', project_code: 'PRJ-2025-004', round_code: 'RND-2025-004-1',
      agreement_no: 'AGR-2025-0012', agreement_date: at(-16, 1),
      shares: 2, share_pct: 0.2, price_per_share: 8 * LAKH, total_price: 16 * LAKH,
      down_payment: 8 * LAKH, installment_count: 4, frequency: 'quarterly', status: 'confirmed', certificate_no: 'CRT-2026-0012',
    },
  ];

  // schedule: down payment, then installments every month / quarter
  const plan: { holding: ShareHolding; down: string; first: [number, number]; step: number }[] = [
    { holding: holdings[0], down: at(-5, 10), first: [-4, 5], step: 1 },
    { holding: holdings[1], down: at(-6, 15), first: [-3, 20], step: 3 },
    { holding: holdings[2], down: at(-16, 3), first: [-13, 1], step: 3 },
  ];
  const installments: Installment[] = plan.flatMap(({ holding, down, first, step }) => {
    const each = (holding.total_price - holding.down_payment) / holding.installment_count;
    return [
      { id: `${holding.code}-0`, holding_code: holding.code, seq: 0, due_date: down, amount: holding.down_payment },
      ...Array.from({ length: holding.installment_count }, (_, k) => ({
        id: `${holding.code}-${k + 1}`,
        holding_code: holding.code,
        seq: k + 1,
        due_date: at(first[0] + k * step, first[1]),
        amount: each,
      })),
    ];
  });

  // what is already paid: [holding, seq, method, days paid before due]
  const paid: [string, number, PaymentMethod, number][] = [
    ['SHR-2025-0012', 0, 'bank_transfer', 0],
    ['SHR-2025-0012', 1, 'bank_transfer', 2],
    ['SHR-2025-0012', 2, 'bank_transfer', 1],
    ['SHR-2025-0012', 3, 'bank_transfer', 3],
    ['SHR-2025-0012', 4, 'bank_transfer', 0],
    ['SHR-2026-0041', 0, 'bank_transfer', 0],
    ['SHR-2026-0041', 1, 'bkash', 2],
    ['SHR-2026-0041', 2, 'card', 1],
    ['SHR-2026-0041', 3, 'bkash', 3],
    ['SHR-2026-0067', 0, 'cheque', 0],
    ['SHR-2026-0067', 1, 'nagad', 4],
  ];
  const rows = paid.map(([holding_code, seq, method, early]) => {
    const inst = installments.find((i) => i.id === `${holding_code}-${seq}`)!;
    return { holding_code, inst, method, amount: inst.amount, paid_on: minusDays(inst.due_date, early) };
  });
  // a part payment, to show how the rest of an installment stays owing
  const resort2 = installments.find((i) => i.id === 'SHR-2026-0067-2')!;
  rows.push({ holding_code: 'SHR-2026-0067', inst: resort2, method: 'bkash', amount: 100_000, paid_on: minusDays(today, 4) });

  const payments: PaymentRecord[] = rows
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on))
    .map(({ holding_code, inst, method, amount, paid_on }, n) => {
      const online = method === 'bkash' || method === 'nagad' || method === 'card';
      return {
        receipt_no: `RCT-${paid_on.slice(0, 4)}-${String(20311 + n * 7).padStart(5, '0')}`,
        holding_code,
        allocations: [{ installment_id: inst.id, principal: amount, late_fee: 0 }],
        principal: amount,
        late_fee: 0,
        total: amount,
        method,
        method_detail: METHOD_DETAIL[method],
        channel: online ? 'online' : 'office',
        reference: demoReference(method, `${paid_on}${inst.id}`),
        paid_at: `${paid_on}T11:${String(10 + n * 3).padStart(2, '0')}:00`,
      };
    });

  const documents: CustomerDocument[] = holdings.flatMap((h) => [
    { id: `${h.code}-agreement`, holding_code: h.code, kind: 'agreement' as const, title: 'Share purchase agreement', issued_on: h.agreement_date, available: true },
    { id: `${h.code}-deed`, holding_code: h.code, kind: 'deed' as const, title: 'Deed of share ownership', issued_on: h.agreement_date, available: true },
    { id: `${h.code}-schedule`, holding_code: h.code, kind: 'schedule' as const, title: 'Payment schedule', issued_on: h.agreement_date, available: true },
    {
      id: `${h.code}-certificate`,
      holding_code: h.code,
      kind: 'certificate' as const,
      title: 'Share certificate',
      issued_on: h.status === 'confirmed' ? at(-3, 10) : null,
      available: h.status === 'confirmed',
    },
  ]);

  return { customer, projects, rounds, holdings, installments, payments, documents };
}
