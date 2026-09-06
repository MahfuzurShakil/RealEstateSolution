'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HardHat, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { money } from '@/lib/domain/procurement';
import {
  projectRepository,
  siteStockRepository,
  stockConsumptionRepository,
  stockReturnRepository,
  towerRepository,
  towerWorkItemRepository,
  userRepository,
} from '@/lib/repositories';
import { formatBdt, formatBdtRate, todayLocal } from '@/lib/utils/format';

/**
 * Recording what a site used, and sending back what it did not (Section 7.8b).
 *
 * One dialog for both because they are the same question — "of the material
 * standing on this site, how much of this item, and where is it going" — and
 * the only difference is the destination: into the work, or back to the store.
 * Two near-identical forms would drift.
 *
 * Both read the *site* balance rather than the store's. That balance is issues
 * minus what has been used minus what has gone back, so neither can account for
 * more than is actually there.
 */
export function SiteStockModal({
  open,
  mode,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: 'use' | 'return';
  defaults?: { project_id?: string; item_id?: string | null };
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!open) return null;
  return <SiteStockDialog mode={mode} defaults={defaults} onClose={onClose} onSaved={onSaved} />;
}

function SiteStockDialog({
  mode,
  defaults,
  onClose,
  onSaved,
}: {
  mode: 'use' | 'return';
  defaults?: { project_id?: string; item_id?: string | null };
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { userId } = useMockSession();
  const using = mode === 'use';

  const [projectId, setProjectId] = useState(defaults?.project_id ?? '');
  const [rowKey, setRowKey] = useState<string | null>(null);
  const [towerId, setTowerId] = useState('');
  const [workItemId, setWorkItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [actor, setActor] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const atSite = useLiveQuery(
    () => (projectId ? siteStockRepository.balance({ project_id: projectId }) : Promise.resolve([])),
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

  /*
   * Only rows with something still standing. An item the site has used in full
   * has nothing left to account for, and offering it invites a quantity that
   * can only be rejected.
   */
  const rows = (atSite ?? []).filter((r) => r.at_site_quantity > 0.0005);
  // the balance is keyed the way `siteBalance` keys it — the catalogue item
  // where there is one, the spelling where there is not
  const keyOf = (r: (typeof rows)[number]) => r.item_id ?? `name:${r.item_name}|${r.unit}`;
  const selected = rows.find((r) => keyOf(r) === rowKey);

  const wanted = Number(quantity) || 0;
  const cost = money(wanted * (selected?.average_unit_price ?? 0));
  const tooMuch = Boolean(selected) && wanted > (selected?.at_site_quantity ?? 0);

  const options: ComboboxOption[] = rows.map((r) => ({
    id: keyOf(r),
    label: r.item_name,
    hint: `${r.at_site_quantity} ${r.unit} on site @ ${formatBdtRate(r.average_unit_price)}`,
  }));

  async function save() {
    if (!projectId) {
      setError('Pick the project this is on');
      return;
    }
    if (!selected) {
      setError('Pick an item standing on this site');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const key = {
        item_id: selected.item_id,
        item_name: selected.item_name,
        unit: selected.unit,
      };
      if (using) {
        await stockConsumptionRepository.use(
          {
            project_id: projectId,
            work_item_id: workItemId || null,
            ...key,
            quantity_used: wanted,
            used_date: date,
            recorded_by: actor || userId,
            notes: notes.trim() || null,
          },
          userId,
        );
      } else {
        await stockReturnRepository.send(
          {
            project_id: projectId,
            ...key,
            quantity_returned: wanted,
            return_date: date,
            returned_by: actor || userId,
            notes: notes.trim() || null,
          },
          userId,
        );
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={using ? 'Record Material Used' : 'Return Material to Store'}
      subtitle={
        using
          ? 'What the site actually consumed — this is the project cost'
          : 'Unused material goes back on the shelf, ready to transfer'
      }
      icon={using ? HardHat : Undo2}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || tooMuch}>
            {busy ? 'Saving…' : using ? 'Record use' : 'Return to store'}
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
              setRowKey(null);
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
            projectId && rows.length === 0
              ? 'Nothing is standing on this site — issue material from the store first'
              : 'What is left of it on site, at the rate it was issued at'
          }
        >
          <Combobox
            value={rowKey}
            options={options}
            onChange={setRowKey}
            disabled={!projectId || rows.length === 0}
            placeholder="Type to search what is on site…"
            emptyLabel="Nothing on this site matches"
          />
        </Field>

        <Field
          label="Quantity"
          required
          error={tooMuch ? `Only ${selected?.at_site_quantity} ${selected?.unit} is on site` : undefined}
        >
          <TextInput
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            invalid={tooMuch}
            disabled={!selected}
          />
        </Field>

        <Field label={using ? 'Used on' : 'Returned on'} required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        {/*
          Only consumption is tied to a work item. A return goes back to a
          store, which has no work in it — asking would be a field with one
          honest answer.
        */}
        {using && (
          <>
            <Field label="Tower">
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

            <Field label="Work item" hint="Which part of the work it went into">
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
          </>
        )}

        <Field label={using ? 'Recorded by' : 'Returned by'} className={using ? undefined : 'sm:col-span-2'}>
          <SelectInput value={actor ?? userId ?? ''} onChange={(e) => setActor(e.target.value)}>
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
            placeholder={
              using
                ? 'Which slab, which floor, anything worth remembering'
                : 'Why it is going back — over-issued, wrong item, work cancelled'
            }
          />
        </Field>
      </div>

      {selected && wanted > 0 && !tooMuch && (
        <p className="mt-4 rounded-xl border border-hairline p-3 text-sm text-ink">
          {wanted} {selected.unit} at {formatBdtRate(selected.average_unit_price)} ={' '}
          <span className="font-semibold">{formatBdt(cost)}</span>
          <span className="mt-1 block text-xs text-ink-muted">
            {using
              ? 'Charged to the project as material cost, at the rate it was issued at.'
              : 'Goes back to this project’s store at the rate it left with, so the store’s average is undisturbed.'}
          </span>
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
