import {
  allocatePayment,
  maxPayable,
  viewHolding,
  type AmountOption,
  type InvestorSnapshot,
  type PaymentAllocation,
  type PaymentMethod,
  type PaymentRecord,
} from '@/lib/domain/investor-portal';
import { todayLocal } from '@/lib/utils/format';
import { buildDemoData, demoReference, DEMO_LOGIN } from './investor-demo.data';

/*
 * Customer Portal repository — MOCK (PROJECT-SHARE-SALE-PLAN.md, demo build).
 *
 * The portal reads and writes only through this object, the same rule the
 * rest of the app follows for Dexie. Today it serves fixed demo data and keeps
 * what the visitor does (sign-in, payments, read notifications) in this
 * browser's localStorage. When the admin module exists, this file is replaced
 * by one that reads the real tables and talks to the real gateway; the pages
 * do not change.
 */

const STATE_KEY = 'customer-portal.demo.v2';
const SESSION_KEY = 'customer-portal.session.v1';
const SESSION_HOURS = 12;
/** how long the gateway keeps a checkout open, as real gateways do */
export const CHECKOUT_MINUTES = 15;
export const CUSTOMER_PORTAL_CHANGED = 'customer-portal:changed';

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

interface StoredState {
  payments: PaymentRecord[];
  intents: PaymentIntent[];
  read: string[];
  interests: string[];
  receipt_seq: number;
}

interface Session {
  customer_code: string;
  signed_in_at: string;
  expires_at: string;
}

const EMPTY: StoredState = { payments: [], intents: [], read: [], interests: [], receipt_seq: 20480 };

const FAILURE: Record<Exclude<GatewayOutcome, 'success'>, string> = {
  declined: 'Your bank or wallet declined the payment. No money has been taken from your account.',
  insufficient_funds: 'There was not enough balance in the account to complete the payment. No money has been taken.',
  cancelled: 'You cancelled the payment on the gateway. No money has been taken.',
};

function load(): StoredState {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function save(state: StoredState) {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* private mode: the demo still works for this page view */
  }
  window.dispatchEvent(new Event(CUSTOMER_PORTAL_CHANGED));
}

const normalise = (id: string) => id.trim().toLowerCase().replace(/[\s-]/g, '').replace(/^\+?88(?=01)/, '');

/** a short pause so buttons show their busy state the way a real network call would */
const latency = (ms = 450) => new Promise((r) => setTimeout(r, ms));

/** "INV-20261101-7KQ2M9" */
function orderId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `INV-${ymd}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

export const investorRepository = {
  demoLogin: DEMO_LOGIN,

  /** Step 1 of sign-in. Only customers the office has created can sign in. */
  async requestCode(identifier: string): Promise<{ ok: true; sent_to: string } | { ok: false; error: string }> {
    await latency();
    const id = normalise(identifier);
    if (id === DEMO_LOGIN.phone) return { ok: true, sent_to: `SMS to ${DEMO_LOGIN.phone.slice(0, 3)}•••••${DEMO_LOGIN.phone.slice(-3)}` };
    if (id === DEMO_LOGIN.email) return { ok: true, sent_to: `email to f•••••@example.com` };
    return {
      ok: false,
      error: 'We could not find a customer account with these details. Accounts are opened by our office once your share agreement is signed.',
    };
  },

  /** Step 2 of sign-in. */
  async verifyCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
    await latency();
    if (code.trim() !== DEMO_LOGIN.otp) return { ok: false, error: 'That code is not correct. Please check and try again.' };
    const now = new Date();
    const session: Session = {
      customer_code: 'CUS-2026-0148',
      signed_in_at: now.toISOString(),
      expires_at: new Date(now.getTime() + SESSION_HOURS * 3_600_000).toISOString(),
    };
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
    return { ok: true };
  },

  session(): Session | null {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      const s = raw ? (JSON.parse(raw) as Session) : null;
      return s && s.expires_at > new Date().toISOString() ? s : null;
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

  async snapshot(): Promise<InvestorSnapshot> {
    const today = todayLocal();
    const demo = buildDemoData(today);
    const state = load();
    return {
      today,
      ...demo,
      payments: [...demo.payments, ...state.payments],
      read_notification_ids: state.read,
      interested_round_codes: state.interests,
    };
  },

  /**
   * Opens a checkout for an amount on one holding. The amount is re-checked
   * and re-allocated here against the live schedule, so what the page showed
   * can never over- or under-charge.
   */
  async createIntent(holdingCode: string, amount: number, option: AmountOption): Promise<PaymentIntent> {
    await latency(600);
    const snap = await this.snapshot();
    const holding = snap.holdings.find((h) => h.code === holdingCode);
    if (!holding) throw new Error('Unknown holding');
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
    const state = load();
    state.intents = [intent, ...state.intents].slice(0, 30);
    save(state);
    return intent;
  },

  async intent(id: string): Promise<PaymentIntent | null> {
    const state = load();
    const intent = state.intents.find((i) => i.id === id) ?? null;
    if (intent && intent.status === 'pending' && intent.expires_at < new Date().toISOString()) {
      intent.status = 'expired';
      intent.failure_reason = 'The payment session timed out before it was completed. No money has been taken.';
      save(state);
    }
    return intent;
  },

  /** What the payment gateway reports back to us (its server-to-server callback in the live build). */
  async completeIntent(id: string, method: PaymentMethod, methodDetail: string, outcome: GatewayOutcome): Promise<PaymentIntent | null> {
    await latency(1800);
    const state = load();
    const intent = state.intents.find((i) => i.id === id);
    if (!intent || intent.status !== 'pending') return intent ?? null;
    const now = new Date();
    intent.method = method;
    intent.method_detail = methodDetail;
    intent.completed_at = now.toISOString();
    if (outcome !== 'success') {
      intent.status = outcome === 'cancelled' ? 'cancelled' : 'failed';
      intent.failure_reason = FAILURE[outcome];
      save(state);
      return intent;
    }
    state.receipt_seq += 1;
    const receiptNo = `RCT-${now.getFullYear()}-${String(state.receipt_seq).padStart(5, '0')}`;
    const reference = demoReference(method, `${intent.id}${now.getTime()}`);
    state.payments.push({
      receipt_no: receiptNo,
      holding_code: intent.holding_code,
      allocations: intent.allocations,
      principal: intent.principal,
      late_fee: intent.late_fee,
      total: intent.total,
      method,
      method_detail: methodDetail,
      channel: 'online',
      reference,
      paid_at: now.toISOString(),
    });
    intent.status = 'paid';
    intent.reference = reference;
    intent.receipt_no = receiptNo;
    save(state);
    return intent;
  },

  markRead(ids: string[]) {
    const state = load();
    state.read = [...new Set([...state.read, ...ids])];
    save(state);
  },

  async registerInterest(roundCode: string) {
    await latency();
    const state = load();
    state.interests = [...new Set([...state.interests, roundCode])];
    save(state);
  },

  /** Puts the demo back to its starting point (keeps the visitor signed in). */
  resetDemo() {
    save({ ...EMPTY });
  },
};
