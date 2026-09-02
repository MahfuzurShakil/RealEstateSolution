import type { BadgeTone } from '@/components/ui/Badge';
import type {
  GoodsReceiptItem,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  QualityCheck,
  SupplierPaymentMethod,
  SupplierType,
} from '@/lib/db/types';

/* ------------------------------------------------------------------ *
 * Money and quantity arithmetic
 * ------------------------------------------------------------------ *
 *
 * Section 0 says money is BDT decimal, not float. JavaScript has one numeric
 * type, so the guarantee is kept by rounding at every step instead of letting
 * binary error accumulate: 0.1 + 0.2 is 0.30000000000000004, and a weighted
 * average that folds a hundred receipts into one number drifts visibly. Every
 * amount this module writes to the database goes through `money()`, and every
 * quantity through `qty()`. Phase B stores them as NUMERIC(14,2)/(14,3) and
 * the same values survive the migration unchanged.
 */

/** BDT, two decimal places. */
export function money(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Material quantities — three decimals covers 0.125 ton and 1.5 cft. */
export function qty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

/* ------------------------------------------------------------------ *
 * Suppliers (Section 7.3)
 * ------------------------------------------------------------------ */

export const SUPPLIER_TYPE_META: Record<SupplierType, { label: string; tone: BadgeTone }> = {
  material_supplier: { label: 'Material Supplier', tone: 'teal' },
  contractor: { label: 'Contractor', tone: 'blue' },
  other: { label: 'Other', tone: 'neutral' },
};

/* ------------------------------------------------------------------ *
 * Purchase orders (Sections 7.4 / 7.5)
 * ------------------------------------------------------------------ */

export const PURCHASE_ORDER_STATUS_META: Record<
  PurchaseOrderStatus,
  { label: string; tone: BadgeTone }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  ordered: { label: 'Ordered', tone: 'amber' },
  partially_received: { label: 'Partially Received', tone: 'blue' },
  received: { label: 'Received', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

/** The happy path, for the step list on the status card. */
export const PURCHASE_ORDER_PIPELINE: PurchaseOrderStatus[] = [
  'draft',
  'ordered',
  'partially_received',
  'received',
];

/**
 * What a person may set by hand.
 *
 * `partially_received` and `received` are deliberately absent: Section 7.6
 * derives them from the goods receipts, and a dropdown that can disagree with
 * the GRNs ("Received" with nothing actually received) is the same class of
 * bug as a work item whose status disagrees with its percentage.
 */
export function allowedNextPoStatuses(current: PurchaseOrderStatus): PurchaseOrderStatus[] {
  switch (current) {
    case 'draft':
      return ['ordered', 'cancelled'];
    case 'ordered':
    case 'partially_received':
      return ['cancelled'];
    default:
      return [];
  }
}

/** A GRN can only be recorded against a live order that has been placed. */
export function canReceiveAgainst(status: PurchaseOrderStatus): boolean {
  return status === 'ordered' || status === 'partially_received';
}

export const QUALITY_CHECK_META: Record<QualityCheck, { label: string; tone: BadgeTone }> = {
  passed: { label: 'Passed', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  pending: { label: 'Pending', tone: 'amber' },
};

export const SUPPLIER_PAYMENT_METHOD_META: Record<SupplierPaymentMethod, string> = {
  cash: 'Cash',
  bank: 'Bank Transfer',
  mfs: 'bKash / Nagad',
  cheque: 'Cheque',
  online: 'Online',
};

export function lineTotal(item: Pick<PurchaseOrderItem, 'quantity_ordered' | 'unit_price'>): number {
  return money((Number(item.quantity_ordered) || 0) * (Number(item.unit_price) || 0));
}

export interface PoTotals {
  lines: number;
  /** what the order is worth: Σ quantity_ordered × unit_price */
  value: number;
  /** what has actually arrived, priced at the same rates */
  received_value: number;
  quantity_ordered: number;
  quantity_received: number;
  /** 0–100, by value rather than by line count */
  received_pct: number;
  fully_received: boolean;
  partially_received: boolean;
}

/**
 * Roll-up of a purchase order's lines.
 *
 * Receipt progress is measured by **value**, not by quantity: a PO mixing 12
 * tons of rod with 1800 cft of sand has no meaningful total quantity (adding
 * the two gives 1812 of nothing), whereas taka are taka. Same reasoning as
 * `requestTotals` in Module 5, which refuses to sum mixed units at all.
 */
export function poTotals(items: PurchaseOrderItem[]): PoTotals {
  let value = 0;
  let receivedValue = 0;
  let ordered = 0;
  let received = 0;
  let allDone = items.length > 0;
  let anyReceived = false;

  for (const item of items) {
    const q = Number(item.quantity_ordered) || 0;
    const r = Number(item.quantity_received) || 0;
    const price = Number(item.unit_price) || 0;
    value += q * price;
    receivedValue += Math.min(r, q) * price;
    ordered += q;
    received += r;
    if (r < q) allDone = false;
    if (r > 0) anyReceived = true;
  }

  return {
    lines: items.length,
    value: money(value),
    received_value: money(receivedValue),
    quantity_ordered: qty(ordered),
    quantity_received: qty(received),
    received_pct: value > 0 ? Math.round((receivedValue / value) * 10000) / 100 : 0,
    fully_received: allDone,
    partially_received: anyReceived && !allDone,
  };
}

/**
 * The status a PO's receipts imply (Section 7.6). Cancelled and draft orders
 * are left alone — cancelling after a partial delivery must not be undone by
 * the next recalculation.
 */
export function statusFromReceipts(
  current: PurchaseOrderStatus,
  totals: PoTotals,
): PurchaseOrderStatus {
  if (current === 'cancelled' || current === 'draft') return current;
  if (totals.fully_received) return 'received';
  if (totals.partially_received) return 'partially_received';
  return 'ordered';
}

/** Quantity still outstanding on a line — what a cancellation would void. */
export function outstanding(item: Pick<PurchaseOrderItem, 'quantity_ordered' | 'quantity_received'>): number {
  return qty(Math.max(0, (Number(item.quantity_ordered) || 0) - (Number(item.quantity_received) || 0)));
}

/**
 * Only `passed` quantities reach stock (Section 7.6) — a failed batch stays on
 * the GRN as a record so the same wrong material is not quietly re-received.
 */
export function stockableQuantity(row: Pick<GoodsReceiptItem, 'quantity_received' | 'quality_check'>): number {
  return row.quality_check === 'passed' ? qty(Number(row.quantity_received) || 0) : 0;
}

/* ------------------------------------------------------------------ *
 * Stock (Sections 7.7 / 7.8 / 7.8a)
 * ------------------------------------------------------------------ */

/**
 * Weighted average purchase cost, exactly as Section 7.6 spells it out:
 * `(old_qty × old_avg + in_qty × in_price) ÷ (old_qty + in_qty)`.
 *
 * Two guards the formula itself does not carry. An empty bin (old_qty ≤ 0)
 * would otherwise average the incoming price against a stale rate that nothing
 * is left at, so the new price simply becomes the rate. And a zero-quantity
 * receipt must not divide by zero — it leaves the average where it was.
 */
export function weightedAverage(
  oldQty: number,
  oldAvg: number,
  inQty: number,
  inPrice: number,
): number {
  const q0 = Math.max(0, Number(oldQty) || 0);
  const q1 = Math.max(0, Number(inQty) || 0);
  if (q1 <= 0) return money(oldAvg);
  if (q0 <= 0) return money(inPrice);
  return money((q0 * (Number(oldAvg) || 0) + q1 * (Number(inPrice) || 0)) / (q0 + q1));
}

/** Value of a stock row — quantity × the weighted average it was bought at. */
export function stockValue(row: { quantity_available: number; average_unit_price: number }): number {
  return money((Number(row.quantity_available) || 0) * (Number(row.average_unit_price) || 0));
}

/** Where a stock row lives. Central stock is `project_id = null` (7.7). */
export function stockLocationLabel(projectName?: string | null): string {
  return projectName ?? 'Central Store';
}

/* ------------------------------------------------------------------ *
 * Supplier vouchers (Section 7.9)
 * ------------------------------------------------------------------ */

export interface PaymentSummary {
  po_value: number;
  paid: number;
  due: number;
  paid_pct: number;
  overpaid: boolean;
}

/**
 * A PO is not a bill, so "due" is measured against the order value rather than
 * against what has arrived — that is how a supplier's ledger reads, and an
 * advance paid before delivery is normal here. Overpayment is surfaced rather
 * than clamped away: it is usually a duplicate voucher, and hiding it is how
 * a duplicate survives to the month-end reconciliation.
 */
export function paymentSummary(poValue: number, vouchers: Array<{ amount: number }>): PaymentSummary {
  const paid = money(vouchers.reduce((sum, v) => sum + (Number(v.amount) || 0), 0));
  const value = money(poValue);
  return {
    po_value: value,
    paid,
    due: money(Math.max(0, value - paid)),
    paid_pct: value > 0 ? Math.min(100, Math.round((paid / value) * 10000) / 100) : 0,
    overpaid: paid > value + 0.009,
  };
}

/* ------------------------------------------------------------------ *
 * Project cost traceability (Section 7.11)
 * ------------------------------------------------------------------ */

export interface ProjectCostSummary {
  /** ordered against this project (central purchases are not attributed here) */
  ordered_value: number;
  /** what has physically arrived, at PO prices */
  received_value: number;
  /** what has been paid to suppliers on those orders */
  paid_value: number;
  /** stock sitting on this project's site, at weighted average cost */
  stock_on_hand_value: number;
  /** consumed on site — the real material cost of the project (7.8) */
  issued_value: number;
  /** value brought in from the central store or another project (7.8a) */
  transferred_in_value: number;
  transferred_out_value: number;
  open_po_count: number;
  request_count: number;
}
