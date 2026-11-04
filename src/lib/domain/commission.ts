import type { BadgeTone } from '@/components/ui/Badge';
import type {
  CommissionBasis,
  CommissionLineStatus,
  CommissionPlan,
  CommissionPlanStatus,
  CommissionSaleKind,
  CommissionStage,
  CommissionTrigger,
  OrgMember,
  OrgMove,
} from '../db/types';
import { money } from './procurement';

/*
 * Sales organisation and staged commission (REVENUE-SHARE-PLAN.md §6–7).
 * Pure maths only: the repositories read the tree, the plans and the payment
 * ledgers, and hand them here.
 */

export const COMMISSION_BASIS_LABEL: Record<CommissionBasis, string> = {
  pct: '% of sale price',
  per_share: 'Taka per share',
  per_sale: 'Taka per unit / sale',
};

export const COMMISSION_TRIGGER_LABEL: Record<CommissionTrigger, string> = {
  agreement: 'Agreement signed / booking confirmed',
  down_payment: 'Down payment received',
  agreement_down_payment: 'Agreement + down payment',
  paid_pct: 'Paid at least X% of the price',
  fully_paid: 'Fully paid',
  handover: 'Handover / certificate issued',
};

export const COMMISSION_LINE_STATUS_META: Record<CommissionLineStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  earned: { label: 'Earned', tone: 'blue' },
  approved: { label: 'Approved', tone: 'teal' },
  paid: { label: 'Paid', tone: 'green' },
  void: { label: 'Void', tone: 'neutral' },
  recovered: { label: 'Recovered', tone: 'red' },
};

export const COMMISSION_PLAN_STATUS_META: Record<CommissionPlanStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Active', tone: 'green' },
  retired: { label: 'Retired', tone: 'amber' },
};

export const SALE_KIND_LABEL: Record<CommissionSaleKind, string> = { share: 'Share sale', booking: 'Booking' };

/* ------------------------------------------------------------------ *
 * The tree as it was on a date
 * ------------------------------------------------------------------ */

/**
 * Who a member reported to on `date`. The member's own `parent_id` is today's
 * answer; each move records the change and the day it took effect, so the
 * last move on or before the date wins, and before the first move the member
 * sat under that move's `from_parent_id`.
 */
export function parentOn(member: Pick<OrgMember, 'id' | 'parent_id'>, moves: OrgMove[], date: string): string | null {
  const mine = moves.filter((m) => m.member_id === member.id).sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.created_at.localeCompare(b.created_at));
  if (mine.length === 0) return member.parent_id;
  const before = mine.filter((m) => m.effective_date <= date);
  if (before.length > 0) return before[before.length - 1].to_parent_id;
  return mine[0].from_parent_id;
}

/** The seller and everyone above them on `date`, nearest first. Stops on a loop. */
export function chainOn(sellerId: string, members: OrgMember[], moves: OrgMove[], date: string): OrgMember[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const chain: OrgMember[] = [];
  const seen = new Set<string>();
  let at = byId.get(sellerId);
  while (at && !seen.has(at.id)) {
    chain.push(at);
    seen.add(at.id);
    const up = parentOn(at, moves, date);
    at = up ? byId.get(up) : undefined;
  }
  return chain;
}

/** Was the member part of the organisation on that day? */
export function activeOn(member: Pick<OrgMember, 'joined_on' | 'left_on'>, date: string): boolean {
  return member.joined_on <= date && (!member.left_on || member.left_on > date);
}

/** Members under `rootId` (not including it), by today's tree. */
export function descendantsOf(rootId: string, members: Pick<OrgMember, 'id' | 'parent_id'>[]): string[] {
  const kids = new Map<string, string[]>();
  for (const m of members) if (m.parent_id) kids.set(m.parent_id, [...(kids.get(m.parent_id) ?? []), m.id]);
  const out: string[] = [];
  const stack = [...(kids.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.includes(id) || id === rootId) continue;
    out.push(id);
    stack.push(...(kids.get(id) ?? []));
  }
  return out;
}

/** Moving `memberId` under `newParentId` would put it under itself. */
export function wouldLoop(memberId: string, newParentId: string | null, members: Pick<OrgMember, 'id' | 'parent_id'>[]): boolean {
  if (!newParentId) return false;
  return newParentId === memberId || descendantsOf(memberId, members).includes(newParentId);
}

/* ------------------------------------------------------------------ *
 * Plans
 * ------------------------------------------------------------------ */

export interface SaleForPlan {
  kind: CommissionSaleKind;
  project_id: string | null;
  offering_id?: string | null;
  date: string;
}

/**
 * The plan in force for a sale: active, of its kind, dated over the sale day,
 * and the most specific one — an offering's plan before the project's, the
 * project's before the all-projects default. Ties go to the latest start.
 */
export function planForSale(plans: CommissionPlan[], sale: SaleForPlan): CommissionPlan | null {
  const kind = sale.kind === 'share' ? 'share_sale' : 'booking';
  const fits = plans.filter((p) => {
    if (p.status !== 'active' || p.applies_to !== kind) return false;
    if (p.effective_from > sale.date || (p.effective_to && p.effective_to < sale.date)) return false;
    if (p.project_id && p.project_id !== sale.project_id) return false;
    if (p.offering_id && p.offering_id !== sale.offering_id) return false;
    return true;
  });
  const rank = (p: CommissionPlan) => (p.offering_id ? 2 : p.project_id ? 1 : 0);
  return fits.sort((a, b) => rank(b) - rank(a) || b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

/** What is wrong with a plan, or null. */
export function planProblem(p: Pick<CommissionPlan, 'name' | 'seller_value' | 'stages' | 'overrides' | 'effective_from' | 'effective_to'>): string | null {
  if (!p.name.trim()) return 'Give the plan a name.';
  if (!(p.seller_value > 0)) return 'Enter what the seller earns.';
  if (!p.effective_from) return 'Enter the date the plan starts.';
  if (p.effective_to && p.effective_to < p.effective_from) return 'The plan cannot end before it starts.';
  if (p.stages.length === 0) return 'Add at least one release stage.';
  for (const s of p.stages) {
    if (!s.label.trim()) return 'Every stage needs a name.';
    if (s.trigger === 'paid_pct' && !(Number(s.threshold_pct) > 0 && Number(s.threshold_pct) <= 100)) return `"${s.label}" needs the % of the price paid (1–100).`;
    if (!(s.release_value >= 0)) return `"${s.label}" cannot release a negative amount.`;
  }
  if (p.stages.every((s) => s.release_type === 'pct')) {
    const sum = p.stages.reduce((t, s) => t + s.release_value, 0);
    if (Math.abs(sum - 100) > 0.001) return `The stages release ${Math.round(sum * 100) / 100}% in all; they must add up to 100%.`;
  }
  const seen = new Set<string>();
  for (const o of p.overrides) {
    if (seen.has(o.designation_id)) return 'A designation is listed twice in the overrides.';
    seen.add(o.designation_id);
    if (!(o.value > 0)) return 'Every override needs an amount above 0.';
  }
  return null;
}

/** One person's whole commission on a sale. */
export function personTotal(basis: CommissionBasis, value: number, sale: { amount: number; units: number }): number {
  if (basis === 'pct') return money((sale.amount * value) / 100);
  if (basis === 'per_share') return money(value * sale.units);
  return money(value);
}

/**
 * Splits a person's total over the stages. A `pct` stage takes that % of the
 * total; a `fixed` stage takes its taka as a share of the seller's total (per
 * share when the seller earns per share), so uplines release in the same
 * proportions. The last stage always takes whatever is left, so the parts add
 * back up to the total to the paisa.
 */
export function stageAmounts(total: number, stages: CommissionStage[], ref: { sellerTotal: number; units: number; perShare: boolean }): number[] {
  const out: number[] = [];
  let given = 0;
  stages.forEach((s, i) => {
    if (i === stages.length - 1) {
      out.push(money(Math.max(0, total - given)));
      return;
    }
    const fraction =
      s.release_type === 'pct'
        ? s.release_value / 100
        : ref.sellerTotal > 0
          ? (s.release_value * (ref.perShare ? ref.units : 1)) / ref.sellerTotal
          : 0;
    const part = money(Math.min(Math.max(0, total * fraction), total - given));
    out.push(part);
    given = money(given + part);
  });
  return out;
}

export interface LineDraft {
  member_id: string;
  role: 'seller' | 'override';
  designation_at_sale: string;
  level: number;
  stage_key: string;
  stage_label: string;
  stage_seq: number;
  amount: number;
}

/**
 * Every line one sale creates: the seller's, then each upline whose
 * designation has an override in the plan, one per stage. Uplines who were
 * not in the organisation on the sale day earn nothing.
 */
export function buildLines(
  plan: Pick<CommissionPlan, 'seller_basis' | 'seller_value' | 'stages' | 'overrides'>,
  chain: OrgMember[],
  sale: { amount: number; units: number; date: string },
  designationLabel: (id: string) => string,
): LineDraft[] {
  if (chain.length === 0) return [];
  const sellerTotal = personTotal(plan.seller_basis, plan.seller_value, sale);
  const ref = { sellerTotal, units: sale.units, perShare: plan.seller_basis === 'per_share' };
  const people: { member: OrgMember; role: 'seller' | 'override'; level: number; total: number }[] = [
    { member: chain[0], role: 'seller', level: 0, total: sellerTotal },
  ];
  chain.slice(1).forEach((m, i) => {
    if (!activeOn(m, sale.date)) return;
    const o = plan.overrides.find((x) => x.designation_id === m.designation_id);
    if (o) people.push({ member: m, role: 'override', level: i + 1, total: personTotal(o.basis, o.value, sale) });
  });
  return people.flatMap((p) =>
    stageAmounts(p.total, plan.stages, ref).map((amount, seq) => ({
      member_id: p.member.id,
      role: p.role,
      designation_at_sale: designationLabel(p.member.designation_id),
      level: p.level,
      stage_key: plan.stages[seq].key,
      stage_label: plan.stages[seq].label,
      stage_seq: seq,
      amount,
    })),
  );
}

/* ------------------------------------------------------------------ *
 * When a stage is reached
 * ------------------------------------------------------------------ */

/** What the payment ledger says about one sale, as the stages need it. */
export interface SaleProgress {
  price: number;
  /** the agreement date (share) or the day the booking was confirmed */
  agreement_on: string | null;
  /** what counts as the down payment: the share sale's down payment, the booking money */
  down_payment: number;
  /** principal paid, by date */
  payments: { date: string; amount: number }[];
  handover_on: string | null;
}

/** The first day cumulative principal reached `target`, or null. */
export function paidReachedOn(payments: SaleProgress['payments'], target: number): string | null {
  if (target <= 0) return payments.length ? [...payments].sort((a, b) => a.date.localeCompare(b.date))[0].date : null;
  let sum = 0;
  for (const p of [...payments].sort((a, b) => a.date.localeCompare(b.date))) {
    sum += p.amount;
    if (sum >= target - 0.5) return p.date;
  }
  return null;
}

const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : null);

/** The day a stage was reached, or null while it has not been. */
export function stageReachedOn(stage: Pick<CommissionStage, 'trigger' | 'threshold_pct'>, p: SaleProgress): string | null {
  switch (stage.trigger) {
    case 'agreement':
      return p.agreement_on;
    case 'down_payment':
      return paidReachedOn(p.payments, p.down_payment);
    case 'agreement_down_payment':
      return later(p.agreement_on, paidReachedOn(p.payments, p.down_payment));
    case 'paid_pct':
      return paidReachedOn(p.payments, (p.price * (Number(stage.threshold_pct) || 0)) / 100);
    case 'fully_paid':
      return paidReachedOn(p.payments, p.price);
    case 'handover':
      return p.handover_on;
  }
}

/* ------------------------------------------------------------------ *
 * Payouts
 * ------------------------------------------------------------------ */

/**
 * A member's payout: their approved lines, less paid commission on cancelled
 * sales still to take back (never more than the lines), less tax on the rest.
 */
export function payoutMath(linesTotal: number, toRecover: number, taxPct: number) {
  const recovered = money(Math.min(Math.max(0, toRecover), linesTotal));
  const base = money(linesTotal - recovered);
  const tax_withheld = money((base * Math.max(0, taxPct)) / 100);
  return { lines_total: money(linesTotal), recovered, tax_withheld, net: money(base - tax_withheld) };
}

/** Yearless display code: ORG-001, CMP-001. */
export function nextPlainCode(prefix: string, existing: string[]): string {
  const head = `${prefix}-`;
  const top = existing
    .filter((c) => c.startsWith(head))
    .reduce((acc, c) => Math.max(acc, Number.parseInt(c.slice(head.length), 10) || 0), 0);
  return `${head}${String(top + 1).padStart(3, '0')}`;
}
