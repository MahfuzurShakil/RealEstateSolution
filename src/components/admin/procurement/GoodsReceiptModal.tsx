'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PackageCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { QUALITY_CHECKS, type QualityCheck } from '@/lib/db/types';
import { QUALITY_CHECK_META, money, outstanding } from '@/lib/domain/procurement';
import type { PurchaseOrderWithRelations } from '@/lib/repositories';
import { goodsReceiptRepository, userRepository } from '@/lib/repositories';
import { formatBdt, formatBdtRate, todayLocal } from '@/lib/utils/format';

/**
 * Record a delivery against a purchase order (Section 7.6).
 *
 * Quantities default to what is still outstanding, because a full delivery is
 * the normal case and re-typing every line invites transposition errors. What
 * is deliberately NOT defaulted is the quality check: it starts at `pending`
 * so accepting material is always a decision somebody took, never a default
 * that carried a failed batch into stock.
 */
export function GoodsReceiptModal({
  open,
  order,
  onClose,
  onSaved,
}: {
  open: boolean;
  order: PurchaseOrderWithRelations;
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!open) return null;
  return <ReceiptDialog order={order} onClose={onClose} onSaved={onSaved} />;
}

interface LineState {
  quantity: string;
  quality: QualityCheck;
}

function ReceiptDialog({
  order,
  onClose,
  onSaved,
}: {
  order: PurchaseOrderWithRelations;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { userId } = useMockSession();
  const pending = order.items.filter((item) => outstanding(item) > 0);

  const [receiptDate, setReceiptDate] = useState(todayLocal());
  const [receivedBy, setReceivedBy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Record<string, LineState>>(
    Object.fromEntries(
      pending.map((item) => [
        item.id,
        { quantity: String(outstanding(item)), quality: 'pending' as QualityCheck },
      ]),
    ),
  );

  const storeTeam = useLiveQuery(
    () => userRepository.listByRole(['site_manager', 'project_manager', 'procurement']),
    [],
  );

  const setLine = (id: string, patch: Partial<LineState>) =>
    setLines((rows) => ({ ...rows, [id]: { ...rows[id], ...patch } }));

  const receivingValue = money(
    pending.reduce(
      (sum, item) => sum + (Number(lines[item.id]?.quantity) || 0) * (Number(item.unit_price) || 0),
      0,
    ),
  );
  const stockingValue = money(
    pending.reduce(
      (sum, item) =>
        sum +
        (lines[item.id]?.quality === 'passed'
          ? (Number(lines[item.id]?.quantity) || 0) * (Number(item.unit_price) || 0)
          : 0),
      0,
    ),
  );

  async function save() {
    const filled = pending
      .map((item) => ({
        po_item_id: item.id,
        quantity_received: Number(lines[item.id]?.quantity) || 0,
        quality_check: lines[item.id]?.quality ?? ('pending' as QualityCheck),
        max: outstanding(item),
        name: item.item_name,
        unit: item.unit,
      }))
      .filter((l) => l.quantity_received > 0);

    if (filled.length === 0) {
      setError('Enter the quantity that arrived on at least one line');
      return;
    }
    /*
     * Over-receipt is refused rather than silently accepted: a quantity larger
     * than what was ordered is a typo far more often than a generous supplier,
     * and letting it through would price stock at a rate for goods nobody
     * agreed to buy. Genuinely receiving more means editing the order first.
     */
    const over = filled.find((l) => l.quantity_received > l.max + 0.0005);
    if (over) {
      setError(
        `${over.name}: only ${over.max} ${over.unit} is still outstanding on this order. Edit the order if the supplier really sent more.`,
      );
      return;
    }

    setBusy(true);
    try {
      await goodsReceiptRepository.createReceipt(
        {
          po_id: order.id,
          receipt_date: receiptDate,
          received_by: receivedBy || userId,
          notes: notes.trim() || null,
          items: filled.map(({ po_item_id, quantity_received, quality_check }) => ({
            po_item_id,
            quantity_received,
            quality_check,
          })),
        },
        userId,
      );
      onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="Record Goods Receipt"
      subtitle={`${order.code} · ${order.supplier?.name ?? 'Supplier removed'}`}
      icon={PackageCheck}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || pending.length === 0}>
            {busy ? 'Saving…' : 'Record receipt'}
          </Button>
        </>
      }
    >
      {pending.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Every line on this order has been fully received — there is nothing left to book in.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Receipt date" required>
              <TextInput
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </Field>
            <Field label="Received by" className="sm:col-span-2">
              <SelectInput
                value={receivedBy ?? userId}
                onChange={(e) => setReceivedBy(e.target.value)}
              >
                {(storeTeam ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <div className="space-y-3">
            {pending.map((item) => {
              const state = lines[item.id];
              const max = outstanding(item);
              return (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-xl border border-hairline bg-white p-3 sm:grid-cols-[1fr_120px_150px] sm:items-end"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{item.item_name}</p>
                    <p className="text-xs text-ink-muted">
                      {max} {item.unit} outstanding · {formatBdtRate(item.unit_price)}/{item.unit}
                    </p>
                  </div>
                  <Field label="Received">
                    <TextInput
                      type="number"
                      min={0}
                      max={max}
                      step="any"
                      value={state?.quantity ?? ''}
                      onChange={(e) => setLine(item.id, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Quality check">
                    <SelectInput
                      value={state?.quality ?? 'pending'}
                      onChange={(e) =>
                        setLine(item.id, { quality: e.target.value as QualityCheck })
                      }
                    >
                      {QUALITY_CHECKS.map((q) => (
                        <option key={q} value={q}>
                          {QUALITY_CHECK_META[q].label}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
              );
            })}
          </div>

          <Field label="Notes">
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Challan number, vehicle, anything the storekeeper noted"
            />
          </Field>

          <div className="rounded-xl border border-hairline bg-white p-3 text-xs text-ink-muted">
            <div className="flex items-center justify-between">
              <span>Delivery value</span>
              <span className="font-medium text-ink">{formatBdt(receivingValue)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>Going into stock</span>
              <span className="font-medium text-emerald-700">{formatBdt(stockingValue)}</span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-1.5">
              Only <Badge tone={QUALITY_CHECK_META.passed.tone}>Passed</Badge> quantities reach
              stock and move the weighted average price (Section 7.6). Failed and pending lines stay
              on this receipt as a record so the same material is not quietly re-booked.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
