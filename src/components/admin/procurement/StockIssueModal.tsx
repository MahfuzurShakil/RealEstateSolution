'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PackageMinus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { money } from '@/lib/domain/procurement';
import {
  projectRepository,
  stockIssueRepository,
  stockRepository,
  towerRepository,
  towerWorkItemRepository,
  userRepository,
} from '@/lib/repositories';
import { formatBdt, formatBdtRate, todayLocal } from '@/lib/utils/format';

/**
 * Issue material from a project's own store to the work on site (Section 7.8).
 *
 * The item is picked from what that project actually holds rather than typed:
 * a free-text item name would create a second spelling of "Cement (Shah
 * Special)" that no stock row matches, and the issue would fail validation for
 * a reason nobody could see. The cost is snapshotted from the store's weighted
 * average at this moment — that frozen figure is the project's material cost.
 */
export function StockIssueModal({
  open,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  defaults?: { project_id?: string; item_name?: string; unit?: string };
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!open) return null;
  return <IssueDialog defaults={defaults} onClose={onClose} onSaved={onSaved} />;
}

function IssueDialog({
  defaults,
  onClose,
  onSaved,
}: {
  defaults?: { project_id?: string; item_name?: string; unit?: string };
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { userId } = useMockSession();

  const [projectId, setProjectId] = useState(defaults?.project_id ?? '');
  const [stockKey, setStockKey] = useState(
    defaults?.item_name && defaults?.unit ? `${defaults.item_name}|${defaults.unit}` : '',
  );
  const [towerId, setTowerId] = useState('');
  const [workItemId, setWorkItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [issueDate, setIssueDate] = useState(todayLocal());
  const [issuedBy, setIssuedBy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const available = useLiveQuery(
    () => (projectId ? stockRepository.availableAt(projectId) : Promise.resolve([])),
    [projectId],
  );
  const towers = useLiveQuery(
    () => (projectId ? towerRepository.listForProject(projectId) : Promise.resolve([])),
    [projectId],
  );
  const workItems = useLiveQuery(
    () => (towerId ? towerWorkItemRepository.listForTower(towerId) : Promise.resolve([])),
    [towerId],
  );
  const siteTeam = useLiveQuery(
    () => userRepository.listByRole(['site_manager', 'project_manager', 'procurement']),
    [],
  );

  const selected = (available ?? []).find((r) => `${r.item_name}|${r.unit}` === stockKey);
  const requested = Number(quantity) || 0;
  const cost = money(requested * (selected?.average_unit_price ?? 0));
  const tooMuch = Boolean(selected) && requested > (selected?.quantity_available ?? 0);

  async function save() {
    if (!projectId) {
      setError('Pick the project this material is going to');
      return;
    }
    if (!selected) {
      setError('Pick an item from this project’s store');
      return;
    }
    setBusy(true);
    try {
      await stockIssueRepository.issue(
        {
          project_id: projectId,
          work_item_id: workItemId || null,
          item_name: selected.item_name,
          unit: selected.unit,
          quantity_issued: requested,
          issue_date: issueDate,
          issued_by: issuedBy || userId,
          notes: notes.trim() || null,
        },
        userId,
      );
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The issue could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="Issue Material to Site"
      subtitle="Stock leaves the store and becomes project cost"
      icon={PackageMinus}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || tooMuch}>
            {busy ? 'Saving…' : 'Issue material'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" required className="sm:col-span-2">
          <SelectInput
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setStockKey('');
              setTowerId('');
              setWorkItemId('');
            }}
          >
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
            projectId && (available ?? []).length === 0
              ? 'This project holds no stock yet — receive a purchase order against it, or transfer from the central store'
              : undefined
          }
        >
          <SelectInput
            value={stockKey}
            onChange={(e) => setStockKey(e.target.value)}
            disabled={!projectId || (available ?? []).length === 0}
          >
            <option value="">Select…</option>
            {(available ?? []).map((row) => (
              <option key={row.id} value={`${row.item_name}|${row.unit}`}>
                {row.item_name} — {row.quantity_available} {row.unit} @{' '}
                {formatBdtRate(row.average_unit_price)}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          label="Quantity"
          required
          error={tooMuch ? `Only ${selected?.quantity_available} ${selected?.unit} in stock` : undefined}
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

        <Field label="Issue date" required>
          <TextInput
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </Field>

        <Field label="Tower" hint="Optional — which part of the site it went to">
          <SelectInput
            value={towerId}
            onChange={(e) => {
              setTowerId(e.target.value);
              setWorkItemId('');
            }}
            disabled={!projectId}
          >
            <option value="">Not recorded</option>
            {(towers ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Work item" hint="Which work consumed it">
          <SelectInput
            value={workItemId}
            onChange={(e) => setWorkItemId(e.target.value)}
            disabled={!towerId}
          >
            <option value="">Not tied to one item</option>
            {(workItems ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.sequence_no}. {w.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Issued by" className="sm:col-span-2">
          <SelectInput value={issuedBy ?? userId} onChange={(e) => setIssuedBy(e.target.value)}>
            {(siteTeam ?? []).map((u) => (
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
            placeholder="Given to the mason gang, 8th floor slab casting…"
          />
        </Field>
      </div>

      {selected && requested > 0 && !tooMuch && (
        <p className="mt-4 rounded-xl border border-hairline bg-white p-3 text-xs text-ink-muted">
          Booked to the project at {formatBdtRate(selected.average_unit_price)} per {selected.unit} —{' '}
          <span className="font-semibold text-ink">{formatBdt(cost)}</span> of material cost. The
          rate is frozen now, so a later purchase at a different price will not restate it.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
