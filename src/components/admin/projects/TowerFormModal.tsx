'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { TOWER_STATUSES, type Tower, type TowerStatus } from '@/lib/db/types';
import { TOWER_STATUS_META } from '@/lib/domain/project';
import { towerRepository } from '@/lib/repositories';

interface FormState {
  name: string;
  floor_count: string;
  status: TowerStatus;
  building_type: string;
  unit_per_floor: string;
  lift_count: string;
  electricity_backup: boolean;
  front_road_width_ft: string;
}

const EMPTY: FormState = {
  name: '',
  floor_count: '',
  status: 'planning',
  building_type: '',
  unit_per_floor: '',
  lift_count: '',
  electricity_backup: false,
  front_road_width_ft: '',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: string) => (v.trim() === '' ? null : Number(v));

/**
 * Add / edit a tower (Section 3.5). A tower is small enough to live in a
 * dialog on the project page rather than a page of its own.
 */
export function TowerFormModal({
  open,
  projectId,
  tower,
  onClose,
}: {
  open: boolean;
  projectId: string;
  tower?: Tower;
  onClose: () => void;
}) {
  // mounted only while open, so the state starts from the tower being edited
  const [form, setForm] = useState<FormState>(() =>
    tower
      ? {
          name: tower.name,
          floor_count: str(tower.floor_count),
          status: tower.status,
          building_type: str(tower.building_type),
          unit_per_floor: str(tower.unit_per_floor),
          lift_count: str(tower.lift_count),
          electricity_backup: tower.electricity_backup ?? false,
          front_road_width_ft: str(tower.front_road_width_ft),
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Required';
    if (!form.floor_count.trim() || Number(form.floor_count) <= 0)
      next.floor_count = 'Enter a floor count above 0';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        name: form.name.trim(),
        floor_count: Number(form.floor_count),
        status: form.status,
        building_type: form.building_type.trim() || null,
        unit_per_floor: num(form.unit_per_floor),
        lift_count: num(form.lift_count),
        electricity_backup: form.electricity_backup,
        front_road_width_ft: num(form.front_road_width_ft),
      };
      if (tower) await towerRepository.update(tower.id, payload);
      else await towerRepository.create(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={tower ? `Edit ${tower.name}` : 'Add Tower'}
      subtitle="Blocks, towers or a single main building"
      icon={Building2}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : tower ? 'Save changes' : 'Add tower'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tower Name" required error={errors.name}>
          <TextInput
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Tower A"
            invalid={Boolean(errors.name)}
          />
        </Field>
        <Field label="Status" required>
          <SelectInput
            value={form.status}
            onChange={(e) => set('status', e.target.value as TowerStatus)}
          >
            {TOWER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TOWER_STATUS_META[s].label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Floor Count" required error={errors.floor_count}>
          <TextInput
            type="number"
            min="1"
            value={form.floor_count}
            onChange={(e) => set('floor_count', e.target.value)}
            placeholder="e.g. 12"
            invalid={Boolean(errors.floor_count)}
          />
        </Field>
        <Field label="Building Type" hint="Basement + Ground + floors">
          <TextInput
            value={form.building_type}
            onChange={(e) => set('building_type', e.target.value)}
            placeholder="e.g. B+G+10"
          />
        </Field>
        <Field label="Units per Floor">
          <TextInput
            type="number"
            min="0"
            value={form.unit_per_floor}
            onChange={(e) => set('unit_per_floor', e.target.value)}
            placeholder="e.g. 4"
          />
        </Field>
        <Field label="Lift Count">
          <TextInput
            type="number"
            min="0"
            value={form.lift_count}
            onChange={(e) => set('lift_count', e.target.value)}
            placeholder="e.g. 2"
          />
        </Field>
        <Field label="Front Road Width (ft)">
          <TextInput
            type="number"
            step="0.1"
            min="0"
            value={form.front_road_width_ft}
            onChange={(e) => set('front_road_width_ft', e.target.value)}
            placeholder="e.g. 40"
          />
        </Field>
        <div className="flex items-center pt-6">
          <Checkbox
            label="Electricity backup (generator)"
            checked={form.electricity_backup}
            onChange={(e) => set('electricity_backup', e.target.checked)}
          />
        </div>
      </div>
    </Modal>
  );
}
