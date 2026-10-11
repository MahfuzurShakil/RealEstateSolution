'use client';

import { useState } from 'react';
import { MapPinPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, MoneyInput, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import {
  ACQUISITION_TYPES,
  LAND_SIZE_UNITS,
  type AcquisitionType,
  type Land,
  type LandEntryMode,
  type LandSizeUnit,
} from '@/lib/db/types';
import {
  ACQUISITION_TYPE_LABEL,
  LAND_ENTRY_MODE_LABEL,
  LAND_SIZE_UNIT_LABEL,
} from '@/lib/domain/land';
import { landJvRepository, landPipelineRepository, landRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';

/**
 * v29 — add the land a project stands on without leaving the project form
 * (PLATFORM-REPLAN.md §1.2).
 *
 * Only what is needed to start: where it is, how big, how it came to us, and
 * — for land already owned — when and what it cost. Owners, mouza/dag,
 * documents and the rest are finished on the land page later; the project's
 * Land card links there.
 *
 * Like `LandownerQuickAddModal` it renders no <form>: it opens inside the
 * project form, and nested forms are invalid HTML.
 */
export function QuickLandModal({
  open,
  initialMode,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialMode: LandEntryMode;
  onClose: () => void;
  onCreated: (land: Land) => void;
}) {
  if (!open) return null;
  return (
    <QuickLandDialog
      key={initialMode}
      initialMode={initialMode}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

const PIPELINE_TYPES: AcquisitionType[] = ['direct_purchase', 'joint_venture'];

function QuickLandDialog({
  initialMode,
  onClose,
  onCreated,
}: {
  initialMode: LandEntryMode;
  onClose: () => void;
  onCreated: (land: Land) => void;
}) {
  const [mode, setMode] = useState<LandEntryMode>(initialMode);
  const [form, setForm] = useState({
    name: '',
    location_division: 'Dhaka',
    location_district: '',
    location_area: '',
    land_size: '',
    land_size_unit: 'katha' as LandSizeUnit,
    acquisition_type: 'direct_purchase' as AcquisitionType,
    asking_price: '',
    owned_on: '',
    price_paid: '',
    registration_paid: '',
    developer_share_pct: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const owned = mode === 'owned';
  const isJv = form.acquisition_type === 'joint_venture';
  const types = owned ? ACQUISITION_TYPES : PIPELINE_TYPES;
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function chooseMode(next: LandEntryMode) {
    setMode(next);
    if (next === 'pipeline' && !PIPELINE_TYPES.includes(form.acquisition_type)) {
      set('acquisition_type', 'direct_purchase');
    }
  }

  async function save() {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Required';
    if (!form.location_district.trim()) next.location_district = 'Required';
    if (!form.location_area.trim()) next.location_area = 'Required';
    if (!(Number(form.land_size) > 0)) next.land_size = 'Enter a size above 0';
    if (owned && !form.owned_on) next.owned_on = 'Required';
    if (!owned && form.acquisition_type === 'direct_purchase' && !(Number(form.asking_price) >= 0 && form.asking_price.trim()))
      next.asking_price = 'Enter an amount';
    // a signed JV has a split; one still being chased gets its terms at signing
    const devShare = Number(form.developer_share_pct);
    if (owned && isJv && !(devShare > 0 && devShare < 100)) next.developer_share_pct = 'Between 1 and 99';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const land = await landRepository.create({
        code: '',
        name: form.name.trim(),
        location_division: form.location_division.trim() || 'Dhaka',
        location_district: form.location_district.trim(),
        location_area: form.location_area.trim(),
        land_size: Number(form.land_size),
        land_size_unit: form.land_size_unit,
        asking_price: owned ? 0 : Number(form.asking_price) || 0,
        acquisition_type: form.acquisition_type,
        status: 'sourced',
        entry_mode: 'pipeline',
      });
      if (owned) {
        if (isJv) {
          await landJvRepository.upsertForLand(land.id, {
            developer_share_pct: devShare,
            landowner_share_pct: 100 - devShare,
            agreement_date: form.owned_on,
            power_of_attorney: false,
            poa_reference: null,
            jv_share_basis: 'flat_count',
          });
        }
        await landPipelineRepository.recordOwnedEntry(
          land.id,
          {
            acquired_on: form.owned_on,
            reference_no: null,
            paid: {
              land_price: Number(form.price_paid) || 0,
              registration_fee: Number(form.registration_paid) || 0,
            },
          },
          null,
        );
      }
      onCreated((await landRepository.getById(land.id)) ?? land);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title="Add land for this project"
      subtitle="The essentials now. Owners, mouza/dag and documents can be finished on the land page."
      icon={MapPinPlus}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Add land'}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-hairline bg-white p-1">
        {(['owned', 'pipeline'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => chooseMode(m)}
            aria-pressed={mode === m}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              mode === m ? 'bg-admin-500 text-white' : 'text-ink-muted hover:bg-admin-50',
            )}
          >
            {m === 'owned' ? LAND_ENTRY_MODE_LABEL.owned : 'Still to acquire'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Land name" required error={errors.name} className="sm:col-span-2">
          <TextInput
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Purbachal Sector 12 plot"
            invalid={Boolean(errors.name)}
            autoFocus
          />
        </Field>
        <Field label="District" required error={errors.location_district}>
          <TextInput
            value={form.location_district}
            onChange={(e) => set('location_district', e.target.value)}
            placeholder="e.g. Narayanganj"
            invalid={Boolean(errors.location_district)}
          />
        </Field>
        <Field label="Area" required error={errors.location_area}>
          <TextInput
            value={form.location_area}
            onChange={(e) => set('location_area', e.target.value)}
            placeholder="e.g. Purbachal"
            invalid={Boolean(errors.location_area)}
          />
        </Field>
        <Field label="Size" required error={errors.land_size}>
          <div className="flex gap-2">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.land_size}
              onChange={(e) => set('land_size', e.target.value)}
              invalid={Boolean(errors.land_size)}
            />
            <SelectInput
              value={form.land_size_unit}
              onChange={(e) => set('land_size_unit', e.target.value)}
              className="w-32"
            >
              {LAND_SIZE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {LAND_SIZE_UNIT_LABEL[u]}
                </option>
              ))}
            </SelectInput>
          </div>
        </Field>
        <Field label="Acquisition type" required>
          <SelectInput
            value={form.acquisition_type}
            onChange={(e) => set('acquisition_type', e.target.value)}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {ACQUISITION_TYPE_LABEL[t]}
              </option>
            ))}
          </SelectInput>
        </Field>

        {owned ? (
          <>
            <Field label={isJv ? 'JV signed on' : 'Owned since'} required error={errors.owned_on}>
              <TextInput
                type="date"
                value={form.owned_on}
                onChange={(e) => set('owned_on', e.target.value)}
                invalid={Boolean(errors.owned_on)}
              />
            </Field>
            {isJv ? (
              <Field
                label="Developer share %"
                required
                error={errors.developer_share_pct}
                hint="The landowner gets the rest, counted in flats"
              >
                <TextInput
                  type="number"
                  value={form.developer_share_pct}
                  onChange={(e) => set('developer_share_pct', e.target.value)}
                  placeholder="e.g. 55"
                  invalid={Boolean(errors.developer_share_pct)}
                />
              </Field>
            ) : (
              <div />
            )}
            <Field label={isJv ? 'Signing money paid' : 'Land price paid'}>
              <MoneyInput
                value={form.price_paid}
                onChange={(e) => set('price_paid', e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Registration & fees paid" hint="Other heads can be added on the land's cost sheet">
              <MoneyInput
                value={form.registration_paid}
                onChange={(e) => set('registration_paid', e.target.value)}
                placeholder="0"
              />
            </Field>
          </>
        ) : (
          form.acquisition_type === 'direct_purchase' && (
            <Field label="Asking price" required error={errors.asking_price}>
              <MoneyInput
                value={form.asking_price}
                onChange={(e) => set('asking_price', e.target.value)}
                placeholder="e.g. 45000000"
                invalid={Boolean(errors.asking_price)}
              />
            </Field>
          )
        )}
      </div>
    </Modal>
  );
}
