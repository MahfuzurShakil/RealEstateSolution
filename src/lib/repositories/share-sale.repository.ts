'use client';

import { db } from '../db/database';
import type {
  Customer,
  CustomerUpload,
  Project,
  ShareFrequency,
  ShareInstallment,
  ShareOffering,
  SharePayment,
  SharePaymentMethod,
  ShareRequest,
  ShareSale,
  ShareSignDraft,
  ShareSigningRecord,
} from '../db/types';
import { SHARE_DOC_META, missingToSign, shareDocChecklist, shareDocScope } from '../domain/share-documents';
import {
  SALE_HOLDS_SHARES,
  addDays,
  allocateSharePayment,
  buildSchedule,
  closesOn,
  maxSharePayable,
  offeringAvailability,
  offeringMath,
  offeringState,
  viewSale,
  type OfferingAvailability,
  type SaleView,
} from '../domain/share-sale';
import { addMonths } from '../domain/booking';
import { newId, nextCode, nowIso } from '../utils/id';
import { formatBdt, todayLocal } from '../utils/format';
import { BaseRepository } from './base.repository';
import { customerRepository } from './booking.repository';
import { normalizePhone } from './lead.repository';

/*
 * Share Sale (PROJECT-SHARE-SALE-PLAN.md, Phase 1).
 *
 * Offerings: the owner values the project (NAV + premium), puts a % of it on
 * the market split into N shares, for a number of days, with the longest
 * installment plan allowed. Sales: a customer (type Investor) reserves
 * shares, signs the agreement — which writes the schedule — and pays,
 * recorded here. Nothing on this side reaches the public site except
 * through a public repository that whitelists fields.
 */

export interface OfferingInput {
  project_id: string;
  net_asset_value: number;
  premium_value: number;
  valuation_date: string;
  offered_pct: number;
  total_shares: number;
  validity_days: number;
  min_shares: number;
  max_shares: number;
  min_down_payment_pct: number;
  max_installments: number;
  installment_frequency: ShareFrequency;
  late_fee_pct: number;
  grace_days: number;
  hold_days: number;
  notes?: string | null;
}

/** % of the project already promised to the market by the project's other offerings. */
async function pctTaken(projectId: string, exceptId?: string): Promise<number> {
  const offerings = (await db.share_offerings.where('project_id').equals(projectId).toArray()).filter((o) => o.id !== exceptId);
  const sales = await db.share_sales.where('project_id').equals(projectId).toArray();
  return offerings.reduce((t, o) => {
    if (o.status === 'cancelled') return t;
    // a closed offering keeps only what it actually sold or still holds
    if (o.status === 'closed') {
      const a = offeringAvailability(o, sales);
      return t + (a.sold + a.reserved) * o.share_pct;
    }
    return t + o.offered_pct;
  }, 0);
}

function checkOffering(i: OfferingInput) {
  const whole = (n: number) => Number.isInteger(Number(n));
  if (!i.project_id) throw new Error('Pick the project whose shares are offered.');
  if (!(i.net_asset_value > 0)) throw new Error('Enter the net asset value — what the project’s assets are worth less what it owes.');
  if (!(i.premium_value >= 0)) throw new Error('The premium cannot be negative.');
  if (!(i.offered_pct > 0 && i.offered_pct <= 100)) throw new Error('The share offered to the market must be above 0% and at most 100%.');
  if (!(whole(i.total_shares) && i.total_shares >= 1)) throw new Error('Enter how many shares the offered % is split into (a whole number).');
  if (!(whole(i.validity_days) && i.validity_days >= 1 && i.validity_days <= 365)) throw new Error('The offer has to stay open between 1 and 365 days.');
  if (!(whole(i.min_shares) && i.min_shares >= 1)) throw new Error('The minimum per customer is at least 1 share.');
  if (!(whole(i.max_shares) && i.max_shares >= i.min_shares)) throw new Error('The maximum per customer cannot be below the minimum.');
  if (i.max_shares > i.total_shares) throw new Error('The maximum per customer cannot be more than the shares on offer.');
  if (!(i.min_down_payment_pct >= 0 && i.min_down_payment_pct <= 100)) throw new Error('The down payment must be between 0 and 100%.');
  if (!(whole(i.max_installments) && i.max_installments >= 0 && i.max_installments <= 120)) throw new Error('Installments must be a whole number from 0 to 120.');
  if (!(i.late_fee_pct >= 0 && i.late_fee_pct <= 25)) throw new Error('The late fee must be between 0 and 25%.');
  if (!(whole(i.grace_days) && i.grace_days >= 0)) throw new Error('Grace days cannot be negative.');
  if (!(whole(i.hold_days) && i.hold_days >= 1 && i.hold_days <= 60)) throw new Error('Reserved shares are held between 1 and 60 days.');
  if (offeringMath(i).price_per_share < 1) throw new Error('The price per share works out below ৳1 — offer fewer shares or check the valuation.');
}

class ShareOfferingRepository extends BaseRepository<ShareOffering> {
  constructor() {
    super(() => db.share_offerings);
  }

  async list(): Promise<ShareOffering[]> {
    return (await db.share_offerings.toArray()).sort((a, b) => b.code.localeCompare(a.code));
  }

  /** The % of the project still free to offer, leaving out `exceptId` (the offering being edited). */
  async freePct(projectId: string, exceptId?: string): Promise<number> {
    return Math.max(0, 100 - (await pctTaken(projectId, exceptId)));
  }

  /** Creates a draft, or changes one. Only drafts change: an open offering's price is what buyers were shown. */
  async save(input: OfferingInput & { id?: string }, userId: string | null): Promise<ShareOffering> {
    const i = { ...input, notes: input.notes?.trim() || null };
    checkOffering(i);
    if (!(await db.projects.get(i.project_id))) throw new Error('That project no longer exists.');
    const free = await this.freePct(i.project_id, input.id);
    if (i.offered_pct > free + 1e-9) {
      throw new Error(`Only ${Number(free.toFixed(4))}% of this project is still free to offer — the rest is in its other offerings.`);
    }
    const m = offeringMath(i);
    const derived = { valuation: m.valuation, share_pct: m.share_pct, price_per_share: m.price_per_share };
    if (input.id) {
      const current = await db.share_offerings.get(input.id);
      if (!current) throw new Error('This offering no longer exists.');
      if (current.status !== 'draft') throw new Error('Only a draft can be changed. Close this offering and open a new one instead.');
      const { id, ...rest } = i as typeof i & { id: string };
      void id;
      return (await this.update(input.id, { ...rest, ...derived }))!;
    }
    const all = await db.share_offerings.toArray();
    const round = all.filter((o) => o.project_id === i.project_id).reduce((n, o) => Math.max(n, o.round_no), 0) + 1;
    return this.create(
      {
        ...i,
        ...derived,
        code: nextCode('SHO', all.map((o) => o.code)),
        round_no: round,
        opens_on: null,
        closes_on: null,
        status: 'draft',
      },
      userId,
    );
  }

  /** Puts a draft on the market from `opensOn` for its validity days. */
  async open(id: string, opensOn: string = todayLocal()): Promise<ShareOffering> {
    const o = await db.share_offerings.get(id);
    if (!o) throw new Error('This offering no longer exists.');
    if (o.status !== 'draft') throw new Error('Only a draft can be opened.');
    const free = await this.freePct(o.project_id, id);
    if (o.offered_pct > free + 1e-9) throw new Error(`Only ${Number(free.toFixed(4))}% of this project is still free to offer.`);
    return (await this.update(id, { status: 'open', opens_on: opensOn, closes_on: closesOn(opensOn, o.validity_days) }))!;
  }

  /** Lets an open offering run longer (the owner's call when the validity ends with shares left). */
  async extend(id: string, extraDays: number): Promise<ShareOffering> {
    const o = await db.share_offerings.get(id);
    if (!o || o.status !== 'open' || !o.closes_on) throw new Error('Only an open offering can be extended.');
    if (!(Number.isInteger(extraDays) && extraDays >= 1 && extraDays <= 365)) throw new Error('Extend by 1 to 365 days.');
    const base = o.closes_on < todayLocal() ? todayLocal() : o.closes_on;
    const closes = addDays(base, extraDays);
    return (await this.update(id, { closes_on: closes, validity_days: o.validity_days + Math.max(0, Math.round((Date.parse(closes) - Date.parse(o.closes_on)) / 86_400_000)) }))!;
  }

  /** Stops selling. Reserved shares stay reserved until they are signed or released. */
  async close(id: string): Promise<ShareOffering> {
    const o = await db.share_offerings.get(id);
    if (!o || o.status !== 'open') throw new Error('Only an open offering can be closed.');
    return (await this.update(id, { status: 'closed' }))!;
  }

  /** Withdraws an offering nobody has bought into. */
  async cancel(id: string): Promise<ShareOffering> {
    const o = await db.share_offerings.get(id);
    if (!o || o.status === 'cancelled' || o.status === 'closed') throw new Error('This offering cannot be cancelled.');
    const held = (await db.share_sales.where('offering_id').equals(id).toArray()).filter((s) => SALE_HOLDS_SHARES[s.status]);
    if (held.length) throw new Error(`${held.length} customer purchase${held.length > 1 ? 's hold' : ' holds'} shares in this offering. Close it instead.`);
    return (await this.update(id, { status: 'cancelled' }))!;
  }

  async removeDraft(id: string): Promise<void> {
    const o = await db.share_offerings.get(id);
    if (!o || o.status !== 'draft') throw new Error('Only a draft can be deleted.');
    await this.remove(id);
  }
}

export const shareOfferingRepository = new ShareOfferingRepository();

export interface ReserveInput {
  offering_id: string;
  /** an existing customer, or the details of a new one (type Investor) */
  customer_id?: string | null;
  new_customer?: { name: string; phone: string; email?: string | null; nid?: string | null; address?: string | null } | null;
  shares: number;
  down_payment_pct: number;
  installment_count: number;
  reserved_on?: string;
  notes?: string | null;
}

export interface SignInput {
  agreement_date: string;
  first_due_date?: string | null;
  signing: ShareSigningRecord;
  /** KYC as written on the agreement; saved on the customer */
  customer?: Partial<Pick<Customer, KycField>>;
  /** the down payment was handed over at the signing */
  down_payment?: { method: SharePaymentMethod; reference?: string | null } | null;
  /** the plan as agreed at the table, when it differs from the reservation */
  terms?: PlanChange | null;
}

export interface PlanChange {
  shares: number;
  down_payment_pct: number;
  installment_count: number;
}

/**
 * Checks a plan against the offering's limits and what is still free, counting
 * this purchase's own shares as free (they are being re-agreed, not added).
 */
async function checkPlan(sale: ShareSale, t: PlanChange): Promise<Pick<ShareSale, 'shares' | 'share_pct' | 'total_price' | 'down_payment' | 'installment_count'>> {
  const o = await db.share_offerings.get(sale.offering_id);
  if (!o) throw new Error('The offering behind this purchase no longer exists.');
  const shares = Math.floor(Number(t.shares) || 0);
  const pct = Number(t.down_payment_pct);
  const n = Math.floor(Number(t.installment_count));
  if (shares < o.min_shares || shares > o.max_shares) throw new Error(`A customer may take ${o.min_shares} to ${o.max_shares} shares in this offering.`);
  if (!(pct >= o.min_down_payment_pct && pct <= 100)) throw new Error(`The down payment must be at least ${o.min_down_payment_pct}%.`);
  if (!(n >= 0 && n <= o.max_installments)) throw new Error(`This offering allows up to ${o.max_installments} installments.`);
  if (n === 0 && pct < 100) throw new Error('With no installments the whole price is paid at signing \u2014 set the down payment to 100%.');
  if (n > 0 && pct >= 100) throw new Error('A 100% down payment leaves nothing for installments \u2014 choose 0 installments.');
  const sales = (await db.share_sales.where('offering_id').equals(o.id).toArray()).filter((x) => x.id !== sale.id);
  const free = offeringAvailability(o, sales).available;
  if (shares > free) throw new Error(`Only ${free} share${free === 1 ? '' : 's'} can go to this purchase.`);
  const held = sales.filter((x) => x.customer_id === sale.customer_id && SALE_HOLDS_SHARES[x.status]).reduce((a, x) => a + x.shares, 0);
  if (held + shares > o.max_shares) throw new Error(`The customer already holds ${held} share${held === 1 ? '' : 's'} here; the most one customer may take is ${o.max_shares}.`);
  const total = shares * sale.price_per_share;
  return { shares, share_pct: shares * o.share_pct, total_price: total, down_payment: Math.round((total * pct) / 100), installment_count: n };
}

const KYC_FIELDS = [
  'email', 'nid', 'tin', 'date_of_birth', 'profession', 'address', 'permanent_address', 'father_or_spouse_name',
  'nominee_name', 'nominee_relation', 'nominee_phone', 'nominee_nid', 'bank_name', 'bank_branch', 'bank_account', 'kyc_verified_on',
] as const;
export type KycField = (typeof KYC_FIELDS)[number];

function cleanKyc(c: Partial<Pick<Customer, KycField>>): Partial<Pick<Customer, KycField>> {
  return Object.fromEntries(KYC_FIELDS.map((k) => [k, typeof c[k] === 'string' ? (c[k] as string).trim() || null : (c[k] ?? null)]));
}

function cleanSigning(s: ShareSigningRecord): ShareSigningRecord {
  const t = (v: string | null | undefined) => v?.trim() || null;
  const witnesses = s.witnesses.map((w) => ({ name: w.name.trim(), id_or_phone: t(w.id_or_phone), address: t(w.address) })).filter((w) => w.name);
  if (!s.place?.trim()) throw new Error('Enter where the agreement was signed.');
  if (!s.company_signatory?.trim()) throw new Error('Enter who signed for the company.');
  if (witnesses.length < 2) throw new Error('An agreement is witnessed by two people — enter both witnesses.');
  const stamp = s.stamp_value != null && String(s.stamp_value) !== '' ? Number(s.stamp_value) : null;
  if (stamp != null && !(stamp >= 0)) throw new Error('The stamp paper value cannot be negative.');
  return {
    place: s.place.trim(),
    company_signatory: s.company_signatory.trim(),
    company_signatory_title: t(s.company_signatory_title),
    witnesses,
    stamp_value: stamp,
    stamp_serial: t(s.stamp_serial),
    notarized_on: t(s.notarized_on),
    notary_name: t(s.notary_name),
    attorney_name: t(s.attorney_name),
  };
}

export interface PaymentInput {
  sale_id: string;
  paid_on: string;
  amount: number;
  method: SharePaymentMethod;
  reference?: string | null;
  notes?: string | null;
  /** set by the Customer Portal's gateway; the office's own entries leave it out */
  channel?: 'office' | 'online';
  method_detail?: string | null;
}

async function ruleFor(sale: ShareSale) {
  const o = await db.share_offerings.get(sale.offering_id);
  return { late_fee_pct: o?.late_fee_pct ?? 0, grace_days: o?.grace_days ?? 0 };
}

class ShareSaleRepository extends BaseRepository<ShareSale> {
  constructor() {
    super(() => db.share_sales);
  }

  /** Holds shares for a customer while the agreement is prepared (plan §4, step 3). */
  async reserve(input: ReserveInput, userId: string | null): Promise<ShareSale> {
    const today = todayLocal();
    const o = await db.share_offerings.get(input.offering_id);
    if (!o) throw new Error('This offering no longer exists.');
    if (offeringState(o, today) !== 'open') throw new Error('Shares can only be reserved while the offering is open.');
    const shares = Math.floor(Number(input.shares) || 0);
    if (shares < o.min_shares || shares > o.max_shares) throw new Error(`A customer may take ${o.min_shares} to ${o.max_shares} shares in this offering.`);
    const pct = Number(input.down_payment_pct);
    if (!(pct >= o.min_down_payment_pct && pct <= 100)) throw new Error(`The down payment must be at least ${o.min_down_payment_pct}%.`);
    const n = Math.floor(Number(input.installment_count));
    if (!(n >= 0 && n <= o.max_installments)) throw new Error(`This offering allows up to ${o.max_installments} installments.`);
    if (n === 0 && pct < 100) throw new Error('With no installments the whole price is paid at signing — set the down payment to 100%.');
    if (n > 0 && pct >= 100) throw new Error('A 100% down payment leaves nothing for installments — choose 0 installments.');

    const sales = await db.share_sales.where('offering_id').equals(o.id).toArray();
    const avail = offeringAvailability(o, sales);
    if (shares > avail.available) throw new Error(`Only ${avail.available} share${avail.available === 1 ? '' : 's'} left in this offering.`);

    let customer: Customer | undefined;
    if (input.customer_id) {
      customer = await db.customers.get(input.customer_id);
      if (!customer) throw new Error('That customer no longer exists.');
    } else if (input.new_customer) {
      const c = input.new_customer;
      if (!c.name.trim()) throw new Error('Enter the customer’s name.');
      if (!c.phone.trim()) throw new Error('Enter the customer’s phone number.');
      const existing = await customerRepository.findByPhone(c.phone);
      if (existing) throw new Error(`${normalizePhone(c.phone)} is already ${existing.name} (${existing.code}). Pick them from the list instead.`);
      customer = await customerRepository.create(
        { code: '', name: c.name.trim(), phone: c.phone, email: c.email || null, nid: c.nid || null, address: c.address || null, customer_type: 'investor' },
        userId,
      );
    } else throw new Error('Pick the customer, or add a new one.');

    const already = sales.filter((s) => s.customer_id === customer!.id && SALE_HOLDS_SHARES[s.status]).reduce((t, s) => t + s.shares, 0);
    if (already + shares > o.max_shares) {
      throw new Error(`${customer.name} already holds ${already} share${already === 1 ? '' : 's'} here; the most one customer may take is ${o.max_shares}.`);
    }
    if (!customer.customer_type) await db.customers.update(customer.id, { customer_type: 'investor', updated_at: nowIso() });

    const total = shares * o.price_per_share;
    const reservedOn = input.reserved_on ?? today;
    return this.create(
      {
        code: nextCode('SHR', (await db.share_sales.toArray()).map((s) => s.code)),
        offering_id: o.id,
        project_id: o.project_id,
        customer_id: customer.id,
        shares,
        share_pct: shares * o.share_pct,
        price_per_share: o.price_per_share,
        total_price: total,
        down_payment: Math.round((total * pct) / 100),
        installment_count: n,
        installment_frequency: o.installment_frequency,
        reserved_on: reservedOn,
        hold_until: addDays(reservedOn, o.hold_days),
        status: 'reserved',
        notes: input.notes?.trim() || null,
      },
      userId,
    );
  }

  /**
   * The agreement is signed: the shares are sold and the schedule is written
   * — down payment on the signing day, installments from `first_due_date`.
   */
  async signAgreement(id: string, input: SignInput, userId: string | null): Promise<ShareSale> {
    const sale = await db.share_sales.get(id);
    if (!sale || sale.status !== 'reserved') throw new Error('Only a reservation can be signed.');
    if (!input.agreement_date) throw new Error('Enter the day the agreement was signed.');
    if (input.agreement_date > todayLocal()) throw new Error('The signing day cannot be in the future.');
    const signing = cleanSigning(input.signing);
    const customer = await db.customers.get(sale.customer_id);
    if (!customer) throw new Error('The customer on this reservation no longer exists.');
    const kyc = cleanKyc({ ...customer, ...input.customer });
    if (!kyc.nid) throw new Error('Enter the customer’s NID or passport number — it is written on the agreement.');
    if (!kyc.father_or_spouse_name) throw new Error('Enter the customer’s father’s or spouse’s name, as the agreement names them.');
    if (!kyc.address) throw new Error('Enter the customer’s present address.');
    const missing = missingToSign(
      shareDocChecklist(await db.customer_uploads.where('customer_id').equals(customer.id).toArray(), id, {
        has_nominee: !!kyc.nominee_name,
        by_attorney: !!signing.attorney_name,
      }),
    );
    if (missing.length) throw new Error(`Put these on file before signing: ${missing.map((m) => m.meta.label).join(', ')}.`);
    if (input.terms) Object.assign(sale, await checkPlan(sale, input.terms));
    const first = sale.installment_count > 0 ? input.first_due_date || addMonths(input.agreement_date, sale.installment_frequency === 'monthly' ? 1 : 3) : input.agreement_date;
    if (sale.installment_count > 0 && first <= input.agreement_date) throw new Error('The first installment has to fall after the signing day.');
    const rows = buildSchedule({ ...sale, agreement_date: input.agreement_date, first_due_date: first });
    const ts = nowIso();
    const codes = (await db.share_sales.toArray()).map((s) => s.agreement_no ?? '').filter(Boolean);
    await db.transaction('rw', db.share_sales, db.share_installments, async () => {
      await db.share_installments.where('sale_id').equals(id).delete();
      await db.share_installments.bulkAdd(rows.map((r) => ({ ...r, id: newId(), sale_id: id, created_at: ts, updated_at: ts, created_by: userId })));
      await db.share_sales.update(id, {
        status: 'agreement_signed',
        agreement_no: nextCode('AGR', codes),
        agreement_date: input.agreement_date,
        first_due_date: first,
        signing,
        sign_draft: null,
        shares: sale.shares,
        share_pct: sale.share_pct,
        total_price: sale.total_price,
        down_payment: sale.down_payment,
        installment_count: sale.installment_count,
        updated_at: ts,
      });
    });
    await db.customers.update(customer.id, { ...kyc, customer_type: 'investor', updated_at: ts });
    if (input.down_payment && sale.down_payment > 0) {
      await this.recordPayment(
        { sale_id: id, paid_on: input.agreement_date, amount: sale.down_payment, method: input.down_payment.method, reference: input.down_payment.reference, notes: 'Down payment received at signing' },
        userId,
      );
    }
    return (await db.share_sales.get(id))!;
  }

  /** Keeps the signing as far as it got, so the office can leave at any step and come back. */
  async saveSignDraft(id: string, draft: ShareSignDraft): Promise<void> {
    const sale = await db.share_sales.get(id);
    if (!sale || sale.status !== 'reserved') throw new Error('Only a reservation is being signed.');
    await db.share_sales.update(id, { sign_draft: { ...draft, saved_at: nowIso() }, updated_at: nowIso() });
  }

  /** Throws the saved signing away and starts again from the reservation. */
  async discardSignDraft(id: string): Promise<void> {
    await db.share_sales.update(id, { sign_draft: null, updated_at: nowIso() });
  }

  /** Corrects the signing record after the fact (a witness's address, the notary date). */
  async updateSigning(id: string, signing: ShareSigningRecord): Promise<ShareSale> {
    const sale = await db.share_sales.get(id);
    if (!sale || !sale.agreement_no) throw new Error('Only a signed agreement has a signing record.');
    return (await this.update(id, { signing: cleanSigning(signing) }))!;
  }

  /** Gives reserved shares back to the offering (hold ran out, customer stepped back). */
  async release(id: string, note: string): Promise<ShareSale> {
    const sale = await db.share_sales.get(id);
    if (!sale || sale.status !== 'reserved') throw new Error('Only a reservation can be released.');
    return (await this.update(id, { status: 'released', status_note: note.trim() || null }))!;
  }

  /** Ends a signed purchase as the agreement allows; its shares go back to the offering. */
  async cancelSale(id: string, note: string): Promise<ShareSale> {
    const sale = await db.share_sales.get(id);
    if (!sale || sale.status !== 'agreement_signed') throw new Error('Only a signed purchase that is still being paid can be cancelled.');
    if (!note.trim()) throw new Error('Say why the purchase is cancelled.');
    return (await this.update(id, { status: 'cancelled', status_note: note.trim() }))!;
  }

  async view(id: string, today = todayLocal()): Promise<SaleView | null> {
    const sale = await db.share_sales.get(id);
    if (!sale) return null;
    const [inst, pays] = await Promise.all([
      db.share_installments.where('sale_id').equals(id).toArray(),
      db.share_payments.where('sale_id').equals(id).toArray(),
    ]);
    return viewSale(sale, inst, pays, today, await ruleFor(sale));
  }

  /**
   * Records money received — at the office, by bank or online — and applies
   * it as the plan says: late fees first, then the oldest installment.
   * Late fees are worked out as of the day it was paid.
   */
  async recordPayment(input: PaymentInput, userId: string | null): Promise<SharePayment> {
    const sale = await db.share_sales.get(input.sale_id);
    if (!sale || sale.status !== 'agreement_signed') throw new Error('Payments are recorded against a signed purchase that is still being paid.');
    if (!input.paid_on) throw new Error('Enter the day the money was received.');
    if (input.paid_on > todayLocal()) throw new Error('The payment date cannot be in the future.');
    if (sale.agreement_date && input.paid_on < sale.agreement_date) throw new Error('The payment date cannot be before the agreement was signed.');
    const view = (await this.view(sale.id, input.paid_on))!;
    const amount = Math.round(Number(input.amount) || 0);
    const max = maxSharePayable(view);
    if (!(amount > 0)) throw new Error('Enter an amount above 0.');
    if (amount > max) throw new Error(`That is more than is owed on this purchase (${formatBdt(max)}).`);
    const allocations = allocateSharePayment(view, amount);
    const principal = allocations.reduce((t, a) => t + a.principal, 0);
    const lateFee = allocations.reduce((t, a) => t + a.late_fee, 0);
    const payment = await sharePaymentRepository.create(
      {
        code: nextCode('SRC', (await db.share_payments.toArray()).map((p) => p.code)),
        sale_id: sale.id,
        paid_on: input.paid_on,
        amount: principal + lateFee,
        principal,
        late_fee: lateFee,
        method: input.method,
        reference: input.reference?.trim() || null,
        allocations,
        notes: input.notes?.trim() || null,
        channel: input.channel ?? 'office',
        method_detail: input.method_detail ?? null,
      },
      userId,
    );
    const after = (await this.view(sale.id))!;
    if (after.schedule.every((r) => r.status === 'paid')) await this.update(sale.id, { status: 'fully_paid' });
    return payment;
  }

  /** Undoes the latest payment on a purchase (a wrong entry); earlier ones stay. */
  async undoLatestPayment(saleId: string): Promise<void> {
    const sale = await db.share_sales.get(saleId);
    if (!sale || (sale.status !== 'agreement_signed' && sale.status !== 'fully_paid') || sale.certificate_no) {
      throw new Error('Payments can be undone only while the purchase is being paid and before the certificate.');
    }
    const latest = (await db.share_payments.where('sale_id').equals(saleId).toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!latest) throw new Error('There is no payment to undo.');
    await db.share_payments.delete(latest.id);
    if (sale.status === 'fully_paid') await this.update(saleId, { status: 'agreement_signed' });
  }

  /** Ownership confirmed: every installment is paid, the certificate is issued. */
  async issueCertificate(id: string, date: string = todayLocal()): Promise<ShareSale> {
    const sale = await db.share_sales.get(id);
    if (!sale || sale.status !== 'fully_paid') throw new Error('A certificate is issued once the whole price is paid.');
    if (sale.certificate_no) return sale;
    const codes = (await db.share_sales.toArray()).map((s) => s.certificate_no ?? '').filter(Boolean);
    return (await this.update(id, { certificate_no: nextCode('CRT', codes), certificate_date: date }))!;
  }
}

export const shareSaleRepository = new ShareSaleRepository();

class SharePaymentRepository extends BaseRepository<SharePayment> {
  constructor() {
    super(() => db.share_payments);
  }
}

export const sharePaymentRepository = new SharePaymentRepository();

class ShareInstallmentRepository extends BaseRepository<ShareInstallment> {
  constructor() {
    super(() => db.share_installments);
  }
}

export const shareInstallmentRepository = new ShareInstallmentRepository();

/* ----------------------------------------------------------------- reads */

export interface OfferingRow {
  offering: ShareOffering;
  project: Project | undefined;
  state: ReturnType<typeof offeringState>;
  availability: OfferingAvailability;
  /** contracted: sold shares × price */
  sold_value: number;
  collected: number;
}

export interface SaleRow extends SaleView {
  offering: ShareOffering | undefined;
  project: Project | undefined;
  customer: Customer | undefined;
}

export interface ShareSaleOverview {
  offerings: OfferingRow[];
  sales: SaleRow[];
  totals: {
    open_offerings: number;
    shares_sold: number;
    shares_reserved: number;
    sold_value: number;
    collected: number;
    outstanding: number;
    overdue: number;
    overdue_sales: number;
    customers: number;
  };
}

/** Everything the Share Sale screens list, worked out in one read. */
export async function shareSaleOverview(today = todayLocal()): Promise<ShareSaleOverview> {
  const [offerings, sales, inst, pays, projects, customers] = await Promise.all([
    db.share_offerings.toArray(),
    db.share_sales.toArray(),
    db.share_installments.toArray(),
    db.share_payments.toArray(),
    db.projects.toArray(),
    db.customers.toArray(),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const saleRows: SaleRow[] = sales
    .map((s) => {
      const o = offeringById.get(s.offering_id);
      return {
        ...viewSale(s, inst, pays, today, { late_fee_pct: o?.late_fee_pct ?? 0, grace_days: o?.grace_days ?? 0 }),
        offering: o,
        project: projectById.get(s.project_id),
        customer: customerById.get(s.customer_id),
      };
    })
    .sort((a, b) => b.sale.code.localeCompare(a.sale.code));
  const offeringRows: OfferingRow[] = offerings
    .map((o) => {
      const mine = saleRows.filter((r) => r.sale.offering_id === o.id);
      const availability = offeringAvailability(o, sales);
      return {
        offering: o,
        project: projectById.get(o.project_id),
        state: offeringState(o, today),
        availability,
        sold_value: availability.sold * o.price_per_share,
        collected: mine.reduce((t, r) => t + r.paid, 0),
      };
    })
    .sort((a, b) => b.offering.code.localeCompare(a.offering.code));
  const live = saleRows.filter((r) => r.sale.status === 'agreement_signed' || r.sale.status === 'fully_paid');
  return {
    offerings: offeringRows,
    sales: saleRows,
    totals: {
      open_offerings: offeringRows.filter((r) => r.state === 'open').length,
      shares_sold: offeringRows.reduce((t, r) => t + r.availability.sold, 0),
      shares_reserved: offeringRows.reduce((t, r) => t + r.availability.reserved, 0),
      sold_value: offeringRows.reduce((t, r) => t + r.sold_value, 0),
      collected: live.reduce((t, r) => t + r.paid, 0),
      outstanding: live.reduce((t, r) => t + r.outstanding, 0),
      overdue: live.reduce((t, r) => t + r.due_now, 0),
      overdue_sales: live.filter((r) => r.health === 'overdue').length,
      customers: new Set(live.map((r) => r.sale.customer_id)).size,
    },
  };
}

/** Each offering's slice of a project, and what the owner keeps (plan §5). */
export interface OwnershipRow {
  offering: ShareOffering;
  sold_pct: number;
  reserved_pct: number;
  unsold_pct: number;
  raised: number;
}

export async function projectOwnership(projectId: string): Promise<{ rows: OwnershipRow[]; customers_pct: number; owner_pct: number }> {
  const offerings = (await db.share_offerings.where('project_id').equals(projectId).toArray())
    .filter((o) => o.status !== 'draft' && o.status !== 'cancelled')
    .sort((a, b) => a.round_no - b.round_no);
  const sales = await db.share_sales.where('project_id').equals(projectId).toArray();
  const rows = offerings.map((o) => {
    const a = offeringAvailability(o, sales);
    return {
      offering: o,
      sold_pct: a.sold * o.share_pct,
      reserved_pct: a.reserved * o.share_pct,
      unsold_pct: a.available * o.share_pct,
      raised: a.sold * o.price_per_share,
    };
  });
  const customers = rows.reduce((t, r) => t + r.sold_pct, 0);
  return { rows, customers_pct: customers, owner_pct: 100 - customers };
}

/* ------------------------------------------- from the Customer Portal */

export interface RequestRow {
  request: ShareRequest;
  offering: ShareOffering | undefined;
  project: Project | undefined;
  customer: Customer | undefined;
  sale: ShareSale | undefined;
}

export interface UploadRow {
  upload: CustomerUpload;
  sale: ShareSale | undefined;
  project: Project | undefined;
  customer: Customer | undefined;
}

/** What customers sent from the Customer Portal: purchase requests and documents, newest first. */
export async function customerPortalInbox(): Promise<{ requests: RequestRow[]; uploads: UploadRow[] }> {
  const [requests, uploads, offerings, sales, projects, customers] = await Promise.all([
    db.share_requests.toArray(),
    db.customer_uploads.toArray(),
    db.share_offerings.toArray(),
    db.share_sales.toArray(),
    db.projects.toArray(),
    db.customers.toArray(),
  ]);
  const by = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const o = by(offerings);
  const s = by(sales);
  const p = by(projects);
  const c = by(customers);
  return {
    requests: requests
      .map((r) => ({ request: r, offering: o.get(r.offering_id), project: p.get(r.project_id), customer: c.get(r.customer_id), sale: r.sale_id ? s.get(r.sale_id) : undefined }))
      .sort((a, b) => b.request.requested_at.localeCompare(a.request.requested_at)),
    // the office's own filings are not something it has to review
    uploads: uploads
      .filter((u) => u.source !== 'office')
      .map((u) => {
        const sale = u.sale_id ? s.get(u.sale_id) : undefined;
        return { upload: u, sale, project: sale ? p.get(sale.project_id) : undefined, customer: c.get(u.customer_id) };
      })
      .sort((a, b) => b.upload.uploaded_at.localeCompare(a.upload.uploaded_at)),
  };
}

class ShareRequestRepository extends BaseRepository<ShareRequest> {
  constructor() {
    super(() => db.share_requests);
  }

  private async live(id: string): Promise<ShareRequest> {
    const r = await db.share_requests.get(id);
    if (!r) throw new Error('This request no longer exists.');
    if (r.status !== 'new' && r.status !== 'contacted') throw new Error('This request has already been dealt with.');
    return r;
  }

  /** The office called the customer; the note is shown to them on the portal. */
  async markContacted(id: string, note: string): Promise<void> {
    await this.live(id);
    await this.update(id, { status: 'contacted', office_note: note.trim() || null });
  }

  /** Turns a request down; the reason is shown to the customer. */
  async decline(id: string, note: string): Promise<void> {
    await this.live(id);
    if (!note.trim()) throw new Error('Say why, so the customer knows.');
    await this.update(id, { status: 'declined', office_note: note.trim() });
  }

  /** Reserves the shares the customer asked for — the usual reservation, with the plan agreed on the call. */
  async reserve(id: string, plan: { shares: number; down_payment_pct: number; installment_count: number }, userId: string | null): Promise<ShareSale> {
    const r = await this.live(id);
    const sale = await shareSaleRepository.reserve(
      { offering_id: r.offering_id, customer_id: r.customer_id, ...plan, notes: `From Customer Portal request ${r.code}${r.note ? `: “${r.note}”` : ''}` },
      userId,
    );
    await this.update(id, { status: 'reserved', sale_id: sale.id, office_note: null });
    return sale;
  }
}

export const shareRequestRepository = new ShareRequestRepository();

class CustomerUploadRepository extends BaseRepository<CustomerUpload> {
  constructor() {
    super(() => db.customer_uploads);
  }

  /** Everything on the customer's file: their own papers and every purchase's. */
  async forCustomer(customerId: string): Promise<CustomerUpload[]> {
    return (await db.customer_uploads.where('customer_id').equals(customerId).toArray()).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  }

  /**
   * The office puts a paper on the customer's file — scanned at the signing,
   * or brought in later. It is accepted as it goes in, and the customer sees
   * it on the portal. Customer papers are kept without a purchase.
   */
  async officeUpload(
    input: { customer_id: string; sale_id: string | null; kind: CustomerUpload['kind']; title?: string | null; note?: string | null; file: Blob; file_name: string },
    userId: string | null,
  ): Promise<CustomerUpload> {
    if (input.file.size > 10 * 1024 * 1024) throw new Error('The file is larger than 10 MB.');
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(input.file_name)) throw new Error('Upload a PDF, JPG, PNG or WEBP file.');
    const scope = shareDocScope(input.kind);
    const saleId = scope === 'customer' ? null : input.sale_id;
    if (scope === 'purchase' && !saleId) throw new Error('Pick the purchase this paper belongs to.');
    const ts = nowIso();
    const row: CustomerUpload = {
      id: newId(),
      customer_id: input.customer_id,
      sale_id: saleId,
      source: 'office',
      kind: input.kind,
      title: input.title?.trim() || SHARE_DOC_META[input.kind].label,
      note: input.note?.trim() || null,
      file_name: input.file_name,
      file_type: input.file.type || 'application/octet-stream',
      file_size: input.file.size,
      uploaded_at: ts,
      status: 'accepted',
      reviewed_on: todayLocal(),
      review_note: null,
      created_at: ts,
      updated_at: ts,
      created_by: userId,
    };
    await db.transaction('rw', db.customer_uploads, db.customer_upload_files, async () => {
      await db.customer_uploads.add(row);
      await db.customer_upload_files.add({ id: row.id, blob: input.file });
    });
    return row;
  }

  /** Takes a paper the office filed off the record (the wrong file went in). */
  async removeOfficeUpload(id: string): Promise<void> {
    const u = await db.customer_uploads.get(id);
    if (!u || u.source !== 'office') throw new Error('Only a paper the office filed can be removed here.');
    await db.transaction('rw', db.customer_uploads, db.customer_upload_files, async () => {
      await db.customer_uploads.delete(id);
      await db.customer_upload_files.delete(id);
    });
  }

  async file(id: string): Promise<Blob | null> {
    return (await db.customer_upload_files.get(id))?.blob ?? null;
  }

  async accept(id: string): Promise<void> {
    await this.update(id, { status: 'accepted', reviewed_on: todayLocal(), review_note: null });
  }

  /** Turns a file down; the reason is shown to the customer, who can upload again. */
  async reject(id: string, note: string): Promise<void> {
    if (!note.trim()) throw new Error('Say what is wrong with the file, so the customer can send a better one.');
    await this.update(id, { status: 'rejected', reviewed_on: todayLocal(), review_note: note.trim() });
  }
}

export const customerUploadRepository = new CustomerUploadRepository();

/** A customer's share purchases and every paper on their investor file. */
export async function customerShareFile(customerId: string): Promise<{ sales: ShareSale[]; uploads: CustomerUpload[] }> {
  const [sales, uploads] = await Promise.all([
    db.share_sales.where('customer_id').equals(customerId).toArray(),
    customerUploadRepository.forCustomer(customerId),
  ]);
  return { sales: sales.sort((a, b) => a.code.localeCompare(b.code)), uploads };
}
