'use client';

import { addDays } from '../domain/share-sale';
import { shareOfferingRepository, shareSaleRepository } from '../repositories';
import type { SharePaymentMethod } from './types';
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
 */

const CRORE = 10_000_000;

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
}

const BUYERS: DemoBuyer[] = [
  { name: 'Farhana Rahman', phone: '01711223344', email: 'farhana.rahman@example.com', shares: 5, down_pct: 20, installments: 20, reserved_ago: 140, signed_ago: 138, paid_through: 3, method: 'bank_transfer' },
  { name: 'Tanvir Hossain', phone: '01819001122', email: 'tanvir.h@example.com', shares: 10, down_pct: 30, installments: 12, reserved_ago: 124, signed_ago: 120, paid_through: 3, method: 'cheque' },
  { name: 'Nusrat Jahan', phone: '01915224466', email: 'nusrat.jahan@example.com', shares: 3, down_pct: 100, installments: 0, reserved_ago: 104, signed_ago: 100, paid_through: 0, method: 'bank_transfer', certificate: true },
  { name: 'Rezaul Karim', phone: '01552778899', email: 'rezaul.karim@example.com', shares: 6, down_pct: 20, installments: 15, reserved_ago: 133, signed_ago: 130, paid_through: 1, method: 'bkash' },
  { name: 'Kamrul Islam', phone: '01678334455', email: 'kamrul.islam@example.com', shares: 4, down_pct: 25, installments: 16, reserved_ago: 3, signed_ago: null, paid_through: -1, method: 'bank_transfer' },
  { name: 'Shahana Akter', phone: '01399887766', email: 'shahana.akter@example.com', shares: 2, down_pct: 20, installments: 20, reserved_ago: 12, signed_ago: null, paid_through: -1, method: 'bank_transfer' },
];

export async function seedDemoShareSale(projectIds: Map<string, string>, createdBy: string | null): Promise<void> {
  const today = todayLocal();
  const ago = (days: number) => addDays(today, -days);
  const tongi = projectIds.get('Nokshi Tongi Logistics Park');
  const uttara = projectIds.get('Nokshi Uttara Heights');
  if (!tongi) return;

  const round1 = await shareOfferingRepository.save(
    {
      project_id: tongi,
      net_asset_value: 90 * CRORE,
      premium_value: 30 * CRORE,
      valuation_date: ago(160),
      offered_pct: 40,
      total_shares: 400,
      validity_days: 180,
      min_shares: 1,
      max_shares: 20,
      min_down_payment_pct: 20,
      max_installments: 20,
      installment_frequency: 'monthly',
      late_fee_pct: 2,
      grace_days: 7,
      hold_days: 7,
      notes: 'First offering. Warehouses let to two logistics tenants from handover.',
    },
    createdBy,
  );
  await shareOfferingRepository.open(round1.id, ago(150));

  for (const b of BUYERS) {
    const sale = await shareSaleRepository.reserve(
      {
        offering_id: round1.id,
        new_customer: { name: b.name, phone: b.phone, email: b.email },
        shares: b.shares,
        down_payment_pct: b.down_pct,
        installment_count: b.installments,
        reserved_on: ago(b.reserved_ago),
      },
      createdBy,
    );
    if (b.signed_ago === null) continue;
    await shareSaleRepository.signAgreement(sale.id, { agreement_date: ago(b.signed_ago), first_due_date: addDays(ago(b.signed_ago), 30) }, createdBy);
    const view = await shareSaleRepository.view(sale.id);
    for (const i of view!.schedule.filter((x) => x.seq <= b.paid_through && x.due_date <= today)) {
      await shareSaleRepository.recordPayment(
        { sale_id: sale.id, paid_on: i.due_date, amount: i.amount, method: i.seq === 0 ? 'bank_transfer' : b.method, reference: `DEMO-${sale.code}-${i.seq}` },
        createdBy,
      );
    }
    if (b.certificate) await shareSaleRepository.issueCertificate(sale.id, ago(b.signed_ago - 5));
  }

  if (uttara) {
    await shareOfferingRepository.save(
      {
        project_id: uttara,
        net_asset_value: 60 * CRORE,
        premium_value: 15 * CRORE,
        valuation_date: ago(5),
        offered_pct: 25,
        total_shares: 250,
        validity_days: 90,
        min_shares: 1,
        max_shares: 15,
        min_down_payment_pct: 25,
        max_installments: 8,
        installment_frequency: 'quarterly',
        late_fee_pct: 2,
        grace_days: 10,
        hold_days: 7,
        notes: 'Draft for the board meeting — premium still under discussion.',
      },
      createdBy,
    );
  }
}
