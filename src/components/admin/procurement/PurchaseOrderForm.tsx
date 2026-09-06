'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Truck } from 'lucide-react';
import { SupplierFormModal } from '@/components/admin/procurement/SupplierFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { MaterialItemPicker } from './MaterialItemPicker';
import { useMockSession } from '@/lib/auth/mock-session';
import type { PurchaseOrderStatus } from '@/lib/db/types';
import { lineTotal, money } from '@/lib/domain/procurement';
import type { MaterialRequestWithRelations, PurchaseOrderWithRelations } from '@/lib/repositories';
import {
  lookupRepository,
  materialRequestRepository,
  projectRepository,
  purchaseOrderRepository,
  supplierRepository,
} from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

interface LineRow {
  /** existing row id, so the quantity already received survives an edit */
  id?: string;
  item_id: string | null;
  item_name: string;
  unit: string;
  quantity_ordered: string;
  unit_price: string;
  /**
   * Which material request copied this line in, or `null` when the buyer typed
   * it themselves.
   *
   * It has to be the request's id rather than a "copied / typed" flag. The two
   * used to be told apart by "does it have an item name", which every
   * already-copied line also satisfies, so re-picking a request stacked the
   * requisition on top of itself once per pick. A flag fixes that but not the
   * next case: the moment a copied line is cleared or re-picked it has to be
   * decided whether it is still the request's, and either answer is wrong for
   * one of the two paths. The id answers it — a line already belonging to the
   * request being picked is *already there*, so it is left exactly as it is,
   * unit price and all.
   */
  from_request: string | null;
}

const EMPTY_LINE = (): LineRow => ({
  item_id: null,
  item_name: '',
  unit: '',
  quantity_ordered: '',
  unit_price: '',
  from_request: null,
});

/**
 * Bring the lines of `request` onto the order.
 *
 * Three kinds of row, three answers:
 *   - the buyer's own lines are never touched;
 *   - lines already belonging to `request` stay exactly as they are, so a
 *     re-pick is a no-op and typed unit prices survive it;
 *   - lines from a *different* request are dropped, because they are the
 *     previous pick's output and keeping them is what duplicated the
 *     requisition.
 *
 * Kept outside the component so both entry points — the dropdown and the
 * arrive-from-a-request effect — run exactly the same code.
 */
function applyRequestLines(
  rows: LineRow[],
  request: {
    id: string;
    items: {
      item_id?: string | null;
      item_name: string;
      unit: string;
      quantity_requested: number;
      quantity_approved?: number | null;
    }[];
  },
): LineRow[] {
  const kept = rows.filter(
    (r) =>
      r.from_request === request.id ||
      // a typed line only survives if there is something on it; the blank line
      // the form opens with is not work worth keeping
      (r.from_request === null && (r.item_name.trim() !== '' || Number(r.quantity_ordered) > 0)),
  );
  if (kept.some((r) => r.from_request === request.id)) return kept;

  const copied: LineRow[] = request.items.map((item) => ({
    item_id: item.item_id ?? null,
    item_name: item.item_name,
    unit: item.unit,
    // what Procurement approved, not what the site asked for
    quantity_ordered: String(item.quantity_approved ?? item.quantity_requested),
    unit_price: '',
    from_request: request.id,
  }));
  if (copied.length === 0) return rows;
  return [...copied, ...kept];
}

/**
 * Raise or edit a purchase order (Sections 7.4 / 7.5).
 *
 * Project is deliberately optional: Section 7.4 makes `project_id` nullable so
 * material can be bought in advance into the central store and transferred to
 * whichever project needs it later (7.8a). Picking a material request fills the
 * lines from what Procurement approved — that is the entry point of the
 * Section 7.2 workflow, and re-typing the requisition is how quantities drift.
 */
export function PurchaseOrderForm({
  order,
  defaults,
}: {
  /** omit to create */
  order?: PurchaseOrderWithRelations;
  /**
   * Prefilled from the material request's "Raise Purchase Order" button. The
   * request arrives already resolved (see the page) so the lines below can be
   * seeded synchronously — a form that has to wait for it renders once as a
   * central-store purchase with nothing on it.
   */
  defaults?: { request?: MaterialRequestWithRelations; project_id?: string };
}) {
  const router = useRouter();
  const { userId } = useMockSession();

  const units = useLiveQuery(() => lookupRepository.options('material_unit', null), []);
  const defaultUnit = units?.[0]?.value ?? 'bag';

  const [requestId, setRequestId] = useState(order?.request_id ?? defaults?.request?.id ?? '');
  const [projectId, setProjectId] = useState(
    order?.project_id ?? defaults?.request?.project_id ?? defaults?.project_id ?? '',
  );
  const [supplierId, setSupplierId] = useState(order?.supplier_id ?? '');
  const [orderDate, setOrderDate] = useState(order?.order_date ?? todayLocal());
  const [status, setStatus] = useState<PurchaseOrderStatus>(order?.status ?? 'draft');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [supplierModal, setSupplierModal] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<LineRow[]>(
    order
      ? order.items.map((i) => ({
          id: i.id,
          item_id: i.item_id ?? null,
          item_name: i.item_name,
          unit: i.unit,
          quantity_ordered: String(i.quantity_ordered),
          unit_price: String(i.unit_price),
          // a saved line belongs to the order now, whatever put it there
          from_request: null,
        }))
      : // arriving from a request: its approved quantities, ready to be priced
        defaults?.request
        ? applyRequestLines([], defaults.request)
        : [EMPTY_LINE()],
  );

  const suppliers = useLiveQuery(() => supplierRepository.list(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);
  /*
   * Approved requests only (Section 7.2): a pending request has not been
   * decided yet, and buying against it would settle the decision by accident.
   * The request already on this order stays in the list even once it has moved
   * to `ordered`, otherwise editing the PO would silently drop the link.
   */
  const requests = useLiveQuery(
    () => materialRequestRepository.list({ status: 'all' }),
    [],
  );
  const selectableRequests = (requests ?? []).filter(
    (r) => r.status === 'approved' || r.id === order?.request_id,
  );
  const selectedRequest = selectableRequests.find((r) => r.id === requestId);

  const total = money(
    lines.reduce(
      (sum, l) => sum + (Number(l.quantity_ordered) || 0) * (Number(l.unit_price) || 0),
      0,
    ),
  );

  function setLine(index: number, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /**
   * Pulling a request in copies its approved quantities onto the order and
   * takes its project with it.
   *
   * Clearing the dropdown leaves the lines alone rather than deleting them —
   * losing a filled-in order to a mis-click is worse than a line the buyer can
   * delete — and they keep their `from_request` tag, so picking the request
   * again recognises them instead of copying a second set.
   */
  function applyRequest(id: string) {
    setRequestId(id);
    const request = selectableRequests.find((r) => r.id === id);
    if (!request) return;

    setProjectId(request.project_id);
    setLines((rows) => applyRequestLines(rows, request));
  }

  async function save() {
    if (!supplierId) {
      setError('Pick the supplier this order goes to');
      return;
    }
    const filled = lines.filter((l) => l.item_name.trim() && Number(l.quantity_ordered) > 0);
    if (filled.length === 0) {
      setError('Add at least one item with a quantity');
      return;
    }
    if (filled.some((l) => Number(l.unit_price) < 0)) {
      setError('A unit price cannot be negative');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        request_id: requestId || null,
        project_id: projectId || null,
        supplier_id: supplierId,
        order_date: orderDate,
        notes: notes.trim() || null,
      };
      const items = filled.map((l) => ({
        id: l.id,
        item_id: l.item_id,
        item_name: l.item_name,
        unit: l.unit || defaultUnit,
        quantity_ordered: Number(l.quantity_ordered),
        unit_price: Number(l.unit_price) || 0,
      }));

      if (order) {
        await purchaseOrderRepository.updateOrder(order.id, payload, items, userId);
        router.push(`/admin/purchase-orders/${order.id}`);
      } else {
        const saved = await purchaseOrderRepository.createOrder(
          { ...payload, status, items },
          userId,
        );
        router.push(`/admin/purchase-orders/${saved.id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Order details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Against material request"
            hint="Approved requests only — leave blank for a direct purchase"
            className="sm:col-span-2"
          >
            <SelectInput value={requestId} onChange={(e) => applyRequest(e.target.value)}>
              <option value="">Not against a request</option>
              {selectableRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.project?.name ?? 'Project removed'} · {r.items.length} line
                  {r.items.length === 1 ? '' : 's'}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field
            label="Project"
            hint="Leave blank for a central-store purchase, transferred to a project later"
          >
            <SelectInput
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={Boolean(selectedRequest)}
            >
              <option value="">Central / company stock</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Supplier" required>
            <div className="flex gap-2">
              <SelectInput value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select…</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
              <Button
                variant="outline"
                onClick={() => setSupplierModal(true)}
                aria-label="Add supplier"
                className="shrink-0"
              >
                <Truck className="size-4" />
              </Button>
            </div>
          </Field>

          <Field label="Order date" required>
            <TextInput
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </Field>

          {!order && (
            <Field
              label="Raise as"
              hint="A draft commits nothing; placing the order tells the site its request is on the way"
            >
              <SelectInput
                value={status}
                onChange={(e) => setStatus(e.target.value as PurchaseOrderStatus)}
              >
                <option value="draft">Draft</option>
                <option value="ordered">Placed with the supplier</option>
              </SelectInput>
            </Field>
          )}
        </div>

        {selectedRequest && (
          <p className="mt-4 rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            The project is taken from {selectedRequest.code} so the cost chain of Section 7.11 stays
            intact — a purchase against a request cannot be booked to a different project.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Items"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLines((rows) => [...rows, EMPTY_LINE()])}
            >
              <Plus className="size-4" /> Add item
            </Button>
          }
        />

        <div className="space-y-3">
          {lines.map((line, index) => {
            const rowTotal = lineTotal({
              quantity_ordered: Number(line.quantity_ordered) || 0,
              unit_price: Number(line.unit_price) || 0,
            });
            const received = order?.items.find((i) => i.id === line.id)?.quantity_received ?? 0;

            return (
              <div
                key={line.id ?? index}
                // stacks on a phone; a five-column grid at 375px leaves the
                // item name a few characters wide
                className="grid gap-3 rounded-xl border border-hairline p-3 sm:grid-cols-[1fr_110px_120px_130px_auto] sm:items-end"
              >
                <MaterialItemPicker
                  value={{ item_id: line.item_id, item_name: line.item_name, unit: line.unit }}
                  onChange={(picked) => setLine(index, picked)}
                />
                <Field label="Quantity">
                  <TextInput
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity_ordered}
                    onChange={(e) => setLine(index, { quantity_ordered: e.target.value })}
                    placeholder="0"
                  />
                </Field>
                {/* The unit belongs to the catalogue item — see the picker. */}
                <Field label="Unit">
                  <TextInput value={line.unit || '—'} readOnly disabled />
                </Field>
                <Field label="Unit price (BDT)">
                  <TextInput
                    type="number"
                    min={0}
                    step="any"
                    value={line.unit_price}
                    onChange={(e) => setLine(index, { unit_price: e.target.value })}
                    placeholder="0"
                  />
                </Field>
                <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                  <span className="text-sm font-medium text-ink sm:mb-1">
                    {formatBdt(rowTotal)}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                    disabled={lines.length === 1 || received > 0}
                    aria-label="Remove item"
                    title={received > 0 ? 'Already received — this line cannot be removed' : undefined}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {received > 0 && (
                  <p className="text-xs text-emerald-700 sm:col-span-5">
                    {received} {line.unit} already received against this line — it stays on the
                    order (Section 7.6, the cancellation rule).
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
          <span className="text-sm text-ink-muted">Order value</span>
          <span className="text-lg font-semibold text-ink">{formatBdt(total)}</span>
        </div>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <Field label="Notes">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery terms, credit period, who to call at the supplier…"
          />
        </Field>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : order ? 'Save changes' : 'Create purchase order'}
        </Button>
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
        {order && (
          <Badge tone="neutral" className="ml-auto self-center">
            Status is set from the goods receipts — edit does not change it
          </Badge>
        )}
      </div>

      <SupplierFormModal
        open={supplierModal}
        onClose={() => setSupplierModal(false)}
        onSaved={(supplier) => {
          setSupplierId(supplier.id);
          setSupplierModal(false);
        }}
      />
    </div>
  );
}
