'use client';

import { db } from '../../db/database';
import type {
  Customer,
  DocumentRecord,
  Project,
  ShareInstallment,
  ShareOffering,
  SharePayment,
  SharePaymentMethod,
  ShareSale,
  ShareRequest as ShareRequestRow,
  CustomerUpload as CustomerUploadRow,
} from '../../db/types';
import {
  UPLOAD_MAX_MB,
  allocatePayment,
  maxPayable,
  viewHolding,
  type AmountOption,
  type CustomerDocument,
  type CustomerUpload,
  type Installment,
  type InvestorCustomer,
  type InvestorProject,
  type InvestorSnapshot,
  type PaymentAllocation,
  type PaymentMethod,
  type PaymentRecord,
  type ShareHolding,
  type ShareRequest,
  type ShareRound,
  type UploadKind,
} from '@/lib/domain/investor-portal';
import { PROJECT_TYPE_LABEL } from '@/lib/domain/project';
import { offeringAvailability, offeringState } from '@/lib/domain/share-sale';
import { newId, nextCode, nowIso } from '@/lib/utils/id';
import { todayLocal } from '@/lib/utils/format';
import { normalizePhone } from '../lead.repository';
import { shareSaleRepository } from '../share-sale.repository';
import { demoReference } from './gateway-reference';

/*
 * Customer Portal repository (PROJECT-SHARE-SALE-PLAN.md).
 *
 * The portal reads the admin Share Sale tables — offerings, purchases,
 * schedules, payments — and writes back only what a customer may do:
 * pay through the gateway, ask to buy shares, upload a document. Like the
 * website's public repositories it WHITELISTS: every object below is built
 * field by field, so the net asset value, the premium, the office's notes,
 * other customers and anything added to those tables later never reach the
 * portal (investor.repository.test.ts checks it).
 *
 * Kept in this browser only, as a real portal keeps them per device: the
 * sign-in session, which notifications were read, and open gateway checkouts.
 */

const SESSION_KEY = 'customer-portal.session.v2';
const PENDING_KEY = 'customer-portal.pending.v1';
const LOCAL_KEY = 'customer-portal.local.v1';
const SESSION_HOURS = 12;
/** how long the gateway keeps a checkout open, as real gateways do */
export const CHECKOUT_MINUTES = 15;
export const CUSTOMER_PORTAL_CHANGED = 'customer-portal:changed';
/** Demo build: no SMS goes out, every sign-in code is this. */
const DEMO_OTP = '123456';
/** shown on a project that has no picture yet */
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=70';

export type IntentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
export type GatewayOutcome = 'success' | 'declined' | 'insufficient_funds' | 'cancelled';

/**
 * One checkout, priced and allocated when the customer confirmed it. The
 * gateway only ever sees the amount and this ID — never the schedule.
 */
export interface PaymentIntent {
  id: string;
  holding_code: string;
  option: AmountOption;
  allocations: PaymentAllocation[];
  principal: number;
  late_fee: number;
  total: number;
  created_at: string;
  expires_at: string;
  status: IntentStatus;
  method: PaymentMethod | null;
  method_detail: string | null;
  reference: string | null;
  receipt_no: string | null;
  failure_reason: string | null;
  completed_at: string | null;
}

interface LocalState {
  intents: PaymentIntent[];
  /** notification ids read, per customer */
  read: Record<string, string[]>;
}

interface Session {
  customer_id: string;
  customer_code: string;
  signed_in_at: string;
  expires_at: string;
}

const FAILURE: Record<Exclude<GatewayOutcome, 'success'>, string> = {
  declined: 'Your bank or wallet declined the payment. No money has been taken from your account.',
  insufficient_funds: 'There was not enough balance in the account to complete the payment. No money has been taken.',
  cancelled: 'You cancelled the payment on the gateway. No money has been taken.',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: works for this page view */
  }
}

const loadLocal = () => readJson<LocalState>(LOCAL_KEY, { intents: [], read: {} });

function saveLocal(state: LocalState) {
  writeJson(LOCAL_KEY, state);
  changed();
}

function changed() {
  window.dispatchEvent(new Event(CUSTOMER_PORTAL_CHANGED));
}

/** a short pause so buttons show their busy state the way a real network call would */
const latency = (ms = 450) => new Promise((r) => setTimeout(r, ms));

/** "INV-20261101-7KQ2M9" */
function orderId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `INV-${ymd}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

/* --------------------------------------------------------------- mapping */

/** The purchases a customer can see: signed or paid. Reservations show as a request instead. */
const VISIBLE_SALE = (s: ShareSale) => s.status === 'agreement_signed' || s.status === 'fully_paid';

const mask = (value: string | null | undefined, keep = 4) => {
  const v = value?.replace(/\s/g, '');
  return v ? `•••• •••• ${v.slice(-keep)}` : null;
};

/** `since`: the earlier of the record's creation and the customer's first purchase */
function toCustomer(c: Customer, since: string): InvestorCustomer {
  return {
    code: c.code,
    customer_type: 'investor',
    full_name: c.name,
    email: c.email || null,
    phone: normalizePhone(c.phone),
    nid_masked: mask(c.nid),
    tin_masked: mask(c.tin),
    date_of_birth: c.date_of_birth || null,
    address: c.address || null,
    kyc_verified_on: c.kyc_verified_on || null,
    joined_on: since,
    nominee: c.nominee_name ? { name: c.nominee_name, relation: c.nominee_relation || null, phone: c.nominee_phone || null, share_pct: 100 } : null,
    bank: c.bank_name ? { bank_name: c.bank_name, branch: c.bank_branch || null, account_masked: mask(c.bank_account) } : null,
  };
}

const STATUS_PROGRESS: Record<Project['status'], number> = {
  planning: 0,
  design: 0,
  approval: 0,
  under_construction: 30,
  nearly_complete: 90,
  handover_ongoing: 100,
  closed: 100,
};

/** Object URLs for uploaded cover pictures, made once per document. */
const coverUrls = new Map<string, string>();

function coverOf(p: Project, docs: Map<string, DocumentRecord>): string {
  const doc = p.cover_image_document_id ? docs.get(p.cover_image_document_id) : undefined;
  if (doc?.file_data && (doc.mime_type ?? '').startsWith('image/')) {
    if (!coverUrls.has(doc.id)) coverUrls.set(doc.id, URL.createObjectURL(doc.file_data));
    return coverUrls.get(doc.id)!;
  }
  return p.cover_image_url || FALLBACK_IMAGE;
}

function toProject(p: Project, latest: ShareOffering | undefined, progress: number | null, image: string): InvestorProject {
  const type = PROJECT_TYPE_LABEL[p.project_type];
  return {
    code: p.code,
    name: p.name,
    category: type,
    location: p.location_summary?.trim() || '—',
    image,
    summary: p.surroundings?.trim() ? `${type} project in ${p.location_summary ?? 'Bangladesh'}. Close to ${p.surroundings.trim()}.` : `${type} project in ${p.location_summary ?? 'Bangladesh'}.`,
    valuation: latest?.valuation ?? 0,
    valuation_date: latest?.valuation_date ?? p.created_at.slice(0, 10),
    construction_progress_pct: progress ?? STATUS_PROGRESS[p.status],
  };
}

function toRound(o: ShareOffering, projectCode: string, sales: ShareSale[], today: string): ShareRound {
  const a = offeringAvailability(o, sales);
  return {
    code: o.code,
    project_code: projectCode,
    round_no: o.round_no,
    valuation: o.valuation,
    offered_pct: o.offered_pct,
    total_shares: o.total_shares,
    share_pct: o.share_pct,
    price_per_share: o.price_per_share,
    shares_available: a.available,
    opens_on: o.opens_on ?? today,
    closes_on: o.closes_on ?? today,
    is_open: offeringState(o, today) === 'open' && a.available > 0,
    min_shares: o.min_shares,
    max_shares: o.max_shares,
    down_payment_pct: o.min_down_payment_pct,
    max_installments: o.max_installments,
    frequency: o.installment_frequency,
    late_fee_pct: o.late_fee_pct,
    grace_days: o.grace_days,
  };
}

function toHolding(s: ShareSale, projectCode: string, roundCode: string): ShareHolding {
  return {
    code: s.code,
    project_code: projectCode,
    round_code: roundCode,
    agreement_no: s.agreement_no ?? '—',
    agreement_date: s.agreement_date ?? s.reserved_on,
    shares: s.shares,
    share_pct: s.share_pct,
    price_per_share: s.price_per_share,
    total_price: s.total_price,
    down_payment: s.down_payment,
    installment_count: s.installment_count,
    frequency: s.installment_frequency,
    status: s.certificate_no ? 'confirmed' : s.status === 'fully_paid' ? 'fully_paid' : 'paying',
    certificate_no: s.certificate_no ?? null,
  };
}

const TO_PORTAL_METHOD: Record<SharePaymentMethod, PaymentMethod> = {
  bank_transfer: 'bank_transfer',
  cheque: 'cheque',
  cash: 'cash',
  bkash: 'bkash',
  nagad: 'nagad',
  card: 'card',
  online: 'internet_banking',
};

const TO_ADMIN_METHOD: Record<PaymentMethod, SharePaymentMethod> = {
  bkash: 'bkash',
  nagad: 'nagad',
  card: 'card',
  rocket: 'online',
  internet_banking: 'online',
  bank_transfer: 'bank_transfer',
  cheque: 'cheque',
  cash: 'cash',
};

function toPayment(p: SharePayment, sale: ShareSale, instSeq: Map<string, number>): PaymentRecord {
  let method = TO_PORTAL_METHOD[p.method];
  if (p.method === 'online' && /rocket/i.test(p.method_detail ?? '')) method = 'rocket';
  const online = p.channel === 'online';
  return {
    receipt_no: p.code,
    holding_code: sale.code,
    // the portal names installments "<purchase code>-<seq>"; ids stay inside
    allocations: p.allocations.map((a) => ({ installment_id: `${sale.code}-${instSeq.get(a.installment_id) ?? 0}`, principal: a.principal, late_fee: a.late_fee })),
    principal: p.principal,
    late_fee: p.late_fee,
    total: p.amount,
    method,
    method_detail: p.method_detail || (online ? 'Online payment' : p.method === 'cash' ? 'Cash at our office' : `${PAYMENT_LABEL[p.method]}, received by our office`),
    channel: online ? 'online' : 'office',
    reference: p.reference || p.code,
    // the gateway's own time when it was paid that day; otherwise the day the office recorded
    paid_at: online && p.created_at.slice(0, 10) === p.paid_on ? p.created_at : `${p.paid_on}T10:00:00`,
  };
}

const PAYMENT_LABEL: Record<SharePaymentMethod, string> = {
  bank_transfer: 'Bank deposit',
  cheque: 'Cheque',
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  card: 'Card',
  online: 'Online',
};

function toRequest(r: ShareRequestRow, offeringCode: string): ShareRequest {
  return {
    id: r.id,
    round_code: offeringCode,
    shares: r.shares,
    installments: r.installments,
    note: r.note ?? '',
    requested_at: r.requested_at,
    status: r.status,
    office_note: r.status === 'declined' || r.status === 'contacted' ? (r.office_note ?? null) : null,
  };
}

function toUpload(u: CustomerUploadRow, saleCode: string): CustomerUpload {
  return {
    id: u.id,
    holding_code: saleCode,
    kind: u.kind,
    title: u.title,
    note: u.note ?? '',
    file_name: u.file_name,
    file_type: u.file_type,
    file_size: u.file_size,
    uploaded_at: u.uploaded_at,
    status: u.status,
    review_note: u.status === 'rejected' ? (u.review_note ?? null) : null,
  };
}

function documentsFor(s: ShareSale): CustomerDocument[] {
  const issued = s.agreement_date ?? null;
  return [
    { id: `${s.code}-agreement`, holding_code: s.code, kind: 'agreement', title: 'Share purchase agreement', issued_on: issued, available: !!issued },
    { id: `${s.code}-deed`, holding_code: s.code, kind: 'deed', title: 'Deed of share ownership', issued_on: issued, available: !!issued },
    { id: `${s.code}-schedule`, holding_code: s.code, kind: 'schedule', title: 'Payment schedule', issued_on: issued, available: !!issued },
    { id: `${s.code}-certificate`, holding_code: s.code, kind: 'certificate', title: 'Share certificate', issued_on: s.certificate_date ?? null, available: !!s.certificate_no },
  ];
}

/** Customers who may sign in: type Investor, or anyone the office has sold shares to. */
async function findCustomer(identifier: string): Promise<Customer | undefined> {
  const raw = identifier.trim();
  if (!raw) return undefined;
  const all = await db.customers.toArray();
  const match = raw.includes('@')
    ? all.find((c) => c.email?.trim().toLowerCase() === raw.toLowerCase())
    : all.find((c) => normalizePhone(c.phone) === normalizePhone(raw));
  if (!match) return undefined;
  if (match.customer_type === 'investor') return match;
  const sales = await db.share_sales.where('customer_id').equals(match.id).count();
  return sales ? match : undefined;
}

/* ---------------------------------------------------------------- reader */

export const investorRepository = {
  /** shown on the sign-in page of the demo build */
  demoLogin: { phone: '01711223344', email: 'farhana.rahman@example.com', otp: DEMO_OTP },

  /** Step 1 of sign-in. Only customers the office has created can sign in. */
  async requestCode(identifier: string): Promise<{ ok: true; sent_to: string } | { ok: false; error: string }> {
    await latency();
    const c = await findCustomer(identifier);
    if (!c) {
      return {
        ok: false,
        error: 'We could not find a customer account with these details. Accounts are opened by our office once your share agreement is signed.',
      };
    }
    try {
      window.sessionStorage.setItem(PENDING_KEY, c.id);
    } catch {
      /* ignore */
    }
    if (identifier.includes('@')) return { ok: true, sent_to: `email to ${identifier.trim()[0]}•••••@${identifier.split('@')[1]}` };
    const phone = normalizePhone(c.phone);
    return { ok: true, sent_to: `SMS to ${phone.slice(0, 3)}•••••${phone.slice(-3)}` };
  },

  /** Step 2 of sign-in. */
  async verifyCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
    await latency();
    let pending: string | null = null;
    try {
      pending = window.sessionStorage.getItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    const customer = pending ? await db.customers.get(pending) : undefined;
    if (!customer) return { ok: false, error: 'This sign-in has expired. Please enter your mobile number again.' };
    if (code.trim() !== DEMO_OTP) return { ok: false, error: 'That code is not correct. Please check and try again.' };
    const now = new Date();
    const session: Session = {
      customer_id: customer.id,
      customer_code: customer.code,
      signed_in_at: now.toISOString(),
      expires_at: new Date(now.getTime() + SESSION_HOURS * 3_600_000).toISOString(),
    };
    writeJson(SESSION_KEY, session);
    try {
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    return { ok: true };
  },

  session(): Session | null {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      const s = raw ? (JSON.parse(raw) as Session) : null;
      return s?.customer_id && s.expires_at > new Date().toISOString() ? s : null;
    } catch {
      return null;
    }
  },

  signOut() {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  },

  /** Everything the portal shows the signed-in customer; null when signed out or the account is gone. */
  async snapshot(): Promise<InvestorSnapshot | null> {
    const session = this.session();
    if (!session) return null;
    const customer = await db.customers.get(session.customer_id);
    if (!customer) return null;
    const today = todayLocal();
    const [offerings, mySales, requests, uploads] = await Promise.all([
      db.share_offerings.toArray(),
      db.share_sales.where('customer_id').equals(customer.id).toArray(),
      db.share_requests.where('customer_id').equals(customer.id).toArray(),
      db.customer_uploads.where('customer_id').equals(customer.id).toArray(),
    ]);
    const sales = mySales.filter(VISIBLE_SALE);
    const offeringById = new Map(offerings.map((o) => [o.id, o]));
    const listed = offerings.filter((o) => o.status !== 'draft' && o.status !== 'cancelled');
    // rounds the customer bought into, plus every round still on the market
    const roundOfferings = listed.filter((o) => sales.some((s) => s.offering_id === o.id) || offeringState(o, today) === 'open');
    const projectIds = [...new Set(roundOfferings.map((o) => o.project_id))];
    const [projects, allSales, towers, installments, payments] = await Promise.all([
      db.projects.bulkGet(projectIds),
      db.share_sales.where('offering_id').anyOf(roundOfferings.map((o) => o.id)).toArray(),
      db.towers.where('project_id').anyOf(projectIds).toArray(),
      db.share_installments.where('sale_id').anyOf(sales.map((s) => s.id)).toArray(),
      db.share_payments.where('sale_id').anyOf(sales.map((s) => s.id)).toArray(),
    ]);
    const coverIds = projects.map((p) => p?.cover_image_document_id).filter((id): id is string => !!id);
    const docs = new Map((await db.documents.bulkGet(coverIds)).filter((d): d is DocumentRecord => !!d).map((d) => [d.id, d]));
    const projectById = new Map(projects.filter((p): p is Project => !!p).map((p) => [p.id, p]));

    const portalProjects = [...projectById.values()].map((p) => {
      const latest = listed.filter((o) => o.project_id === p.id).sort((a, b) => b.round_no - a.round_no)[0];
      const mine = towers.filter((t) => t.project_id === p.id && t.current_progress_pct != null);
      const progress = mine.length ? Math.round(mine.reduce((t, x) => t + Number(x.current_progress_pct), 0) / mine.length) : null;
      return toProject(p, latest, progress, coverOf(p, docs));
    });
    const projectCode = (id: string) => projectById.get(id)?.code ?? '—';
    const rounds = roundOfferings.filter((o) => projectById.has(o.project_id)).map((o) => toRound(o, projectCode(o.project_id), allSales, today));
    const holdings = sales.filter((s) => offeringById.has(s.offering_id) && projectById.has(s.project_id)).map((s) => toHolding(s, projectCode(s.project_id), offeringById.get(s.offering_id)!.code));
    const saleById = new Map(sales.map((s) => [s.id, s]));
    const instSeq = new Map(installments.map((i) => [i.id, i.seq]));
    const portalInstallments: Installment[] = installments.map((i: ShareInstallment) => {
      const code = saleById.get(i.sale_id)!.code;
      return { id: `${code}-${i.seq}`, holding_code: code, seq: i.seq, due_date: i.due_date, amount: i.amount };
    });
    const local = loadLocal();
    return {
      today,
      customer: toCustomer(customer, [customer.created_at.slice(0, 10), ...mySales.map((s) => s.reserved_on)].sort()[0]),
      projects: portalProjects,
      rounds,
      holdings,
      installments: portalInstallments,
      payments: payments.map((p) => toPayment(p, saleById.get(p.sale_id)!, instSeq)),
      documents: sales.flatMap(documentsFor),
      read_notification_ids: local.read[customer.id] ?? [],
      share_requests: requests
        .filter((r) => r.status !== 'withdrawn' && offeringById.has(r.offering_id))
        .sort((a, b) => b.requested_at.localeCompare(a.requested_at))
        .map((r) => toRequest(r, offeringById.get(r.offering_id)!.code)),
      uploads: uploads
        .filter((u) => saleById.has(u.sale_id))
        .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
        .map((u) => toUpload(u, saleById.get(u.sale_id)!.code)),
    };
  },

  /** The signed-in customer's purchase with this code, or an error. */
  async ownSale(code: string): Promise<ShareSale> {
    const session = this.session();
    if (!session) throw new Error('Please sign in again.');
    const sale = await db.share_sales.where('code').equals(code).first();
    if (!sale || sale.customer_id !== session.customer_id || !VISIBLE_SALE(sale)) throw new Error('This investment could not be found.');
    return sale;
  },

  /**
   * Opens a checkout for an amount on one holding. The amount is re-checked
   * and re-allocated here against the live schedule, so what the page showed
   * can never over- or under-charge.
   */
  async createIntent(holdingCode: string, amount: number, option: AmountOption): Promise<PaymentIntent> {
    await latency(600);
    const snap = await this.snapshot();
    const holding = snap?.holdings.find((h) => h.code === holdingCode);
    if (!snap || !holding) throw new Error('Unknown holding');
    const view = viewHolding(snap, holding);
    const charge = Math.min(Math.round(amount), maxPayable(view));
    const allocations = allocatePayment(view, charge);
    const principal = allocations.reduce((t, a) => t + a.principal, 0);
    const lateFee = allocations.reduce((t, a) => t + a.late_fee, 0);
    const now = new Date();
    const intent: PaymentIntent = {
      id: orderId(),
      holding_code: holdingCode,
      option,
      allocations,
      principal,
      late_fee: lateFee,
      total: principal + lateFee,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + CHECKOUT_MINUTES * 60_000).toISOString(),
      status: 'pending',
      method: null,
      method_detail: null,
      reference: null,
      receipt_no: null,
      failure_reason: null,
      completed_at: null,
    };
    const state = loadLocal();
    state.intents = [intent, ...state.intents].slice(0, 30);
    saveLocal(state);
    return intent;
  },

  async intent(id: string): Promise<PaymentIntent | null> {
    const state = loadLocal();
    const intent = state.intents.find((i) => i.id === id) ?? null;
    if (intent && intent.status === 'pending' && intent.expires_at < new Date().toISOString()) {
      intent.status = 'expired';
      intent.failure_reason = 'The payment session timed out before it was completed. No money has been taken.';
      saveLocal(state);
    }
    return intent;
  },

  /**
   * What the payment gateway reports back (its server-to-server callback in
   * the live build). A successful payment is recorded on the purchase in the
   * admin Share Sale module, so the office sees it at once, with the
   * gateway's transaction ID; the receipt number is that record's code.
   */
  async completeIntent(id: string, method: PaymentMethod, methodDetail: string, outcome: GatewayOutcome): Promise<PaymentIntent | null> {
    await latency(1800);
    const state = loadLocal();
    const intent = state.intents.find((i) => i.id === id);
    if (!intent || intent.status !== 'pending') return intent ?? null;
    const now = new Date();
    intent.method = method;
    intent.method_detail = methodDetail;
    intent.completed_at = now.toISOString();
    if (outcome !== 'success') {
      intent.status = outcome === 'cancelled' ? 'cancelled' : 'failed';
      intent.failure_reason = FAILURE[outcome];
      saveLocal(state);
      return intent;
    }
    const reference = demoReference(method, `${intent.id}${now.getTime()}`);
    try {
      const sale = await this.ownSale(intent.holding_code);
      const payment = await shareSaleRepository.recordPayment(
        {
          sale_id: sale.id,
          paid_on: todayLocal(),
          amount: intent.total,
          method: TO_ADMIN_METHOD[method],
          reference,
          notes: `Customer Portal order ${intent.id}`,
          channel: 'online',
          method_detail: methodDetail,
        },
        null,
      );
      intent.status = 'paid';
      intent.reference = reference;
      intent.receipt_no = payment.code;
      intent.principal = payment.principal;
      intent.late_fee = payment.late_fee;
      intent.total = payment.amount;
    } catch (e) {
      // e.g. the office recorded a payment meanwhile and less is owed now
      intent.status = 'failed';
      intent.failure_reason = `${e instanceof Error ? e.message : 'The payment could not be applied.'} No money has been taken.`;
    }
    saveLocal(state);
    return intent;
  },

  markRead(ids: string[]) {
    const session = this.session();
    if (!session) return;
    const state = loadLocal();
    state.read[session.customer_id] = [...new Set([...(state.read[session.customer_id] ?? []), ...ids])];
    saveLocal(state);
  },

  /**
   * Asks to buy shares in an open round. Nothing is reserved yet: the office
   * sees the request under Share Sale → Customer Requests, calls, and
   * reserves the shares (plan §4, step 3).
   */
  async requestShares(input: { round_code: string; shares: number; installments: number; note: string }): Promise<ShareRequest> {
    await latency(700);
    const session = this.session();
    if (!session) throw new Error('Please sign in again.');
    const today = todayLocal();
    const o = await db.share_offerings.where('code').equals(input.round_code).first();
    if (!o || offeringState(o, today) !== 'open') throw new Error('This offering is no longer open.');
    const avail = offeringAvailability(o, await db.share_sales.where('offering_id').equals(o.id).toArray());
    const shares = Math.floor(input.shares);
    if (shares < o.min_shares || shares > Math.min(o.max_shares, avail.available)) {
      throw new Error(`You can ask for ${o.min_shares} to ${Math.min(o.max_shares, avail.available)} shares in this round.`);
    }
    if (!(input.installments >= 0 && input.installments <= o.max_installments)) throw new Error(`This round allows up to ${o.max_installments} installments.`);
    const mine = await db.share_requests.where('customer_id').equals(session.customer_id).toArray();
    const open = mine.find((r) => r.offering_id === o.id && (r.status === 'new' || r.status === 'contacted'));
    const ts = nowIso();
    const fields = { shares, installments: input.installments, note: input.note.trim() || null, requested_at: ts, status: 'new' as const, office_note: null };
    let row: ShareRequestRow;
    if (open) {
      await db.share_requests.update(open.id, { ...fields, updated_at: ts });
      row = { ...open, ...fields };
    } else {
      row = {
        id: newId(),
        code: nextCode('SRQ', (await db.share_requests.toArray()).map((r) => r.code)),
        offering_id: o.id,
        project_id: o.project_id,
        customer_id: session.customer_id,
        sale_id: null,
        ...fields,
        created_at: ts,
        updated_at: ts,
        created_by: null,
      };
      await db.share_requests.add(row);
    }
    changed();
    return toRequest(row, o.code);
  },

  /** Takes back a request the office has not acted on yet. */
  async withdrawRequest(roundCode: string) {
    await latency(300);
    const session = this.session();
    if (!session) return;
    const o = await db.share_offerings.where('code').equals(roundCode).first();
    if (!o) return;
    const rows = (await db.share_requests.where('customer_id').equals(session.customer_id).toArray()).filter(
      (r) => r.offering_id === o.id && (r.status === 'new' || r.status === 'contacted'),
    );
    for (const r of rows) await db.share_requests.update(r.id, { status: 'withdrawn', updated_at: nowIso() });
    changed();
  },

  /** Sends a document to the office against one investment; it lands in Share Sale → Customer Requests. */
  async uploadDocument(input: { holding_code: string; kind: UploadKind; title: string; note: string; file: File }): Promise<CustomerUpload> {
    if (input.file.size > UPLOAD_MAX_MB * 1024 * 1024) throw new Error(`The file is larger than ${UPLOAD_MAX_MB} MB.`);
    await latency(900);
    const sale = await this.ownSale(input.holding_code);
    const ts = nowIso();
    const row: CustomerUploadRow = {
      id: newId(),
      customer_id: sale.customer_id,
      sale_id: sale.id,
      kind: input.kind,
      title: input.title.trim(),
      note: input.note.trim() || null,
      file_name: input.file.name,
      file_type: input.file.type,
      file_size: input.file.size,
      uploaded_at: ts,
      status: 'under_review',
      reviewed_on: null,
      review_note: null,
      created_at: ts,
      updated_at: ts,
      created_by: null,
    };
    await db.transaction('rw', db.customer_uploads, db.customer_upload_files, async () => {
      await db.customer_uploads.add(row);
      await db.customer_upload_files.add({ id: row.id, blob: input.file });
    });
    changed();
    return toUpload(row, sale.code);
  },

  /** The customer's own uploaded file, to open or download. */
  async uploadFile(id: string): Promise<Blob | null> {
    const session = this.session();
    const u = await db.customer_uploads.get(id);
    if (!session || !u || u.customer_id !== session.customer_id) return null;
    return (await db.customer_upload_files.get(id))?.blob ?? null;
  },

  /** A customer may take back a file the office has not reviewed yet. */
  async deleteUpload(id: string) {
    const session = this.session();
    const u = await db.customer_uploads.get(id);
    if (!session || !u || u.customer_id !== session.customer_id || u.status !== 'under_review') return;
    await db.transaction('rw', db.customer_uploads, db.customer_upload_files, async () => {
      await db.customer_uploads.delete(id);
      await db.customer_upload_files.delete(id);
    });
    changed();
  },
};
