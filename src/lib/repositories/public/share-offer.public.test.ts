import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { todayLocal } from '../../utils/format';
import { publicShareOfferRepository } from './share-offer.public.repository';

/*
 * BUYER-PORTAL-PLAN.md §6 — share offerings on the website: nothing while the
 * switch is off, and when it is on, nothing of the valuation's make-up, the
 * owner's notes or a column no one has mapped yet.
 */

const LEAK = /LEAK|leak_probe|777\d{3}/;
const NOW = '2026-01-01T00:00:00.000Z';
const base = (id: string) => ({ id, created_at: NOW, updated_at: NOW, created_by: 'LEAK-creator', leak_probe: 'LEAK-new-column' });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (list: object[]) => list as any[];

async function seed(on: boolean) {
  await Promise.all(db.tables.map((t) => t.clear()));
  const today = todayLocal();
  await db.company_settings.bulkAdd(rows([{ ...base('co'), company_name: 'Sample Co', default_currency: 'BDT', tax_id: 'LEAK-tax', public_show_share_sale: on }]));
  await db.projects.bulkAdd(rows([{ ...base('p1'), code: 'PRJ-2026-009', name: 'Lake Resort', project_type: 'commercial', location_summary: 'Sylhet', status: 'under_construction', notes: 'LEAK-project-notes', budget: 777123 }]));
  await db.share_offerings.bulkAdd(rows([{
    ...base('o1'),
    code: 'SHO-2026-001',
    project_id: 'p1',
    round_no: 1,
    net_asset_value: 777111,
    premium_value: 777222,
    valuation: 777333,
    valuation_date: today,
    offered_pct: 40,
    total_shares: 400,
    share_pct: 0.1,
    price_per_share: 250_000,
    validity_days: 30,
    opens_on: today,
    closes_on: today,
    min_shares: 1,
    max_shares: 20,
    min_down_payment_pct: 20,
    max_installments: 24,
    installment_frequency: 'monthly',
    late_fee_pct: 2,
    grace_days: 7,
    hold_days: 7,
    status: 'open',
    notes: 'LEAK-offering-notes',
  }]));
}

describe('public share offerings', () => {
  beforeEach(() => seed(true));

  it('shows nothing while the website switch is off', async () => {
    await seed(false);
    expect(await publicShareOfferRepository.openOffers()).toEqual([]);
    await expect(publicShareOfferRepository.requestShares({ round_code: 'SHO-2026-001', shares: 2, installments: 12, note: '', name: 'Rana', phone: '01711000000', email: '' })).rejects.toThrow();
  });

  it('returns the open offering without anything private', async () => {
    const offers = await publicShareOfferRepository.openOffers();
    expect(offers).toHaveLength(1);
    expect(offers[0].round.price_per_share).toBe(250_000);
    expect(JSON.stringify(offers)).not.toMatch(LEAK);
  });

  it('takes a visitor’s request without an account, and updates it on a second try', async () => {
    const first = await publicShareOfferRepository.requestShares({ round_code: 'SHO-2026-001', shares: 2, installments: 12, note: 'Evening calls', name: 'Rana Ahmed', phone: '01711 000000', email: '' });
    await publicShareOfferRepository.requestShares({ round_code: 'SHO-2026-001', shares: 5, installments: 12, note: '', name: 'Rana Ahmed', phone: '01711000000', email: 'rana@example.com' });
    const all = await db.share_requests.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ code: first.code, customer_id: null, source: 'website', prospect_phone: '01711000000', shares: 5, status: 'new' });
  });

  it('refuses more shares than one customer may take', async () => {
    await expect(publicShareOfferRepository.requestShares({ round_code: 'SHO-2026-001', shares: 50, installments: 12, note: '', name: 'Rana', phone: '01711000000', email: '' })).rejects.toThrow(/1 to 20/);
  });
});
