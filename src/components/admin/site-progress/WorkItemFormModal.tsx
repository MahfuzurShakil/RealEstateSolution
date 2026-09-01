'use client';

import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { TowerWorkItem } from '@/lib/db/types';
import { towerWorkItemRepository } from '@/lib/repositories';

/**
 * Add or edit one WBS line (Section 6.2).
 *
 * `actual_progress_pct` is deliberately NOT editable here: progress is reported
 * through the daily log, and a back door that changes the number without
 * leaving a log entry would make the Section 6.3 trail unreliable.
 */
export function WorkItemFormModal({
  open,
  towerId,
  item,
  nextSequence,
  remainingWeight,
  onClose,
}: {
  open: boolean;
  towerId: string;
  /** omit to add a new line */
  item?: TowerWorkItem;
  nextSequence: number;
  /** how much of the 100% is still unallocated, for the hint */
  remainingWeight: number;
  onClose: () => void;
}) {
  const { userId } = useMockSession();

  /*
   * Mounted only while open (see the caller), so the initial state IS the item
   * being edited — no effect has to copy props into state afterwards.
   */
  const [name, setName] = useState(item?.name ?? '');
  const [sequence, setSequence] = useState(String(item?.sequence_no ?? nextSequence));
  const [weight, setWeight] = useState(
    String(item?.weight_pct ?? Math.max(0, Math.round(remainingWeight * 100) / 100)),
  );
  const [start, setStart] = useState(item?.planned_start_date ?? '');
  const [end, setEnd] = useState(item?.planned_end_date ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) {
      setError('A name is required');
      return;
    }
    const weightValue = Number(weight);
    if (!Number.isFinite(weightValue) || weightValue < 0 || weightValue > 100) {
      setError('Weight must be between 0 and 100');
      return;
    }
    if (start && end && end < start) {
      setError('The planned end date cannot be before the start date');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        sequence_no: Number(sequence) || nextSequence,
        weight_pct: weightValue,
        planned_start_date: start || null,
        planned_end_date: end || null,
      };
      if (item) await towerWorkItemRepository.updateItem(item.id, payload);
      else {
        await towerWorkItemRepository.create(
          { ...payload, tower_id: towerId, actual_progress_pct: 0, status: 'not_started' },
          userId,
        );
        await towerWorkItemRepository.recalculateTower(towerId);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={item ? 'Edit work item' : 'Add work item'}
      subtitle="One line of the tower's work breakdown"
      icon={ListChecks}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : item ? 'Save changes' : 'Add work item'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 5th Floor Slab Casting"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sequence" required hint="The order the work happens in">
            <TextInput
              type="number"
              min={1}
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
            />
          </Field>
          <Field
            label="Weight %"
            required
            hint={
              remainingWeight > 0.01
                ? `${remainingWeight.toFixed(2)}% of the tower is still unallocated`
                : 'All 100% is allocated — adding here needs another line trimmed'
            }
          >
            <TextInput
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Planned start" hint="Drives the planned-vs-actual comparison">
            <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Planned end">
            <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>

        {item && (
          <p className="rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            Progress stands at <span className="font-medium text-ink">{item.actual_progress_pct}%</span>.
            It is changed by logging a site update, not from this form — that is what keeps the
            daily log honest.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
