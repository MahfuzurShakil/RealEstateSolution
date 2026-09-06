'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HardHat, TriangleAlert, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { money } from '@/lib/domain/procurement';
import { WRITE_OFF_REASONS, type WriteOffReason } from '@/lib/db/types';
import {
  projectRepository,
  siteStockRepository,
  stockConsumptionRepository,
  stockReturnRepository,
  stockWriteOffRepository,
  towerRepository,
  towerWorkItemRepository,
  userRepository,
} from '@/lib/repositories';
import { formatBdt, formatBdtRate, todayLocal } from '@/lib/utils/format';

export type SiteStockMode = 'use' | 'return' | 'write_off';

export const WRITE_OFF_REASON_LABEL: Record<WriteOffReason, string> = {
  damaged: 'Damaged',
  expired: 'Expired / set',
  lost: 'Lost',
  theft: 'Theft',
  other: 'Other',
};

/**
 * Recording what a site used, sent back, and wrote off (Section 7.8b).
 *
 * One dialog for all three because they are the same question — "of the
 * material standing on this site, how much of this item, and where is it
 * going" — and only the destination differs: into the work, back to the store,
 * or gone. Three near-identical forms would drift.
 *
 * All three read the *site* balance rather than the store's. That balance is
 * issues minus used minus returned minus written off, so none of them can
 * account for more than is actually there.
 */
export function SiteStockModal({
  open,
  mode,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: SiteStockMode;
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
  mode: SiteStockMode;
  defaults?: { project_id?: string; item_id?: string | null };
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { userId } = useMockSession();
  const using = mode === 'use';
  const writingOff = mode === 'write_off';

  const [projectId, setProjectId] = useState(defaults?.project_id ?? '');
  const [rowKey, setRowKey] = useState<string | null>(null);
  const [towerId, setTowerId] = useState('');
  const [workItemId, setWorkItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [actor, setActor] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState<WriteOffReason>('damaged');
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
    // the one movement that destroys value without producing anything; an
    // unexplained one is indistinguishable from a mistake or a cover
    if (writingOff && !notes.trim()) {
      setError('Say what happened to it');
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
      } else if (writingOff) {
        await stockWriteOffRepository.writeOff(
          {
            project_id: projectId,
            ...key,
            quantity_written_off: wanted,
            reason,
            notes: notes.trim(),
            write_off_date: date,
            approved_by: actor || userId,
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
      title={
        using
          ? 'Record Material Used'
          : writingOff
            ? 'Write Material Off'
            : 'Return Material to Store'
      }
      subtitle={
        using
          ? 'What the site actually consumed — this is the project cost'
          : writingOff
            ? 'Damaged, expired, lost or stolen — the cost stays, the material is gone'
            : 'Unused material goes back on the shelf, ready to transfer'
      }
      icon={using ? HardHat : writingOff ? TriangleAlert : Undo2}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || tooMuch}>
            {busy ? 'Saving…' : using ? 'Record use' : writingOff ? 'Write off' : 'Return to store'}
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

        <Field label={using ? 'Used on' : writingOff ? 'Written off on' : 'Returned on'} required>
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

        {writingOff && (
          <Field label="Reason" required>
            <SelectInput
              value={reason}
              onChange={(e) => setReason(e.target.value as WriteOffReason)}
            >
              {WRITE_OFF_REASONS.map((r) => (
                <option key={r} value={r}>
                  {WRITE_OFF_REASON_LABEL[r]}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        <Field
          label={using ? 'Recorded by' : writingOff ? 'Approved by' : 'Returned by'}
          className={using || writingOff ? undefined : 'sm:col-span-2'}
        >
          <SelectInput value={actor ?? userId ?? ''} onChange={(e) => setActor(e.target.value)}>
            {(siteTeam ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          label="Notes"
          required={writingOff}
          className="sm:col-span-2"
          hint={writingOff ? 'Required — this is the only record of what happened' : undefined}
        >
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              using
                ? 'Which slab, which floor, anything worth remembering'
                : writingOff
                  ? 'Set in the bag after the monsoon; 12 bags unusable'
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
              : writingOff
                ? 'Stays as project cost — the money was spent — but is reported apart from consumption, so “what the building used” stays comparable with the bill of quantities.'
                : 'Goes back to this project’s store at the rate it left with, so the store’s average is undisturbed.'}
          </span>
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
