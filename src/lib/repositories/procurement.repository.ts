'use client';

import { db } from '../db/database';
import type {
  GoodsReceipt,
  GoodsReceiptItem,
  MaterialRequest,
  Project,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  QualityCheck,
  StockIssue,
  StockRow,
  StockTransfer,
  Supplier,
  SupplierType,
  SupplierVoucher,
  Tower,
  TowerWorkItem,
} from '../db/types';
import {
  money,
  outstanding,
  paymentSummary,
  poTotals,
  qty,
  statusFromReceipts,
  stockValue,
  stockableQuantity,
  weightedAverage,
  type PoTotals,
  type ProjectCostSummary,
} from '../domain/procurement';
import { allowedNextRequestStatuses } from '../domain/site-progress';
import { nextCode } from '../utils/id';
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
  po_count: number;
  /** value of every non-cancelled order placed with them */
  ordered_value: number;
  paid_value: number;
  last_order_date?: string | null;
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
    const stats = new Map<string, { count: number; value: number; last: string | null }>();
    for (const order of orders) {
      if (order.status === 'cancelled') continue;
      const entry = stats.get(order.supplier_id) ?? { count: 0, value: 0, last: null };
      entry.count += 1;
      entry.value += poTotals(itemsByPo.get(order.id) ?? []).value;
      entry.last =
        entry.last && entry.last > order.order_date ? entry.last : order.order_date;
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
      return {
        ...supplier,
        po_count: entry?.count ?? 0,
        ordered_value: money(entry?.value ?? 0),
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
    return rows.find((r) => r.id === id) ?? { ...supplier, po_count: 0, ordered_value: 0, paid_value: 0 };
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
  item_name: string;
  unit: string;
  quantity_ordered: number;
  unit_price: number;
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
    const code = rest.code?.trim() ? rest.code : await this.generateCode();

    const order = await this.create({ ...rest, code }, createdBy);
    await purchaseOrderItemRepository.replaceForOrder(order.id, items, createdBy);

    if (order.status === 'ordered') await markRequestOrdered(order, createdBy);
    return order;
  }

  async updateOrder(
    id: string,
    changes: {
      request_id?: string | null;
      project_id?: string | null;
      supplier_id?: string;
      order_date?: string;
      notes?: string | null;
    },
    items: PurchaseOrderItemInput[],
    createdBy: string | null = null,
  ): Promise<PurchaseOrder | undefined> {
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
     * Section 7.2 closes the request when the PO is fully received, and the
     * transition has to survive the reverse too: deleting the GRN that
     * completed the order puts the request back to `ordered`, otherwise the
     * site is told material arrived that has just been un-received. Both moves
     * go through the Module 5 repository so the decision trail records them.
     */
    const request = await db.material_requests.get(order.request_id);
    if (!request) return;

    if (next === 'received' && allowedNextRequestStatuses(request.status).includes('fulfilled')) {
      await materialRequestRepository.setStatus(order.request_id, 'fulfilled', {
        decided_by: actor,
        decision_note: `Fully received against ${order.code}.`,
      });
    } else if (next !== 'received' && request.status === 'fulfilled') {
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

/** Section 6.5: raising the order tells the site its request is being bought. */
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

      await db.purchase_order_items.update(poItem.id, {
        quantity_received: qty((Number(poItem.quantity_received) || 0) + quantity),
      });

      const stockable = stockableQuantity(saved);
      if (stockable > 0) {
        await stockRepository.receive(
          order?.project_id ?? null,
          poItem.item_name,
          poItem.unit,
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
      if (poItem) {
        await db.purchase_order_items.update(poItem.id, {
          quantity_received: qty(
            Math.max(0, (Number(poItem.quantity_received) || 0) - line.quantity_received),
          ),
        });
      }

      const stockable = stockableQuantity(line);
      if (stockable > 0 && poItem) {
        await stockRepository.withdraw(
          order?.project_id ?? null,
          poItem.item_name,
          poItem.unit,
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
}

class StockRepository extends BaseRepository<StockRow> {
  constructor() {
    super(() => db.stock);
  }

  /**
   * The Section 7.7 identity: one row per `(project_id, item_name, unit)`.
   *
   * IndexedDB cannot index `null`, so a central-store row would never be found
   * through the compound index — the lookup goes through `item_name` (which is
   * always present) and settles the other two in memory. The candidate set is
   * one item's worth of rows, so this stays cheap.
   */
  async findRow(
    projectId: string | null,
    itemName: string,
    unit: string,
  ): Promise<StockRow | undefined> {
    const rows = await db.stock.where('item_name').equals(itemName).toArray();
    return rows.find((r) => (r.project_id ?? null) === (projectId ?? null) && r.unit === unit);
  }

  /** Adds received or transferred-in material, moving the weighted average. */
  async receive(
    projectId: string | null,
    itemName: string,
    unit: string,
    quantity: number,
    unitPrice: number,
    createdBy: string | null = null,
  ): Promise<StockRow> {
    const existing = await this.findRow(projectId, itemName, unit);
    const incoming = qty(quantity);

    if (!existing) {
      return this.create(
        {
          project_id: projectId,
          item_name: itemName,
          unit,
          quantity_available: incoming,
          average_unit_price: money(unitPrice),
        },
        createdBy,
      );
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
    itemName: string,
    unit: string,
    quantity: number,
  ): Promise<StockRow | undefined> {
    const existing = await this.findRow(projectId, itemName, unit);
    if (!existing) return undefined;
    return this.update(existing.id, {
      quantity_available: qty(Math.max(0, existing.quantity_available - qty(quantity))),
    });
  }

  async availableFor(projectId: string | null, itemName: string, unit: string): Promise<number> {
    const row = await this.findRow(projectId, itemName, unit);
    return row?.quantity_available ?? 0;
  }

  async list(filters: StockFilters = {}): Promise<StockRowWithRelations[]> {
    const [rows, projects] = await Promise.all([db.stock.toArray(), db.projects.toArray()]);
    const projectById = new Map(projects.map((p) => [p.id, p]));

    let out: StockRowWithRelations[] = rows.map((row) => {
      const project = row.project_id ? projectById.get(row.project_id) : undefined;
      return {
        ...row,
        project,
        location_label: project?.name ?? 'Central Store',
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
        [r.item_name, r.unit, r.location_label].some((f) => String(f).toLowerCase().includes(q)),
      );
    }

    return out.sort(
      (a, b) => a.item_name.localeCompare(b.item_name) || a.location_label.localeCompare(b.location_label),
    );
  }

  /** Distinct items held at one location, for the issue/transfer pickers. */
  async availableAt(projectId: string | null): Promise<StockRow[]> {
    const rows = await db.stock.toArray();
    return rows
      .filter((r) => (r.project_id ?? null) === (projectId ?? null) && r.quantity_available > 0)
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
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
    const row = await stockRepository.findRow(input.project_id, input.item_name, input.unit);
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

    await stockRepository.withdraw(input.project_id, input.item_name, input.unit, quantity);
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
      issue.item_name,
      issue.unit,
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
   * Moves material between stores (Section 7.8a) — the central-stock route of
   * the advance-stocking scenario. The source's average cost travels with the
   * goods, so the destination's own weighted average absorbs it at what the
   * material actually cost rather than at a made-up rate.
   */
  async transfer(
    input: Omit<NewRecord<StockTransfer>, 'code' | 'unit_cost_snapshot'> & { code?: string },
    createdBy: string | null = null,
  ): Promise<StockTransfer> {
    const quantity = qty(Number(input.quantity) || 0);
    const from = input.from_project_id ?? null;

    if (quantity <= 0) throw new Error('Transfer a quantity greater than zero.');
    if (from === input.to_project_id) throw new Error('Source and destination are the same store.');

    const source = await stockRepository.findRow(from, input.item_name, input.unit);
    const available = source?.quantity_available ?? 0;
    if (quantity > available) {
      throw new InsufficientStockError(input.item_name, available, quantity, input.unit);
    }

    const unitCost = money(source?.average_unit_price ?? 0);
    const code = input.code?.trim() ? input.code : await this.generateCode();

    const transfer = await this.create(
      { ...input, code, quantity, unit_cost_snapshot: unitCost },
      createdBy,
    );

    await stockRepository.withdraw(from, input.item_name, input.unit, quantity);
    await stockRepository.receive(
      input.to_project_id,
      input.item_name,
      input.unit,
      quantity,
      unitCost,
      createdBy,
    );
    return transfer;
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
      const toProject = projectById.get(transfer.to_project_id);
      return {
        ...transfer,
        from_project: fromProject,
        to_project: toProject,
        from_label: fromProject?.name ?? 'Central Store',
        to_label: toProject?.name ?? 'Unknown project',
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

  /** Reverses the move — back out of the destination, back into the source. */
  async removeCascade(id: string): Promise<void> {
    const transfer = await this.getById(id);
    if (!transfer) return;
    await stockRepository.withdraw(
      transfer.to_project_id,
      transfer.item_name,
      transfer.unit,
      transfer.quantity,
    );
    await stockRepository.receive(
      transfer.from_project_id ?? null,
      transfer.item_name,
      transfer.unit,
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
   * Pays a supplier (Section 7.9 — direct, no approval step). `project_id` is
   * copied off the order rather than chosen: Section 7.11 makes the PO the
   * link in the cost chain, and letting the two disagree is exactly how a
   * payment ends up rolled up against the wrong project.
   */
  async pay(
    input: Omit<NewRecord<SupplierVoucher>, 'code' | 'supplier_id' | 'project_id'> & {
      code?: string;
    },
    createdBy: string | null = null,
  ): Promise<SupplierVoucher> {
    const order = await db.purchase_orders.get(input.po_id);
    if (!order) throw new Error('The purchase order this voucher pays no longer exists.');
    if (money(Number(input.amount) || 0) <= 0) throw new Error('Enter an amount greater than zero.');

    const code = input.code?.trim() ? input.code : await this.generateCode();
    return this.create(
      {
        ...input,
        code,
        amount: money(Number(input.amount) || 0),
        supplier_id: order.supplier_id,
        project_id: order.project_id ?? null,
      },
      createdBy,
    );
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
    await documentRepository.removeForEntity('supplier_voucher', id);
    await this.remove(id);
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
    const [orders, items, issues, transfers, vouchers, stock, requests] = await Promise.all([
      db.purchase_orders.toArray(),
      db.purchase_order_items.toArray(),
      db.stock_issues.where('project_id').equals(projectId).toArray(),
      db.stock_transfers.toArray(),
      db.supplier_vouchers.toArray(),
      db.stock.toArray(),
      db.material_requests.where('project_id').equals(projectId).toArray(),
    ]);

    const itemsByPo = groupBy(items, (i) => i.po_id);
    const projectOrders = orders.filter((o) => o.project_id === projectId);

    let orderedValue = 0;
    let receivedValue = 0;
    let openPos = 0;
    for (const order of projectOrders) {
      if (order.status === 'cancelled') continue;
      const totals = poTotals(itemsByPo.get(order.id) ?? []);
      orderedValue += totals.value;
      receivedValue += totals.received_value;
      if (order.status === 'ordered' || order.status === 'partially_received') openPos += 1;
    }

    return {
      ordered_value: money(orderedValue),
      received_value: money(receivedValue),
      paid_value: money(
        vouchers
          .filter((v) => v.project_id === projectId)
          .reduce((sum, v) => sum + (Number(v.amount) || 0), 0),
      ),
      stock_on_hand_value: money(
        stock.filter((s) => s.project_id === projectId).reduce((sum, s) => sum + stockValue(s), 0),
      ),
      issued_value: money(issues.reduce((sum, i) => sum + (Number(i.total_cost) || 0), 0)),
      transferred_in_value: money(
        transfers
          .filter((t) => t.to_project_id === projectId)
          .reduce((sum, t) => sum + t.quantity * t.unit_cost_snapshot, 0),
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
export const stockTransferRepository = new StockTransferRepository();
export const supplierVoucherRepository = new SupplierVoucherRepository();
export const procurementCostRepository = new ProcurementCostRepository();

export { outstanding };
