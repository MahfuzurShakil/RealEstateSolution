'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownToLine, Hammer, Hand, PackageX, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { WRITE_OFF_REASONS, type WriteOffReason } from '@/lib/db/types';
import type { SiteMaterialMode, SiteMaterialRow } from '@/lib/repositories';
import { siteMaterialsRepository, towerRepository, towerWorkItemRepository } from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';

const MODE: Record<
  SiteMaterialMode,
  { title: string; verb: string; icon: typeof Hand; help: string; workItem: boolean }
> = {
  hand_out: {
    title: 'Hand out to the work',
    verb: 'Hand out',
    icon: Hand,
    help: 'From the site store to the mason or sub-contractor. It shows as In use until it is recorded as used or comes back.',
    workItem: true,
  },
  use: {
    title: 'Mark used',
    verb: 'Mark used',
    icon: Hammer,
    help: 'Taken from what is in use first; anything beyond that is handed out from the store and used in one step. Partly or fully — record what actually went into the work.',
    workItem: true,
  },
  back_to_store: {
    title: 'Back to the site store',
    verb: 'Put back',
    icon: Undo2,
    help: 'Handed out but not used — it goes back on the site store shelf.',
    workItem: false,
  },
  send_back: {
    title: 'Send back to the main store',
    verb: 'Send back',
    icon: ArrowDownToLine,
    help: 'Leftovers when the work is done. It is on the way until the main store counts it in, and from there it can go to another project.',
    workItem: false,
  },
  write_off: {
    title: 'Write off',
    verb: 'Write off',
    icon: PackageX,
    help: 'Damaged, set in the bag, lost or stolen. It leaves the site and is recorded apart from what was used.',
    workItem: false,
  },
};

const REASON_LABEL: Record<WriteOffReason, string> = {
  damaged: 'Damaged',
  expired: 'Expired / set',
  lost: 'Lost',
  theft: 'Stolen',
  other: 'Other',
};

/** Quantity only — no money is shown in Construction (client, 2026-10-11). */
export function SiteMaterialActionModal({
  projectId,
  row,
  mode,
  onClose,
}: {
  projectId: string;
  row: SiteMaterialRow | null;
  mode: SiteMaterialMode | null;
  onClose: () => void;
}) {
  if (!row || !mode) return null;
  return <Dialog projectId={projectId} row={row} mode={mode} onClose={onClose} />;
}

function Dialog({
  projectId,
  row,
  mode,
  onClose,
}: {
  projectId: string;
  row: SiteMaterialRow;
  mode: SiteMaterialMode;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const meta = MODE[mode];
  const max =
    mode === 'hand_out' ? row.in_store : mode === 'back_to_store' ? row.in_use : row.in_use + row.in_store;
  const [quantity, setQuantity] = useState(String(Math.round(max * 1000) / 1000));
  const [workItem, setWorkItem] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState<WriteOffReason>('damaged');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const workItems = useLiveQuery(async () => {
    const [towers, items] = await Promise.all([
      towerRepository.listForProject(projectId),
      towerWorkItemRepository.listForProject(projectId),
    ]);
    const towerName = new Map(towers.map((t) => [t.id, t.name]));
    return items
      .map((i) => ({ id: i.id, tower: towerName.get(i.tower_id) ?? 'Tower', seq: i.sequence_no, name: i.name }))
      .sort((a, b) => a.tower.localeCompare(b.tower) || a.seq - b.seq)
      .map((i) => ({ id: i.id, label: `${i.tower} · ${i.name}` }));
  }, [projectId]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await siteMaterialsRepository.act({
        mode,
        project_id: projectId,
        row_id: row.id,
        quantity: Number(quantity) || 0,
        work_item_id: workItem || null,
        date,
        by: userId,
        notes: notes.trim() || null,
        reason,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={meta.title}
      subtitle={`${row.item_name} · ${row.in_store} ${row.unit} in store · ${row.in_use} in use`}
      icon={meta.icon}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={mode === 'write_off' ? 'danger' : 'primary'} onClick={save} disabled={busy}>
            {busy ? 'Saving…' : meta.verb}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-xs text-ink-muted">{meta.help}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Quantity (${row.unit})`} required hint={`Up to ${Math.round(max * 1000) / 1000}`}>
          <TextInput
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Date" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {meta.workItem && (
          <Field label="For which work" className="sm:col-span-2" hint="Optional, but it is how material is matched to progress">
            <SelectInput value={workItem} onChange={(e) => setWorkItem(e.target.value)}>
              <option value="">Site-wide / not one item</option>
              {(workItems ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}
        {mode === 'write_off' && (
          <Field label="Reason" required>
            <SelectInput value={reason} onChange={(e) => setReason(e.target.value as WriteOffReason)}>
              {WRITE_OFF_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}
        <Field
          label={mode === 'write_off' ? 'What happened (required)' : 'Note'}
          className="sm:col-span-2"
        >
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
