'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { MapPicker } from '@/components/ui/map/MapPicker';
import { LandownerQuickAddModal } from './LandownerQuickAddModal';
import {
  ACQUISITION_TYPES,
  JV_SHARE_BASES,
  LAND_SIZE_UNITS,
  type AcquisitionType,
  type JvShareBasis,
  type Land,
  type LandSizeUnit,
  type Landowner,
} from '@/lib/db/types';
import { JV_SHARE_BASIS_LABEL } from '@/lib/domain/project';
import {
  ACQUISITION_TYPE_LABEL,
  LAND_SIZE_UNIT_LABEL,
  finalAmountHint,
  finalAmountLabel,
  landUsesPurchasePricing,
} from '@/lib/domain/land';
import {
  landJvRepository,
  landOwnerMappingRepository,
  landRepository,
  landownerRepository,
  type LandWithRelations,
} from '@/lib/repositories';

interface OwnerRow {
  owner_id: string;
  ownership_share_pct: string;
  is_primary_contact: boolean;
}

interface FormState {
  name: string;
  location_division: string;
  location_district: string;
  location_area: string;
  road: string;
  mouza: string;
  dag_number: string;
  khatian_number: string;
  land_size: string;
  land_size_unit: LandSizeUnit;
  asking_price: string;
  negotiated_price: string;
  final_agreed_amount: string;
  gps_lat: string;
  gps_lng: string;
  nearby_facilities: string;
  acquisition_type: AcquisitionType;
  remarks: string;
  // JV block — only used when acquisition_type = joint_venture (Section 2.6)
  developer_share_pct: string;
  landowner_share_pct: string;
  agreement_date: string;
  power_of_attorney: boolean;
  poa_reference: string;
  jv_share_basis: JvShareBasis;
}

const EMPTY: FormState = {
  name: '',
  location_division: '',
  location_district: '',
  location_area: '',
  road: '',
  mouza: '',
  dag_number: '',
  khatian_number: '',
  land_size: '',
  land_size_unit: 'katha',
  asking_price: '',
  negotiated_price: '',
  final_agreed_amount: '',
  gps_lat: '',
  gps_lng: '',
  nearby_facilities: '',
  acquisition_type: 'direct_purchase',
  remarks: '',
  developer_share_pct: '',
  landowner_share_pct: '',
  agreement_date: '',
  power_of_attorney: false,
  poa_reference: '',
  jv_share_basis: 'flat_count',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: string) => (v.trim() === '' ? null : Number(v));

function toFormState(land: LandWithRelations): FormState {
  return {
    ...EMPTY,
    name: land.name,
    location_division: land.location_division,
    location_district: land.location_district,
    location_area: land.location_area,
    road: str(land.road),
    mouza: str(land.mouza),
    dag_number: str(land.dag_number),
    khatian_number: str(land.khatian_number),
    land_size: str(land.land_size),
    land_size_unit: land.land_size_unit,
    asking_price: str(land.asking_price),
    negotiated_price: str(land.negotiated_price),
    final_agreed_amount: str(land.final_agreed_amount),
    gps_lat: str(land.gps_lat),
    gps_lng: str(land.gps_lng),
    nearby_facilities: str(land.nearby_facilities),
    acquisition_type: land.acquisition_type,
    remarks: str(land.remarks),
    developer_share_pct: str(land.jv?.developer_share_pct),
    landowner_share_pct: str(land.jv?.landowner_share_pct),
    agreement_date: str(land.jv?.agreement_date),
    power_of_attorney: land.jv?.power_of_attorney ?? false,
    poa_reference: str(land.jv?.poa_reference),
    jv_share_basis: land.jv?.jv_share_basis ?? 'flat_count',
  };
}

/**
 * Add / Edit form for Module 1 (layout follows Design Reference A.9: labelled
 * inputs in a responsive grid, card sections, Cancel/Save footer).
 *
 * Owner capture is always shown; the JV card appears only for joint_venture.
 */
export function LandForm({ land }: { land?: LandWithRelations }) {
  const router = useRouter();
  const isEdit = Boolean(land);

  const [form, setForm] = useState<FormState>(land ? toFormState(land) : EMPTY);
  const [owners, setOwners] = useState<OwnerRow[]>(
    land?.owners.map((o) => ({
      owner_id: o.owner_id,
      ownership_share_pct: str(o.ownership_share_pct),
      is_primary_contact: o.is_primary_contact,
    })) ?? [],
  );
  const [allOwners, setAllOwners] = useState<Landowner[]>([]);
  const [quickAddIndex, setQuickAddIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    landownerRepository
      .getAll()
      .then((rows) => setAllOwners(rows.sort((a, b) => a.name.localeCompare(b.name))));
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isJv = form.acquisition_type === 'joint_venture';
  const purchasePricing = landUsesPurchasePricing(form.acquisition_type);

  const ownerShareTotal = useMemo(
    () => owners.reduce((sum, o) => sum + (Number(o.ownership_share_pct) || 0), 0),
    [owners],
  );

  function addOwnerRow() {
    setOwners((rows) => [
      ...rows,
      { owner_id: '', ownership_share_pct: '', is_primary_contact: rows.length === 0 },
    ]);
  }

  function updateOwnerRow(index: number, patch: Partial<OwnerRow>) {
    setOwners((rows) =>
      rows.map((row, i) => {
        if (i === index) return { ...row, ...patch };
        // only one primary contact per land
        if (patch.is_primary_contact) return { ...row, is_primary_contact: false };
        return row;
      }),
    );
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Reference name is required';
    if (!form.location_division.trim()) next.location_division = 'Required';
    if (!form.location_district.trim()) next.location_district = 'Required';
    if (!form.location_area.trim()) next.location_area = 'Required';
    if (!form.land_size.trim() || Number(form.land_size) <= 0)
      next.land_size = 'Enter a size above 0';
    /*
     * Only a purchase has an asking price. It used to be required on every
     * land, so every joint venture in the system carries a price nobody asked
     * and nobody agreed — and the list sorts on it.
     */
    if (purchasePricing && (!form.asking_price.trim() || Number(form.asking_price) < 0))
      next.asking_price = 'Enter an amount';

    if (owners.some((o) => !o.owner_id)) next.owners = 'Pick a landowner for every row';
    else if (new Set(owners.map((o) => o.owner_id)).size !== owners.length)
      next.owners = 'The same landowner is listed twice';
    else if (owners.length > 0 && Math.abs(ownerShareTotal - 100) > 0.01)
      next.owners = `Ownership shares must total 100% (currently ${ownerShareTotal}%)`;

    if (isJv) {
      const dev = Number(form.developer_share_pct);
      const own = Number(form.landowner_share_pct);
      if (!form.developer_share_pct.trim() || !form.landowner_share_pct.trim())
        next.jv_share = 'Both shares are required for a joint venture';
      else if (Math.abs(dev + own - 100) > 0.01)
        next.jv_share = `Developer + landowner share must total 100% (currently ${dev + own}%)`;
      if (!form.agreement_date) next.agreement_date = 'Required';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        location_division: form.location_division.trim(),
        location_district: form.location_district.trim(),
        location_area: form.location_area.trim(),
        road: form.road.trim() || null,
        mouza: form.mouza.trim() || null,
        dag_number: form.dag_number.trim() || null,
        khatian_number: form.khatian_number.trim() || null,
        land_size: Number(form.land_size),
        land_size_unit: form.land_size_unit,
        asking_price: Number(form.asking_price),
        negotiated_price: num(form.negotiated_price),
        final_agreed_amount: num(form.final_agreed_amount),
        gps_lat: num(form.gps_lat),
        gps_lng: num(form.gps_lng),
        nearby_facilities: form.nearby_facilities.trim() || null,
        acquisition_type: form.acquisition_type,
        remarks: form.remarks.trim() || null,
      };

      let saved: Land;
      if (land) {
        saved = (await landRepository.update(land.id, payload)) as Land;
      } else {
        saved = await landRepository.create({
          ...payload,
          code: '',
          status: 'new',
          assigned_to: null,
        });
      }

      // Owner mappings: rewrite the set for this land.
      const existing = await landOwnerMappingRepository.listForLand(saved.id);
      await Promise.all(existing.map((m) => landOwnerMappingRepository.remove(m.id)));
      await Promise.all(
        owners.map((o) =>
          landOwnerMappingRepository.create({
            land_id: saved.id,
            owner_id: o.owner_id,
            ownership_share_pct: Number(o.ownership_share_pct) || 0,
            is_primary_contact: o.is_primary_contact,
          }),
        ),
      );

      // JV details exist only for joint_venture lands.
      if (isJv) {
        await landJvRepository.upsertForLand(saved.id, {
          developer_share_pct: Number(form.developer_share_pct),
          landowner_share_pct: Number(form.landowner_share_pct),
          agreement_date: form.agreement_date,
          power_of_attorney: form.power_of_attorney,
          poa_reference: form.poa_reference.trim() || null,
          jv_share_basis: form.jv_share_basis,
        });
      } else {
        const jv = await landJvRepository.getForLand(saved.id);
        if (jv) await landJvRepository.remove(jv.id);
      }

      router.push(`/admin/lands/${saved.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">
      <Card>
        <CardHeader title="Land Information" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Reference Name" required error={errors.name} className="xl:col-span-2">
            <TextInput
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Bashundhara Block K plot"
              invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label="Acquisition Type" required>
            <SelectInput
              value={form.acquisition_type}
              onChange={(e) => set('acquisition_type', e.target.value as AcquisitionType)}
            >
              {ACQUISITION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACQUISITION_TYPE_LABEL[t]}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Division" required error={errors.location_division}>
            <TextInput
              value={form.location_division}
              placeholder="e.g. Dhaka"
              onChange={(e) => set('location_division', e.target.value)}
              invalid={Boolean(errors.location_division)}
            />
          </Field>
          <Field label="District" required error={errors.location_district}>
            <TextInput
              value={form.location_district}
              placeholder="e.g. Gazipur"
              onChange={(e) => set('location_district', e.target.value)}
              invalid={Boolean(errors.location_district)}
            />
          </Field>
          <Field label="Area" required error={errors.location_area}>
            <TextInput
              value={form.location_area}
              placeholder="e.g. Bashundhara R/A"
              onChange={(e) => set('location_area', e.target.value)}
              invalid={Boolean(errors.location_area)}
            />
          </Field>
          <Field label="Road">
            <TextInput
              value={form.road}
              placeholder="e.g. Road 12, Block K"
              onChange={(e) => set('road', e.target.value)}
            />
          </Field>
          <Field label="Mouza">
            <TextInput
              value={form.mouza}
              placeholder="e.g. Baridhara"
              onChange={(e) => set('mouza', e.target.value)}
            />
          </Field>
          <Field label="Dag Number">
            <TextInput
              value={form.dag_number}
              placeholder="e.g. 1245"
              onChange={(e) => set('dag_number', e.target.value)}
            />
          </Field>
          <Field label="Khatian Number">
            <TextInput
              value={form.khatian_number}
              placeholder="e.g. 88/3"
              onChange={(e) => set('khatian_number', e.target.value)}
            />
          </Field>
          <Field label="Land Size" required error={errors.land_size}>
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.land_size}
              placeholder="e.g. 10"
              onChange={(e) => set('land_size', e.target.value)}
              invalid={Boolean(errors.land_size)}
            />
          </Field>
          <Field label="Size Unit" required>
            <SelectInput
              value={form.land_size_unit}
              onChange={(e) => set('land_size_unit', e.target.value as LandSizeUnit)}
            >
              {LAND_SIZE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {LAND_SIZE_UNIT_LABEL[u]}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Commercials (BDT)" />
        {/*
          Asking → negotiated → agreed is three stages of one number, and a
          joint venture has none of them: the owner is not asking a price,
          nothing is being haggled down, and what they receive is a share of the
          building. Asking the questions anyway produced a purchase price on
          every JV plot that nobody had agreed to pay.

          The one money question a JV does have is the cash side, which is the
          field below — and an existing figure is kept rather than cleared when
          a plot switches, because a land that was being bought before the JV
          was struck genuinely had an asking price.
        */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {purchasePricing && (
            <>
              <Field label="Asking Price" required error={errors.asking_price}>
                <MoneyInput
                  value={form.asking_price}
                  placeholder="e.g. 45000000"
                  onChange={(e) => set('asking_price', e.target.value)}
                  invalid={Boolean(errors.asking_price)}
                />
              </Field>
              <Field label="Negotiated Price">
                <MoneyInput
                  value={form.negotiated_price}
                  placeholder="e.g. 42000000"
                  onChange={(e) => set('negotiated_price', e.target.value)}
                />
              </Field>
            </>
          )}
          <Field
            label={finalAmountLabel(form.acquisition_type)}
            hint={finalAmountHint(form.acquisition_type)}
            className={purchasePricing ? undefined : 'md:col-span-2'}
          >
            <MoneyInput
              value={form.final_agreed_amount}
              placeholder={purchasePricing ? 'e.g. 40000000' : 'e.g. 5000000, or 0'}
              onChange={(e) => set('final_agreed_amount', e.target.value)}
            />
          </Field>
        </div>
        {!purchasePricing && (
          <p className="mt-3 text-xs text-ink-muted">
            The unit split is below — that is what the owner is actually paid. This field is only
            the cash alongside it.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Landowners"
          action={
            <Button type="button" variant="outline" size="sm" onClick={addOwnerRow}>
              <Plus className="size-4" /> Add owner
            </Button>
          }
        />
        {owners.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No landowner linked yet. Owner details are captured for every land, whether it is a
            direct purchase or a joint venture.
          </p>
        ) : (
          <div className="space-y-3">
            {owners.map((row, index) => (
              <div
                key={index}
                className="grid items-end gap-3 rounded-xl border border-hairline p-3 md:grid-cols-[2fr_1fr_auto_auto]"
              >
                <Field label="Landowner">
                  <div className="flex gap-2">
                    <SelectInput
                      value={row.owner_id}
                      onChange={(e) => updateOwnerRow(index, { owner_id: e.target.value })}
                      invalid={!row.owner_id && Boolean(errors.owners)}
                    >
                      <option value="">Select landowner…</option>
                      {allOwners.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                          {o.phone ? ` — ${o.phone}` : ''}
                        </option>
                      ))}
                    </SelectInput>
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={() => setQuickAddIndex(index)}
                      title="Create a new landowner"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </Field>
                <Field label="Share %">
                  <TextInput
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={row.ownership_share_pct}
                    placeholder="e.g. 50"
                    onChange={(e) => updateOwnerRow(index, { ownership_share_pct: e.target.value })}
                  />
                </Field>
                <Checkbox
                  label="Primary contact"
                  className="pb-3"
                  checked={row.is_primary_contact}
                  onChange={(e) => updateOwnerRow(index, { is_primary_contact: e.target.checked })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mb-1.5"
                  onClick={() => setOwners((rows) => rows.filter((_, i) => i !== index))}
                  aria-label="Remove owner"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <p className="text-sm text-ink-muted">
              Total share: <span className="font-medium text-ink">{ownerShareTotal}%</span>
            </p>
          </div>
        )}
        {errors.owners && <p className="mt-2 text-xs text-red-600">{errors.owners}</p>}
      </Card>

      {isJv && (
        <Card>
          <CardHeader title="Joint Venture Details" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Developer Share %" required error={errors.jv_share}>
              <TextInput
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.developer_share_pct}
                placeholder="e.g. 55"
                onChange={(e) => set('developer_share_pct', e.target.value)}
                invalid={Boolean(errors.jv_share)}
              />
            </Field>
            <Field label="Landowner Share %" required>
              <TextInput
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.landowner_share_pct}
                placeholder="e.g. 45"
                onChange={(e) => set('landowner_share_pct', e.target.value)}
                invalid={Boolean(errors.jv_share)}
              />
            </Field>
            <Field label="Agreement Date" required error={errors.agreement_date}>
              <TextInput
                type="date"
                value={form.agreement_date}
                onChange={(e) => set('agreement_date', e.target.value)}
                invalid={Boolean(errors.agreement_date)}
              />
            </Field>
            <div className="flex items-center pt-6">
              <Checkbox
                label="Power of attorney signed"
                checked={form.power_of_attorney}
                onChange={(e) => set('power_of_attorney', e.target.checked)}
              />
            </div>
            <Field label="POA Reference">
              <TextInput
                value={form.poa_reference}
                placeholder="e.g. POA-2026-014"
                onChange={(e) => set('poa_reference', e.target.value)}
                disabled={!form.power_of_attorney}
              />
            </Field>
            {/* The share % above is a percentage OF something — without this
                the flat-by-flat split in Module 2 cannot be checked. */}
            <Field
              label="Share Basis"
              required
              className="xl:col-span-2"
              hint="What the shares are counted in. The project page checks the unit allocation against this."
            >
              <SelectInput
                value={form.jv_share_basis}
                onChange={(e) => set('jv_share_basis', e.target.value as JvShareBasis)}
              >
                {JV_SHARE_BASES.map((b) => (
                  <option key={b} value={b}>
                    {JV_SHARE_BASIS_LABEL[b]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Location & Notes" />
        {/* pick the spot on the map instead of typing coordinates by hand */}
        <MapPicker
          lat={form.gps_lat}
          lng={form.gps_lng}
          onChange={(lat, lng) => setForm((f) => ({ ...f, gps_lat: lat, gps_lng: lng }))}
        />

        <div className="mt-4 grid gap-4">
          <Field label="Nearby Facilities">
            <TextArea
              value={form.nearby_facilities}
              onChange={(e) => set('nearby_facilities', e.target.value)}
              placeholder="School, hospital, market, main road distance…"
            />
          </Field>
          <Field label="Remarks" className="md:col-span-2 xl:col-span-3">
            <TextArea
              value={form.remarks}
              placeholder="Internal notes about this opportunity…"
              onChange={(e) => set('remarks', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create land'}
        </Button>
      </div>

      <LandownerQuickAddModal
        open={quickAddIndex !== null}
        onClose={() => setQuickAddIndex(null)}
        onCreated={(owner) => {
          setAllOwners((rows) => [...rows, owner].sort((a, b) => a.name.localeCompare(b.name)));
          if (quickAddIndex !== null) updateOwnerRow(quickAddIndex, { owner_id: owner.id });
          setQuickAddIndex(null);
        }}
      />
    </form>
  );
}
