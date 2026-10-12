'use client';

import { db } from '../db/database';
import { todayLocal } from '../utils/format';
import type {
  GoodsReceipt,
  GoodsReceiptItem,
  MaterialRequest,
  Project,
  PoDeliverTo,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  QualityCheck,
  StockConsumption,
  StockIssue,
  StockReturn,
  StockWriteOff,
  StockRow,
  StockTransfer,
  Supplier,
  SupplierBill,
  SupplierBillItem,
  SupplierBillStatus,
  SupplierType,
  SupplierVoucher,
  Tower,
  TowerWorkItem,
  WriteOffReason,
} from '../db/types';
import {
  money,
  outstanding,
  paymentSummary,
  poTotals,
  siteBalance,
  isStaleOnSite,
  qty,
  statusFromReceipts,
  stockValue,
  type SiteBalanceRow,
  stockableQuantity,
  weightedAverage,
  type PoTotals,
  type ProjectCostSummary,
  billCounts,
  isBillPayable,
  poDeliversToSite,
  receivingStore,
  requestSiteProgress,
  threeWayMatch,
  transferReceivedQuantity,
  transferStatus,
  type MatchResult,
} from '../domain/procurement';
import { allowedNextRequestStatuses } from '../domain/site-progress';
import { newId, nextCode } from '../utils/id';
import { BaseRepository, type NewRecord } from './base.repository';
import { documentRepository } from './document.repository';
import { materialRequestRepository } from './site-progress.repository';

/*
 * Like site-progress.repository, this file reads `db.projects` / `db.towers` /
 * `db.material_requests` directly rather than importing the repositories that
 * own them, except for `materialRequestRepository.setStatus` — Section 6.5's
 * lifecycle has to keep writing its audit trail, so that one call goes through
 * the real path instead of touching the table. The dependency runs one way:
 * procurement → site-progress, never back.
 */

/* ------------------------------------------------------------------ *
 * Suppliers (Section 7.3)
 * ------------------------------------------------------------------ */

export interface SupplierFilters {
  search?: string;
  type?: SupplierType | 'all';
}

export interface SupplierWithStats extends Supplier {
  /** orders actually placed — drafts are not orders and are counted separately */
  po_count: number;
  /** value of every placed, non-cancelled order */
  ordered_value: number;
  /** what has actually arrived, at order rates */
  received_value: number;
  paid_value: number;
  /** placed but not yet delivered — a commitment, shown so the two are not confused */
  awaiting_delivery_value: number;
  /**
   * What the supplier can actually bill for: placed orders, plus whatever had
   * already been delivered on an order that was later cancelled. Cancelling
   * voids the undelivered balance, not the material already in the store.
   */
  billable_value: number;
  draft_count: number;
  draft_value: number;
  last_order_date?: string | null;
}

/**
 * What a supplier is owed, or is holding of ours.
 *
 * The balance is measured against the **order value**, keeping the position
 * `paymentSummary` already takes: a PO is not a bill, a supplier's ledger reads
 * this way, and paying an advance before delivery is normal in this trade. What
 * changed is what counts as an order — a `draft` is a shopping list nobody has
 * placed, and counting one made a supplier with a BDT 4,672,800 draft look like
 * a BDT 6.4M liability before a single delivery. Drafts are now excluded here
 * and reported separately, and `received_value` / `awaiting_delivery_value` sit
 * alongside so a commitment is never mistaken for an invoice.
 *
 * A cancelled order is not simply dropped either. Cancelling voids the
 * undelivered balance, but material that had already arrived is in the store
 * and was rightly paid for, so its received value stays billable — otherwise a
 * settled account showed the whole payment as an advance nobody was holding.
 *
 * Where vouchers still exceed what is billable — a genuine advance paid before
 * delivery — the balance is an asset held with the supplier, not a debt, and is
 * reported as such rather than as a negative payable.
 */
export function supplierBalance(row: Pick<SupplierWithStats, 'billable_value' | 'paid_value'>): {
  due: number;
  advance: number;
} {
  const net = money(row.billable_value - row.paid_value);
  return { due: Math.max(0, net), advance: Math.max(0, -net) };
}

class SupplierRepository extends BaseRepository<Supplier> {
  constructor() {
    super(() => db.suppliers);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.suppliers.toArray()).map((s) => s.code);
    return nextCode('SUP', codes);
  }

  async createSupplier(
    input: Omit<NewRecord<Supplier>, 'code'> & { code?: string },
    createdBy: string | null = null,
  ): Promise<Supplier> {
    const code = input.code?.trim() ? input.code : await this.generateCode();
    return this.create({ ...input, code }, createdBy);
  }

  async list(filters: SupplierFilters = {}): Promise<SupplierWithStats[]> {
    const [suppliers, orders, items, vouchers] = await Promise.all([
      db.suppliers.toArray(),
      db.purchase_orders.toArray(),
      db.purchase_order_items.toArray(),
      db.supplier_vouchers.toArray(),
    ]);

    const itemsByPo = groupBy(items, (i) => i.po_id);
    type Entry = {
      count: number;
      value: number;
      received: number;
      cancelledReceived: number;
      draftCount: number;
      draftValue: number;
      last: string | null;
    };
    const blank = (): Entry => ({
      count: 0,
      value: 0,
      received: 0,
      cancelledReceived: 0,
      draftCount: 0,
      draftValue: 0,
      last: null,
    });
    const stats = new Map<string, Entry>();
    for (const order of orders) {
      const entry = stats.get(order.supplier_id) ?? blank();
      const totals = poTotals(itemsByPo.get(order.id) ?? []);

      if (order.status === 'cancelled') {
        // the undelivered balance is void, but material that had already
        // arrived stays in the store and is still owed for
        entry.cancelledReceived += totals.received_value;
        stats.set(order.supplier_id, entry);
        continue;
      }

      if (order.status === 'draft') {
        // a draft is a shopping list, not a commitment — kept visible, kept
        // out of every figure that reads as money owed or ordered
        entry.draftCount += 1;
        entry.draftValue += totals.value;
      } else {
        entry.count += 1;
        entry.value += totals.value;
        entry.received += totals.received_value;
        entry.last = entry.last && entry.last > order.order_date ? entry.last : order.order_date;
      }
      stats.set(order.supplier_id, entry);
    }

    const paidBySupplier = new Map<string, number>();
    for (const voucher of vouchers) {
      paidBySupplier.set(
        voucher.supplier_id,
        (paidBySupplier.get(voucher.supplier_id) ?? 0) + (Number(voucher.amount) || 0),
      );
    }

    let rows: SupplierWithStats[] = suppliers.map((supplier) => {
      const entry = stats.get(supplier.id);
      const ordered = money(entry?.value ?? 0);
      const cancelledReceived = money(entry?.cancelledReceived ?? 0);
      const received = money((entry?.received ?? 0) + cancelledReceived);
      return {
        ...supplier,
        po_count: entry?.count ?? 0,
        ordered_value: ordered,
        received_value: received,
        awaiting_delivery_value: money(Math.max(0, ordered - (entry?.received ?? 0))),
        billable_value: money(ordered + cancelledReceived),
        draft_count: entry?.draftCount ?? 0,
        draft_value: money(entry?.draftValue ?? 0),
        paid_value: money(paidBySupplier.get(supplier.id) ?? 0),
        last_order_date: entry?.last ?? null,
      };
    });

    if (filters.type && filters.type !== 'all') rows = rows.filter((r) => r.type === filters.type);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.code, r.name, r.phone, r.contact_person, r.address, r.notes]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** `null` when the supplier is gone, so a detail page can tell "deleted"
   *  apart from `useLiveQuery`'s pending `undefined`. */
  async getWithStats(id: string): Promise<SupplierWithStats | null> {
    const supplier = await this.getById(id);
    if (!supplier) return null;
    const rows = await this.list();
    return (
      rows.find((r) => r.id === id) ?? {
        ...supplier,
        po_count: 0,
        ordered_value: 0,
        received_value: 0,
        awaiting_delivery_value: 0,
        billable_value: 0,
        draft_count: 0,
        draft_value: 0,
        paid_value: 0,
      }
    );
  }

  /**
   * A supplier with purchase history is never deleted — the orders and
   * vouchers pointing at them would lose their counterparty, and a paid
   * voucher with no supplier is an unanswerable audit question.
   */
  async blockedByOrders(id: string): Promise<number> {
    return db.purchase_orders.where('supplier_id').equals(id).count();
  }

  async removeCascade(id: string): Promise<void> {
    await documentRepository.removeForEntity('supplier', id);
    await this.remove(id);
  }
}

/* ------------------------------------------------------------------ *
 * Purchase orders (Sections 7.4 / 7.5)
 * ------------------------------------------------------------------ */

export interface PurchaseOrderFilters {
  search?: string;
  status?: PurchaseOrderStatus | 'all';
  supplier_id?: string;
  /** '' = every order, 'central' = the project-less ones (7.4) */
  project_id?: string;
  request_id?: string;
  /** orders that have been placed and are not fully in yet */
  open_only?: boolean;
}

export interface PurchaseOrderWithRelations extends PurchaseOrder {
  items: PurchaseOrderItem[];
  totals: PoTotals;
  supplier?: Supplier;
  project?: Project;
  request?: MaterialRequest;
  receipts: GoodsReceipt[];
  vouchers: SupplierVoucher[];
  paid_value: number;
}

export interface PurchaseOrderItemInput {
  id?: string;
  /** Tier 3.1: the catalogue item. Null only for a line typed before it existed. */
  item_id?: string | null;
  item_name: string;
  unit: string;
  quantity_ordered: number;
  unit_price: number;
}

/**
 * E2E test 2026-10-12 #14/#15: every line needs a real price, and an order
 * against a material request may not buy more than was approved, less what
 * other live orders on that request already cover.
 */
async function assertOrderLines(
  items: PurchaseOrderItemInput[],
  requestId: string | null,
  orderId: string | null,
): Promise<void> {
  const unpriced = items.find((l) => !(Number(l.unit_price) > 0));
  if (unpriced) throw new Error(`${unpriced.item_name}: enter a unit price above 0`);
  if (!requestId) return;

  const requestLines = await db.material_request_items.where('request_id').equals(requestId).toArray();
  const otherOrders = (await db.purchase_orders.where('request_id').equals(requestId).toArray()).filter(
    (o) => o.id !== orderId && o.status !== 'cancelled',
  );
  const otherLines = otherOrders.length
    ? await db.purchase_order_items.where('po_id').anyOf(otherOrders.map((o) => o.id)).toArray()
    : [];
  const sameItem = (a: { item_id?: string | null; item_name: string }, b: typeof a) =>
    a.item_id && b.item_id ? a.item_id === b.item_id : a.item_name.trim().toLowerCase() === b.item_name.trim().toLowerCase();

  for (const req of requestLines) {
    const approved = Number(req.quantity_approved ?? req.quantity_requested) || 0;
    const already = otherLines.filter((l) => sameItem(l, req)).reduce((s, l) => s + Number(l.quantity_ordered), 0);
    const here = items.filter((l) => sameItem(l, req)).reduce((s, l) => s + Number(l.quantity_ordered), 0);
    if (here + already > approved + 1e-9) {
      const left = Math.max(0, approved - already);
      throw new Error(
        `${req.item_name}: ${approved} ${req.unit} approved${already ? `, ${already} already on other orders` : ''} — this order can take at most ${left} ${req.unit}.`,
      );
    }
  }
}

/** Older rows predate `sort_order`; fall back to when they were created. */
function poLineOrder(a: PurchaseOrderItem, b: PurchaseOrderItem): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at);
}

class PurchaseOrderRepository extends BaseRepository<PurchaseOrder> {
  constructor() {
    super(() => db.purchase_orders);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.purchase_orders.toArray()).map((o) => o.code);
    return nextCode('PO', codes);
  }

  /**
   * An order and its lines are saved together — a PO with no lines has no
   * value, no supplier commitment and nothing to receive against.
   *
   * Raising the order (status `ordered`) is what moves the material request to
   * `ordered` in Section 6.5. A draft does not: nothing has been committed to
   * a supplier yet, and the site would be told its material is on the way when
   * it is not.
   */
  async createOrder(
    input: Omit<NewRecord<PurchaseOrder>, 'code'> & {
      code?: string;
      items: PurchaseOrderItemInput[];
    },
    createdBy: string | null = null,
  ): Promise<PurchaseOrder> {
    const { items, ...rest } = input;
    await assertOrderLines(items, rest.request_id ?? null, null);
    const code = rest.code?.trim() ? rest.code : await this.generateCode();

    const order = await this.create({ ...rest, code }, createdBy);
    await purchaseOrderItemRepository.replaceForOrder(order.id, items, createdBy);

    if (order.status === 'ordered') await markRequestOrdered(order, createdBy);
    return order;
  }

  /**
   * Quantity already on live orders against a request, keyed by catalogue
   * item id (or lower-cased name for an older typed line).
   */
  async orderedAgainstRequest(requestId: string, exceptOrderId: string | null): Promise<Record<string, number>> {
    const orders = (await db.purchase_orders.where('request_id').equals(requestId).toArray()).filter(
      (o) => o.id !== exceptOrderId && o.status !== 'cancelled',
    );
    if (orders.length === 0) return {};
    const lines = await db.purchase_order_items.where('po_id').anyOf(orders.map((o) => o.id)).toArray();
    const out: Record<string, number> = {};
    for (const l of lines) {
      const key = l.item_id ?? l.item_name.trim().toLowerCase();
      out[key] = (out[key] ?? 0) + Number(l.quantity_ordered);
    }
    return out;
  }

  async updateOrder(
    id: string,
    changes: {
      request_id?: string | null;
      project_id?: string | null;
      supplier_id?: string;
      order_date?: string;
      deliver_to?: PoDeliverTo | null;
      notes?: string | null;
    },
    items: PurchaseOrderItemInput[],
    createdBy: string | null = null,
  ): Promise<PurchaseOrder | undefined> {
    /*
     * Where the goods were unloaded is history once a receipt exists: moving
     * the order to another store would leave the received stock in the old
     * one (Phase 2 step 4).
     */
    const before = await this.getById(id);
    await assertOrderLines(
      items,
      changes.request_id !== undefined ? changes.request_id : (before?.request_id ?? null),
      id,
    );
    if (before) {
      const received = (await db.goods_receipts.where('po_id').equals(id).count()) > 0;
      const moved =
        receivingStore(before) !==
        receivingStore({
          project_id: changes.project_id !== undefined ? changes.project_id : before.project_id,
          deliver_to: changes.deliver_to !== undefined ? changes.deliver_to : before.deliver_to,
        });
      if (received && moved) {
        throw new Error('Goods have already been received on this order, so its project and delivery point cannot change.');
      }
    }
    await purchaseOrderItemRepository.replaceForOrder(id, items, createdBy);
    const saved = await this.update(id, changes as never);
    // trimming a line to what has already arrived can complete the order
    await this.recalculateFromReceipts(id, createdBy);
    return saved;
  }

  async list(filters: PurchaseOrderFilters = {}): Promise<PurchaseOrderWithRelations[]> {
    const [orders, items, suppliers, projects, requests, receipts, vouchers] = await Promise.all([
      db.purchase_orders.toArray(),
      db.purchase_order_items.toArray(),
      db.suppliers.toArray(),
      db.projects.toArray(),
      db.material_requests.toArray(),
      db.goods_receipts.toArray(),
      db.supplier_vouchers.toArray(),
    ]);

    const itemsByPo = groupBy([...items].sort(poLineOrder), (i) => i.po_id);
    const receiptsByPo = groupBy(receipts, (r) => r.po_id);
    const vouchersByPo = groupBy(vouchers, (v) => v.po_id);
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const requestById = new Map(requests.map((r) => [r.id, r]));

    let rows: PurchaseOrderWithRelations[] = orders.map((order) => {
      const lines = itemsByPo.get(order.id) ?? [];
      const poVouchers = vouchersByPo.get(order.id) ?? [];
      return {
        ...order,
        items: lines,
        totals: poTotals(lines),
        supplier: supplierById.get(order.supplier_id),
        project: order.project_id ? projectById.get(order.project_id) : undefined,
        request: order.request_id ? requestById.get(order.request_id) : undefined,
        receipts: (receiptsByPo.get(order.id) ?? []).sort((a, b) =>
          b.receipt_date.localeCompare(a.receipt_date),
        ),
        vouchers: poVouchers,
        paid_value: money(poVouchers.reduce((sum, v) => sum + (Number(v.amount) || 0), 0)),
      };
    });

    if (filters.open_only) {
      rows = rows.filter((r) => r.status === 'ordered' || r.status === 'partially_received');
    }
    if (filters.status && filters.status !== 'all') rows = rows.filter((r) => r.status === filters.status);
    if (filters.supplier_id) rows = rows.filter((r) => r.supplier_id === filters.supplier_id);
    if (filters.request_id) rows = rows.filter((r) => r.request_id === filters.request_id);
    if (filters.project_id) {
      rows =
        filters.project_id === 'central'
          ? rows.filter((r) => !r.project_id)
          : rows.filter((r) => r.project_id === filters.project_id);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.code, r.notes, r.supplier?.name, r.project?.name, r.request?.code, ...r.items.map((i) => i.item_name)]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort(
      (a, b) => b.order_date.localeCompare(a.order_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  /** `null` when the order is gone — see the note on `getWithStats`. */
  async getWithRelations(id: string): Promise<PurchaseOrderWithRelations | null> {
    const order = await this.getById(id);
    if (!order) return null;
    const rows = await this.list();
    return rows.find((r) => r.id === id) ?? null;
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await db.purchase_orders.toArray();
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Manual status moves: raising a draft, or cancelling.
   *
   * Cancelling only voids what has **not** arrived (Section 7.6, the PO
   * cancellation rule) — received quantity is already in stock and stays
   * there, and the lines keep their received figures so the GRN history still
   * reconciles.
   */
  async setStatus(
    id: string,
    status: PurchaseOrderStatus,
    options: { note?: string | null; actor?: string | null } = {},
  ): Promise<PurchaseOrder | undefined> {
    const order = await this.getById(id);
    if (!order) return undefined;

    const notes = options.note?.trim()
      ? [order.notes, options.note.trim()].filter(Boolean).join('\n')
      : order.notes;

    const saved = await this.update(id, { status, notes });
    if (status === 'ordered' && saved) await markRequestOrdered(saved, options.actor ?? null);
    return saved;
  }

  /**
   * Re-derives `status` from the goods receipts (Section 7.6) and, when the
   * order is complete, closes the material request behind it.
   */
  async recalculateFromReceipts(id: string, actor: string | null = null): Promise<void> {
    const order = await this.getById(id);
    if (!order) return;

    const items = await purchaseOrderItemRepository.listForOrder(id);
    const totals = poTotals(items);
    const next = statusFromReceipts(order.status, totals);
    if (next !== order.status) await this.update(id, { status: next });

    if (!order.request_id) return;

    /*
     * A fully received order puts the request in the *store*, not on the site.
     *
     * This used to write `fulfilled`, which said the site had its material at
     * the moment the material reached a godown. Nothing else in the system ever
     * corrected that, so a short delivery or a load that never left the store
     * was indistinguishable from a job done. `received` is what a goods receipt
     * actually knows; the site closes the request itself.
     *
     * The reverse still has to hold: deleting the GRN that completed the order
     * puts the request back to `ordered`, or the site is told material arrived
     * that has just been un-received. A request the site has already confirmed
     * is left alone — the material is on site and un-receiving the paperwork
     * does not take it back.
     */
    const request = await db.material_requests.get(order.request_id);
    if (!request) return;

    // Phase 2 step 4: delivered straight to site, the site's receipts move it
    if (poDeliversToSite(order)) {
      await syncRequestFromSite(order.request_id, actor);
      return;
    }

    if (next === 'received' && allowedNextRequestStatuses(request.status).includes('received')) {
      await materialRequestRepository.setStatus(order.request_id, 'received', {
        decided_by: actor,
        decision_note: `Fully received against ${order.code} — in store.`,
      });
    } else if (next !== 'received' && request.status === 'received') {
      await materialRequestRepository.setStatus(order.request_id, 'ordered', {
        decided_by: actor,
        decision_note: `Reopened — a goods receipt on ${order.code} was removed, so the order is no longer complete.`,
      });
    }
  }

  /**
   * Deleting an order rolls back everything it caused: its receipts (and the
   * stock they added), its lines, and its documents. Vouchers are the one
   * thing it refuses to take with it — see `blockedByVouchers`.
   */
  async blockedByVouchers(id: string): Promise<number> {
    return db.supplier_vouchers.where('po_id').equals(id).count();
  }

  async removeCascade(id: string): Promise<void> {
    const receipts = await db.goods_receipts.where('po_id').equals(id).toArray();
    for (const receipt of receipts) await goodsReceiptRepository.removeCascade(receipt.id);

    await purchaseOrderItemRepository.removeForOrder(id);
    await documentRepository.removeForEntity('purchase_order', id);
    await this.remove(id);
  }
}

/**
 * Route (b) of Section 7.8a: an approved request met from the main store, with
 * nothing bought. Phase 2 step 4: sending it puts the request **on the way**;
 * the site receiving it is what moves it to Partly received / Received
 * (`syncRequestFromSite`).
 */
async function markRequestReceivedByTransfer(
  transfer: StockTransfer,
  actor: string | null,
): Promise<void> {
  if (!transfer.request_id || !transfer.to_project_id) return;
  const request = await db.material_requests.get(transfer.request_id);
  if (!request || !allowedNextRequestStatuses(request.status).includes('delivered')) return;

  await materialRequestRepository.setStatus(transfer.request_id, 'delivered', {
    decided_by: actor,
    decision_note: `Sent from the main store — ${transfer.code}.`,
  });
}

/** The other half: deleting that transfer takes the material back, so the
 *  request is open again. Mirrors the goods-receipt rollback. */
async function reopenRequestClosedByTransfer(transfer: StockTransfer): Promise<void> {
  if (!transfer.request_id) return;
  const request = await db.material_requests.get(transfer.request_id);
  // as above: once the site has confirmed, deleting the paperwork does not
  // take the material back off the site
  if (!request || request.status !== 'delivered') return;

  await materialRequestRepository.setStatus(transfer.request_id, 'approved', {
    decided_by: request.created_by ?? null,
    decision_note: `Transfer ${transfer.code} was deleted — the material went back, so this is waiting again.`,
  });
}

/**
 * What the site has received for each line of a request (Phase 2 step 4):
 * accepted quantity on goods receipts of site-delivered orders raised against
 * it, plus dispatches from the main store it has counted in. Keyed by request
 * line id; a line is matched by catalogue item, or by spelling for old rows.
 */
export async function receivedAtSiteForRequest(requestId: string): Promise<Map<string, number>> {
  const [lines, orders, transfers] = await Promise.all([
    db.material_request_items.where('request_id').equals(requestId).toArray(),
    db.purchase_orders.where('request_id').equals(requestId).toArray(),
    db.stock_transfers.toArray(),
  ]);
  const keyOf = (r: { item_id?: string | null; item_name: string; unit: string }) =>
    r.item_id ?? `name:${r.item_name}|${r.unit}`;
  const got = new Map<string, number>();
  const add = (k: string, q: number) => got.set(k, qty((got.get(k) ?? 0) + q));

  for (const order of orders) {
    if (!poDeliversToSite(order)) continue;
    const items = await db.purchase_order_items.where('po_id').equals(order.id).toArray();
    for (const item of items) add(keyOf(item), Number(item.quantity_received) || 0);
  }
  for (const t of transfers) {
    if (t.request_id !== requestId) continue;
    add(keyOf(t), transferReceivedQuantity(t));
  }

  const out = new Map<string, number>();
  for (const line of lines) {
    const k = keyOf(line);
    const alt = `name:${line.item_name}|${line.unit}`;
    out.set(line.id, got.get(k) ?? got.get(alt) ?? 0);
  }
  return out;
}

/**
 * Moves a request to Partly received / Received from what the site actually
 * has. Never moves it backwards past what the site confirmed, and leaves a
 * closed request alone.
 */
export async function syncRequestFromSite(requestId: string, actor: string | null): Promise<void> {
  const request = await db.material_requests.get(requestId);
  if (!request) return;
  const lines = await db.material_request_items.where('request_id').equals(requestId).toArray();
  const received = await receivedAtSiteForRequest(requestId);
  const progress = requestSiteProgress(
    lines.map((l) => ({
      approved: Number(l.quantity_approved ?? l.quantity_requested) || 0,
      received: received.get(l.id) ?? 0,
    })),
  );
  const next = progress === 'all' ? 'fulfilled' : progress === 'part' ? 'partially_received' : null;
  if (!next || next === request.status) return;
  if (!allowedNextRequestStatuses(request.status).includes(next)) return;
  await materialRequestRepository.setStatus(requestId, next, {
    decided_by: actor,
    decision_note:
      next === 'fulfilled'
        ? 'Everything approved has been received at site.'
        : 'Part of the approved quantity has been received at site.',
  });
}

async function markRequestOrdered(order: PurchaseOrder, actor: string | null): Promise<void> {
  if (!order.request_id) return;
  const request = await db.material_requests.get(order.request_id);
  if (!request) return;
  if (!allowedNextRequestStatuses(request.status).includes('ordered')) return;

  await materialRequestRepository.setStatus(order.request_id, 'ordered', {
    decided_by: actor,
    decision_note: `Purchase order ${order.code} raised.`,
  });
}

class PurchaseOrderItemRepository extends BaseRepository<PurchaseOrderItem> {
  constructor() {
    super(() => db.purchase_order_items);
  }

  async listForOrder(poId: string): Promise<PurchaseOrderItem[]> {
    const rows = await db.purchase_order_items.where('po_id').equals(poId).toArray();
    return rows.sort(poLineOrder);
  }

  /**
   * Rewrites the lines of an order.
   *
   * A line that keeps its id keeps its `quantity_received`: that figure comes
   * from goods receipts, not from this form, and reading the form's silence as
   * zero would un-receive material that is already sitting in the store — the
   * same trap `material_request_items.quantity_approved` fell into in Module 5.
   */
  async replaceForOrder(
    poId: string,
    items: PurchaseOrderItemInput[],
    createdBy: string | null = null,
  ): Promise<void> {
    const existing = await this.listForOrder(poId);
    const byId = new Map(existing.map((row) => [row.id, row]));
    const keptIds = new Set(items.map((i) => i.id).filter(Boolean) as string[]);

    for (const row of existing) {
      if (!keptIds.has(row.id)) {
        // its receipt lines would otherwise point at a line that is gone
        const orphans = await db.goods_receipt_items.where('po_item_id').equals(row.id).toArray();
        await db.goods_receipt_items.bulkDelete(orphans.map((o) => o.id));
        await this.remove(row.id);
      }
    }

    for (const [index, item] of items.entries()) {
      const prior = item.id ? byId.get(item.id) : undefined;
      const payload = {
        po_id: poId,
        item_id: item.item_id ?? null,
        item_name: item.item_name.trim(),
        unit: item.unit,
        quantity_ordered: qty(Number(item.quantity_ordered) || 0),
        unit_price: money(Number(item.unit_price) || 0),
        quantity_received: prior?.quantity_received ?? 0,
        sort_order: index + 1,
      };
      if (prior) await this.update(item.id!, payload);
      else await this.create(payload, createdBy);
    }
  }

  async removeForOrder(poId: string): Promise<void> {
    const rows = await this.listForOrder(poId);
    await db.purchase_order_items.bulkDelete(rows.map((r) => r.id));
  }
}

/* ------------------------------------------------------------------ *
 * Goods receipts (Section 7.6)
 * ------------------------------------------------------------------ */

export interface GoodsReceiptLineInput {
  po_item_id: string;
  quantity_received: number;
  quality_check: QualityCheck;
}

export interface GoodsReceiptWithRelations extends GoodsReceipt {
  items: Array<GoodsReceiptItem & { po_item?: PurchaseOrderItem }>;
  order?: PurchaseOrder;
  supplier?: Supplier;
  received_by_name?: string | null;
  /** value of the delivery at PO prices */
  value: number;
}

class GoodsReceiptRepository extends BaseRepository<GoodsReceipt> {
  constructor() {
    super(() => db.goods_receipts);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.goods_receipts.toArray()).map((r) => r.code);
    return nextCode('GRN', codes);
  }

  /**
   * Records a delivery (Section 7.6) and everything that follows from it:
   * the PO lines' `quantity_received` go up, the order's status is re-derived,
   * and **only the `passed` quantities** reach stock, where they move the
   * weighted average purchase price.
   *
   * `pending` quality is deliberately not stocked either: the material is on
   * site but not accepted, and letting it into the average would price the
   * store at a rate for goods that may still be sent back. Re-checking it
   * later is a fresh GRN line, which is also what leaves an audit trail.
   */
  async createReceipt(
    input: Omit<NewRecord<GoodsReceipt>, 'code'> & {
      code?: string;
      items: GoodsReceiptLineInput[];
    },
    createdBy: string | null = null,
  ): Promise<GoodsReceipt> {
    const { items, ...rest } = input;
    const code = rest.code?.trim() ? rest.code : await this.generateCode();
    const receipt = await this.create({ ...rest, code }, createdBy);

    const order = await db.purchase_orders.get(receipt.po_id);

    for (const line of items) {
      const quantity = qty(Number(line.quantity_received) || 0);
      if (quantity <= 0) continue;

      const poItem = await db.purchase_order_items.get(line.po_item_id);
      if (!poItem) continue;

      const saved = await goodsReceiptItemRepository.create(
        {
          grn_id: receipt.id,
          po_item_id: line.po_item_id,
          quantity_received: quantity,
          quality_check: line.quality_check,
        },
        createdBy,
      );

      /*
       * Only ACCEPTED quantity counts against the order line.
       *
       * This used to add everything that arrived, including a batch that
       * failed its quality check — so PO-2026-008 read "received" in full
       * while all 150 units had failed and nothing had reached stock. The
       * order looked closed, nobody chased the supplier for a replacement,
       * and because the payable is computed from received value (PR-1), we
       * were also reporting money owed for material we had rejected.
       *
       * The physical arrival is not lost: the GRN line still records the
       * quantity and its quality check, which is what an argument with the
       * supplier is had from. Same measure as stock, so the order line, the
       * store and the payable can never disagree again.
       */
      const stockable = stockableQuantity(saved);

      await db.purchase_order_items.update(poItem.id, {
        quantity_received: qty((Number(poItem.quantity_received) || 0) + stockable),
      });

      if (stockable > 0) {
        // Phase 2 step 4: the site's store, or the main store, as the order says
        await stockRepository.receive(
          order ? receivingStore(order) : null,
          { item_id: poItem.item_id ?? null, item_name: poItem.item_name, unit: poItem.unit },
          stockable,
          poItem.unit_price,
          createdBy,
        );
      }
    }

    await purchaseOrderRepository.recalculateFromReceipts(receipt.po_id, createdBy);
    return receipt;
  }

  async listForOrder(poId: string): Promise<GoodsReceiptWithRelations[]> {
    const rows = await db.goods_receipts.where('po_id').equals(poId).toArray();
    const full = await Promise.all(rows.map((r) => this.getWithRelations(r.id)));
    return full
      .filter((r): r is GoodsReceiptWithRelations => r !== null)
      .sort((a, b) => b.receipt_date.localeCompare(a.receipt_date));
  }

  async getWithRelations(id: string): Promise<GoodsReceiptWithRelations | null> {
    const receipt = await this.getById(id);
    if (!receipt) return null;

    const [lines, order] = await Promise.all([
      goodsReceiptItemRepository.listForReceipt(id),
      db.purchase_orders.get(receipt.po_id),
    ]);
    const poItems = await purchaseOrderItemRepository.listForOrder(receipt.po_id);
    const poItemById = new Map(poItems.map((i) => [i.id, i]));
    const supplier = order ? await db.suppliers.get(order.supplier_id) : undefined;
    const receiver = receipt.received_by ? await db.users.get(receipt.received_by) : undefined;

    const items = lines
      .map((line) => ({ ...line, po_item: poItemById.get(line.po_item_id) }))
      .sort((a, b) => (a.po_item?.sort_order ?? 0) - (b.po_item?.sort_order ?? 0));

    return {
      ...receipt,
      items,
      order,
      supplier,
      received_by_name: receiver?.name ?? null,
      value: money(
        items.reduce(
          (sum, line) => sum + line.quantity_received * (Number(line.po_item?.unit_price) || 0),
          0,
        ),
      ),
    };
  }

  /**
   * Undoes a delivery: the PO lines give back the quantity, the stock gives
   * back what was added, and the order's status (and the request behind it) is
   * re-derived.
   *
   * The weighted average is **not** rewound. A running average is not
   * reversible — it depends on the order every receipt landed in, and the
   * material may already have been issued at that rate — so the quantity comes
   * back out at the store's current average and the rate stays where it is.
   * That is what a stores ledger does with a reversal, and pretending
   * otherwise would invent a price nothing was ever bought at.
   */
  async removeCascade(id: string): Promise<void> {
    const receipt = await this.getById(id);
    if (!receipt) return;

    const order = await db.purchase_orders.get(receipt.po_id);
    const lines = await goodsReceiptItemRepository.listForReceipt(id);

    for (const line of lines) {
      const poItem = await db.purchase_order_items.get(line.po_item_id);
      // symmetric with the create path: only what was accepted ever went on
      // the line, so only that comes back off it
      const stockable = stockableQuantity(line);

      if (poItem) {
        await db.purchase_order_items.update(poItem.id, {
          quantity_received: qty(Math.max(0, (Number(poItem.quantity_received) || 0) - stockable)),
        });
      }

      if (stockable > 0 && poItem) {
        await stockRepository.withdraw(
          order ? receivingStore(order) : null,
          { item_id: poItem.item_id ?? null, item_name: poItem.item_name, unit: poItem.unit },
          stockable,
        );
      }
    }

    await db.goods_receipt_items.bulkDelete(lines.map((l) => l.id));
    await this.remove(id);
    await purchaseOrderRepository.recalculateFromReceipts(receipt.po_id);
  }
}

class GoodsReceiptItemRepository extends BaseRepository<GoodsReceiptItem> {
  constructor() {
    super(() => db.goods_receipt_items);
  }

  async listForReceipt(grnId: string): Promise<GoodsReceiptItem[]> {
    return db.goods_receipt_items.where('grn_id').equals(grnId).toArray();
  }
}

/* ------------------------------------------------------------------ *
 * Stock (Section 7.7)
 * ------------------------------------------------------------------ */

export interface StockFilters {
  search?: string;
  /** '' = everywhere, 'central' = the company store, otherwise a project id */
  location?: string;
  /** hide rows that have run down to nothing */
  in_stock_only?: boolean;
}

export interface StockRowWithRelations extends StockRow {
  project?: Project;
  location_label: string;
  value: number;
  /**
   * The catalogue's current name for this item, falling back to the row's own.
   *
   * Stock is a *current state*, not a document: it says what is in the store
   * now, so it should read by what the material is called now. A purchase
   * order is the opposite — it records what was ordered, under the name it was
   * ordered as — which is why `item_name` stays on the row and the documents
   * keep using it.
   */
  display_name: string;
}

/**
 * How a stock row is addressed (Tier 3.1).
 *
 * `item_id` is the identity; `item_name` and `unit` are carried alongside so a
 * new row can be written with them and so a pre-catalogue row can still be
 * found. Both are needed at every call site, which is why they travel together
 * rather than as three loose arguments.
 */
export interface StockKey {
  item_id?: string | null;
  item_name: string;
  unit: string;
}

class StockRepository extends BaseRepository<StockRow> {
  constructor() {
    super(() => db.stock);
  }

  /**
   * The identity of a stock row: `(project_id, item_id)` since Tier 3.1.
   *
   * Section 7.7 originally made it `(project_id, item_name, unit)`, which meant
   * a material split into as many rows as it had spellings — each with its own
   * quantity and its own weighted-average cost. The catalogue item is now the
   * identity, so renaming it moves nothing.
   *
   * The name lookup is kept as a **fallback**, not as an alternative: rows
   * written before v13 that the back-fill did not reach have no `item_id`, and
   * they still have to be found. Once a row is matched to an item, the item
   * wins.
   *
   * IndexedDB cannot index `null`, so a central-store row (`project_id = null`)
   * is never found through a compound index — the lookup narrows on the item
   * and settles the project in memory. The candidate set is one item's worth of
   * rows, so this stays cheap either way.
   */
  async findRow(
    projectId: string | null,
    key: StockKey,
  ): Promise<StockRow | undefined> {
    const sameStore = (r: StockRow) => (r.project_id ?? null) === (projectId ?? null);

    if (key.item_id) {
      const byItem = await db.stock.where('item_id').equals(key.item_id).toArray();
      const hit = byItem.find(sameStore);
      if (hit) return hit;
    }

    // pre-catalogue rows, and anything the v13 back-fill could not match
    const byName = await db.stock.where('item_name').equals(key.item_name).toArray();
    return byName.find((r) => sameStore(r) && r.unit === key.unit && !r.item_id);
  }

  /** Adds received or transferred-in material, moving the weighted average. */
  async receive(
    projectId: string | null,
    key: StockKey,
    quantity: number,
    unitPrice: number,
    createdBy: string | null = null,
  ): Promise<StockRow> {
    const existing = await this.findRow(projectId, key);
    const incoming = qty(quantity);

    if (!existing) {
      return this.create(
        {
          project_id: projectId,
          item_id: key.item_id ?? null,
          item_name: key.item_name,
          unit: key.unit,
          quantity_available: incoming,
          average_unit_price: money(unitPrice),
        },
        createdBy,
      );
    }

    /*
     * A pre-catalogue row that has now been reached by a catalogued receipt
     * adopts the item, so the next lookup finds it by identity rather than by
     * spelling. Quantity and average are untouched — this only records which
     * item the row was always holding.
     */
    if (!existing.item_id && key.item_id) {
      await this.update(existing.id, { item_id: key.item_id });
    }

    const average = weightedAverage(
      existing.quantity_available,
      existing.average_unit_price,
      incoming,
      unitPrice,
    );
    const updated = await this.update(existing.id, {
      quantity_available: qty(existing.quantity_available + incoming),
      average_unit_price: average,
    });
    return updated ?? existing;
  }

  /**
   * Takes material out. Never goes below zero: a negative bin is always a data
   * error rather than a real state, and the callers that matter (issue,
   * transfer) validate against `quantity_available` before getting here.
   */
  async withdraw(
    projectId: string | null,
    key: StockKey,
    quantity: number,
  ): Promise<StockRow | undefined> {
    const existing = await this.findRow(projectId, key);
    if (!existing) return undefined;
    return this.update(existing.id, {
      quantity_available: qty(Math.max(0, existing.quantity_available - qty(quantity))),
    });
  }

  async availableFor(projectId: string | null, key: StockKey): Promise<number> {
    const row = await this.findRow(projectId, key);
    return row?.quantity_available ?? 0;
  }

  async list(filters: StockFilters = {}): Promise<StockRowWithRelations[]> {
    const [rows, projects, items] = await Promise.all([
      db.stock.toArray(),
      db.projects.toArray(),
      db.material_items.toArray(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const itemById = new Map(items.map((i) => [i.id, i]));

    let out: StockRowWithRelations[] = rows.map((row) => {
      const project = row.project_id ? projectById.get(row.project_id) : undefined;
      const item = row.item_id ? itemById.get(row.item_id) : undefined;
      return {
        ...row,
        project,
        location_label: project?.name ?? 'Main store',
        display_name: item?.name ?? row.item_name,
        value: stockValue(row),
      };
    });

    if (filters.location) {
      out =
        filters.location === 'central'
          ? out.filter((r) => !r.project_id)
          : out.filter((r) => r.project_id === filters.location);
    }
    if (filters.in_stock_only) out = out.filter((r) => r.quantity_available > 0);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      out = out.filter((r) =>
        [r.display_name, r.item_name, r.unit, r.location_label].some((f) =>
          String(f).toLowerCase().includes(q),
        ),
      );
    }

    return out.sort(
      (a, b) =>
        a.display_name.localeCompare(b.display_name) ||
        a.location_label.localeCompare(b.location_label),
    );
  }

  /** Distinct items held at one location, for the issue/transfer pickers. */
  /**
   * What can be issued or moved out of one store right now.
   *
   * Carries `display_name` for the same reason `list` does: a picker is showing
   * current stock, so it should name the material as the catalogue names it
   * today rather than as it was spelled when the row was first written.
   */
  async availableAt(
    projectId: string | null,
  ): Promise<Array<StockRow & { display_name: string }>> {
    const [rows, items] = await Promise.all([db.stock.toArray(), db.material_items.toArray()]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    return rows
      .filter((r) => (r.project_id ?? null) === (projectId ?? null) && r.quantity_available > 0)
      .map((r) => ({
        ...r,
        display_name: (r.item_id ? itemById.get(r.item_id)?.name : undefined) ?? r.item_name,
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
}

/* ------------------------------------------------------------------ *
 * Stock issues (Section 7.8)
 * ------------------------------------------------------------------ */

export interface StockIssueFilters {
  search?: string;
  project_id?: string;
  work_item_id?: string;
}

export interface StockIssueWithRelations extends StockIssue {
  project?: Project;
  work_item?: TowerWorkItem;
  tower?: Tower;
  issued_by_name?: string | null;
}

export class InsufficientStockError extends Error {
  constructor(
    readonly itemName: string,
    readonly available: number,
    readonly requested: number,
    readonly unit: string,
  ) {
    super(
      `Only ${available} ${unit} of ${itemName} in stock — ${requested} ${unit} was asked for.`,
    );
    this.name = 'InsufficientStockError';
  }
}

class StockIssueRepository extends BaseRepository<StockIssue> {
  constructor() {
    super(() => db.stock_issues);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.stock_issues.toArray()).map((r) => r.code);
    return nextCode('ISSUE', codes);
  }

  /**
   * Issues material to the site (Section 7.8).
   *
   * The cost is snapshotted from the store's weighted average **at this
   * moment** and never re-read: a later purchase at a different rate must not
   * silently restate what last month's slab cost. This frozen `total_cost` is
   * the project's real material consumption, and what Module 7 rolls up.
   */
  async issue(
    input: Omit<NewRecord<StockIssue>, 'code' | 'unit_cost_snapshot' | 'total_cost'> & {
      code?: string;
    },
    createdBy: string | null = null,
  ): Promise<StockIssue> {
    const quantity = qty(Number(input.quantity_issued) || 0);
    const key = { item_id: input.item_id ?? null, item_name: input.item_name, unit: input.unit };
    const row = await stockRepository.findRow(input.project_id, key);
    const available = row?.quantity_available ?? 0;

    if (quantity <= 0) throw new Error('Issue a quantity greater than zero.');
    if (quantity > available) {
      throw new InsufficientStockError(input.item_name, available, quantity, input.unit);
    }

    const unitCost = money(row?.average_unit_price ?? 0);
    const code = input.code?.trim() ? input.code : await this.generateCode();

    const issue = await this.create(
      {
        ...input,
        code,
        quantity_issued: quantity,
        unit_cost_snapshot: unitCost,
        total_cost: money(quantity * unitCost),
      },
      createdBy,
    );

    await stockRepository.withdraw(input.project_id, key, quantity);
    return issue;
  }

  async list(filters: StockIssueFilters = {}): Promise<StockIssueWithRelations[]> {
    const [issues, projects, workItems, towers, users] = await Promise.all([
      db.stock_issues.toArray(),
      db.projects.toArray(),
      db.tower_work_items.toArray(),
      db.towers.toArray(),
      db.users.toArray(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const workItemById = new Map(workItems.map((w) => [w.id, w]));
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let rows: StockIssueWithRelations[] = issues.map((issue) => {
      const workItem = issue.work_item_id ? workItemById.get(issue.work_item_id) : undefined;
      return {
        ...issue,
        project: projectById.get(issue.project_id),
        work_item: workItem,
        tower: workItem ? towerById.get(workItem.tower_id) : undefined,
        issued_by_name: issue.issued_by ? (userById.get(issue.issued_by)?.name ?? null) : null,
      };
    });

    if (filters.project_id) rows = rows.filter((r) => r.project_id === filters.project_id);
    if (filters.work_item_id) rows = rows.filter((r) => r.work_item_id === filters.work_item_id);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.code, r.item_name, r.notes, r.project?.name, r.work_item?.name, r.issued_by_name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort(
      (a, b) => b.issue_date.localeCompare(a.issue_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  /** Cancelling an issue puts the material back on the shelf it came from. */
  async removeCascade(id: string): Promise<void> {
    const issue = await this.getById(id);
    if (!issue) return;
    await stockRepository.receive(
      issue.project_id,
      { item_id: issue.item_id ?? null, item_name: issue.item_name, unit: issue.unit },
      issue.quantity_issued,
      issue.unit_cost_snapshot,
    );
    await this.remove(id);
  }
}

/* ------------------------------------------------------------------ *
 * Stock transfers (Section 7.8a)
 * ------------------------------------------------------------------ */

export interface StockTransferFilters {
  search?: string;
  /** matches either side of the move */
  project_id?: string;
}

export interface StockTransferWithRelations extends StockTransfer {
  from_project?: Project;
  to_project?: Project;
  from_label: string;
  to_label: string;
  transferred_by_name?: string | null;
  received_by_name?: string | null;
  value: number;
}

class StockTransferRepository extends BaseRepository<StockTransfer> {
  constructor() {
    super(() => db.stock_transfers);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.stock_transfers.toArray()).map((r) => r.code);
    return nextCode('TRF', codes);
  }

  /**
   * Sends material from one store to another (Section 7.8a): main store → a
   * site, site → site, or a site's leftovers back to the main store
   * (`to_project_id = null`).
   *
   * Phase 2 step 4: the material leaves the source now and is **on the way**
   * until the other side counts it in (`receive`). Moving it instantly meant
   * the site never confirmed anything, so a short load was invisible. The
   * source's average cost travels with the goods.
   *
   * A dispatch to a site with no `request_id` is material sent ahead — the
   * site still receives it.
   */
  async transfer(
    input: Omit<
      NewRecord<StockTransfer>,
      'code' | 'unit_cost_snapshot' | 'status' | 'quantity_received' | 'received_date' | 'received_by'
    > & { code?: string },
    createdBy: string | null = null,
  ): Promise<StockTransfer> {
    const quantity = qty(Number(input.quantity) || 0);
    const from = input.from_project_id ?? null;
    const to = input.to_project_id ?? null;

    if (quantity <= 0) throw new Error('Send a quantity greater than zero.');
    if (from === to) throw new Error('Source and destination are the same store.');

    const key = { item_id: input.item_id ?? null, item_name: input.item_name, unit: input.unit };
    const source = await stockRepository.findRow(from, key);
    const available = source?.quantity_available ?? 0;
    if (quantity > available) {
      throw new InsufficientStockError(input.item_name, available, quantity, input.unit);
    }

    const unitCost = money(source?.average_unit_price ?? 0);
    const code = input.code?.trim() ? input.code : await this.generateCode();

    const transfer = await this.create(
      {
        ...input,
        to_project_id: to,
        code,
        quantity,
        unit_cost_snapshot: unitCost,
        status: 'on_the_way',
        quantity_received: null,
        received_date: null,
        received_by: null,
      },
      createdBy,
    );

    await stockRepository.withdraw(from, key, quantity);
    await markRequestReceivedByTransfer(transfer, createdBy);
    return transfer;
  }

  /**
   * The other side counts it in. What arrived goes on its shelf at the cost it
   * left with; a shortfall stays on the record with a note rather than
   * disappearing.
   */
  async receive(
    id: string,
    input: { quantity_received: number; received_date: string; received_by: string | null; note?: string | null },
  ): Promise<StockTransfer | undefined> {
    const transfer = await this.getById(id);
    if (!transfer) return undefined;
    if (transferStatus(transfer) === 'received') throw new Error('This dispatch has already been received.');

    const got = qty(Number(input.quantity_received) || 0);
    if (got < 0) throw new Error('Received quantity cannot be negative.');
    if (got > transfer.quantity + 0.0005) {
      throw new Error(`Only ${transfer.quantity} ${transfer.unit} was sent.`);
    }
    if (got < transfer.quantity - 0.0005 && !input.note?.trim()) {
      throw new Error('Less arrived than was sent — say what happened in the note.');
    }

    const key = { item_id: transfer.item_id ?? null, item_name: transfer.item_name, unit: transfer.unit };
    if (got > 0) {
      await stockRepository.receive(
        transfer.to_project_id ?? null,
        key,
        got,
        transfer.unit_cost_snapshot,
        input.received_by,
      );
    }
    const saved = await this.update(id, {
      status: 'received',
      quantity_received: got,
      received_date: input.received_date,
      received_by: input.received_by,
      receive_note: input.note?.trim() || null,
    });
    if (transfer.request_id) await syncRequestFromSite(transfer.request_id, input.received_by);
    return saved;
  }

  /** Dispatches a store has not counted in yet; `null` = the main store. */
  async onTheWayTo(projectId: string | null): Promise<StockTransferWithRelations[]> {
    const rows = await this.list();
    return rows.filter(
      (r) => transferStatus(r) === 'on_the_way' && (r.to_project_id ?? null) === (projectId ?? null),
    );
  }

  async list(filters: StockTransferFilters = {}): Promise<StockTransferWithRelations[]> {
    const [transfers, projects, users] = await Promise.all([
      db.stock_transfers.toArray(),
      db.projects.toArray(),
      db.users.toArray(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let rows: StockTransferWithRelations[] = transfers.map((transfer) => {
      const fromProject = transfer.from_project_id
        ? projectById.get(transfer.from_project_id)
        : undefined;
      const toProject = transfer.to_project_id ? projectById.get(transfer.to_project_id) : undefined;
      return {
        ...transfer,
        from_project: fromProject,
        to_project: toProject,
        from_label: fromProject?.name ?? 'Main store',
        to_label: transfer.to_project_id ? (toProject?.name ?? 'Unknown project') : 'Main store',
        received_by_name: transfer.received_by
          ? (userById.get(transfer.received_by)?.name ?? null)
          : null,
        transferred_by_name: transfer.transferred_by
          ? (userById.get(transfer.transferred_by)?.name ?? null)
          : null,
        value: money(transfer.quantity * transfer.unit_cost_snapshot),
      };
    });

    if (filters.project_id) {
      rows = rows.filter(
        (r) => r.from_project_id === filters.project_id || r.to_project_id === filters.project_id,
      );
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.code, r.item_name, r.notes, r.from_label, r.to_label, r.transferred_by_name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort(
      (a, b) =>
        b.transfer_date.localeCompare(a.transfer_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  /**
   * Reverses the move — back out of the destination (only what it counted
   * in), back into the source (all of it: a shortfall reversed is a shortfall
   * that never happened).
   */
  async removeCascade(id: string): Promise<void> {
    const transfer = await this.getById(id);
    if (!transfer) return;
    // the material goes back before the request does, so a failure here leaves
    // the request open rather than closed against stock that has moved
    await reopenRequestClosedByTransfer(transfer);
    const key = {
      item_id: transfer.item_id ?? null,
      item_name: transfer.item_name,
      unit: transfer.unit,
    };
    const arrived = transferReceivedQuantity(transfer);
    if (arrived > 0) await stockRepository.withdraw(transfer.to_project_id ?? null, key, arrived);
    await stockRepository.receive(
      transfer.from_project_id ?? null,
      key,
      transfer.quantity,
      transfer.unit_cost_snapshot,
    );
    await this.remove(id);
  }
}

/* ------------------------------------------------------------------ *
 * Supplier vouchers (Section 7.9)
 * ------------------------------------------------------------------ */

export interface SupplierVoucherFilters {
  search?: string;
  supplier_id?: string;
  po_id?: string;
  /** '' = every voucher, 'central' = the ones with no project */
  project_id?: string;
  payment_method?: string;
}

export interface SupplierVoucherWithRelations extends SupplierVoucher {
  supplier?: Supplier;
  order?: PurchaseOrder;
  project?: Project;
  paid_by_name?: string | null;
}

class SupplierVoucherRepository extends BaseRepository<SupplierVoucher> {
  constructor() {
    super(() => db.supplier_vouchers);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.supplier_vouchers.toArray()).map((r) => r.code);
    return nextCode('VCH', codes);
  }

  /**
   * Pays a supplier against an approved bill — the final billable voucher
   * (Phase 2 step 4). Order, supplier and project are copied off the bill
   * rather than chosen: Section 7.11 makes the PO the link in the cost chain,
   * and letting them disagree is how a payment lands on the wrong project.
   *
   * Paying more than the voucher's balance is refused. That is not a budget
   * rule — it is a second payment of the same bill, which is the mistake this
   * whole chain exists to catch.
   */
  async pay(
    input: Omit<NewRecord<SupplierVoucher>, 'code' | 'supplier_id' | 'project_id' | 'po_id'> & {
      code?: string;
      bill_id: string;
    },
    createdBy: string | null = null,
  ): Promise<SupplierVoucher> {
    const bill = await db.supplier_bills.get(input.bill_id);
    if (!bill) throw new Error('The bill this payment settles no longer exists.');
    if (!isBillPayable(bill.status)) {
      throw new Error('Only an approved bill (a payable voucher) can be paid.');
    }
    const amount = money(Number(input.amount) || 0);
    if (amount <= 0) throw new Error('Enter an amount greater than zero.');
    const paid = await supplierBillRepository.paidOn(bill.id);
    const balance = money(bill.payable_amount - paid);
    if (amount > balance + 0.009) {
      throw new Error(`Only ${balance.toLocaleString('en-IN')} is left to pay on ${bill.code}.`);
    }

    const code = input.code?.trim() ? input.code : await this.generateCode();
    const saved = await this.create(
      {
        ...input,
        code,
        amount,
        po_id: bill.po_id,
        supplier_id: bill.supplier_id,
        project_id: bill.project_id ?? null,
      },
      createdBy,
    );
    await supplierBillRepository.syncPaid(bill.id);
    return saved;
  }

  async list(filters: SupplierVoucherFilters = {}): Promise<SupplierVoucherWithRelations[]> {
    const [vouchers, suppliers, orders, projects, users] = await Promise.all([
      db.supplier_vouchers.toArray(),
      db.suppliers.toArray(),
      db.purchase_orders.toArray(),
      db.projects.toArray(),
      db.users.toArray(),
    ]);
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let rows: SupplierVoucherWithRelations[] = vouchers.map((voucher) => ({
      ...voucher,
      supplier: supplierById.get(voucher.supplier_id),
      order: orderById.get(voucher.po_id),
      project: voucher.project_id ? projectById.get(voucher.project_id) : undefined,
      paid_by_name: voucher.paid_by ? (userById.get(voucher.paid_by)?.name ?? null) : null,
    }));

    if (filters.supplier_id) rows = rows.filter((r) => r.supplier_id === filters.supplier_id);
    if (filters.po_id) rows = rows.filter((r) => r.po_id === filters.po_id);
    if (filters.payment_method && filters.payment_method !== 'all') {
      rows = rows.filter((r) => r.payment_method === filters.payment_method);
    }
    if (filters.project_id) {
      rows =
        filters.project_id === 'central'
          ? rows.filter((r) => !r.project_id)
          : rows.filter((r) => r.project_id === filters.project_id);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.code, r.reference_no, r.notes, r.supplier?.name, r.order?.code, r.project?.name, r.paid_by_name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return rows.sort(
      (a, b) =>
        b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  async getWithRelations(id: string): Promise<SupplierVoucherWithRelations | null> {
    const voucher = await this.getById(id);
    if (!voucher) return null;
    const rows = await this.list();
    return rows.find((r) => r.id === id) ?? null;
  }

  async summaryForOrder(poId: string) {
    const [items, vouchers] = await Promise.all([
      purchaseOrderItemRepository.listForOrder(poId),
      db.supplier_vouchers.where('po_id').equals(poId).toArray(),
    ]);
    return paymentSummary(poTotals(items).value, vouchers);
  }

  async removeCascade(id: string): Promise<void> {
    const voucher = await this.getById(id);
    await documentRepository.removeForEntity('supplier_voucher', id);
    await this.remove(id);
    if (voucher?.bill_id) await supplierBillRepository.syncPaid(voucher.bill_id);
  }
}

/* ------------------------------------------------------------------ *
 * Supplier bills → payable vouchers (Phase 2 step 4, PLATFORM-REPLAN §4.3)
 * ------------------------------------------------------------------ */

export interface SupplierBillLineInput {
  po_item_id: string;
  quantity_billed: number;
  rate_billed: number;
}

export interface SupplierBillFilters {
  search?: string;
  status?: SupplierBillStatus | 'all' | 'payable';
  supplier_id?: string;
  project_id?: string;
  po_id?: string;
}

export interface SupplierBillWithRelations extends SupplierBill {
  items: SupplierBillItem[];
  order?: PurchaseOrder;
  supplier?: Supplier;
  project?: Project;
  match: MatchResult;
  paid: number;
  balance: number;
  /** payable above the matched lines at the order's rate — the price difference */
  price_difference: number;
  recorded_by_name?: string | null;
  verified_by_name?: string | null;
  approved_by_name?: string | null;
  has_scan: boolean;
}

class SupplierBillRepository extends BaseRepository<SupplierBill> {
  constructor() {
    super(() => db.supplier_bills);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.supplier_bills.toArray()).map((r) => r.code);
    return nextCode('BILL', codes);
  }

  /**
   * The match for a set of billed lines on one order, against what other
   * (non-rejected) bills on that order already billed.
   */
  async matchFor(
    poId: string,
    lines: SupplierBillLineInput[],
    excludeBillId: string | null = null,
  ): Promise<MatchResult> {
    const [poItems, bills] = await Promise.all([
      purchaseOrderItemRepository.listForOrder(poId),
      db.supplier_bills.where('po_id').equals(poId).toArray(),
    ]);
    const others = bills.filter((b) => b.id !== excludeBillId && billCounts(b.status));
    const otherItems = others.length
      ? await db.supplier_bill_items.where('bill_id').anyOf(others.map((b) => b.id)).toArray()
      : [];
    const before = new Map<string, number>();
    for (const i of otherItems) {
      before.set(i.po_item_id, qty((before.get(i.po_item_id) ?? 0) + (Number(i.quantity_billed) || 0)));
    }
    const byId = new Map(poItems.map((i) => [i.id, i]));
    return threeWayMatch(
      lines
        .filter((l) => byId.has(l.po_item_id))
        .map((l) => ({
          po_item: byId.get(l.po_item_id)!,
          billed_before: before.get(l.po_item_id) ?? 0,
          quantity_billed: l.quantity_billed,
          rate_billed: l.rate_billed,
        })),
    );
  }

  /**
   * Procurement records the supplier's bill. Lines with nothing billed are
   * dropped. The payable starts at the matched value; the verifier settles it.
   */
  async record(
    input: {
      po_id: string;
      bill_no: string;
      bill_date: string;
      vat_amount?: number | null;
      ait_amount?: number | null;
      notes?: string | null;
      code?: string;
      items: SupplierBillLineInput[];
    },
    createdBy: string | null = null,
  ): Promise<SupplierBill> {
    const order = await db.purchase_orders.get(input.po_id);
    if (!order) throw new Error('The purchase order this bill is for no longer exists.');
    if (!input.bill_no.trim()) throw new Error("Enter the supplier's bill number.");
    const lines = input.items.filter((l) => (Number(l.quantity_billed) || 0) > 0);
    if (lines.length === 0) throw new Error('Bill at least one line.');

    const duplicate = (await db.supplier_bills.where('supplier_id').equals(order.supplier_id).toArray()).find(
      (b) => b.bill_no.trim().toLowerCase() === input.bill_no.trim().toLowerCase() && b.status !== 'rejected',
    );
    if (duplicate) {
      throw new Error(`This supplier's bill ${input.bill_no} is already recorded as ${duplicate.code}.`);
    }

    const match = await this.matchFor(order.id, lines);
    const code = input.code?.trim() ? input.code : await this.generateCode();
    const bill = await this.create(
      {
        code,
        po_id: order.id,
        supplier_id: order.supplier_id,
        project_id: order.project_id ?? null,
        bill_no: input.bill_no.trim(),
        bill_date: input.bill_date,
        status: 'recorded',
        billed_amount: match.billed_value,
        vat_amount: input.vat_amount ?? null,
        ait_amount: input.ait_amount ?? null,
        payable_amount: match.matched_value,
        payable_note: null,
        notes: input.notes?.trim() || null,
      },
      createdBy,
    );
    for (const line of lines) {
      await db.supplier_bill_items.add({
        id: newId(),
        bill_id: bill.id,
        po_item_id: line.po_item_id,
        quantity_billed: qty(Number(line.quantity_billed) || 0),
        rate_billed: money(Number(line.rate_billed) || 0),
        created_at: bill.created_at,
        updated_at: bill.created_at,
        created_by: createdBy,
      });
    }
    return bill;
  }

  /**
   * Accounts confirm the match and settle what we will pay. A payable that is
   * not the matched value needs a note — that is the whole audit trail of a
   * difference.
   */
  async verify(
    id: string,
    input: { payable_amount: number; payable_note?: string | null; by: string | null; date: string },
  ): Promise<SupplierBill | undefined> {
    const bill = await this.getWithRelations(id);
    if (!bill) return undefined;
    if (bill.status !== 'recorded') throw new Error('Only a bill waiting to be verified can be verified.');
    const payable = money(Number(input.payable_amount) || 0);
    if (payable <= 0) throw new Error('The payable amount must be greater than zero.');
    if (Math.abs(payable - bill.match.matched_value) > 0.009 && !input.payable_note?.trim()) {
      throw new Error('The payable differs from the matched value — say why in the note.');
    }
    return this.update(id, {
      status: 'verified',
      payable_amount: payable,
      payable_note: input.payable_note?.trim() || null,
      verified_by: input.by,
      verified_at: input.date,
    });
  }

  /**
   * Management approves: the bill becomes the final billable voucher. A rate
   * above the order is allowed with a note (client decision 2026-10-11).
   */
  async approve(
    id: string,
    input: { by: string | null; date: string; note?: string | null },
  ): Promise<SupplierBill | undefined> {
    const bill = await this.getWithRelations(id);
    if (!bill) return undefined;
    if (bill.status !== 'verified') throw new Error('Only a verified bill can be approved.');
    if (!bill.match.clean && !input.note?.trim()) {
      throw new Error('This bill does not match the order and receipts — note why it is approved.');
    }
    return this.update(id, {
      status: 'approved',
      approved_by: input.by,
      approved_at: input.date,
      decision_note: input.note?.trim() || bill.decision_note || null,
    });
  }

  /** Sent back to the supplier, at verification or approval. */
  async reject(id: string, input: { by: string | null; date: string; reason: string }) {
    const bill = await this.getById(id);
    if (!bill) return undefined;
    if (bill.status !== 'recorded' && bill.status !== 'verified') {
      throw new Error('A bill that is approved or paid cannot be rejected.');
    }
    if (!input.reason.trim()) throw new Error('Give the reason for rejecting it.');
    return this.update(id, {
      status: 'rejected',
      decision_note: input.reason.trim(),
      ...(bill.status === 'recorded'
        ? { verified_by: input.by, verified_at: input.date }
        : { approved_by: input.by, approved_at: input.date }),
    });
  }

  async paidOn(billId: string): Promise<number> {
    const rows = await db.supplier_vouchers.where('bill_id').equals(billId).toArray();
    return money(rows.reduce((t, v) => t + (Number(v.amount) || 0), 0));
  }

  /** Approved → Part paid → Paid follows the payments; never set by hand. */
  async syncPaid(billId: string): Promise<void> {
    const bill = await this.getById(billId);
    if (!bill || !['approved', 'part_paid', 'paid'].includes(bill.status)) return;
    const paid = await this.paidOn(billId);
    const next: SupplierBillStatus =
      paid <= 0.009 ? 'approved' : paid >= bill.payable_amount - 0.009 ? 'paid' : 'part_paid';
    if (next !== bill.status) await this.update(billId, { status: next });
  }

  async list(filters: SupplierBillFilters = {}): Promise<SupplierBillWithRelations[]> {
    let bills = await db.supplier_bills.toArray();
    if (filters.po_id) bills = bills.filter((b) => b.po_id === filters.po_id);
    if (filters.supplier_id) bills = bills.filter((b) => b.supplier_id === filters.supplier_id);
    if (filters.project_id) {
      bills =
        filters.project_id === 'central'
          ? bills.filter((b) => !b.project_id)
          : bills.filter((b) => b.project_id === filters.project_id);
    }
    if (filters.status === 'payable') bills = bills.filter((b) => isBillPayable(b.status));
    else if (filters.status && filters.status !== 'all') bills = bills.filter((b) => b.status === filters.status);

    const full = await Promise.all(bills.map((b) => this.relate(b)));
    let out = full;
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      out = out.filter((r) =>
        [r.code, r.bill_no, r.notes, r.supplier?.name, r.order?.code, r.project?.name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }
    return out.sort((a, b) => b.bill_date.localeCompare(a.bill_date) || b.created_at.localeCompare(a.created_at));
  }

  async getWithRelations(id: string): Promise<SupplierBillWithRelations | null> {
    const bill = await this.getById(id);
    return bill ? this.relate(bill) : null;
  }

  private async relate(bill: SupplierBill): Promise<SupplierBillWithRelations> {
    const [items, order, supplier, project, paid, docs] = await Promise.all([
      db.supplier_bill_items.where('bill_id').equals(bill.id).toArray(),
      db.purchase_orders.get(bill.po_id),
      db.suppliers.get(bill.supplier_id),
      bill.project_id ? db.projects.get(bill.project_id) : Promise.resolve(undefined),
      this.paidOn(bill.id),
      db.documents.where('entity_id').equals(bill.id).toArray(),
    ]);
    const match = await this.matchFor(
      bill.po_id,
      items.map((i) => ({ po_item_id: i.po_item_id, quantity_billed: i.quantity_billed, rate_billed: i.rate_billed })),
      bill.id,
    );
    const userIds = [bill.created_by, bill.verified_by, bill.approved_by].filter(Boolean) as string[];
    const users = userIds.length ? await db.users.bulkGet(userIds) : [];
    const name = (id?: string | null) => (id ? (users.find((u) => u?.id === id)?.name ?? null) : null);
    const payableLive = isBillPayable(bill.status) || bill.status === 'paid';
    return {
      ...bill,
      items,
      order,
      supplier,
      project,
      match,
      paid,
      balance: payableLive ? money(Math.max(0, bill.payable_amount - paid)) : 0,
      price_difference: money(bill.payable_amount - match.matched_at_order_rate),
      recorded_by_name: name(bill.created_by),
      verified_by_name: name(bill.verified_by),
      approved_by_name: name(bill.approved_by),
      has_scan: docs.some((d) => d.entity_type === 'supplier_bill'),
    };
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await db.supplier_bills.toArray();
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  async blockedByPayments(id: string): Promise<number> {
    return db.supplier_vouchers.where('bill_id').equals(id).count();
  }

  async removeCascade(id: string): Promise<void> {
    if ((await this.blockedByPayments(id)) > 0) {
      throw new Error('Payments have been made against this bill; delete those first.');
    }
    const items = await db.supplier_bill_items.where('bill_id').equals(id).toArray();
    await db.supplier_bill_items.bulkDelete(items.map((i) => i.id));
    await documentRepository.removeForEntity('supplier_bill', id);
    await this.remove(id);
  }
}

/* ------------------------------------------------------------------ *
 * What a site used, and what it sent back (Section 7.8b addendum)
 * ------------------------------------------------------------------ */

export interface SiteStockFilters {
  search?: string;
  project_id?: string;
}

export interface StockConsumptionWithRelations extends StockConsumption {
  project?: Project;
  work_item?: TowerWorkItem;
  tower?: Tower;
  recorded_by_name?: string | null;
}

export interface StockReturnWithRelations extends StockReturn {
  project?: Project;
  returned_by_name?: string | null;
}

export class InsufficientSiteStockError extends Error {
  constructor(itemName: string, atSite: number, wanted: number, unit: string) {
    super(
      `Only ${atSite} ${unit} of ${itemName} is standing on this site, so ${wanted} ${unit} cannot be accounted for. Issue more from the store first.`,
    );
    this.name = 'InsufficientSiteStockError';
  }
}

/**
 * Issues, consumption and returns for one project, as movements the domain
 * helper can net off. Shared by both repositories and by the cost roll-up, so
 * the balance is computed in exactly one place.
 */
async function siteMovementsFor(projectId: string | undefined) {
  const [issues, used, returned, writtenOff] = await Promise.all([
    projectId
      ? db.stock_issues.where('project_id').equals(projectId).toArray()
      : db.stock_issues.toArray(),
    projectId
      ? db.stock_consumptions.where('project_id').equals(projectId).toArray()
      : db.stock_consumptions.toArray(),
    projectId
      ? db.stock_returns.where('project_id').equals(projectId).toArray()
      : db.stock_returns.toArray(),
    projectId
      ? db.stock_write_offs.where('project_id').equals(projectId).toArray()
      : db.stock_write_offs.toArray(),
  ]);
  return {
    issues,
    used,
    returned,
    writtenOff,
    balance: siteBalance(
      issues.map((i) => ({
        ...i,
        quantity: i.quantity_issued,
        unit_cost: i.unit_cost_snapshot,
        // the ageing clock starts when the material reached the site
        date: i.issue_date,
      })),
      used.map((u) => ({ ...u, quantity: u.quantity_used, unit_cost: u.unit_cost_snapshot })),
      returned.map((r) => ({
        ...r,
        quantity: r.quantity_returned,
        unit_cost: r.unit_cost_snapshot,
      })),
      writtenOff.map((w) => ({
        ...w,
        quantity: w.quantity_written_off,
        unit_cost: w.unit_cost_snapshot,
      })),
      todayLocal(),
    ),
  };
}

class SiteStockRepository {
  /** What is standing on a site right now, by item. */
  async balance(filters: SiteStockFilters = {}): Promise<SiteBalanceRow[]> {
    const { balance } = await siteMovementsFor(filters.project_id);
    if (!filters.search?.trim()) return balance;
    const q = filters.search.trim().toLowerCase();
    return balance.filter((r) => r.item_name.toLowerCase().includes(q));
  }

  /** Rows that have been standing longer than `SITE_AGEING_DAYS`. */
  async stale(filters: SiteStockFilters = {}): Promise<SiteBalanceRow[]> {
    const rows = await this.balance(filters);
    return rows.filter((r) => r.at_site_quantity > 0.0005 && isStaleOnSite(r));
  }

  /** One item's balance, for the forms that have to check before they write. */
  async rowFor(projectId: string, key: StockKey): Promise<SiteBalanceRow | undefined> {
    const { balance } = await siteMovementsFor(projectId);
    return balance.find((r) =>
      key.item_id
        ? r.item_id === key.item_id
        : r.item_id === null && r.item_name === key.item_name && r.unit === key.unit,
    );
  }
}

class StockConsumptionRepository extends BaseRepository<StockConsumption> {
  constructor() {
    super(() => db.stock_consumptions);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.stock_consumptions.toArray()).map((r) => r.code);
    return nextCode('USE', codes);
  }

  /**
   * Records material actually used on site (Section 7.8b).
   *
   * The store is not touched: the material left it when it was issued. What
   * this changes is the site balance, and it is the row Module 7 rolls up as
   * the project's real material cost.
   */
  async use(
    input: Omit<NewRecord<StockConsumption>, 'code' | 'unit_cost_snapshot' | 'total_cost'> & {
      code?: string;
    },
    createdBy: string | null = null,
  ): Promise<StockConsumption> {
    const quantity = qty(Number(input.quantity_used) || 0);
    if (quantity <= 0) throw new Error('Record a quantity greater than zero.');

    const key = { item_id: input.item_id ?? null, item_name: input.item_name, unit: input.unit };
    const row = await siteStockRepository.rowFor(input.project_id, key);
    const atSite = row?.at_site_quantity ?? 0;
    if (quantity > atSite) {
      throw new InsufficientSiteStockError(input.item_name, atSite, quantity, input.unit);
    }

    const unitCost = money(row?.average_unit_price ?? 0);
    const code = input.code?.trim() ? input.code : await this.generateCode();

    return this.create(
      {
        ...input,
        code,
        quantity_used: quantity,
        unit_cost_snapshot: unitCost,
        total_cost: money(quantity * unitCost),
      },
      createdBy,
    );
  }

  async list(filters: SiteStockFilters = {}): Promise<StockConsumptionWithRelations[]> {
    const [rows, projects, workItems, towers, users] = await Promise.all([
      db.stock_consumptions.toArray(),
      db.projects.toArray(),
      db.tower_work_items.toArray(),
      db.towers.toArray(),
      db.users.toArray(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const workItemById = new Map(workItems.map((w) => [w.id, w]));
    const towerById = new Map(towers.map((t) => [t.id, t]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let out: StockConsumptionWithRelations[] = rows.map((row) => {
      const workItem = row.work_item_id ? workItemById.get(row.work_item_id) : undefined;
      return {
        ...row,
        project: projectById.get(row.project_id),
        work_item: workItem,
        tower: workItem ? towerById.get(workItem.tower_id) : undefined,
        recorded_by_name: row.recorded_by ? (userById.get(row.recorded_by)?.name ?? null) : null,
      };
    });

    if (filters.project_id) out = out.filter((r) => r.project_id === filters.project_id);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      out = out.filter((r) =>
        [r.code, r.item_name, r.notes, r.project?.name, r.work_item?.name, r.recorded_by_name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return out.sort(
      (a, b) => b.used_date.localeCompare(a.used_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  /**
   * What each work item has consumed, keyed by `work_item_id`.
   *
   * The other half of Section 6: a tower can be logged to 100% with nothing
   * recorded as used against any of its lines, and the two halves of the module
   * then disagree with nothing noticing. This is what lets the progress panel
   * say so.
   *
   * Consumption with no work item is excluded rather than bucketed anywhere —
   * site-wide material (safety gear, site office) is real and belongs to no
   * line, and inventing a home for it would misreport whichever line got it.
   */
  async byWorkItem(): Promise<
    Map<string, { value: number; entries: number; items: Array<{ name: string; unit: string; quantity: number }> }>
  > {
    const rows = await db.stock_consumptions.toArray();
    const out = new Map<
      string,
      { value: number; entries: number; items: Array<{ name: string; unit: string; quantity: number }> }
    >();
    for (const row of rows) {
      if (!row.work_item_id) continue;
      const at = out.get(row.work_item_id) ?? { value: 0, entries: 0, items: [] };
      at.value = money(at.value + (Number(row.total_cost) || 0));
      at.entries += 1;
      // quantities, for Construction, which shows no money (Phase 2 step 4)
      const line = at.items.find((i) => i.name === row.item_name && i.unit === row.unit);
      if (line) line.quantity = qty(line.quantity + (Number(row.quantity_used) || 0));
      else at.items.push({ name: row.item_name, unit: row.unit, quantity: qty(Number(row.quantity_used) || 0) });
      out.set(row.work_item_id, at);
    }
    return out;
  }

  /** Deleting it puts the quantity back on the site, not in the store. */
  async removeCascade(id: string): Promise<void> {
    await this.remove(id);
  }
}

export interface StockWriteOffWithRelations extends StockWriteOff {
  project?: Project;
  approved_by_name?: string | null;
}

class StockWriteOffRepository extends BaseRepository<StockWriteOff> {
  constructor() {
    super(() => db.stock_write_offs);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.stock_write_offs.toArray()).map((r) => r.code);
    return nextCode('WO', codes);
  }

  /**
   * Writes material off a site (Section 7.8b).
   *
   * Neither the store nor the work gets it: it is gone. The cost stays with the
   * project — the money was spent — but it is reported apart from consumption,
   * because "what the building consumed" is what a bill of quantities is
   * checked against and spoilage is not part of it.
   *
   * A reason is required by the type and a note by the form. A write-off is the
   * one movement here that destroys value without producing anything, and one
   * with no explanation is indistinguishable from a mistake or a cover.
   */
  async writeOff(
    input: Omit<NewRecord<StockWriteOff>, 'code' | 'unit_cost_snapshot' | 'total_cost'> & {
      code?: string;
    },
    createdBy: string | null = null,
  ): Promise<StockWriteOff> {
    const quantity = qty(Number(input.quantity_written_off) || 0);
    if (quantity <= 0) throw new Error('Write off a quantity greater than zero.');
    if (!input.notes?.trim()) throw new Error('Say what happened to it.');

    const key = { item_id: input.item_id ?? null, item_name: input.item_name, unit: input.unit };
    const row = await siteStockRepository.rowFor(input.project_id, key);
    const atSite = row?.at_site_quantity ?? 0;
    if (quantity > atSite) {
      throw new InsufficientSiteStockError(input.item_name, atSite, quantity, input.unit);
    }

    const unitCost = money(row?.average_unit_price ?? 0);
    const code = input.code?.trim() ? input.code : await this.generateCode();

    return this.create(
      {
        ...input,
        code,
        quantity_written_off: quantity,
        unit_cost_snapshot: unitCost,
        total_cost: money(quantity * unitCost),
      },
      createdBy,
    );
  }

  async list(filters: SiteStockFilters = {}): Promise<StockWriteOffWithRelations[]> {
    const [rows, projects, users] = await Promise.all([
      db.stock_write_offs.toArray(),
      db.projects.toArray(),
      db.users.toArray(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let out: StockWriteOffWithRelations[] = rows.map((row) => ({
      ...row,
      project: projectById.get(row.project_id),
      approved_by_name: row.approved_by ? (userById.get(row.approved_by)?.name ?? null) : null,
    }));

    if (filters.project_id) out = out.filter((r) => r.project_id === filters.project_id);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      out = out.filter((r) =>
        [r.code, r.item_name, r.notes, r.reason, r.project?.name, r.approved_by_name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return out.sort(
      (a, b) =>
        b.write_off_date.localeCompare(a.write_off_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  }

  /** Reversing it puts the quantity back on the site, where it came from. */
  async removeCascade(id: string): Promise<void> {
    await this.remove(id);
  }
}

class StockReturnRepository extends BaseRepository<StockReturn> {
  constructor() {
    super(() => db.stock_returns);
  }

  async generateCode(): Promise<string> {
    const codes = (await db.stock_returns.toArray()).map((r) => r.code);
    return nextCode('RET', codes);
  }

  /**
   * Sends material back from the site to that project's store (Section 7.8b).
   *
   * It goes back at the rate it left with, so the store's weighted average is
   * not disturbed by material it already holds at that rate, and issued value
   * still equals used + returned + still at site. From the store the existing
   * transfer (7.8a) can move it to whichever project needs it, which is the
   * whole reason this exists: before it, the only way to record material
   * leaving a site was to pretend it had been consumed.
   */
  async send(
    input: Omit<NewRecord<StockReturn>, 'code' | 'unit_cost_snapshot'> & { code?: string },
    createdBy: string | null = null,
  ): Promise<StockReturn> {
    const quantity = qty(Number(input.quantity_returned) || 0);
    if (quantity <= 0) throw new Error('Return a quantity greater than zero.');

    const key = { item_id: input.item_id ?? null, item_name: input.item_name, unit: input.unit };
    const row = await siteStockRepository.rowFor(input.project_id, key);
    const atSite = row?.at_site_quantity ?? 0;
    if (quantity > atSite) {
      throw new InsufficientSiteStockError(input.item_name, atSite, quantity, input.unit);
    }

    const unitCost = money(row?.average_unit_price ?? 0);
    const code = input.code?.trim() ? input.code : await this.generateCode();

    const saved = await this.create(
      { ...input, code, quantity_returned: quantity, unit_cost_snapshot: unitCost },
      createdBy,
    );
    await stockRepository.receive(input.project_id, key, quantity, unitCost);
    return saved;
  }

  async list(filters: SiteStockFilters = {}): Promise<StockReturnWithRelations[]> {
    const [rows, projects, users] = await Promise.all([
      db.stock_returns.toArray(),
      db.projects.toArray(),
      db.users.toArray(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const userById = new Map(users.map((u) => [u.id, u]));

    let out: StockReturnWithRelations[] = rows.map((row) => ({
      ...row,
      project: projectById.get(row.project_id),
      returned_by_name: row.returned_by ? (userById.get(row.returned_by)?.name ?? null) : null,
    }));

    if (filters.project_id) out = out.filter((r) => r.project_id === filters.project_id);
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      out = out.filter((r) =>
        [r.code, r.item_name, r.notes, r.project?.name, r.returned_by_name]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return out.sort(
      (a, b) =>
        b.return_date.localeCompare(a.return_date) || b.created_at.localeCompare(a.created_at),
    );
  }

  /** Cancelling it takes the material back off the store's shelf. */
  async removeCascade(id: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) return;
    await stockRepository.withdraw(
      row.project_id,
      { item_id: row.item_id ?? null, item_name: row.item_name, unit: row.unit },
      row.quantity_returned,
    );
    await this.remove(id);
  }
}

/* ------------------------------------------------------------------ *
 * The site's view of its material (Phase 2 step 4) — quantities, no money
 * ------------------------------------------------------------------ */

export interface IncomingDelivery {
  /** `po:<id>` or `trf:<id>` */
  id: string;
  kind: 'order' | 'dispatch';
  code: string;
  /** supplier, or the store it was sent from */
  from_label: string;
  date: string;
  request_code?: string | null;
  /** material sent ahead: nobody on site asked for it */
  sent_ahead: boolean;
  lines: Array<{ item_name: string; unit: string; quantity: number; outstanding: number }>;
  order?: PurchaseOrderWithRelations;
  transfer?: StockTransferWithRelations;
}

export interface SiteMaterialRow {
  id: string;
  item_id: string | null;
  item_name: string;
  unit: string;
  /** everything that reached the site: supplier deliveries + dispatches counted in */
  received: number;
  /** in the site store, not handed out */
  in_store: number;
  /** handed out to the work, not yet recorded as used */
  in_use: number;
  used: number;
  written_off: number;
  /** leftovers sent to the main store or another site */
  sent_back: number;
  /** on the way back, not yet counted in by the other side */
  sending: number;
  oldest_in_use_days: number;
}

/** An order as something to receive — the same Receive at a site or the main store. */
export function orderAsDelivery(
  order: PurchaseOrderWithRelations,
  requestCode: string | null = order.request?.code ?? null,
): IncomingDelivery {
  return {
    id: `po:${order.id}`,
    kind: 'order',
    code: order.code,
    from_label: order.supplier?.name ?? 'Supplier',
    date: order.order_date,
    request_code: requestCode,
    sent_ahead: !order.request_id,
    lines: order.items.map((i) => ({
      item_name: i.item_name,
      unit: i.unit,
      quantity: i.quantity_ordered,
      outstanding: outstanding(i),
    })),
    order,
  };
}

/** A dispatch as something to receive. */
export function transferAsDelivery(
  t: StockTransferWithRelations,
  requestCode: string | null = null,
): IncomingDelivery {
  return {
    id: `trf:${t.id}`,
    kind: 'dispatch',
    code: t.code,
    from_label: t.from_label,
    date: t.transfer_date,
    request_code: requestCode,
    sent_ahead: !t.request_id,
    lines: [{ item_name: t.item_name, unit: t.unit, quantity: t.quantity, outstanding: t.quantity }],
    transfer: t,
  };
}

export type SiteMaterialMode = 'hand_out' | 'use' | 'back_to_store' | 'send_back' | 'write_off';

export interface SiteMaterialAction {
  mode: SiteMaterialMode;
  project_id: string;
  /** `SiteMaterialRow.id` */
  row_id: string;
  quantity: number;
  work_item_id?: string | null;
  date: string;
  by: string | null;
  notes?: string | null;
  reason?: WriteOffReason;
}

class SiteMaterialsRepository {
  /**
   * What is coming to this site and has not been received: orders unloading
   * here, and dispatches from the main store (or another site), with or without
   * a request.
   */
  async incoming(projectId: string): Promise<IncomingDelivery[]> {
    const [orders, dispatches, requests] = await Promise.all([
      purchaseOrderRepository.list({ project_id: projectId }),
      stockTransferRepository.onTheWayTo(projectId),
      db.material_requests.where('project_id').equals(projectId).toArray(),
    ]);
    const requestCode = new Map(requests.map((r) => [r.id, r.code]));
    const out: IncomingDelivery[] = [];
    for (const order of orders) {
      if (!poDeliversToSite(order)) continue;
      if (order.status !== 'ordered' && order.status !== 'partially_received') continue;
      out.push(orderAsDelivery(order, order.request_id ? (requestCode.get(order.request_id) ?? null) : null));
    }
    for (const t of dispatches) {
      out.push(transferAsDelivery(t, t.request_id ? (requestCode.get(t.request_id) ?? null) : null));
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * What the main store has to receive: orders delivered to it, and leftovers
   * sites have sent back (Phase 2 step 4).
   */
  async incomingToMainStore(): Promise<IncomingDelivery[]> {
    const [orders, dispatches, requests] = await Promise.all([
      purchaseOrderRepository.list(),
      stockTransferRepository.onTheWayTo(null),
      db.material_requests.toArray(),
    ]);
    const requestCode = new Map(requests.map((r) => [r.id, r.code]));
    return [
      ...orders
        .filter((o) => !poDeliversToSite(o) && (o.status === 'ordered' || o.status === 'partially_received'))
        .map((o) => orderAsDelivery(o, o.request_id ? (requestCode.get(o.request_id) ?? null) : null)),
      ...dispatches.map((t) => transferAsDelivery(t, null)),
    ].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * One row per item: received, in the site store, in use, used, sent back.
   * The client's three statuses (received / in use / used) as quantities of
   * the same row rather than separate tabs.
   */
  async forProject(projectId: string): Promise<SiteMaterialRow[]> {
    const [orders, poItems, grnItems, transfers, stock, site, items] = await Promise.all([
      db.purchase_orders.where('project_id').equals(projectId).toArray(),
      db.purchase_order_items.toArray(),
      db.goods_receipt_items.toArray(),
      db.stock_transfers.toArray(),
      db.stock.where('project_id').equals(projectId).toArray(),
      siteMovementsFor(projectId),
      db.material_items.toArray(),
    ]);
    const itemName = new Map(items.map((i) => [i.id, i.name]));
    const rows = new Map<string, SiteMaterialRow>();
    const keyOf = (r: { item_id?: string | null; item_name: string; unit: string }) =>
      r.item_id ?? `name:${r.item_name}|${r.unit}`;
    const row = (r: { item_id?: string | null; item_name: string; unit: string }) => {
      const k = keyOf(r);
      let hit = rows.get(k);
      if (!hit) {
        hit = {
          id: k,
          item_id: r.item_id ?? null,
          item_name: (r.item_id ? itemName.get(r.item_id) : undefined) ?? r.item_name,
          unit: r.unit,
          received: 0,
          in_store: 0,
          in_use: 0,
          used: 0,
          written_off: 0,
          sent_back: 0,
          sending: 0,
          oldest_in_use_days: 0,
        };
        rows.set(k, hit);
      }
      return hit;
    };

    const siteOrders = new Set(orders.filter(poDeliversToSite).map((o) => o.id));
    const poItemById = new Map(poItems.filter((i) => siteOrders.has(i.po_id)).map((i) => [i.id, i]));
    for (const line of grnItems) {
      const poItem = poItemById.get(line.po_item_id);
      if (!poItem) continue;
      const r = row(poItem);
      r.received = qty(r.received + stockableQuantity(line));
    }
    for (const t of transfers) {
      if (t.to_project_id === projectId) {
        const r = row(t);
        r.received = qty(r.received + transferReceivedQuantity(t));
      }
      if (t.from_project_id === projectId) {
        const r = row(t);
        if (transferStatus(t) === 'received') r.sent_back = qty(r.sent_back + t.quantity);
        else r.sending = qty(r.sending + t.quantity);
      }
    }
    for (const s of stock) {
      const r = row(s);
      r.in_store = qty(r.in_store + (Number(s.quantity_available) || 0));
    }
    for (const b of site.balance) {
      const r = row(b);
      r.in_use = qty(r.in_use + Math.max(0, b.at_site_quantity));
      r.used = qty(r.used + b.used_quantity);
      r.written_off = qty(r.written_off + b.written_off_quantity);
      r.oldest_in_use_days = Math.max(r.oldest_in_use_days, b.at_site_quantity > 0 ? b.days_on_site : 0);
    }

    return [...rows.values()]
      .filter((r) => r.received + r.in_store + r.in_use + r.used + r.sent_back + r.sending > 0.0005)
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }

  /**
   * One site action on one item (Phase 2 step 4), quantity only:
   *
   * - `hand_out`: site store → in use (an issue);
   * - `use`: recorded as used — taken from what is in use first, the rest
   *   handed out and used in one go, because most sites do both the same day;
   * - `back_to_store`: in use → site store;
   * - `send_back`: leftovers to the main store, on the way until it counts
   *   them in — from the site store first, then from what is in use;
   * - `write_off`: damaged, lost or stolen — in use first, then store.
   */
  async act(input: SiteMaterialAction): Promise<void> {
    const quantity = qty(Number(input.quantity) || 0);
    if (quantity <= 0) throw new Error('Enter a quantity greater than zero.');
    // E2E 2026-10-12 #20 — site records are of what happened, never ahead of today
    if (!input.date) throw new Error('Enter the date.');
    if (input.date > todayLocal()) throw new Error('The date cannot be in the future.');
    const rows = await this.forProject(input.project_id);
    const row = rows.find((r) => r.id === input.row_id);
    if (!row) throw new Error('This item is no longer on the site.');
    const key = { item_id: row.item_id, item_name: row.item_name, unit: row.unit };
    const base = { project_id: input.project_id, ...key };

    const handOut = async (q: number, note: string | null) =>
      stockIssueRepository.issue(
        {
          ...base,
          work_item_id: input.work_item_id ?? null,
          quantity_issued: q,
          issue_date: input.date,
          issued_by: input.by,
          notes: note,
        },
        input.by,
      );
    const backToStore = async (q: number, note: string | null) =>
      stockReturnRepository.send(
        { ...base, quantity_returned: q, return_date: input.date, returned_by: input.by, notes: note },
        input.by,
      );
    const tooMuch = (have: number, what: string) =>
      new Error(`Only ${have} ${row.unit} of ${row.item_name} is ${what}.`);

    switch (input.mode) {
      case 'hand_out':
        if (quantity > row.in_store + 0.0005) throw tooMuch(row.in_store, 'in the site store');
        await handOut(quantity, input.notes ?? null);
        return;
      case 'back_to_store':
        if (quantity > row.in_use + 0.0005) throw tooMuch(row.in_use, 'in use');
        await backToStore(quantity, input.notes ?? null);
        return;
      case 'use': {
        if (quantity > row.in_use + row.in_store + 0.0005) {
          throw tooMuch(qty(row.in_use + row.in_store), 'on the site');
        }
        const fromStore = qty(Math.max(0, quantity - row.in_use));
        if (fromStore > 0) await handOut(fromStore, 'Handed out and used the same day.');
        await stockConsumptionRepository.use(
          {
            ...base,
            work_item_id: input.work_item_id ?? null,
            quantity_used: quantity,
            used_date: input.date,
            recorded_by: input.by,
            notes: input.notes ?? null,
          },
          input.by,
        );
        return;
      }
      case 'send_back': {
        if (quantity > row.in_use + row.in_store + 0.0005) {
          throw tooMuch(qty(row.in_use + row.in_store), 'on the site');
        }
        const fromUse = qty(Math.max(0, quantity - row.in_store));
        if (fromUse > 0) await backToStore(fromUse, 'Collected from the work to send back.');
        await stockTransferRepository.transfer(
          {
            ...key,
            quantity,
            from_project_id: input.project_id,
            to_project_id: null,
            transfer_date: input.date,
            transferred_by: input.by,
            notes: input.notes ?? 'Leftover sent back to the main store.',
          },
          input.by,
        );
        return;
      }
      case 'write_off': {
        if (!input.notes?.trim()) throw new Error('Say what happened to it.');
        if (quantity > row.in_use + row.in_store + 0.0005) {
          throw tooMuch(qty(row.in_use + row.in_store), 'on the site');
        }
        const fromStore = qty(Math.max(0, quantity - row.in_use));
        if (fromStore > 0) await handOut(fromStore, 'Taken from the store to write off.');
        await stockWriteOffRepository.writeOff(
          {
            ...base,
            quantity_written_off: quantity,
            reason: input.reason ?? 'damaged',
            notes: input.notes.trim(),
            write_off_date: input.date,
            approved_by: input.by,
          },
          input.by,
        );
        return;
      }
    }
  }

  /**
   * Mark used straight from the site store: most sites hand out and use the
   * same day, so the hand-out is recorded with it rather than as a second step.
   */
  async useFromStore(
    input: {
      project_id: string;
      item_id?: string | null;
      item_name: string;
      unit: string;
      quantity: number;
      work_item_id?: string | null;
      date: string;
      by: string | null;
      notes?: string | null;
    },
  ): Promise<void> {
    const issue = await stockIssueRepository.issue(
      {
        project_id: input.project_id,
        work_item_id: input.work_item_id ?? null,
        item_id: input.item_id ?? null,
        item_name: input.item_name,
        unit: input.unit,
        quantity_issued: input.quantity,
        issue_date: input.date,
        issued_by: input.by,
        notes: 'Handed out and used the same day.',
      },
      input.by,
    );
    await stockConsumptionRepository.use(
      {
        project_id: input.project_id,
        work_item_id: input.work_item_id ?? null,
        item_id: issue.item_id ?? null,
        item_name: issue.item_name,
        unit: issue.unit,
        quantity_used: issue.quantity_issued,
        used_date: input.date,
        recorded_by: input.by,
        notes: input.notes ?? null,
      },
      input.by,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Project cost traceability (Section 7.11)
 * ------------------------------------------------------------------ */

class ProcurementCostRepository {
  /**
   * Section 7.11's chain, rolled up for one project:
   * `material_requests` → `purchase_orders` → `stock` → `stock_issues` →
   * `supplier_vouchers`, with `stock_transfers` bridging the central-store
   * route. Nothing here needs an extra mapping table — every step already
   * carries `project_id`.
   */
  async forProject(projectId: string): Promise<ProjectCostSummary> {
    const [orders, items, site, transfers, vouchers, stock, requests] = await Promise.all([
      db.purchase_orders.toArray(),
      db.purchase_order_items.toArray(),
      siteMovementsFor(projectId),
      db.stock_transfers.toArray(),
      db.supplier_vouchers.toArray(),
      db.stock.toArray(),
      db.material_requests.where('project_id').equals(projectId).toArray(),
    ]);

    const itemsByPo = groupBy(items, (i) => i.po_id);
    const projectOrders = orders.filter((o) => o.project_id === projectId);

    let orderedValue = 0;
    let siteReceivedValue = 0;
    let draftValue = 0;
    let receivedValue = 0;
    let openPos = 0;
    for (const order of projectOrders) {
      if (order.status === 'cancelled') continue;
      const totals = poTotals(itemsByPo.get(order.id) ?? []);
      /*
       * A draft is a shopping list, not a commitment — the same rule the
       * supplier stats and the procurement dashboard already applied, and the
       * same words the purchase order form uses ("a draft commits nothing").
       *
       * This roll-up was the one place that disagreed, so a project whose only
       * order was a draft reported millions "Ordered" beside "0 orders still
       * open" — two numbers on one card contradicting each other. Drafts are
       * reported separately instead of vanishing, because a buyer preparing an
       * order still wants to see it.
       */
      if (order.status === 'draft') {
        draftValue += totals.value;
        continue;
      }
      orderedValue += totals.value;
      receivedValue += totals.received_value;
      // Phase 2 step 4: only what was unloaded at the site is the site's yet;
      // a main-store order reaches the project through a dispatch
      if (poDeliversToSite(order)) siteReceivedValue += totals.received_value;
      if (order.status === 'ordered' || order.status === 'partially_received') openPos += 1;
    }

    const bills = (await db.supplier_bills.where('project_id').equals(projectId).toArray()).filter(
      (b) => b.status === 'approved' || b.status === 'part_paid' || b.status === 'paid',
    );
    let payable = 0;
    let priceDifference = 0;
    for (const bill of bills) {
      const full = await supplierBillRepository.getWithRelations(bill.id);
      if (!full) continue;
      payable += full.payable_amount;
      priceDifference += full.price_difference;
    }

    return {
      ordered_value: money(orderedValue),
      draft_value: money(draftValue),
      received_value: money(receivedValue),
      site_received_value: money(siteReceivedValue),
      approved_bill_value: money(payable),
      price_difference_value: money(priceDifference),
      paid_value: money(
        vouchers
          .filter((v) => v.project_id === projectId)
          .reduce((sum, v) => sum + (Number(v.amount) || 0), 0),
      ),
      stock_on_hand_value: money(
        stock.filter((s) => s.project_id === projectId).reduce((sum, s) => sum + stockValue(s), 0),
      ),
      /*
       * Three numbers where there was one, because the one was two things at
       * once. `issued_value` was labelled "consumed on site — the real material
       * cost", and it is neither: it is what left the store. A delivery of 500
       * bags became project cost the day it was unloaded, and the 120 bags
       * still standing on the site were charged and invisible.
       *
       * `consumed_value` is the cost now. `at_site_value` is the rest, which
       * has a home for the first time — it can be reported, and it can be sent
       * back to the store and moved to a project that needs it.
       */
      issued_value: money(
        site.issues.reduce((sum, i) => sum + (Number(i.total_cost) || 0), 0),
      ),
      consumed_value: money(
        site.used.reduce((sum, u) => sum + (Number(u.total_cost) || 0), 0),
      ),
      // spent, and it built nothing — kept out of `consumed_value` so that
      // figure stays comparable with a bill of quantities
      written_off_value: money(
        site.writtenOff.reduce((sum, w) => sum + (Number(w.total_cost) || 0), 0),
      ),
      at_site_value: money(site.balance.reduce((sum, r) => sum + r.at_site_value, 0)),
      // counted in by the site — a dispatch on the lorry is nobody's cost yet
      transferred_in_value: money(
        transfers
          .filter((t) => t.to_project_id === projectId)
          .reduce((sum, t) => sum + transferReceivedQuantity(t) * t.unit_cost_snapshot, 0),
      ),
      transferred_out_value: money(
        transfers
          .filter((t) => t.from_project_id === projectId)
          .reduce((sum, t) => sum + t.quantity * t.unit_cost_snapshot, 0),
      ),
      open_po_count: openPos,
      request_count: requests.length,
    };
  }

  /** Headline numbers for the procurement landing pages. */
  async dashboard(): Promise<{
    open_po_count: number;
    open_po_value: number;
    awaiting_grn_value: number;
    stock_value: number;
    unpaid_value: number;
    approved_requests: number;
  }> {
    const [orders, items, vouchers, stock, requests] = await Promise.all([
      db.purchase_orders.toArray(),
      db.purchase_order_items.toArray(),
      db.supplier_vouchers.toArray(),
      db.stock.toArray(),
      db.material_requests.toArray(),
    ]);

    const itemsByPo = groupBy(items, (i) => i.po_id);
    const paidByPo = new Map<string, number>();
    for (const voucher of vouchers) {
      paidByPo.set(voucher.po_id, (paidByPo.get(voucher.po_id) ?? 0) + (Number(voucher.amount) || 0));
    }

    let openCount = 0;
    let openValue = 0;
    let awaiting = 0;
    let unpaid = 0;
    for (const order of orders) {
      if (order.status === 'cancelled') continue;
      const totals = poTotals(itemsByPo.get(order.id) ?? []);
      if (order.status === 'ordered' || order.status === 'partially_received') {
        openCount += 1;
        openValue += totals.value;
        awaiting += totals.value - totals.received_value;
      }
      if (order.status !== 'draft') {
        unpaid += Math.max(0, totals.value - (paidByPo.get(order.id) ?? 0));
      }
    }

    return {
      open_po_count: openCount,
      open_po_value: money(openValue),
      awaiting_grn_value: money(awaiting),
      stock_value: money(stock.reduce((sum, s) => sum + stockValue(s), 0)),
      unpaid_value: money(unpaid),
      approved_requests: requests.filter((r) => r.status === 'approved').length,
    };
  }

  /**
   * Approved material requests with no purchase order yet — the Procurement
   * team's actual to-do list, and the entry point of Section 7.2.
   */
  async awaitingPurchase(): Promise<MaterialRequest[]> {
    const [requests, orders] = await Promise.all([
      db.material_requests.where('status').equals('approved').toArray(),
      db.purchase_orders.toArray(),
    ]);
    const covered = new Set(
      orders.filter((o) => o.status !== 'cancelled' && o.request_id).map((o) => o.request_id!),
    );
    return requests
      .filter((r) => !covered.has(r.id))
      .sort((a, b) => a.request_date.localeCompare(b.request_date));
  }
}

/* ------------------------------------------------------------------ */

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const list = map.get(key(row));
    if (list) list.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

export const supplierRepository = new SupplierRepository();
export const purchaseOrderRepository = new PurchaseOrderRepository();
export const purchaseOrderItemRepository = new PurchaseOrderItemRepository();
export const goodsReceiptRepository = new GoodsReceiptRepository();
export const goodsReceiptItemRepository = new GoodsReceiptItemRepository();
export const stockRepository = new StockRepository();
export const stockIssueRepository = new StockIssueRepository();
export const siteStockRepository = new SiteStockRepository();
export const stockConsumptionRepository = new StockConsumptionRepository();
export const stockReturnRepository = new StockReturnRepository();
export const stockWriteOffRepository = new StockWriteOffRepository();
export const stockTransferRepository = new StockTransferRepository();
export const supplierVoucherRepository = new SupplierVoucherRepository();
export const supplierBillRepository = new SupplierBillRepository();
export const procurementCostRepository = new ProcurementCostRepository();
export const siteMaterialsRepository = new SiteMaterialsRepository();

export { outstanding };
