import type { BadgeTone } from '@/components/ui/Badge';
import type {
  GoodsReceiptItem,
  PoDeliverTo,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  StockTransfer,
  SupplierBillStatus,
  TransferStatus,
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
  /** placed with a supplier against this project (drafts excluded — see below) */
  ordered_value: number;
  /** prepared but not placed: a shopping list, committing nothing */
  draft_value: number;
  /** what has physically arrived, at PO prices */
  received_value: number;
  /** of that, unloaded at this project's site (Phase 2 step 4) */
  site_received_value: number;
  /** approved supplier bills (payable vouchers) on this project's orders */
  approved_bill_value: number;
  /** what those bills pay above the order rate for what they cover */
  price_difference_value: number;
  /** what has been paid to suppliers on those orders */
  paid_value: number;
  /** stock sitting on this project's site, at weighted average cost */
  stock_on_hand_value: number;
  /** handed out of the store to the site (7.8) — a movement, not a cost */
  issued_value: number;
  /** actually used on site (7.8b) — the project's real material cost */
  consumed_value: number;
  /** spent and built nothing — spoilage, loss, theft (7.8b) */
  written_off_value: number;
  /** issued but neither used nor returned: material standing on the site */
  at_site_value: number;
  /** value brought in from the central store or another project (7.8a) */
  transferred_in_value: number;
  transferred_out_value: number;
  open_po_count: number;
  request_count: number;
}

/* ------------------------------------------------------------------ *
 * What is standing on a site (Section 7.8b addendum)
 * ------------------------------------------------------------------ */

/**
 * How long material may stand on a site before it is worth asking about.
 *
 * Not in the scope document and not a rule the software enforces — nothing is
 * blocked, and a site can hold material for a year if that is the plan. It is
 * the line at which the stock screen stops treating a balance as an ordinary
 * buffer and starts flagging it, so somebody looks. Sixty days is roughly a
 * construction cycle: material that has outlived the work it was issued for.
 */
export const SITE_AGEING_DAYS = 60;

export function isStaleOnSite(row: { days_on_site: number }): boolean {
  return row.days_on_site >= SITE_AGEING_DAYS;
}

export interface SiteBalanceRow {
  /**
   * `project|item` — the key the row was grouped under.
   *
   * A derived row has no record to take an id from, and the tables that render
   * it need a stable one. The grouping key is exactly that: unique by
   * construction, and the same across re-computations for the same site and
   * item, so React does not tear the list down whenever a quantity changes.
   */
  id: string;
  project_id: string;
  item_id: string | null;
  item_name: string;
  unit: string;
  issued_quantity: number;
  used_quantity: number;
  returned_quantity: number;
  written_off_quantity: number;
  /** issued − used − returned − written off: material still standing on site */
  at_site_quantity: number;
  /**
   * The issue date of the oldest material still standing, and how long ago it
   * was — FIFO, so what is left is assumed to be the most recent deliveries.
   *
   * Quantity alone does not say whether a site is over-supplied or hoarding:
   * 40 bags issued yesterday is a normal buffer and 40 bags issued five months
   * ago is money sitting in a corner going hard. `null` when nothing is
   * standing.
   */
  oldest_unused_date: string | null;
  days_on_site: number;
  /** issued value ÷ issued quantity, the rate everything at this site carries */
  average_unit_price: number;
  at_site_value: number;
  issued_value: number;
  used_value: number;
  returned_value: number;
  written_off_value: number;
}

interface SiteMovement {
  project_id: string;
  item_id?: string | null;
  item_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  /** issues only — what the ageing is measured from */
  date?: string;
}

/**
 * The rate material at a site carries.
 *
 * Everything on a site arrived through an issue, so the issued average is what
 * it cost — total issued value over total issued quantity. Consumption and
 * returns are both valued at it, which is what makes the identity hold:
 *
 *     issued value = used + returned + still at site
 *
 * A per-batch cost would be more precise and is not available: material is
 * poured from a heap, not drawn from a labelled pallet, and Module 6 already
 * settled that a running average is not reversible. One rate per site per item,
 * frozen onto each consumption and return as it is recorded, is the version of
 * this that can be reconciled.
 */
export function siteAverageCost(issued: Array<{ quantity: number; unit_cost: number }>): number {
  let value = 0;
  let quantity = 0;
  for (const row of issued) {
    quantity += Number(row.quantity) || 0;
    value += (Number(row.quantity) || 0) * (Number(row.unit_cost) || 0);
  }
  return quantity > 0 ? money(value / quantity) : 0;
}

/**
 * Issues minus consumption minus returns, per (project, item).
 *
 * Derived rather than stored, deliberately. A fourth quantity column would be a
 * fourth thing to keep in step with three tables that already say everything —
 * the same reasoning that keeps `overdue` off `payment_installments`. These
 * tables are small and are only ever read a project at a time.
 *
 * Rows that net to nothing are dropped: a site that used exactly what it was
 * given has no balance, and listing it as zero buries the ones that do.
 */
export function siteBalance(
  issues: SiteMovement[],
  used: SiteMovement[],
  returned: SiteMovement[],
  writtenOff: SiteMovement[] = [],
  today: string = new Date().toISOString().slice(0, 10),
): SiteBalanceRow[] {
  // keyed on the catalogue item since Tier 3.1, falling back to the spelling
  // for rows recorded before it — the same key `stockRepository.findRow` uses
  const key = (m: SiteMovement) => `${m.project_id}|${m.item_id ?? `name:${m.item_name}|${m.unit}`}`;
  const rows = new Map<string, SiteBalanceRow>();

  const seed = (m: SiteMovement): SiteBalanceRow => {
    const k = key(m);
    let row = rows.get(k);
    if (!row) {
      row = {
        id: k,
        project_id: m.project_id,
        item_id: m.item_id ?? null,
        item_name: m.item_name,
        unit: m.unit,
        issued_quantity: 0,
        used_quantity: 0,
        returned_quantity: 0,
        written_off_quantity: 0,
        at_site_quantity: 0,
        oldest_unused_date: null,
        days_on_site: 0,
        average_unit_price: 0,
        at_site_value: 0,
        issued_value: 0,
        used_value: 0,
        returned_value: 0,
        written_off_value: 0,
      };
      rows.set(k, row);
    }
    return row;
  };

  for (const m of issues) {
    const row = seed(m);
    row.issued_quantity = qty(row.issued_quantity + m.quantity);
    row.issued_value = money(row.issued_value + m.quantity * m.unit_cost);
  }
  for (const m of used) {
    const row = seed(m);
    row.used_quantity = qty(row.used_quantity + m.quantity);
    row.used_value = money(row.used_value + m.quantity * m.unit_cost);
  }
  for (const m of returned) {
    const row = seed(m);
    row.returned_quantity = qty(row.returned_quantity + m.quantity);
    row.returned_value = money(row.returned_value + m.quantity * m.unit_cost);
  }
  for (const m of writtenOff) {
    const row = seed(m);
    row.written_off_quantity = qty(row.written_off_quantity + m.quantity);
    row.written_off_value = money(row.written_off_value + m.quantity * m.unit_cost);
  }

  /*
   * Ageing is FIFO over the issues: material accounted for is taken off the
   * oldest deliveries first, so what is left is the newest, and its earliest
   * issue date is how long the site has been sitting on it.
   *
   * FIFO is an assumption, not a fact — nobody labels a bag — but it is the
   * conservative one here: it reports the *youngest* possible age for what is
   * standing, so an ageing warning that fires is never crying wolf.
   */
  const issuesByRow = new Map<string, SiteMovement[]>();
  for (const m of issues) {
    const list = issuesByRow.get(key(m)) ?? [];
    list.push(m);
    issuesByRow.set(key(m), list);
  }

  for (const [k, row] of rows.entries()) {
    row.at_site_quantity = qty(
      row.issued_quantity - row.used_quantity - row.returned_quantity - row.written_off_quantity,
    );
    row.average_unit_price =
      row.issued_quantity > 0 ? money(row.issued_value / row.issued_quantity) : 0;
    row.at_site_value = money(row.at_site_quantity * row.average_unit_price);

    if (row.at_site_quantity > 0.0005) {
      let accountedFor = row.used_quantity + row.returned_quantity + row.written_off_quantity;
      const batches = (issuesByRow.get(k) ?? [])
        .filter((m) => m.date)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      for (const batch of batches) {
        if (accountedFor >= batch.quantity - 0.0005) {
          accountedFor -= batch.quantity;
          continue;
        }
        row.oldest_unused_date = batch.date ?? null;
        break;
      }
      if (row.oldest_unused_date) {
        const from = Date.parse(row.oldest_unused_date);
        const now = Date.parse(today);
        row.days_on_site =
          Number.isFinite(from) && Number.isFinite(now)
            ? Math.max(0, Math.round((now - from) / 86_400_000))
            : 0;
      }
    }
  }

  return [...rows.values()]
    .filter(
      (r) => Math.abs(r.at_site_quantity) > 0.0005 || r.used_quantity > 0 || r.written_off_quantity > 0,
    )
    .sort((a, b) => b.at_site_value - a.at_site_value || a.item_name.localeCompare(b.item_name));
}

/* ------------------------------------------------------------------ *
 * Phase 2 step 4 — delivery point, dispatches, bills (PLATFORM-REPLAN §4.3)
 * ------------------------------------------------------------------ */

export const PO_DELIVER_TO_META: Record<PoDeliverTo, { label: string; tone: BadgeTone }> = {
  site: { label: 'Straight to site', tone: 'teal' },
  main_store: { label: 'Main store', tone: 'blue' },
};

/**
 * Whether the supplier unloads at the project's site. Rows before v30 carry no
 * `deliver_to`; they keep the old rule — an order for a project went to it.
 * An order with no project has no site to go to.
 */
export function poDeliversToSite(order: Pick<PurchaseOrder, 'deliver_to' | 'project_id'>): boolean {
  if (!order.project_id) return false;
  return (order.deliver_to ?? 'site') === 'site';
}

/** The store a goods receipt on this order lands in: the site's, or the main store (null). */
export function receivingStore(order: Pick<PurchaseOrder, 'deliver_to' | 'project_id'>): string | null {
  return poDeliversToSite(order) ? (order.project_id ?? null) : null;
}

export const TRANSFER_STATUS_META: Record<TransferStatus, { label: string; tone: BadgeTone }> = {
  on_the_way: { label: 'On the way', tone: 'amber' },
  received: { label: 'Received', tone: 'green' },
};

/** Transfers before v30 moved instantly, so no status means received. */
export function transferStatus(t: Pick<StockTransfer, 'status'>): TransferStatus {
  return t.status ?? 'received';
}

/** What actually arrived — the full quantity on a pre-v30 transfer. */
export function transferReceivedQuantity(
  t: Pick<StockTransfer, 'status' | 'quantity' | 'quantity_received'>,
): number {
  if (transferStatus(t) !== 'received') return 0;
  return qty(Number(t.quantity_received ?? t.quantity) || 0);
}

export const SUPPLIER_BILL_STATUS_META: Record<
  SupplierBillStatus,
  { label: string; tone: BadgeTone; owner: string }
> = {
  recorded: { label: 'To verify', tone: 'amber', owner: 'Accounts' },
  verified: { label: 'To approve', tone: 'blue', owner: 'Management' },
  approved: { label: 'Payable', tone: 'teal', owner: 'Finance' },
  part_paid: { label: 'Part paid', tone: 'amber', owner: 'Finance' },
  paid: { label: 'Paid', tone: 'green', owner: '—' },
  rejected: { label: 'Rejected', tone: 'red', owner: '—' },
};

/** Approved bills are payable vouchers; these are the ones Finance can pay. */
export function isBillPayable(status: SupplierBillStatus): boolean {
  return status === 'approved' || status === 'part_paid';
}

/** Bills that still count against the order — a rejected one billed nothing. */
export function billCounts(status: SupplierBillStatus): boolean {
  return status !== 'rejected';
}

export type MatchFlag = 'over_received' | 'billed_before' | 'rate_above_order' | 'rate_below_order';

export const MATCH_FLAG_META: Record<MatchFlag, { label: string; tone: BadgeTone }> = {
  over_received: { label: 'Billed more than received', tone: 'red' },
  billed_before: { label: 'Already billed', tone: 'red' },
  rate_above_order: { label: 'Rate above order', tone: 'amber' },
  rate_below_order: { label: 'Rate below order', tone: 'blue' },
};

export interface MatchLine {
  po_item_id: string;
  item_name: string;
  unit: string;
  ordered: number;
  /** accepted at delivery — rejected material can never be billed */
  received: number;
  /** on other, non-rejected bills of the same order */
  billed_before: number;
  billed: number;
  order_rate: number;
  billed_rate: number;
  /** received, not billed before, and billed now: what we owe for */
  matched_quantity: number;
  matched_value: number;
  billed_value: number;
  /** the matched quantity at the order's rate — the base of the price difference */
  matched_at_order_rate: number;
  flags: MatchFlag[];
}

export interface MatchResult {
  lines: MatchLine[];
  billed_value: number;
  matched_value: number;
  matched_at_order_rate: number;
  clean: boolean;
}

/**
 * The three-way match (order × receipt × bill), per order line.
 *
 * What we owe for is the quantity that arrived, was accepted and has not been
 * billed already, at the billed rate. Everything beyond that is flagged, never
 * silently dropped: transparency, not restriction (client decision
 * 2026-10-11) — a higher rate is payable with a note, but nobody can miss it.
 */
export function threeWayMatch(
  lines: Array<{
    po_item: Pick<
      PurchaseOrderItem,
      'id' | 'item_name' | 'unit' | 'quantity_ordered' | 'quantity_received' | 'unit_price'
    >;
    billed_before: number;
    quantity_billed: number;
    rate_billed: number;
  }>,
): MatchResult {
  const out: MatchLine[] = lines.map((l) => {
    const ordered = qty(Number(l.po_item.quantity_ordered) || 0);
    const received = qty(Number(l.po_item.quantity_received) || 0);
    const before = qty(Number(l.billed_before) || 0);
    const billed = qty(Number(l.quantity_billed) || 0);
    const orderRate = money(Number(l.po_item.unit_price) || 0);
    const rate = money(Number(l.rate_billed) || 0);
    const open = qty(Math.max(0, received - before));
    const matched = qty(Math.min(billed, open));
    const flags: MatchFlag[] = [];
    if (billed > open + 0.0005) {
      // it would have fitted what arrived, had part of it not been billed already
      flags.push(before > 0 && billed <= received + 0.0005 ? 'billed_before' : 'over_received');
    }
    if (billed > 0 && rate > orderRate + 0.004) flags.push('rate_above_order');
    if (billed > 0 && rate < orderRate - 0.004) flags.push('rate_below_order');
    return {
      po_item_id: l.po_item.id,
      item_name: l.po_item.item_name,
      unit: l.po_item.unit,
      ordered,
      received,
      billed_before: before,
      billed,
      order_rate: orderRate,
      billed_rate: rate,
      matched_quantity: matched,
      matched_value: money(matched * rate),
      billed_value: money(billed * rate),
      matched_at_order_rate: money(matched * orderRate),
      flags,
    };
  });
  const sum = (pick: (l: MatchLine) => number) => money(out.reduce((t, l) => t + pick(l), 0));
  return {
    lines: out,
    billed_value: sum((l) => l.billed_value),
    matched_value: sum((l) => l.matched_value),
    matched_at_order_rate: sum((l) => l.matched_at_order_rate),
    clean: out.every((l) => l.flags.length === 0),
  };
}

/**
 * How far a request has got at the site: approved against what the site has
 * received for it, line by line (Phase 2 step 4).
 */
export function requestSiteProgress(
  lines: Array<{ approved: number; received: number }>,
): 'none' | 'part' | 'all' {
  const live = lines.filter((l) => l.approved > 0);
  if (live.length === 0) return 'none';
  const any = live.some((l) => l.received > 0.0005);
  const all = live.every((l) => l.received >= l.approved - 0.0005);
  return all ? 'all' : any ? 'part' : 'none';
}
