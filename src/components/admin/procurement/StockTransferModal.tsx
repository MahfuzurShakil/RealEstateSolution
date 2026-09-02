'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { money } from '@/lib/domain/procurement';
import {
  projectRepository,
  stockRepository,
  stockTransferRepository,
  userRepository,
} from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/** `''` is the central store; a project id is that project's own store. */
const CENTRAL = '';

/**
 * Move material between stores (Section 7.8a).
 *
 * This is the second half of the advance-stocking route: buy into the central
 * store with no project, then transfer to whichever project needs it. The
 * source's average cost travels with the goods, so the destination's own
 * weighted average absorbs it at what the material actually cost.
 */
export function StockTransferModal({
  open,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  defaults?: { from_project_id?: string | null; item_name?: string; unit?: string };
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!open) return null;
  return <TransferDialog defaults={defaults} onClose={onClose} onSaved={onSaved} />;
}

function TransferDialog({
  defaults,
  onClose,
  onSaved,
}: {
  defaults?: { from_project_id?: string | null; item_name?: string; unit?: string };
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { userId } = useMockSession();

  const [fromId, setFromId] = useState(defaults?.from_project_id ?? CENTRAL);
  const [toId, setToId] = useState('');
  const [stockKey, setStockKey] = useState(
    defaults?.item_name && defaults?.unit ? `${defaults.item_name}|${defaults.unit}` : '',
  );
  const [quantity, setQuantity] = useState('');
  const [transferDate, setTransferDate] = useState(todayLocal());
  const [transferredBy, setTransferredBy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const available = useLiveQuery(
    () => stockRepository.availableAt(fromId || null),
    [fromId],
  );
  const team = useLiveQuery(
    () => userRepository.listByRole(['procurement', 'site_manager', 'project_manager']),
    [],
  );

  const selected = (available ?? []).find((r) => `${r.item_name}|${r.unit}` === stockKey);
  const requested = Number(quantity) || 0;
  const tooMuch = Boolean(selected) && requested > (selected?.quantity_available ?? 0);
  const sameStore = Boolean(toId) && (fromId || null) === toId;

  async function save() {
    if (!toId) {
      setError('Pick the project the material is going to');
      return;
    }
    if (sameStore) {
      setError('Source and destination are the same store');
      return;
    }
    if (!selected) {
      setError('Pick an item from the source store');
      return;
    }
    setBusy(true);
    try {
      await stockTransferRepository.transfer(
        {
          item_name: selected.item_name,
          unit: selected.unit,
          quantity: requested,
          from_project_id: fromId || null,
          to_project_id: toId,
          transfer_date: transferDate,
          transferred_by: transferredBy || userId,
          notes: notes.trim() || null,
        },
        userId,
      );
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The transfer could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="Transfer Stock"
      subtitle="Central store → project, or project → project"
      icon={ArrowLeftRight}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || tooMuch || sameStore}>
            {busy ? 'Saving…' : 'Transfer stock'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" required>
          <SelectInput
            value={fromId}
            onChange={(e) => {
              setFromId(e.target.value);
              setStockKey('');
            }}
          >
            <option value={CENTRAL}>Central Store</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="To" required error={sameStore ? 'Pick a different store' : undefined}>
          <SelectInput value={toId} onChange={(e) => setToId(e.target.value)} invalid={sameStore}>
            <option value="">Select…</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          label="Item"
          required
          className="sm:col-span-2"
          hint={
            (available ?? []).length === 0
              ? 'This store holds nothing yet — receive a purchase order into it first'
              : undefined
          }
        >
          <SelectInput
            value={stockKey}
            onChange={(e) => setStockKey(e.target.value)}
            disabled={(available ?? []).length === 0}
          >
            <option value="">Select…</option>
            {(available ?? []).map((row) => (
              <option key={row.id} value={`${row.item_name}|${row.unit}`}>
                {row.item_name} — {row.quantity_available} {row.unit} @{' '}
                {formatBdt(row.average_unit_price)}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          label="Quantity"
          required
          error={tooMuch ? `Only ${selected?.quantity_available} ${selected?.unit} available` : undefined}
        >
          <TextInput
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            invalid={tooMuch}
            placeholder="0"
          />
        </Field>

        <Field label="Transfer date" required>
          <TextInput
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
          />
        </Field>

        <Field label="Transferred by" className="sm:col-span-2">
          <SelectInput
            value={transferredBy ?? userId}
            onChange={(e) => setTransferredBy(e.target.value)}
          >
            {(team ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Notes" className="sm:col-span-2">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why it is being moved — surplus after casting, urgent shortage…"
          />
        </Field>
      </div>

      {selected && requested > 0 && !tooMuch && (
        <p className="mt-4 rounded-xl border border-hairline bg-white p-3 text-xs text-ink-muted">
          Moving {formatBdt(money(requested * selected.average_unit_price))} of material at{' '}
          {formatBdt(selected.average_unit_price)} per {selected.unit}. The destination store
          recalculates its own weighted average with this cost, so the project is charged what the
          material really cost rather than a nominal rate.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
