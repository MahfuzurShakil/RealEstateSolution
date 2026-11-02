/**
 * Customer Portal for customers of type Investor (PROJECT-SHARE-SALE-PLAN.md).
 *
 * Pure types and rules only: what a share holding is, how an installment's
 * status and late fee are worked out, how a payment (full or part) is applied
 * to the schedule, and how a portfolio is summed. The data comes from the
 * admin Share Sale tables through the whitelisting repository in
 * src/lib/repositories/investor/investor.repository.ts.
 */

import type { CustomerUploadKind } from '@/lib/db/types';
import { localDay } from '@/lib/utils/format';
import { SHARE_DOC_KINDS, SHARE_DOC_META } from './share-documents';

export type CustomerType = 'investor' | 'buyer';
export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = { investor: 'Investor', buyer: 'Buyer' };

/** "Buyer & Investor" for someone holding both (BUYER-PORTAL-PLAN.md §10, F4). */
export function customerTypeLabel(roles: CustomerType[]): string {
  const order: CustomerType[] = ['buyer', 'investor'];
  return order.filter((r) => roles.includes(r)).map((r) => CUSTOMER_TYPE_LABEL[r]).join(' & ') || CUSTOMER_TYPE_LABEL.investor;
}

export type PaymentFrequency = 'monthly' | 'quarterly';
export const FREQUENCY_LABEL: Record<PaymentFrequency, string> = { monthly: 'Monthly', quarterly: 'Quarterly' };

/** Stored lifecycle of a holding (plan §6). "Overdue" is not stored: it is read off the schedule. */
export type HoldingStatus = 'paying' | 'fully_paid' | 'confirmed';

export type PaymentMethod = 'bkash' | 'nagad' | 'rocket' | 'card' | 'internet_banking' | 'bank_transfer' | 'cheque' | 'cash';
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  card: 'Card',
  internet_banking: 'Internet banking',
  bank_transfer: 'Bank deposit',
  cheque: 'Cheque',
  cash: 'Cash at office',
};

export interface InvestorCustomer {
  code: string;
  customer_type: CustomerType;
  full_name: string;
  /** "daughter of …" / "wife of …", as the agreement names the customer */
  father_or_spouse_name: string | null;
  email: string | null;
  phone: string;
  /** null where the office has not recorded it yet */
  nid_masked: string | null;
  tin_masked: string | null;
  date_of_birth: string | null;
  address: string | null;
  kyc_verified_on: string | null;
  joined_on: string;
  nominee: { name: string; relation: string | null; phone: string | null; share_pct: number } | null;
  bank: { bank_name: string; branch: string | null; account_masked: string | null } | null;
}

export interface InvestorProject {
  code: string;
  name: string;
  category: string;
  location: string;
  image: string;
  summary: string;
  /** latest valuation of 100% of the project */
  valuation: number;
  valuation_date: string;
  construction_progress_pct: number;
}

export interface ShareRound {
  code: string;
  project_code: string;
  round_no: number;
  valuation: number;
  offered_pct: number;
  total_shares: number;
  /** ownership one share carries, in % */
  share_pct: number;
  price_per_share: number;
  shares_available: number;
  opens_on: string;
  closes_on: string;
  is_open: boolean;
  /** what one customer may buy in this round */
  min_shares: number;
  max_shares: number;
  /** the least down payment the round accepts, in % of the price */
  down_payment_pct: number;
  /** the longest installment plan the round offers */
  max_installments: number;
  frequency: PaymentFrequency;
  /** late fee: this % of an installment once it is more than `grace_days` late */
  late_fee_pct: number;
  grace_days: number;
}

export interface ShareHolding {
  code: string;
  project_code: string;
  round_code: string;
  agreement_no: string;
  agreement_date: string;
  shares: number;
  share_pct: number;
  price_per_share: number;
  total_price: number;
  down_payment: number;
  installment_count: number;
  frequency: PaymentFrequency;
  status: HoldingStatus;
  certificate_no: string | null;
  /**
   * BUYER-PORTAL-PLAN.md §5 — a flat or plot booking is a holding too, with
   * the same schedule, payments and checkout. Share fields are 0 on a home.
   */
  kind?: 'share' | 'home';
  home?: HomeInfo | null;
  /** a home's late fee comes from its agreement, not a share round */
  fee_rule?: LateFeeRule | null;
  /** how the agreement was signed and witnessed; witness ID numbers stay with the office */
  signing?: {
    place: string;
    company_signatory: string;
    company_signatory_title: string | null;
    witnesses: string[];
    stamp_value: number | null;
    notarized_on: string | null;
  } | null;
}

/** What a buyer sees of their flat or plot: the unit, the agreement and how far handover has come. */
export interface HomeInfo {
  unit_code: string;
  /** "Flat · Tower A, 7th floor · 1,450 sft" */
  unit_label: string;
  booking_date: string;
  booking_amount: number;
  /** "Installments" / "Full payment" / null before the agreement */
  payment_plan: string | null;
  handover_date: string | null;
  fully_paid_on: string | null;
  /** keys, deed, mutation — each with the day it was done */
  delivery: { label: string; done_on: string | null }[];
  /** a booking still waiting for its booking money */
  on_hold: boolean;
}

export interface Installment {
  /** `${holding_code}-${seq}` */
  id: string;
  holding_code: string;
  /** a home's rows carry their own name ("Booking money", "Installment 3 of 24") */
  label?: string;
  /** 0 = down payment */
  seq: number;
  due_date: string;
  amount: number;
}

/** How much of one payment went to one installment. */
export interface PaymentAllocation {
  installment_id: string;
  principal: number;
  late_fee: number;
}

export interface PaymentRecord {
  receipt_no: string;
  holding_code: string;
  allocations: PaymentAllocation[];
  principal: number;
  late_fee: number;
  total: number;
  method: PaymentMethod;
  /** "bKash 01711•••344", "Visa •••• 4242", "BRAC Bank" */
  method_detail: string;
  channel: 'online' | 'office';
  /** the provider's transaction ID, or the office's deposit slip number */
  reference: string;
  paid_at: string;
}

export interface CustomerDocument {
  id: string;
  holding_code: string;
  kind: 'agreement' | 'deed' | 'schedule' | 'certificate';
  title: string;
  issued_on: string | null;
  /** a certificate not issued yet is listed, locked, so the customer knows it is coming */
  available: boolean;
}

export type ShareRequestStatus = 'new' | 'contacted' | 'reserved' | 'declined' | 'withdrawn';

/** A customer's request to buy shares in an open round; the office follows up with the agreement. */
export interface ShareRequest {
  id: string;
  round_code: string;
  shares: number;
  installments: number;
  note: string;
  requested_at: string;
  status: ShareRequestStatus;
  /** what the office said, when it declined or got in touch */
  office_note: string | null;
}

export type UploadKind = CustomerUploadKind;
export const UPLOAD_KIND_LABEL = Object.fromEntries(SHARE_DOC_KINDS.map((k) => [k, SHARE_DOC_META[k].label])) as Record<UploadKind, string>;
/** The largest file a customer may upload. */
export const UPLOAD_MAX_MB = 10;
export const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

/** A file the customer sent us against one investment. The office reviews it. */
export interface CustomerUpload {
  id: string;
  /** null for the customer's own papers (NID, photo …), which serve every investment */
  holding_code: string | null;
  /** sent by the customer, or put on file by the office (signed papers, scans) */
  source: 'customer' | 'office';
  kind: UploadKind;
  title: string;
  note: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
  status: 'under_review' | 'accepted' | 'rejected';
  /** why the office turned it down */
  review_note: string | null;
}

/** Everything the portal reads for one signed-in customer. */
export interface InvestorSnapshot {
  today: string;
  customer: InvestorCustomer;
  /** BUYER-PORTAL-PLAN.md §5 — what the customer holds: homes, shares or both */
  roles: CustomerType[];
  projects: InvestorProject[];
  rounds: ShareRound[];
  holdings: ShareHolding[];
  installments: Installment[];
  payments: PaymentRecord[];
  documents: CustomerDocument[];
  read_notification_ids: string[];
  share_requests: ShareRequest[];
  uploads: CustomerUpload[];
}

/* ------------------------------------------------------------------ rules */

/**
 * Late fee: a % of the installment once it is more than the grace days late
 * (plan §7). Each offering sets its own; these are the plan's defaults.
 */
export interface LateFeeRule {
  late_fee_pct: number;
  grace_days: number;
}
export const DEFAULT_FEE_RULE: LateFeeRule = { late_fee_pct: 2, grace_days: 7 };
/** An unpaid installment falling due within this many days shows as "Due". */
export const DUE_WINDOW_DAYS = 30;
/** The smallest part payment the gateway accepts. */
export const MIN_PART_PAYMENT = 5_000;

export type InstallmentStatus = 'paid' | 'overdue' | 'due' | 'upcoming';
export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  paid: 'Paid',
  overdue: 'Overdue',
  due: 'Due',
  upcoming: 'Upcoming',
};

export function installmentLabel(seq: number): string {
  return seq === 0 ? 'Down payment' : `Installment ${seq}`;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function lateFeeFor(amount: number, daysLate: number, rule: LateFeeRule = DEFAULT_FEE_RULE): number {
  return daysLate > rule.grace_days ? Math.round((amount * rule.late_fee_pct) / 100) : 0;
}

export interface InstallmentView extends Installment {
  label: string;
  /** read off what is still unpaid: an installment part-paid after its due date is still "overdue" */
  status: InstallmentStatus;
  paid_amount: number;
  remaining: number;
  /** some paid, some still owing */
  partial: boolean;
  days_late: number;
  late_fee_paid: number;
  /** late fee still owing (charged once, on the full installment, after the grace days) */
  late_fee_due: number;
  payments: PaymentRecord[];
}

export function viewInstallments(installments: Installment[], payments: PaymentRecord[], today: string, rule: LateFeeRule = DEFAULT_FEE_RULE): InstallmentView[] {
  return installments
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((inst) => {
      const touching = payments.filter((p) => p.allocations.some((a) => a.installment_id === inst.id));
      const allocs = touching.flatMap((p) => p.allocations.filter((a) => a.installment_id === inst.id));
      const paidAmount = Math.min(inst.amount, allocs.reduce((t, a) => t + a.principal, 0));
      const feePaid = allocs.reduce((t, a) => t + a.late_fee, 0);
      const remaining = inst.amount - paidAmount;
      const days = daysBetween(inst.due_date, today);
      let status: InstallmentStatus;
      if (remaining <= 0) status = 'paid';
      else if (days > 0) status = 'overdue';
      else if (-days <= DUE_WINDOW_DAYS) status = 'due';
      else status = 'upcoming';
      const daysLate = status === 'overdue' ? days : 0;
      const feeCharged = status === 'overdue' ? lateFeeFor(inst.amount, daysLate, rule) : feePaid;
      return {
        ...inst,
        label: inst.label ?? installmentLabel(inst.seq),
        status,
        paid_amount: paidAmount,
        remaining,
        partial: paidAmount > 0 && remaining > 0,
        days_late: daysLate,
        late_fee_paid: feePaid,
        late_fee_due: Math.max(0, feeCharged - feePaid),
        payments: touching.sort((a, b) => a.paid_at.localeCompare(b.paid_at)),
      };
    });
}

export type HoldingHealth = 'overdue' | 'on_track' | 'fully_paid';
export const HOLDING_HEALTH_LABEL: Record<HoldingHealth, string> = {
  overdue: 'Payment overdue',
  on_track: 'On track',
  fully_paid: 'Fully paid',
};

export interface HoldingView {
  holding: ShareHolding;
  project: InvestorProject;
  round: ShareRound;
  schedule: InstallmentView[];
  payments: PaymentRecord[];
  documents: CustomerDocument[];
  paid: number;
  outstanding: number;
  overdue_amount: number;
  late_fees: number;
  /** what brings the account up to date today: overdue amounts plus late fees */
  due_now: number;
  next: InstallmentView | null;
  paid_count: number;
  progress_pct: number;
  /** ownership valued at the project's latest valuation */
  current_value: number;
  health: HoldingHealth;
}

/** A home has no share round; its plan and late fee stand in for one. */
function homeRound(h: ShareHolding): ShareRound {
  return {
    code: '',
    project_code: h.project_code,
    round_no: 0,
    valuation: 0,
    offered_pct: 0,
    total_shares: 0,
    share_pct: 0,
    price_per_share: 0,
    shares_available: 0,
    opens_on: h.agreement_date,
    closes_on: h.agreement_date,
    is_open: false,
    min_shares: 0,
    max_shares: 0,
    down_payment_pct: 0,
    max_installments: h.installment_count,
    frequency: 'monthly',
    late_fee_pct: h.fee_rule?.late_fee_pct ?? 0,
    grace_days: h.fee_rule?.grace_days ?? 0,
  };
}

export const isHome = (h: ShareHolding) => h.kind === 'home';

/** "Unit D-7A" or "40 shares": what a holding is, in a word, beside its code. */
export function holdingTag(h: ShareHolding): string {
  return isHome(h) ? `Unit ${h.home?.unit_code ?? '—'}` : `${h.shares} shares`;
}

/** Where a holding's own page is: My homes or My investments. */
export function holdingHref(h: ShareHolding): string {
  return isHome(h) ? `/customer/homes/${h.code}` : `/customer/investments/${h.code}`;
}

export function viewHolding(s: InvestorSnapshot, holding: ShareHolding): HoldingView {
  const project = s.projects.find((p) => p.code === holding.project_code)!;
  const round = isHome(holding) ? homeRound(holding) : s.rounds.find((r) => r.code === holding.round_code)!;
  const payments = s.payments.filter((p) => p.holding_code === holding.code).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  const schedule = viewInstallments(
    s.installments.filter((i) => i.holding_code === holding.code),
    payments,
    s.today,
    round,
  );
  const sum = (rows: InstallmentView[], pick: (r: InstallmentView) => number) => rows.reduce((t, r) => t + pick(r), 0);
  const overdueRows = schedule.filter((r) => r.status === 'overdue');
  const paid = sum(schedule, (r) => r.paid_amount);
  const lateFees = sum(schedule, (r) => r.late_fee_due);
  const overdue = sum(overdueRows, (r) => r.remaining);
  const allPaid = schedule.every((r) => r.status === 'paid');
  return {
    holding,
    project,
    round,
    schedule,
    payments,
    documents: s.documents.filter((d) => d.holding_code === holding.code),
    paid,
    outstanding: holding.total_price - paid,
    overdue_amount: overdue,
    late_fees: lateFees,
    due_now: overdue + lateFees,
    next: schedule.find((r) => r.status !== 'paid') ?? null,
    paid_count: schedule.filter((r) => r.status === 'paid').length,
    progress_pct: holding.total_price ? Math.round((paid / holding.total_price) * 100) : 0,
    // a home is worth its price here; a share follows the project's valuation
    current_value: isHome(holding) ? holding.total_price : Math.round((project.valuation * holding.share_pct) / 100),
    health: allPaid ? 'fully_paid' : overdueRows.length ? 'overdue' : 'on_track',
  };
}

/* --------------------------------------------------------------- paying */

/**
 * Applies an amount to a holding's schedule the way lenders and developers
 * do: oldest installment first, and on each installment its late fee before
 * the installment itself. Whatever is left over goes to the next one, so a
 * part payment simply leaves the rest of that installment owing.
 */
export function allocatePayment(view: HoldingView, amount: number): PaymentAllocation[] {
  let left = Math.round(amount);
  const out: PaymentAllocation[] = [];
  for (const i of view.schedule) {
    if (left <= 0) break;
    if (i.status === 'paid' && i.late_fee_due === 0) continue;
    const fee = Math.min(left, i.late_fee_due);
    left -= fee;
    const principal = Math.min(left, i.remaining);
    left -= principal;
    if (fee || principal) out.push({ installment_id: i.id, principal, late_fee: fee });
  }
  return out;
}

/** The most a customer can pay on a holding: everything still owing, late fees included. */
export function maxPayable(view: HoldingView): number {
  return view.outstanding + view.late_fees;
}

export type AmountOption = 'due_now' | 'next' | 'full' | 'custom';

export interface AmountChoice {
  id: AmountOption;
  title: string;
  hint: string;
  amount: number;
}

/** The amounts offered on "Make a payment", worked out from the schedule. */
export function amountChoices(view: HoldingView): AmountChoice[] {
  const open = view.schedule.filter((i) => i.status !== 'paid');
  const owing = (i: InstallmentView) => i.remaining + i.late_fee_due;
  const out: AmountChoice[] = [];
  if (view.due_now > 0) {
    const n = open.filter((i) => i.status === 'overdue').length;
    out.push({
      id: 'due_now',
      title: 'Amount due now',
      hint: `${n} overdue installment${n > 1 ? 's' : ''}${view.late_fees ? ' and late fee' : ''} — brings your account up to date`,
      amount: view.due_now,
    });
  }
  const firstNotLate = open.find((i) => i.status !== 'overdue');
  if (firstNotLate) {
    const amount = view.due_now + owing(firstNotLate);
    out.push({
      id: 'next',
      title: view.due_now > 0 ? 'Due now + next installment' : 'Next installment',
      hint: `Covers ${firstNotLate.label.toLowerCase()}${firstNotLate.partial ? ' (balance)' : ''}, due ${formatDay(firstNotLate.due_date)}`,
      amount,
    });
  }
  if (open.length > 1 || !out.length) {
    out.push({ id: 'full', title: 'Full outstanding balance', hint: isHome(view.holding) ? 'Pays off your home in one go' : 'Pays off this investment in one go', amount: maxPayable(view) });
  }
  out.push({ id: 'custom', title: 'Other amount', hint: `Any amount from ${formatTaka(Math.min(MIN_PART_PAYMENT, maxPayable(view)))}`, amount: 0 });
  return out;
}

/* ------------------------------------------------------------ what is due */

export type DueState = 'overdue' | 'due' | 'upcoming' | 'paid';
export const DUE_STATE_LABEL: Record<DueState, string> = {
  overdue: 'Overdue',
  due: 'Due soon',
  upcoming: 'On schedule',
  paid: 'Fully paid',
};

/** One investment on the "Make a payment" landing grid: what is late, what is next. */
export interface PaymentDueRow {
  view: HoldingView;
  state: DueState;
  overdue_count: number;
  /** overdue principal, without late fees */
  overdue_amount: number;
  late_fee: number;
  /** overdue principal plus late fees: what brings the account up to date */
  due_now: number;
  /** the oldest unpaid installment that is late */
  oldest_overdue: InstallmentView | null;
  /** the first unpaid installment that is not late yet */
  next: InstallmentView | null;
  /** days the oldest overdue installment is late; days until `next` when nothing is late */
  days: number;
  paid_count: number;
  total_count: number;
  /** what the Pay button asks for: everything overdue, or else the next installment */
  pay_amount: number;
}

export function paymentDueRow(view: HoldingView, today: string): PaymentDueRow {
  const open = view.schedule.filter((i) => i.status !== 'paid');
  const late = open.filter((i) => i.status === 'overdue');
  const next = open.find((i) => i.status !== 'overdue') ?? null;
  const state: DueState = !open.length ? 'paid' : late.length ? 'overdue' : next?.status === 'due' ? 'due' : 'upcoming';
  const oldest = late[0] ?? null;
  return {
    view,
    state,
    overdue_count: late.length,
    overdue_amount: view.overdue_amount,
    late_fee: view.late_fees,
    due_now: view.due_now,
    oldest_overdue: oldest,
    next,
    days: oldest ? oldest.days_late : next ? daysBetween(today, next.due_date) : 0,
    paid_count: view.paid_count,
    total_count: view.schedule.length,
    pay_amount: view.due_now > 0 ? view.due_now : next ? next.remaining + next.late_fee_due : 0,
  };
}

/** Overdue first (longest late at the top), then by the next due date; fully paid last. */
export function paymentDueRows(portfolio: PortfolioView, today: string): PaymentDueRow[] {
  const rank: Record<DueState, number> = { overdue: 0, due: 1, upcoming: 2, paid: 3 };
  return portfolio.holdings
    .map((v) => paymentDueRow(v, today))
    .sort((a, b) => rank[a.state] - rank[b.state] || (a.state === 'overdue' ? b.days - a.days : a.days - b.days));
}

/* --------------------------------------------------------------- portfolio */

export interface PortfolioView {
  holdings: HoldingView[];
  total_invested: number;
  current_value: number;
  paid: number;
  outstanding: number;
  due_now: number;
  overdue_count: number;
  /** the next unpaid installment across every holding */
  next: { view: HoldingView; installment: InstallmentView } | null;
  open_rounds: { round: ShareRound; project: InvestorProject }[];
  /** BUYER-PORTAL-PLAN.md §5 — the same holdings, split by kind */
  homes: HoldingView[];
  shares: HoldingView[];
}

export function viewPortfolio(s: InvestorSnapshot): PortfolioView {
  const holdings = s.holdings.map((h) => viewHolding(s, h));
  const total = (pick: (v: HoldingView) => number) => holdings.reduce((t, v) => t + pick(v), 0);
  const upcoming = holdings
    .flatMap((view) => view.schedule.filter((i) => i.status !== 'paid').map((installment) => ({ view, installment })))
    .sort((a, b) => a.installment.due_date.localeCompare(b.installment.due_date));
  return {
    holdings,
    total_invested: total((v) => v.holding.total_price),
    current_value: total((v) => v.current_value),
    paid: total((v) => v.paid),
    outstanding: total((v) => v.outstanding),
    due_now: total((v) => v.due_now),
    overdue_count: holdings.reduce((t, v) => t + v.schedule.filter((i) => i.status === 'overdue').length, 0),
    next: upcoming[0] ?? null,
    open_rounds: s.rounds
      .filter((r) => r.is_open)
      .map((round) => ({ round, project: s.projects.find((p) => p.code === round.project_code)! })),
    homes: holdings.filter((v) => isHome(v.holding)),
    shares: holdings.filter((v) => !isHome(v.holding)),
  };
}

/** "Installment 4" or "Installment 4 (part)" — what one allocation paid for. */
export function allocationLabel(view: HoldingView | undefined, a: PaymentAllocation): string {
  const inst = view?.schedule.find((i) => i.id === a.installment_id);
  const label = inst?.label ?? installmentLabel(Number(a.installment_id.split('-').pop()));
  if (a.principal === 0 && a.late_fee > 0) return `${label} late fee`;
  return inst && a.principal < inst.amount ? `${label} (part)` : label;
}

/* ---------------------------------------------------------- notifications */

export type NotificationKind = 'overdue' | 'reminder' | 'payment' | 'offering' | 'update';

export interface PortalNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  date: string;
  href: string;
}

/** Built from the schedule, so a reminder disappears the moment it is paid. */
export function buildNotifications(s: InvestorSnapshot, portfolio: PortfolioView): PortalNotification[] {
  const out: PortalNotification[] = [];
  for (const v of portfolio.holdings) {
    for (const i of v.schedule) {
      const pay = `/customer/payments/checkout?holding=${v.holding.code}`;
      if (i.status === 'overdue') {
        out.push({
          id: `overdue-${i.id}-${i.remaining}`,
          kind: 'overdue',
          title: `${i.label} is overdue`,
          body: `${formatTaka(i.remaining)}${i.partial ? ' still owing' : ''} for ${v.project.name} was due on ${formatDay(i.due_date)}.${
            i.late_fee_due ? ` A late fee of ${formatTaka(i.late_fee_due)} has been added.` : v.round.late_fee_pct ? ` Please pay within ${v.round.grace_days} days of the due date to avoid a late fee.` : ''
          }`,
          date: s.today,
          href: pay,
        });
      } else if (i.status === 'due') {
        out.push({
          id: `due-${i.id}-${i.remaining}`,
          kind: 'reminder',
          title: `${i.label} due on ${formatDay(i.due_date)}`,
          body: `${formatTaka(i.remaining)}${i.partial ? ' balance' : ''} for ${v.project.name}.`,
          date: s.today,
          href: pay,
        });
      }
    }
  }
  for (const p of s.payments.slice().sort((a, b) => b.paid_at.localeCompare(a.paid_at)).slice(0, 4)) {
    const project = portfolio.holdings.find((v) => v.holding.code === p.holding_code)?.project;
    out.push({
      id: `paid-${p.receipt_no}`,
      kind: 'payment',
      title: 'Payment received',
      body: `${formatTaka(p.total)} for ${project?.name ?? p.holding_code} by ${p.method_detail}. Receipt ${p.receipt_no}.`,
      date: localDay(p.paid_at),
      href: `/customer/receipts/${p.receipt_no}`,
    });
  }
  for (const { round, project } of portfolio.open_rounds) {
    out.push({
      id: `round-${round.code}`,
      kind: 'offering',
      title: `${project.name}: Round ${round.round_no} is open`,
      body: `${round.shares_available} shares available at ${formatTaka(round.price_per_share)} each, until ${formatDay(round.closes_on)}.`,
      date: round.opens_on,
      href: '/customer#opportunities',
    });
  }
  for (const v of portfolio.holdings.filter((h) => h.project.construction_progress_pct < 100)) {
    out.push({
      id: `progress-${v.project.code}-${v.project.construction_progress_pct}`,
      kind: 'update',
      title: `${v.project.name}: construction update`,
      body: `Work has reached ${v.project.construction_progress_pct}% completion.`,
      date: v.project.valuation_date,
      href: holdingHref(v.holding),
    });
  }
  const rank: Record<NotificationKind, number> = { overdue: 0, reminder: 1, payment: 2, offering: 3, update: 4 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.date.localeCompare(a.date));
}

/* ------------------------------------------------------------- formatting */

/** "৳ 2,04,000" — full amount, lakh grouping, the way the agreement writes it. */
export function formatTaka(amount: number): string {
  return `৳ ${Math.round(amount).toLocaleString('en-IN')}`;
}

/** "05 Feb 2027" */
export function formatDay(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date.length === 10 ? `${date}T00:00:00` : date);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatPct(pct: number): string {
  return `${Number(pct.toFixed(3))}%`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}
function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? belowHundred(r) : ''].filter(Boolean).join(' ');
}

/** "Taka Two Lakh Four Thousand Only" — receipts state the amount in words (crore / lakh system). */
export function takaInWords(amount: number): string {
  let n = Math.round(amount);
  if (n === 0) return 'Taka Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 1000 ? belowThousand(Math.floor(crore / 1000)) + ' Thousand ' : ''}${belowThousand(crore % 1000)} Crore`.trim());
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return `Taka ${parts.join(' ')} Only`;
}
