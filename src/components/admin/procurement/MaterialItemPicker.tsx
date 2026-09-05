'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Package, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { MaterialItem } from '@/lib/db/types';
import {
  DuplicateMaterialItemError,
  lookupRepository,
  materialItemRepository,
} from '@/lib/repositories';

export interface PickedItem {
  item_id: string | null;
  item_name: string;
  unit: string;
}

/**
 * Choose a material from the catalogue (Tier 3.1).
 *
 * Replaces the free-text box that let "Cement (Fresh)" and "cement fresh"
 * become two items holding separate stock and separate weighted averages.
 *
 * The unit comes with the item rather than being chosen beside it — it is a
 * property of the material, and picking them independently was the third way
 * one material could split into several stock rows.
 *
 * A line recorded before the catalogue existed, or against an item since
 * retired, keeps its own name as an option. Without that the select would fall
 * back to its first entry and quietly re-point somebody's requisition at a
 * material they never asked for.
 */
export function MaterialItemPicker({
  value,
  onChange,
  label = 'Item',
  allowCreate = true,
}: {
  value: PickedItem;
  onChange: (picked: PickedItem) => void;
  label?: string;
  allowCreate?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const items = useLiveQuery(() => materialItemRepository.options(), []);
  const options = items ?? [];

  const unlisted =
    value.item_name && !options.some((i) => i.id === value.item_id) ? value.item_name : null;

  return (
    <>
      <Field
        label={label}
        hint={value.unit ? `Stocked in ${value.unit}` : 'The unit comes with the item'}
      >
        <div className="flex gap-2">
          <SelectInput
            value={value.item_id ?? (unlisted ? `unlisted:${unlisted}` : '')}
            onChange={(e) => {
              const picked = options.find((i) => i.id === e.target.value);
              if (picked) onChange({ item_id: picked.id, item_name: picked.name, unit: picked.unit });
              else if (!e.target.value) onChange({ item_id: null, item_name: '', unit: '' });
            }}
          >
            <option value="">Choose an item…</option>
            {unlisted && <option value={`unlisted:${unlisted}`}>{unlisted} (not in catalogue)</option>}
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.unit})
              </option>
            ))}
          </SelectInput>
          {allowCreate && (
            <Button
              variant="outline"
              aria-label="Add a new material item"
              title="Add a material the catalogue does not have yet"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-4" />
            </Button>
          )}
        </div>
      </Field>

      {adding && (
        <NewItemModal
          onClose={() => setAdding(false)}
          onCreated={(item) =>
            onChange({ item_id: item.id, item_name: item.name, unit: item.unit })
          }
        />
      )}
    </>
  );
}

/**
 * Adding a material without leaving the form.
 *
 * A site engineer mid-requisition should not have to abandon it to go and
 * create a catalogue row — that is how free text got used in the first place.
 */
function NewItemModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (item: MaterialItem) => void;
}) {
  const { userId } = useMockSession();
  const units = useLiveQuery(() => lookupRepository.options('material_unit', null), []);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resolvedUnit = unit || units?.[0]?.value || '';

  return (
    <Modal
      open
      onClose={onClose}
      title="New material item"
      subtitle="It joins the catalogue and can be picked on any form"
      icon={Package}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const item = await materialItemRepository.createItem(
                  { name, unit: resolvedUnit, category },
                  userId,
                );
                onCreated(item);
                onClose();
              } catch (e) {
                setError(
                  e instanceof DuplicateMaterialItemError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : 'Could not add the item.',
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Adding…' : 'Add item'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name" required error={error ?? undefined}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cement (Shah Special)"
            invalid={Boolean(error)}
          />
        </Field>
        <Field
          label="Stocked in"
          required
          hint="One unit per item — buying in another unit is a conversion, not a second item"
        >
          <SelectInput value={resolvedUnit} onChange={(e) => setUnit(e.target.value)}>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.value}>
                {u.value}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Category" hint="Free grouping — cement, rod, sand, electrical…">
          <TextInput
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>
    </Modal>
  );
}
