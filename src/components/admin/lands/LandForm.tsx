'use client';

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
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
  lookupRepository,
  landOwnerMappingRepository,
  landRepository,
  landownerRepository,
  type LandWithRelations,
} from '@/lib/repositories';

/** Column layout shared by the owner table's header, rows and total. */
const OWNER_GRID = 'md:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem_2.5rem]';

/** Select value that opens the create-landowner dialog instead of picking one. */
const NEW_OWNER = '__new_owner__';

interface OwnerRow {
  owner_id: string;
  ownership_share_pct: string;
  /** BRD LAND-002 — in the land's own `land_size_unit` */
  ownership_area: string;
  /**
   * BRD LAND-002 — what was agreed with this owner specifically. Not on the
   * form since L7 (nothing is agreed when a land is created); kept in state so
   * editing a land does not wipe an amount recorded on the Owners tab.
   */
  agreed_amount: string;
  is_primary_contact: boolean;
}

interface FormState {
  name: string;
  location_division: string;
  location_district: string;
  location_upazila: string;
  location_area: string;
  road: string;
  road_access: string;
  land_classification: string;
  source: string;
  mouza: string;
  dag_number: string;
  khatian_number: string;
  land_size: string;
  land_size_unit: LandSizeUnit;
  asking_price: string;
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
  location_upazila: '',
  location_area: '',
  road: '',
  road_access: '',
  land_classification: '',
  source: '',
  mouza: '',
  dag_number: '',
  khatian_number: '',
  land_size: '',
  land_size_unit: 'katha',
  asking_price: '',
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
    location_upazila: str(land.location_upazila),
    location_area: land.location_area,
    road: str(land.road),
    road_access: str(land.road_access),
    land_classification: str(land.land_classification),
    source: str(land.source),
    mouza: str(land.mouza),
    dag_number: str(land.dag_number),
    khatian_number: str(land.khatian_number),
    land_size: str(land.land_size),
    land_size_unit: land.land_size_unit,
    asking_price: str(land.asking_price),
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
      ownership_area: str(o.ownership_area),
      agreed_amount: str(o.agreed_amount),
      is_primary_contact: o.is_primary_contact,
    })) ?? [],
  );
  const [allOwners, setAllOwners] = useState<Landowner[]>([]);
  const [quickAddIndex, setQuickAddIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // BRD LAND-001 — both lists are Master Data, editable without a deploy
  const classifications = useLiveQuery(
    () => lookupRepository.options('land_classification'),
    [],
  );
  const sources = useLiveQuery(() => lookupRepository.options('land_source'), []);

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
    () => Math.round(owners.reduce((sum, o) => sum + (Number(o.ownership_share_pct) || 0), 0) * 100) / 100,
    [owners],
  );
  const ownerAreaTotal =
    Math.round(owners.reduce((sum, o) => sum + (Number(o.ownership_area) || 0), 0) * 10000) / 10000;
  const ownerAreaMismatch =
    owners.some((o) => o.ownership_area.trim() !== '') &&
    Math.abs(ownerAreaTotal - (Number(form.land_size) || 0)) > 0.01;

  function addOwnerRow() {
    setOwners((rows) => [
      ...rows,
      {
        owner_id: '',
        ownership_share_pct: '',
        ownership_area: '',
        agreed_amount: '',
        is_primary_contact: rows.length === 0,
      },
    ]);
  }

  /*
   * The owner is often not in the master list yet — a plot comes in with a
   * name and a phone number. Adding the row and opening the create dialog in
   * one click means nobody has to abandon a half-filled land to go to the
   * Landowners page first.
   */
  function addNewOwner() {
    setQuickAddIndex(owners.length);
    addOwnerRow();
  }

  /*
   * Share and area are two ways of saying the same thing on a plot of known
   * size, so typing one fills the other. Both stay editable: a deed often
   * divides by area in a way the percentage only rounds, and the totals under
   * the table flag it when the two stop agreeing.
   */
  const round2 = (n: number) => String(Math.round(n * 100) / 100);
  // area keeps four places: 45% of 1.5 bigha is 0.675, and rounding it to 0.68
  // makes the owners' areas add up to more than the land
  const round4 = (n: number) => String(Math.round(n * 10000) / 10000);
  function setOwnerShare(index: number, value: string) {
    const size = Number(form.land_size);
    const pct = Number(value);
    updateOwnerRow(index, {
      ownership_share_pct: value,
      ...(value.trim() !== '' && size > 0 && Number.isFinite(pct)
        ? { ownership_area: round4((size * pct) / 100) }
        : {}),
    });
  }
  function setOwnerArea(index: number, value: string) {
    const size = Number(form.land_size);
    const area = Number(value);
    updateOwnerRow(index, {
      ownership_area: value,
      ...(value.trim() !== '' && size > 0 && Number.isFinite(area)
        ? { ownership_share_pct: round2((area / size) * 100) }
        : {}),
    });
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
    if (!form.name.trim()) next.name = 'Land name is required';
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
      /*
       * Checked before anything is written, so a refused owner removal does
       * not leave the land saved with its old owners and a half-applied edit.
       */
      if (land) {
        const blocked = await landOwnerMappingRepository.removalBlockReason(
          land.id,
          owners.map((o) => o.owner_id),
        );
        if (blocked) {
          setErrors((prev) => ({ ...prev, owners: blocked }));
          return;
        }
      }

      const payload = {
        name: form.name.trim(),
        location_division: form.location_division.trim(),
        location_district: form.location_district.trim(),
        location_upazila: form.location_upazila.trim() || null,
        location_area: form.location_area.trim(),
        road: form.road.trim() || null,
        road_access: form.road_access.trim() || null,
        land_classification: form.land_classification.trim() || null,
        source: form.source.trim() || null,
        mouza: form.mouza.trim() || null,
        dag_number: form.dag_number.trim() || null,
        khatian_number: form.khatian_number.trim() || null,
        land_size: Number(form.land_size),
        land_size_unit: form.land_size_unit,
        asking_price: Number(form.asking_price),
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
          status: 'sourced',
          assigned_to: null,
        });
      }

      // Owner mappings: updated in place, so payments and plans keep their owner.
      await landOwnerMappingRepository.syncForLand(
        saved.id,
        owners.map((o) => ({
          owner_id: o.owner_id,
          ownership_share_pct: Number(o.ownership_share_pct) || 0,
          ownership_area: num(o.ownership_area),
          agreed_amount: num(o.agreed_amount),
          is_primary_contact: o.is_primary_contact,
        })),
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
          <Field
            label="Land Name"
            hint="What your team calls this plot — usually the area and the block or road"
            required
            error={errors.name}
            className="xl:col-span-2"
          >
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
          {/* BRD LAND-001 — a mouza belongs to an upazila, so a dag number is
              only unambiguous with one */}
          <Field label="Upazila / Thana">
            <TextInput
              value={form.location_upazila}
              placeholder="e.g. Tongi"
              onChange={(e) => set('location_upazila', e.target.value)}
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
          {/* BRD LAND-001 — how the plot is *reached*, which is a different
              question from which road it is on. The surveyed width belongs to
              the site visit (SITE-001), not here. */}
          <Field label="Road Access" hint="How the plot is reached today">
            <TextInput
              value={form.road_access}
              placeholder="e.g. 20 ft pucca road, direct frontage"
              onChange={(e) => set('road_access', e.target.value)}
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
          <Field label="Measuring Unit" required>
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

          {/* BRD LAND-001. Both lists are Master Data, not ENUMs — the
              classification set varies by district, and a new source of leads
              should not need a deploy. */}
          <Field label="Land Classification" hint="As written on the khatian">
            <SelectInput
              value={form.land_classification}
              onChange={(e) => set('land_classification', e.target.value)}
            >
              <option value="">Not recorded</option>
              {classifications?.map((o) => (
                <option key={o.id} value={o.value}>
                  {o.value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Source" hint="Where this opportunity came from">
            <SelectInput value={form.source} onChange={(e) => set('source', e.target.value)}>
              <option value="">Not recorded</option>
              {sources?.map((o) => (
                <option key={o.id} value={o.value}>
                  {o.value}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Card>

      {/*
        A new joint venture has no money question left to ask here — no asking
        price, and the cash side is written by the pipeline at signing — so the
        card is not rendered rather than rendered empty.
      */}
      {(purchasePricing || isEdit) && (
      <Card>
        <CardHeader title="Commercials (BDT)" />
        {/*
          A joint venture has no asking price: the owner is not asking one,
          nothing is being haggled down, and what they receive is a share of the
          building. Asking anyway produced a purchase price on every JV plot
          that nobody had agreed to pay. An existing figure is kept rather than
          cleared when a plot switches, because a land that was being bought
          before the JV was struck genuinely had an asking price.

          Negotiated Price used to sit here too, and was dropped after client
          review: one "negotiated" number is a snapshot of a conversation that
          has rounds, and the offer ladder that replaces it records each round
          with its date and terms. See the note on `Land` in db/types.ts.

          Final Agreed Amount is not asked for when a land is first added —
          nothing is agreed on the day a plot is sourced, and the pipeline
          writes it at Acquired / JV Signed. It stays editable afterwards, which
          is how a land bought before this system existed gets its figure and
          how a typo gets fixed.
        */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {purchasePricing && (
            <Field label="Asking Price" required error={errors.asking_price}>
              <MoneyInput
                value={form.asking_price}
                placeholder="e.g. 45000000"
                onChange={(e) => set('asking_price', e.target.value)}
                invalid={Boolean(errors.asking_price)}
              />
            </Field>
          )}
          {isEdit && (
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
          )}
        </div>
        {!isEdit && (
          <p className="mt-3 text-xs text-ink-muted">
            The final agreed amount is recorded by the pipeline when this land is marked acquired —
            it is not set here.
          </p>
        )}
        {isEdit && !purchasePricing && (
          <p className="mt-3 text-xs text-ink-muted">
            The unit split is below — that is what the owner is actually paid. This field is only
            the cash alongside it.
          </p>
        )}
      </Card>
      )}

      <Card>
        <CardHeader
          title="Landowners"
          action={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addNewOwner}>
                <UserPlus className="size-4" /> New landowner
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addOwnerRow}>
                <Plus className="size-4" /> Add owner
              </Button>
            </div>
          }
        />
        {owners.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No landowner linked yet. Use <strong>Add owner</strong> to pick someone already on the
            Landowners list, or <strong>New landowner</strong> to create them here — they are saved
            to the Landowners list as well.
          </p>
        ) : (
          <div>
            {/* one header for the table; on a phone each field carries its own label */}
            <div className={`hidden gap-3 px-3 pb-2 text-xs font-medium text-ink-muted md:grid ${OWNER_GRID}`}>
              <span>Landowner</span>
              <span>Share %</span>
              <span>Area ({LAND_SIZE_UNIT_LABEL[form.land_size_unit]})</span>
              <span>Primary</span>
              <span className="sr-only">Remove</span>
            </div>
            <div className="space-y-2">
              {owners.map((row, index) => (
                <div
                  key={index}
                  className={`grid items-center gap-3 rounded-xl border border-hairline p-3 ${OWNER_GRID}`}
                >
                  <div>
                    <span className="mb-1 block text-xs text-ink-muted md:hidden">Landowner</span>
                    <div className="flex gap-2">
                      <SelectInput
                        aria-label="Landowner"
                        value={row.owner_id}
                        onChange={(e) => {
                          // the second option opens the create dialog rather than selecting
                          if (e.target.value === NEW_OWNER) setQuickAddIndex(index);
                          else updateOwnerRow(index, { owner_id: e.target.value });
                        }}
                        invalid={!row.owner_id && Boolean(errors.owners)}
                      >
                        <option value="">Select landowner…</option>
                        <option value={NEW_OWNER}>+ Create new landowner…</option>
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
                        <UserPlus className="size-4" /> New
                      </Button>
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-ink-muted md:hidden">Share %</span>
                    <TextInput
                      aria-label="Share %"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={row.ownership_share_pct}
                      placeholder="e.g. 50"
                      onChange={(e) => setOwnerShare(index, e.target.value)}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-ink-muted md:hidden">
                      Area ({LAND_SIZE_UNIT_LABEL[form.land_size_unit]})
                    </span>
                    <TextInput
                      aria-label={`Area (${LAND_SIZE_UNIT_LABEL[form.land_size_unit]})`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.ownership_area}
                      placeholder="e.g. 4.5"
                      onChange={(e) => setOwnerArea(index, e.target.value)}
                    />
                  </div>
                  {/* the column header names it on a desktop; a phone needs the words */}
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink md:justify-center">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-hairline accent-admin-500"
                      checked={row.is_primary_contact}
                      onChange={(e) => updateOwnerRow(index, { is_primary_contact: e.target.checked })}
                    />
                    <span className="md:sr-only">Primary contact</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-self-end"
                    onClick={() => setOwners((rows) => rows.filter((_, i) => i !== index))}
                    aria-label="Remove owner"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className={`mt-2 gap-3 px-3 text-sm text-ink-muted md:grid ${OWNER_GRID}`}>
              <span className="font-medium text-ink">Total</span>
              <span className={Math.abs(ownerShareTotal - 100) > 0.01 ? 'font-medium text-amber-700' : 'font-medium text-ink'}>
                {ownerShareTotal}%
              </span>
              <span className={ownerAreaMismatch ? 'font-medium text-amber-700' : 'font-medium text-ink'}>
                {ownerAreaTotal} of {form.land_size || '—'} {LAND_SIZE_UNIT_LABEL[form.land_size_unit]}
              </span>
            </div>
            <p className="mt-2 px-3 text-xs text-ink-muted">
              Enter a share or an area — the other fills in from the land size, and either can be
              changed. What each owner is paid is agreed later, in negotiation, and split by share
              on the Owners tab.
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

        {/*
          These two were stacked in a one-column grid, which left Nearby
          Facilities sitting at half the width of the card with dead space
          beside it. They are the same kind of field and the same size, so they
          sit side by side and each fills its half.
        */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Nearby Facilities">
            <TextArea
              value={form.nearby_facilities}
              onChange={(e) => set('nearby_facilities', e.target.value)}
              placeholder="School, hospital, market, main road distance…"
            />
          </Field>
          <Field label="Remarks">
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
