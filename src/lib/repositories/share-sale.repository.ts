'use client';

import { db } from '../db/database';
import type {
  Customer,
  Project,
  ShareFrequency,
  ShareInstallment,
  ShareOffering,
  SharePayment,
  SharePaymentMethod,
  ShareSale,
} from '../db/types';
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

export interface PaymentInput {
  sale_id: string;
  paid_on: string;
  amount: number;
  method: SharePaymentMethod;
  reference?: string | null;
  notes?: string | null;
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
  async signAgreement(id: string, input: { agreement_date: string; first_due_date?: string | null }, userId: string | null): Promise<ShareSale> {
    const sale = await db.share_sales.get(id);
    if (!sale || sale.status !== 'reserved') throw new Error('Only a reservation can be signed.');
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
        updated_at: ts,
      });
    });
    return (await db.share_sales.get(id))!;
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
