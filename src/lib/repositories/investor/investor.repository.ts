'use client';

import { db } from '../../db/database';
import type {
  Booking,
  BookingInstallment,
  Customer,
  DocumentRecord,
  Payment as BookingPayment,
  PaymentMethod as BookingPaymentMethod,
  Project,
  Tower,
  Unit,
  UnitDelivery,
  ShareInstallment,
  ShareOffering,
  SharePayment,
  SharePaymentMethod,
  ShareSale,
  ShareRequest as ShareRequestRow,
  CustomerUpload as CustomerUploadRow,
  OfflinePaymentMethod,
  PaymentSubmission,
} from '../../db/types';
import {
  UPLOAD_MAX_MB,
  allocatePayment,
  maxPayable,
  viewHolding,
  type AmountOption,
  type CustomerDocument,
  PAYMENT_METHOD_LABEL,
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
  type DepositAccount,
  type OfflinePayment,
  formatTaka,
} from '@/lib/domain/investor-portal';
import { SALE_PAYMENT_MODE_LABEL } from '@/lib/domain/booking';
import { PROJECT_TYPE_LABEL } from '@/lib/domain/project';
import { SHARE_DOC_META, shareDocScope } from '@/lib/domain/share-documents';
import { maxSharePayable, offeringAvailability, offeringState } from '@/lib/domain/share-sale';
import { newId, nextCode, nowIso } from '@/lib/utils/id';
import { todayLocal } from '@/lib/utils/format';
import { normalizePhone } from '../lead.repository';
import { shareSaleRepository } from '../share-sale.repository';
import { bookingRepository } from '../booking.repository';
import { bookingLedgerRepository } from '../booking-ledger.repository';
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
function toCustomer(c: Customer, since: string, type: 'buyer' | 'investor' = 'investor'): InvestorCustomer {
  return {
    code: c.code,
    customer_type: type,
    full_name: c.name,
    father_or_spouse_name: c.father_or_spouse_name || null,
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
    late_fee_type: o.late_fee_type ?? null,
    late_fee_amount: o.late_fee_amount ?? null,
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
    signing: s.signing
      ? {
          place: s.signing.place,
          company_signatory: s.signing.company_signatory,
          company_signatory_title: s.signing.company_signatory_title ?? null,
          witnesses: s.signing.witnesses.map((w) => w.name),
          stamp_value: s.signing.stamp_value ?? null,
          notarized_on: s.signing.notarized_on ?? null,
        }
      : null,
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

/** A reported bank payment as the customer sees it: never who reviewed it, nor the office's account ids. */
function toOfflinePayment(p: PaymentSubmission, accounts: Map<string, DepositAccount>): OfflinePayment {
  const a = p.paid_into_account_id ? accounts.get(p.paid_into_account_id) : undefined;
  return {
    code: p.code,
    holding_code: p.holding_code,
    amount: p.amount,
    method: p.method,
    paid_on: p.paid_on,
    paid_into: a ? `${a.bank_name || a.name}${a.account_number ? ` · ${a.account_number}` : ''}` : '—',
    reference: p.reference,
    status: p.status,
    submitted_at: p.created_at,
    reviewed_at: p.reviewed_at ?? null,
    review_note: p.status === 'rejected' ? (p.review_note ?? null) : null,
    receipt_no: p.receipt_no ?? null,
  };
}

function toUpload(u: CustomerUploadRow, saleCode: string | null): CustomerUpload {
  return {
    id: u.id,
    holding_code: saleCode,
    source: u.source === 'office' ? 'office' : 'customer',
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

/* ------------------------------------------------- homes (BUYER-PORTAL-PLAN.md §5) */

/** The bookings a buyer sees: every one not cancelled, on hold included. */
const LIVE_BOOKING = (b: Booking) => b.status !== 'cancelled';

const FROM_BOOKING_METHOD: Record<BookingPaymentMethod, PaymentMethod> = {
  cash: 'cash',
  bank: 'bank_transfer',
  mfs: 'bkash',
  cheque: 'cheque',
  card: 'card',
  online: 'internet_banking',
};

const TO_BOOKING_METHOD: Record<PaymentMethod, BookingPaymentMethod> = {
  bkash: 'mfs',
  nagad: 'mfs',
  rocket: 'mfs',
  card: 'card',
  internet_banking: 'online',
  bank_transfer: 'bank',
  cheque: 'cheque',
  cash: 'cash',
};

/** A buyer receipt has no code of its own; the portal shows "MR-" and the start of its id. */
export function homeReceiptNo(p: Pick<BookingPayment, 'id'>): string {
  return `MR-${p.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

const DELIVERY_LABEL: Record<UnitDelivery['step'], string> = {
  keys_handed_over: 'Keys handed over',
  possession_given: 'Possession given',
  share_certificate: 'Share certificate issued',
  deed_registered: 'Sale deed registered',
  mutation_done: 'Mutation done',
};

function unitLabel(u: Unit | undefined, t: Tower | undefined, type: string): string {
  if (!u) return type;
  const size = u.size_sqft ? `${Number(u.size_sqft).toLocaleString('en-IN')} sft` : u.land_size ? `${u.land_size} ${u.land_size_unit ?? ''}`.trim() : null;
  const where = [t?.name, u.floor != null ? `floor ${u.floor}` : null].filter(Boolean).join(', ');
  return [type, where || null, size].filter(Boolean).join(' · ');
}

function toHomeHolding(b: Booking, unit: Unit | undefined, tower: Tower | undefined, project: Project, rows: BookingInstallment[], deliveries: UnitDelivery[]): ShareHolding {
  const installments = rows.filter((r) => r.kind !== 'booking_money');
  return {
    kind: 'home',
    code: b.code,
    project_code: project.code,
    round_code: '',
    agreement_no: b.agreement_no ?? '—',
    agreement_date: b.agreement_date ?? b.booking_date,
    shares: 0,
    share_pct: 0,
    price_per_share: 0,
    total_price: Number(b.final_price) || 0,
    down_payment: Number(b.booking_amount) || 0,
    installment_count: installments.length,
    frequency: 'monthly',
    status: b.fully_paid_on ? 'fully_paid' : 'paying',
    certificate_no: null,
    fee_rule: b.late_fee_pct ? { late_fee_pct: Number(b.late_fee_pct), grace_days: Number(b.late_fee_grace_days) || 0 } : { late_fee_pct: 0, grace_days: 0 },
    home: {
      unit_code: unit?.code ?? '—',
      unit_label: unitLabel(unit, tower, PROJECT_TYPE_LABEL[project.project_type]),
      booking_date: b.booking_date,
      booking_amount: Number(b.booking_amount) || 0,
      payment_plan: b.payment_mode ? SALE_PAYMENT_MODE_LABEL[b.payment_mode] : null,
      handover_date: b.handover_date ?? null,
      fully_paid_on: b.fully_paid_on ?? null,
      delivery: (['keys_handed_over', 'deed_registered', 'mutation_done'] as UnitDelivery['step'][]).map((step) => ({
        label: DELIVERY_LABEL[step],
        done_on: deliveries.find((d) => d.booking_id === b.id && d.step === step)?.event_date ?? null,
      })),
      on_hold: b.status === 'hold',
    },
    signing: b.signing
      ? {
          place: b.signing.place,
          company_signatory: b.signing.company_signatory,
          company_signatory_title: b.signing.company_signatory_title ?? null,
          witnesses: b.signing.witnesses.map((w) => w.name),
          stamp_value: b.signing.stamp_value ?? null,
          notarized_on: b.signing.notarized_on ?? null,
        }
      : null,
  };
}

function toHomePayment(p: BookingPayment, code: string, seqById: Map<string, number>): PaymentRecord {
  const online = p.channel === 'online';
  const method = FROM_BOOKING_METHOD[p.payment_method] ?? 'bank_transfer';
  const fee = Number(p.late_fee) || 0;
  return {
    receipt_no: homeReceiptNo(p),
    holding_code: code,
    allocations: (p.allocations ?? []).map((a) => ({ installment_id: `${code}-${seqById.get(a.installment_id) ?? 0}`, principal: a.principal, late_fee: a.late_fee })),
    principal: (Number(p.amount) || 0) - fee,
    late_fee: fee,
    total: Number(p.amount) || 0,
    method,
    method_detail: p.method_detail || (online ? 'Online payment' : p.payment_method === 'cash' ? 'Cash at our office' : `${PAYMENT_METHOD_LABEL[method]}, received by our office`),
    channel: online ? 'online' : 'office',
    reference: p.reference_no || homeReceiptNo(p),
    paid_at: online && p.created_at.slice(0, 10) === p.payment_date ? p.created_at : `${p.payment_date}T10:00:00`,
  };
}

function homeDocuments(b: Booking): CustomerDocument[] {
  const issued = b.agreement_date ?? null;
  return [
    { id: `${b.code}-agreement`, holding_code: b.code, kind: 'agreement', title: 'Sale agreement', issued_on: issued, available: !!issued },
    { id: `${b.code}-schedule`, holding_code: b.code, kind: 'schedule', title: 'Payment schedule', issued_on: issued ?? b.booking_date, available: true },
  ];
}

/** The account online money lands in: the wallet merchant account for bKash and the like, else the first bank account. */
async function gatewayAccount(method: PaymentMethod): Promise<string | null> {
  const accounts = (await db.bank_accounts.toArray()).filter((a) => a.is_active);
  const wallet = method === 'bkash' || method === 'nagad' || method === 'rocket';
  return (wallet ? accounts.find((a) => a.type === 'mfs') : undefined)?.id ?? accounts.find((a) => a.type === 'bank')?.id ?? accounts[0]?.id ?? null;
}

/** Customers who may sign in: an investor or a buyer — anyone holding shares or a booking, or created as one. */
async function findCustomer(identifier: string): Promise<Customer | undefined> {
  const raw = identifier.trim();
  if (!raw) return undefined;
  const all = await db.customers.toArray();
  const match = raw.includes('@')
    ? all.find((c) => c.email?.trim().toLowerCase() === raw.toLowerCase())
    : all.find((c) => normalizePhone(c.phone) === normalizePhone(raw));
  if (!match) return undefined;
  if (match.customer_type === 'investor' || match.customer_type === 'buyer') return match;
  const sales = await db.share_sales.where('customer_id').equals(match.id).count();
  const homes = (await db.bookings.where('customer_id').equals(match.id).toArray()).filter(LIVE_BOOKING).length;
  return sales || homes ? match : undefined;
}

/* ---------------------------------------------------------------- reader */

export const investorRepository = {
  /** shown on the sign-in page of the demo build */
  demoLogin: { phone: '01711223344', email: 'farhana.rahman@example.com', otp: DEMO_OTP, buyer_phone: '01855889900', both_phone: '01966445566' },

  /** Step 1 of sign-in. Only customers the office has created can sign in. */
  async requestCode(identifier: string): Promise<{ ok: true; sent_to: string } | { ok: false; error: string }> {
    await latency();
    const c = await findCustomer(identifier);
    if (!c) {
      return {
        ok: false,
        error: 'We could not find a customer account with these details. Accounts are opened by our office once you book a flat or plot, or sign a share agreement.',
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
    // the buyer's flats and plots, and the projects they stand in
    const bookings = (await db.bookings.where('customer_id').equals(customer.id).toArray()).filter(LIVE_BOOKING);
    const units = await db.units.bulkGet(bookings.map((b) => b.unit_id));
    const homeTowers = await db.towers.bulkGet(units.map((u) => u?.tower_id ?? ''));
    const projectIds = [
      ...new Set([...roundOfferings.map((o) => o.project_id), ...homeTowers.map((t) => t?.project_id).filter((id): id is string => !!id)]),
    ];
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

    const [homeRows, homePays, deliveries] = await Promise.all([
      db.booking_installments.where('booking_id').anyOf(bookings.map((b) => b.id)).toArray(),
      db.payments.where('booking_id').anyOf(bookings.map((b) => b.id)).toArray(),
      db.unit_deliveries.where('booking_id').anyOf(bookings.map((b) => b.id)).toArray(),
    ]);
    const homeSeq = new Map(homeRows.map((r) => [r.id, r.seq]));
    const homes = bookings.flatMap((b, i) => {
      const project = homeTowers[i] ? projectById.get(homeTowers[i]!.project_id) : undefined;
      if (!project) return [];
      return [toHomeHolding(b, units[i] ?? undefined, homeTowers[i] ?? undefined, project, homeRows.filter((r) => r.booking_id === b.id), deliveries)];
    });
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const roles: ('buyer' | 'investor')[] = [];
    if (homes.length) roles.push('buyer');
    if (sales.length || requests.length || customer.customer_type === 'investor') roles.push('investor');
    if (!roles.length) roles.push(customer.customer_type ?? 'investor');
    const portalInstallments: Installment[] = installments.map((i: ShareInstallment) => {
      const code = saleById.get(i.sale_id)!.code;
      return { id: `${code}-${i.seq}`, holding_code: code, seq: i.seq, due_date: i.due_date, amount: i.amount };
    });
    const local = loadLocal();
    const depositById = new Map((await this.depositAccounts()).map((a) => [a.id, a]));
    return {
      today,
      customer: toCustomer(customer, [customer.created_at.slice(0, 10), ...mySales.map((s) => s.reserved_on), ...bookings.map((b) => b.booking_date)].sort()[0], roles[0]),
      roles,
      projects: portalProjects,
      rounds,
      holdings: [...homes, ...holdings],
      installments: [
        ...homeRows.map((r) => {
          const code = bookingById.get(r.booking_id)!.code;
          return { id: `${code}-${r.seq}`, holding_code: code, seq: r.seq, label: r.label, due_date: r.due_date, amount: r.amount };
        }),
        ...portalInstallments,
      ],
      payments: [
        ...homePays.map((p) => toHomePayment(p, bookingById.get(p.booking_id)!.code, homeSeq)),
        ...payments.map((p) => toPayment(p, saleById.get(p.sale_id)!, instSeq)),
      ],
      documents: [...bookings.flatMap(homeDocuments), ...sales.flatMap(documentsFor)],
      read_notification_ids: local.read[customer.id] ?? [],
      share_requests: requests
        .filter((r) => r.status !== 'withdrawn' && offeringById.has(r.offering_id))
        .sort((a, b) => b.requested_at.localeCompare(a.requested_at))
        .map((r) => toRequest(r, offeringById.get(r.offering_id)!.code)),
      // the customer's own papers, and those of purchases they can see (not a reservation's)
      uploads: uploads
        .filter((u) => (u.sale_id ? saleById.has(u.sale_id) : u.booking_id ? bookingById.has(u.booking_id) : true))
        .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
        .map((u) => toUpload(u, u.sale_id ? saleById.get(u.sale_id)!.code : u.booking_id ? bookingById.get(u.booking_id)!.code : null)),
      offline_payments: (await db.payment_submissions.where('customer_id').equals(customer.id).toArray())
        .filter((p) => p.status !== 'withdrawn')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((p) => toOfflinePayment(p, depositById)),
    };
  },

  /** The signed-in customer's booking with this code, or an error. */
  async ownBooking(code: string): Promise<Booking> {
    const session = this.session();
    if (!session) throw new Error('Please sign in again.');
    const booking = await db.bookings.where('code').equals(code).first();
    if (!booking || booking.customer_id !== session.customer_id || !LIVE_BOOKING(booking)) throw new Error('This booking could not be found.');
    return booking;
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
    // a flat or plot: the money goes on the booking, into the gateway's account, through the same ledger
    if (await db.bookings.where('code').equals(intent.holding_code).count()) {
      try {
        const booking = await this.ownBooking(intent.holding_code);
        const before = new Set((await db.payments.where('booking_id').equals(booking.id).toArray()).map((p) => p.id));
        await bookingRepository.recordPayment(booking.id, {
          amount: intent.total,
          payment_date: todayLocal(),
          payment_method: TO_BOOKING_METHOD[method],
          reference_no: reference,
          notes: `Customer Portal order ${intent.id}`,
          account_id: await gatewayAccount(method),
          channel: 'online',
          method_detail: methodDetail,
        });
        const paid = (await db.payments.where('booking_id').equals(booking.id).toArray()).find((p) => !before.has(p.id));
        intent.status = 'paid';
        intent.reference = reference;
        intent.receipt_no = paid ? homeReceiptNo(paid) : null;
        intent.late_fee = Number(paid?.late_fee) || 0;
        intent.principal = intent.total - intent.late_fee;
      } catch (e) {
        intent.status = 'failed';
        intent.failure_reason = `${e instanceof Error ? e.message : 'The payment could not be applied.'} No money has been taken.`;
      }
      saveLocal(state);
      return intent;
    }
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
        source: 'portal',
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

  /**
   * Sends a paper to the office. Personal papers (NID, photo, TIN …) go on
   * the customer's file and serve every investment; the rest belong to the
   * investment given. It lands in Share Sale → Customer Requests.
   */
  async uploadDocument(input: { holding_code: string | null; kind: UploadKind; title: string; note: string; file: File }): Promise<CustomerUpload> {
    if (input.file.size > UPLOAD_MAX_MB * 1024 * 1024) throw new Error(`The file is larger than ${UPLOAD_MAX_MB} MB.`);
    if (!SHARE_DOC_META[input.kind].customer_may_upload) throw new Error('Our office files this paper for you.');
    await latency(900);
    const session = this.session();
    if (!session) throw new Error('Please sign in again.');
    const personal = shareDocScope(input.kind) === 'customer';
    let sale: ShareSale | null = null;
    let booking: Booking | null = null;
    if (!personal) {
      if (!input.holding_code) throw new Error('Choose the home or investment this paper is for.');
      if (await db.bookings.where('code').equals(input.holding_code).count()) booking = await this.ownBooking(input.holding_code);
      else sale = await this.ownSale(input.holding_code);
    }
    const ts = nowIso();
    const row: CustomerUploadRow = {
      id: newId(),
      customer_id: session.customer_id,
      sale_id: sale?.id ?? null,
      booking_id: booking?.id ?? null,
      source: 'customer',
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
    return toUpload(row, sale?.code ?? booking?.code ?? null);
  },

  /**
   * The company accounts a customer may deposit into — only what a deposit
   * slip needs, nothing of the balance (SHARE-SALE-FEEDBACK-PLAN.md C1). For
   * the demo, every active bank account; the real list is still to be agreed.
   */
  async depositAccounts(): Promise<DepositAccount[]> {
    const rows = await db.bank_accounts.toArray();
    return rows
      .filter((a) => a.is_active && a.type === 'bank')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ id: a.id, name: a.name, bank_name: a.bank_name ?? '', branch: a.branch ?? '', account_number: a.account_number ?? '' }));
  },

  /**
   * Tells the office about a payment made at the bank, with the slip. Nothing
   * is paid yet: the installment stays as it is until Accounts confirms the
   * money against the bank statement (plan C1).
   */
  async submitOfflinePayment(input: {
    holding_code: string;
    amount: number;
    method: OfflinePaymentMethod;
    paid_on: string;
    paid_into_account_id: string;
    reference: string;
    note: string;
    file: File;
  }): Promise<OfflinePayment> {
    const session = this.session();
    if (!session) throw new Error('Please sign in again.');
    const amount = Math.round(Number(input.amount) || 0);
    if (!(amount > 0)) throw new Error('Enter the amount you paid.');
    if (!input.paid_on || input.paid_on > todayLocal()) throw new Error('Enter the date on the slip — it cannot be in the future.');
    if (!input.paid_into_account_id) throw new Error('Choose the account you paid into.');
    if (!input.reference.trim()) throw new Error('Enter the transaction, slip or cheque number.');
    if (!input.file) throw new Error('Attach a photo or PDF of the slip.');
    if (input.file.size > UPLOAD_MAX_MB * 1024 * 1024) throw new Error(`The file is larger than ${UPLOAD_MAX_MB} MB.`);
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(input.file.name)) throw new Error('Attach a PDF, JPG, PNG or WEBP file.');
    await latency(900);

    let sale: ShareSale | null = null;
    let booking: Booking | null = null;
    let owed: number;
    if (await db.bookings.where('code').equals(input.holding_code).count()) {
      booking = await this.ownBooking(input.holding_code);
      const ledger = await bookingLedgerRepository.view(booking.id, todayLocal());
      owed = Math.max(0, (Number(booking.final_price) || 0) - (ledger?.paid ?? 0)) + (ledger?.late_fees ?? 0);
    } else {
      sale = await this.ownSale(input.holding_code);
      const view = await shareSaleRepository.view(sale.id, todayLocal());
      owed = view ? maxSharePayable(view) : 0;
    }
    // money already reported and still being checked counts as on its way
    const pending = (await db.payment_submissions.where('holding_code').equals(input.holding_code).toArray())
      .filter((p) => p.status === 'submitted')
      .reduce((t, p) => t + p.amount, 0);
    if (amount > owed - pending) throw new Error(`That is more than is still owed here (${formatTaka(Math.max(0, owed - pending))}${pending ? ', after the payments already being checked' : ''}).`);

    const ts = nowIso();
    const slip: CustomerUploadRow = {
      id: newId(),
      customer_id: session.customer_id,
      sale_id: sale?.id ?? null,
      booking_id: booking?.id ?? null,
      source: 'customer',
      kind: 'payment_proof',
      title: `Payment slip · ${input.reference.trim()}`,
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
    const all = await db.payment_submissions.toArray();
    const row: PaymentSubmission = {
      id: newId(),
      code: nextCode('PSB', all.map((p) => p.code)),
      customer_id: session.customer_id,
      holding_code: input.holding_code,
      sale_id: sale?.id ?? null,
      booking_id: booking?.id ?? null,
      amount,
      method: input.method,
      paid_on: input.paid_on,
      paid_into_account_id: input.paid_into_account_id,
      reference: input.reference.trim(),
      note: input.note.trim() || null,
      slip_upload_id: slip.id,
      status: 'submitted',
      created_at: ts,
      updated_at: ts,
      created_by: null,
    };
    await db.transaction('rw', db.customer_uploads, db.customer_upload_files, db.payment_submissions, async () => {
      await db.customer_uploads.add(slip);
      await db.customer_upload_files.add({ id: slip.id, blob: input.file });
      await db.payment_submissions.add(row);
    });
    changed();
    return toOfflinePayment(row, new Map((await this.depositAccounts()).map((a) => [a.id, a])));
  },

  /** The customer takes back a reported payment the office has not checked yet. */
  async withdrawOfflinePayment(code: string) {
    const session = this.session();
    const row = await db.payment_submissions.where('code').equals(code).first();
    if (!session || !row || row.customer_id !== session.customer_id || row.status !== 'submitted') return;
    await db.transaction('rw', db.payment_submissions, db.customer_uploads, db.customer_upload_files, async () => {
      await db.payment_submissions.update(row.id, { status: 'withdrawn', updated_at: nowIso() });
      if (row.slip_upload_id) {
        await db.customer_uploads.delete(row.slip_upload_id);
        await db.customer_upload_files.delete(row.slip_upload_id);
      }
    });
    changed();
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
    if (!session || !u || u.customer_id !== session.customer_id || u.status !== 'under_review' || u.source === 'office') return;
    await db.transaction('rw', db.customer_uploads, db.customer_upload_files, async () => {
      await db.customer_uploads.delete(id);
      await db.customer_upload_files.delete(id);
    });
    changed();
  },
};
