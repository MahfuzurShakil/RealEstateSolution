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
  otherCostRowProblem,
  type OtherCostRow,
} from '@/lib/domain/land';
import { landJvRepository, landPipelineRepository, landRepository } from '@/lib/repositories';
import { OtherCostsEditor } from '@/components/admin/lands/OtherCostsEditor';
import { cn } from '@/lib/utils/cn';
import { todayLocal } from '@/lib/utils/format';

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
  initialDraft,
  onClose,
  onReview,
}: {
  open: boolean;
  initialMode: LandEntryMode;
  /** coming back from the confirm step: the form as it was left */
  initialDraft?: QuickLandDraft;
  onClose: () => void;
  /** nothing is saved here - the picker shows the draft and saves on confirm */
  onReview: (draft: QuickLandDraft) => void;
}) {
  if (!open) return null;
  return (
    <QuickLandDialog
      key={initialMode}
      initialMode={initialDraft?.mode ?? initialMode}
      initialDraft={initialDraft}
      onClose={onClose}
      onReview={onReview}
    />
  );
}

const EMPTY_FORM = {
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
};

/** What the quick form collected, checked but not yet saved. */
export interface QuickLandDraft {
  mode: LandEntryMode;
  form: typeof EMPTY_FORM;
  other_costs: OtherCostRow[];
}

/**
 * Saves a reviewed draft (LAND-OWNED-FLOW-PLAN.md section 1). Runs only when
 * the user confirms, so going back to edit, or cancelling, leaves no land behind.
 */
export async function createQuickLand(draft: QuickLandDraft): Promise<Land> {
  const { form } = draft;
  const owned = draft.mode === 'owned';
  const isJv = form.acquisition_type === 'joint_venture';
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
      const devShare = Number(form.developer_share_pct);
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
        other_costs: draft.other_costs,
      },
      null,
    );
  }
  return (await landRepository.getById(land.id)) ?? land;
}

const PIPELINE_TYPES: AcquisitionType[] = ['direct_purchase', 'joint_venture'];

function QuickLandDialog({
  initialMode,
  initialDraft,
  onClose,
  onReview,
}: {
  initialMode: LandEntryMode;
  initialDraft?: QuickLandDraft;
  onClose: () => void;
  onReview: (draft: QuickLandDraft) => void;
}) {
  const [mode, setMode] = useState<LandEntryMode>(initialMode);
  const [form, setForm] = useState(initialDraft?.form ?? EMPTY_FORM);
  const [otherCosts, setOtherCosts] = useState<OtherCostRow[]>(initialDraft?.other_costs ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCostErrors, setShowCostErrors] = useState(false);

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
    // E2E 2026-10-12 #22 — the same check the full land form makes
    else {
      const name = form.name.trim().toLowerCase();
      if ((await landRepository.getAll()).some((l) => l.name.trim().toLowerCase() === name))
        next.name = 'Another land already has this name';
    }
    if (!form.location_division.trim()) next.location_division = 'Required';
    if (!form.location_district.trim()) next.location_district = 'Required';
    if (!form.location_area.trim()) next.location_area = 'Required';
    if (!(Number(form.land_size) > 0)) next.land_size = 'Enter a size above 0';
    if (owned && !form.owned_on) next.owned_on = 'Required';
    // E2E 2026-10-12 #23 — owned since a day that has not come yet
    else if (owned && form.owned_on > todayLocal()) next.owned_on = 'Cannot be in the future';
    if (!owned && form.acquisition_type === 'direct_purchase' && !(Number(form.asking_price) >= 0 && form.asking_price.trim()))
      next.asking_price = 'Enter an amount';
    // a signed JV has a split; one still being chased gets its terms at signing
    /*
     * A JV must name its landowners (client decision 2026-10-11), and this
     * quick dialog does not record owners, so a JV is added from the land
     * form instead.
     */
    if (isJv) next.acquisition_type = 'A joint venture needs its landowners: add it from Lands → Add Land, then pick it here.';
    const devShare = Number(form.developer_share_pct);
    if (owned && isJv && !(devShare > 0 && devShare < 100)) next.developer_share_pct = 'Between 1 and 99';
    const costProblem = owned && otherCosts.some((r) => otherCostRowProblem(r));
    setShowCostErrors(Boolean(costProblem));
    setErrors(next);
    if (Object.keys(next).length > 0 || costProblem) return;

    onReview({
      mode,
      form,
      other_costs: owned ? otherCosts.filter((r) => r.label.trim() && Number(r.amount) > 0) : [],
    });
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
          <Button onClick={save}>Review land</Button>
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
        <Field label="Division" required error={errors.location_division}>
          <TextInput
            value={form.location_division}
            onChange={(e) => set('location_division', e.target.value)}
            placeholder="e.g. Dhaka"
            invalid={Boolean(errors.location_division)}
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
        <Field label="Acquisition type" required error={errors.acquisition_type}>
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
            {isJv && (
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
            )}
            {/* the two money fields always sit side by side (client, 2026-10-17) */}
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <Field
                label={
                  isJv
                    ? 'Signing money paid'
                    : form.acquisition_type === 'inherited'
                      ? 'Price paid (0 if inherited)'
                      : 'Land price paid'
                }
              >
                <MoneyInput
                  value={form.price_paid}
                  onChange={(e) => set('price_paid', e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Registration & fees paid">
                <MoneyInput
                  value={form.registration_paid}
                  onChange={(e) => set('registration_paid', e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-sm font-medium text-ink">Other costs paid</p>
              <p className="mb-2 text-xs text-ink-muted">
                Namjari, stamp duty, survey, boundary wall: anything else this land has cost so far.
              </p>
              <OtherCostsEditor rows={otherCosts} onChange={setOtherCosts} showErrors={showCostErrors} />
            </div>
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
