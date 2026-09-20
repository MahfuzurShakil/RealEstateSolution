'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Home, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, MoneyInput, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import {
  ALLOCATION_TYPES,
  FOR_SALE_BY,
  type AllocationType,
  type ForSaleBy,
  type Land,
  type Landowner,
  type Unit,
  type UnitStatus,
} from '@/lib/db/types';
import {
  ALLOCATION_TYPE_LABEL,
  FOR_SALE_BY_LABEL,
  UNIT_STATUS_META,
  isManualUnitStatus,
  isUnitEditable,
  shapeUses,
  unitSizeLabel,
  unitStatusOptions,
  type ProjectShape,
  type UnitField,
} from '@/lib/domain/project';
import { BOOKING_STATUS_META } from '@/lib/domain/booking';
import {
  bookingRepository,
  lookupRepository,
  projectRepository,
  unitRepository,
} from '@/lib/repositories';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: string) => (v.trim() === '' ? null : Number(v));

/**
 * Edit one item — the odd floor the bulk generator could not cover.
 *
 * v26 — which fields appear comes from `projectShape`. A plot has no floor,
 * no bedrooms and no sqft but does have an area in katha, a road width and a
 * corner flag; a share has a percentage and nothing else. Asking a plot for
 * its balcony count is not merely noise — it makes the screen unusable.
 * Mounted only while open, so the form starts from the unit it was given.
 *
 * A sold or handed-over unit opens read-only: its price and allocation are
 * already baked into a booking (and later a payment schedule), so changing
 * them here would contradict signed paperwork.
 */
export function UnitEditModal({
  open,
  projectId,
  unit,
  shape,
  onClose,
}: {
  open: boolean;
  /** scopes the landowner list to the owners of this project's own land */
  projectId: string;
  unit: Unit;
  shape: ProjectShape;
  onClose: () => void;
}) {
  /** one place the field list is asked, so the form and the save agree */
  const uses = (field: UnitField) => shapeUses(shape, field);
  const [form, setForm] = useState<Unit>(() => ({ ...unit }));
  const [owners, setOwners] = useState<
    Array<{ owner: Landowner; lands: Array<{ land: Land; share_pct: number }> }>
  >([]);
  const [unitTypes, setUnitTypes] = useState<string[]>([]);
  const [facings, setFacings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const locked = !isUnitEditable(unit.status);
  /** the booking that claimed this unit, so a locked unit can point at it */
  const booking = useLiveQuery(() => bookingRepository.activeForUnit(unit.id), [unit.id]);

  useEffect(() => {
    /*
     * Only the owners of the land this project sits on — allocating to anyone
     * else is not a thing that can be true, and `allocation()` counts per
     * owner, so it would land in the JV target-vs-actual check.
     */
    projectRepository.landownersForProject(projectId).then(setOwners);
    lookupRepository.options('unit_type').then((o) => setUnitTypes(o.map((r) => r.value)));
    lookupRepository.options('facing').then((o) => setFacings(o.map((r) => r.value)));
  }, [projectId]);

  const set = <K extends keyof Unit>(key: K, value: Unit[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!form.code.trim()) return setError('Unit code is required');
    if (await unitRepository.isCodeTaken(form.code.trim(), unit.id)) {
      return setError(`Unit code ${form.code.trim()} is already used`);
    }
    if (form.allocation_type === 'landowner_share' && !form.allocated_to_owner_id) {
      return setError(`Pick the landowner this ${shape.labels.item.toLowerCase()} belongs to`);
    }

    setSaving(true);
    try {
      await unitRepository.update(unit.id, {
        code: form.code.trim(),
        // only write back what this shape actually uses, so a plot never
        // acquires a floor 0 and a share never acquires 0 sqft
        floor: uses('floor') ? Number(form.floor) : null,
        unit_type: form.unit_type,
        bedroom_count: uses('bedrooms') ? num(str(form.bedroom_count)) : null,
        bathroom_count: uses('bedrooms') ? num(str(form.bathroom_count)) : null,
        balcony_count: uses('bedrooms') ? num(str(form.balcony_count)) : null,
        size_sqft: uses('size_sqft') ? Number(form.size_sqft) : null,
        land_size: uses('land_size') ? num(str(form.land_size)) : null,
        land_size_unit: uses('land_size') ? (form.land_size_unit ?? 'katha') : null,
        share_pct: uses('share_pct') ? num(str(form.share_pct)) : null,
        road_width_ft: uses('road_width') ? num(str(form.road_width_ft)) : null,
        is_corner: uses('corner') ? Boolean(form.is_corner) : null,
        facing: uses('facing') ? form.facing?.trim() || null : null,
        base_price: Number(form.base_price),
        parking_allocated: Number(form.parking_allocated) || 0,
        status: form.status,
        allocation_type: form.allocation_type,
        allocated_to_owner_id:
          form.allocation_type === 'landowner_share' ? form.allocated_to_owner_id : null,
        for_sale_by: form.for_sale_by,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Edit ${shape.labels.item.toLowerCase()} ${unit.code}`}
      subtitle={uses('floor') ? `Floor ${unit.floor}` : unitSizeLabel(unit, shape)}
      icon={Home}
      size="lg"
      onClose={onClose}
      footer={
        locked ? (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        )
      }
    >
      {locked && (
        <div className="mb-4 rounded-xl border border-slate-300 bg-slate-50 p-3">
          <p className="flex items-start gap-2 text-sm font-medium text-slate-700">
            <Lock className="mt-0.5 size-4 shrink-0" />
            This unit is {UNIT_STATUS_META[unit.status].label.toLowerCase()} — read only
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Its price and allocation are part of a signed booking. Change them there, not here.
          </p>
          {booking && (
            <Link href={`/admin/bookings/${booking.id}`} className="mt-3 inline-block">
              <Button variant="outline" size="sm">
                Open {booking.code}
                <Badge tone={BOOKING_STATUS_META[booking.status].tone}>
                  {BOOKING_STATUS_META[booking.status].label}
                </Badge>
              </Button>
            </Link>
          )}
        </div>
      )}
      <fieldset disabled={locked} className={locked ? 'opacity-70' : undefined}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={`${shape.labels.item} Code`} required>
          <TextInput value={form.code} onChange={(e) => set('code', e.target.value)} />
        </Field>
        {uses('floor') && (
          <Field label="Floor" required>
            <TextInput
              type="number"
              value={str(form.floor)}
              onChange={(e) => set('floor', Number(e.target.value))}
            />
          </Field>
        )}
        <Field label={`${shape.labels.item} Type`}>
          <SelectInput value={form.unit_type} onChange={(e) => set('unit_type', e.target.value)}>
            {[...new Set([form.unit_type, ...unitTypes])].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectInput>
        </Field>
        {uses('facing') && (
          <Field label="Facing">
            <SelectInput value={form.facing ?? ''} onChange={(e) => set('facing', e.target.value)}>
              <option value="">—</option>
              {[...new Set([form.facing ?? '', ...facings])].filter(Boolean).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {uses('bedrooms') && (
          <>
            <Field label="Bedrooms">
              <TextInput
                type="number"
                min="0"
                value={str(form.bedroom_count)}
                onChange={(e) => set('bedroom_count', num(e.target.value))}
              />
            </Field>
            <Field label="Bathrooms">
              <TextInput
                type="number"
                min="0"
                value={str(form.bathroom_count)}
                onChange={(e) => set('bathroom_count', num(e.target.value))}
              />
            </Field>
            <Field label="Balconies">
              <TextInput
                type="number"
                min="0"
                value={str(form.balcony_count)}
                onChange={(e) => set('balcony_count', num(e.target.value))}
              />
            </Field>
          </>
        )}
        {uses('parking') && (
          <Field label="Parking">
            <TextInput
              type="number"
              min="0"
              value={str(form.parking_allocated)}
              onChange={(e) => set('parking_allocated', Number(e.target.value))}
            />
          </Field>
        )}

        {uses('size_sqft') && (
          <Field label="Size (sqft)" required>
            <TextInput
              type="number"
              min="0"
              value={str(form.size_sqft)}
              onChange={(e) => set('size_sqft', Number(e.target.value))}
            />
          </Field>
        )}
        {uses('land_size') && (
          <Field
            label={`Area (${form.land_size_unit ?? 'katha'})`}
            hint={uses('share_pct') ? 'What this share represents on the ground' : undefined}
          >
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={str(form.land_size)}
              onChange={(e) => set('land_size', num(e.target.value))}
            />
          </Field>
        )}
        {uses('share_pct') && (
          <Field label="Share (%)" required hint="Two shares held as one → double this">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={str(form.share_pct)}
              onChange={(e) => set('share_pct', num(e.target.value))}
            />
          </Field>
        )}
        {uses('road_width') && (
          <Field label="Road width (ft)" hint="A wider road is worth real money here">
            <TextInput
              type="number"
              min="0"
              value={str(form.road_width_ft)}
              onChange={(e) => set('road_width_ft', num(e.target.value))}
            />
          </Field>
        )}
        {uses('corner') && (
          <div className="flex items-center pt-6">
            <Checkbox
              label="Corner plot"
              checked={Boolean(form.is_corner)}
              onChange={(e) => set('is_corner', e.target.checked)}
            />
          </div>
        )}
        <Field label="Base Price (BDT)" required>
          <MoneyInput
            value={str(form.base_price)}
            onChange={(e) => set('base_price', Number(e.target.value))}
          />
        </Field>
        <Field
          label="Status"
          hint={
            isManualUnitStatus(unit.status)
              ? 'Reserved, Booked and Sold are set by the booking, not here.'
              : `${UNIT_STATUS_META[unit.status].label} was set by a booking. Change it from the booking, not here.`
          }
        >
          <SelectInput
            value={form.status}
            onChange={(e) => set('status', e.target.value as UnitStatus)}
          >
            {unitStatusOptions(unit.status).map((s) => (
              <option key={s} value={s} disabled={!isManualUnitStatus(s)}>
                {UNIT_STATUS_META[s].label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field
          label="Who sells it"
          hint={
            form.allocation_type === 'landowner_share'
              ? "A landowner's own flat is not counted in company sales or collections."
              : 'A developer-share flat is the company’s to sell, so this stays with the company.'
          }
        >
          <SelectInput
            value={form.for_sale_by}
            /*
             * A developer-share flat sold "owner direct" is not a real state,
             * and it silently drops the unit out of company revenue (Section
             * 8.5 filters on exactly this field). The bulk allocate modal
             * already pairs the two; the single-unit form let them diverge.
             */
            disabled={form.allocation_type === 'developer_share'}
            onChange={(e) => set('for_sale_by', e.target.value as ForSaleBy)}
          >
            {FOR_SALE_BY.map((v) => (
              <option key={v} value={v}>
                {FOR_SALE_BY_LABEL[v]}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Allocation" className="sm:col-span-2">
          <SelectInput
            value={form.allocation_type}
            onChange={(e) => {
              const next = e.target.value as AllocationType;
              set('allocation_type', next);
              // developer share is always the company's to sell; a landowner's
              // flat defaults to their own, which they can hand back to us
              set('for_sale_by', next === 'developer_share' ? 'company' : 'owner_direct');
            }}
          >
            {ALLOCATION_TYPES.map((a) => (
              <option key={a} value={a}>
                {ALLOCATION_TYPE_LABEL[a]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Allocated To (landowner)" className="sm:col-span-2">
          <SelectInput
            value={form.allocated_to_owner_id ?? ''}
            disabled={form.allocation_type !== 'landowner_share'}
            onChange={(e) => set('allocated_to_owner_id', e.target.value || null)}
          >
            <option value="">—</option>
            {owners.map(({ owner, lands }) => (
              <option key={owner.id} value={owner.id}>
                {owner.name} — {lands.map((l) => `${l.land.code} ${l.share_pct}%`).join(', ')}
              </option>
            ))}
          </SelectInput>
        </Field>
        {form.allocation_type === 'landowner_share' && owners.length === 0 && (
          <p className="-mt-2 text-xs text-amber-700 sm:col-span-2">
            No landowner is attached to this project&rsquo;s land yet. Link the land on the
            project, and record its owners on the land record, before allocating a landowner
            share.
          </p>
        )}
      </div>
      </fieldset>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
