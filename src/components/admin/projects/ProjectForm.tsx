'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardList, Info, KeyRound, Map as MapIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { QuickLandModal } from './QuickLandModal';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import {
  CONSTRUCTION_AFTER_SALE,
  PROJECT_TYPES,
  type ConstructionAfterSale,
  type Land,
  type LandEntryMode,
  type LandSizeUnit,
  type Project,
  type ProjectType,
} from '@/lib/db/types';
import {
  ACQUISITION_TYPE_LABEL,
  LAND_SIZE_UNIT_LABEL,
  LAND_STATUS_META,
  developmentGateBlockReason,
  landStatusLabel,
} from '@/lib/domain/land';
import {
  CONSTRUCTION_AFTER_SALE_LABEL,
  PROJECT_TYPE_HINT,
  PROJECT_TYPE_LABEL,
  projectSalesStatus,
} from '@/lib/domain/project';
import {
  companySettingsRepository,
  landDevelopmentRepository,
  landProjectMappingRepository,
  landRepository,
  lookupRepository,
  projectRepository,
  userRepository,
  type ProjectWithRelations,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

interface FormState {
  name: string;
  project_type: ProjectType;
  total_land_area: string;
  total_land_area_unit: LandSizeUnit;
  location_summary: string;
  expected_start_date: string;
  expected_completion_date: string;
  actual_start_date: string;
  architect: string;
  project_manager: string;
  surroundings: string;
  cover_image_url: string;
  is_public: boolean;
  is_featured: boolean;
  /** v29 — land_share only */
  construction_after_sale: ConstructionAfterSale;
}

const EMPTY: FormState = {
  name: '',
  project_type: 'apartment',
  total_land_area: '',
  total_land_area_unit: 'katha',
  location_summary: '',
  expected_start_date: '',
  expected_completion_date: '',
  actual_start_date: '',
  architect: '',
  project_manager: '',
  surroundings: '',
  cover_image_url: '',
  is_public: false,
  is_featured: false,
  construction_after_sale: 'undecided',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: string) => (v.trim() === '' ? null : Number(v));

/**
 * Add / Edit form for Module 2 (Design Reference A.9).
 *
 * Project first (PLATFORM-REPLAN.md §1.2): a project can be saved with no land
 * at all, and any land still alive can be linked — one already owned, or one
 * still in acquisition. Land can also be added from here without leaving the
 * form. Whether the land is secure enough to sell or build on is the
 * project's land readiness, checked when sales open and construction starts,
 * not here.
 */
export function ProjectForm({ project }: { project?: ProjectWithRelations }) {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(project ? toFormState(project) : EMPTY);
  // who can hold a project: the PM role, plus management on a small office
  const managers =
    useLiveQuery(() => userRepository.listByRole(['project_manager', 'management']), []) ?? [];
  const [landIds, setLandIds] = useState<string[]>(project?.lands.map((l) => l.id) ?? []);
  const [amenities, setAmenities] = useState<string[]>(project?.amenities ?? []);
  const [availableLands, setAvailableLands] = useState<Land[]>([]);
  /** lands already carrying another project — legal, but worth flagging */
  const [otherProjectByLand, setOtherProjectByLand] = useState<Record<string, string>>({});
  const [amenityOptions, setAmenityOptions] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  /** v29 — the quick-add land dialog, and which entry it opens on */
  const [addingLand, setAddingLand] = useState<LandEntryMode | null>(null);

  useEffect(() => {
    const alreadyMine = new Set(project?.lands.map((l) => l.id) ?? []);
    landRepository.getAll().then((rows) =>
      setAvailableLands(
        rows
          // any land still alive — owned or still being acquired (v29)
          .filter(
            (l) => alreadyMine.has(l.id) || (l.status !== 'rejected' && l.status !== 'disposed'),
          )
          .sort((a, b) => a.code.localeCompare(b.code)),
      ),
    );
    lookupRepository.options('amenity').then((rows) => setAmenityOptions(rows.map((r) => r.value)));

    landRepository.getAll().then(async (rows) => {
      const taken: Record<string, string> = {};
      for (const land of rows) {
        const others = (await landProjectMappingRepository.projectsForLand(land.id)).filter(
          (p) => p.id !== project?.id,
        );
        if (others.length > 0) taken[land.id] = others.map((p) => p.code).join(', ');
      }
      setOtherProjectByLand(taken);
    });
  }, [project]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const selectedLands = useMemo(
    () => availableLands.filter((l) => landIds.includes(l.id)),
    [availableLands, landIds],
  );

  /** Sum of the picked lands, only when they share one unit (Section 3.3). */
  const landAreaSuggestion = useMemo(() => {
    if (selectedLands.length === 0) return null;
    const units = new Set(selectedLands.map((l) => l.land_size_unit));
    if (units.size !== 1) return null;
    const unit = [...units][0];
    const total = selectedLands.reduce((sum, l) => sum + (Number(l.land_size) || 0), 0);
    return { total: Number(total.toFixed(2)), unit };
  }, [selectedLands]);

  function toggleLand(id: string) {
    setLandIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  /*
   * Gate G3 (BRD DEV-004) — a project planned over a plot that is still being
   * filled has a schedule nobody can meet: piling cannot start on ground that
   * is four feet short, and the dates are wrong from the day they are drawn.
   *
   * Live, so ticking a plot shows the problem immediately rather than at save.
   * Lands already linked to this project are exempt: the link exists, and
   * re-validating history would make an existing project unsaveable over work
   * that was done before the gate was switched on.
   */
  const gateOn = useLiveQuery(
    async () => (await companySettingsRepository.get())?.require_development_ready ?? false,
    [],
  );
  const alreadyLinked = useMemo(
    () => new Set(project?.lands.map((l) => l.id) ?? []),
    [project],
  );
  const blockedLands = useLiveQuery(async () => {
    const reasons: string[] = [];
    for (const id of landIds) {
      if (alreadyLinked.has(id)) continue;
      const land = await landRepository.getById(id);
      const readiness = await landDevelopmentRepository.readinessForLand(id);
      const reason = developmentGateBlockReason(land ?? undefined, readiness);
      if (reason) reasons.push(reason);
    }
    return reasons;
  }, [landIds, alreadyLinked]) ?? [];

  function toggleAmenity(value: string) {
    setAmenities((list) =>
      list.includes(value) ? list.filter((a) => a !== value) : [...list, value],
    );
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Project name is required';
    if (!form.expected_start_date) next.expected_start_date = 'Required';
    if (!form.expected_completion_date) next.expected_completion_date = 'Required';
    else if (
      form.expected_start_date &&
      form.expected_completion_date < form.expected_start_date
    ) {
      next.expected_completion_date = 'Completion cannot be before the start date';
    }
    /*
     * Gate G3 (BRD DEV-004). Checked here because this is where the link is
     * actually made — lands are put into projects from this form, never from
     * the land page.
     *
     * Every blocked plot is named rather than just the first, so somebody
     * fixing this does not discover the second one after saving the first.
     */
    if (gateOn && blockedLands.length > 0) {
      next.lands = blockedLands.join(' ');
    }
    /*
     * v29 — the public site shows projects that are selling. Only checked when
     * the box is being ticked, so an older project already public with sales
     * not yet opened can still be edited.
     */
    const salesOpen = project ? projectSalesStatus(project) !== 'not_open' : false;
    if (form.is_public && !project?.is_public && !salesOpen) {
      next.is_public = 'Open sales on the project page first, then publish it';
    }
    if (form.is_featured && !form.is_public) {
      next.is_featured = 'A featured project must be public first';
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
        project_type: form.project_type,
        total_land_area: num(form.total_land_area),
        total_land_area_unit: form.total_land_area_unit,
        location_summary: form.location_summary.trim() || null,
        expected_start_date: form.expected_start_date,
        expected_completion_date: form.expected_completion_date,
        actual_start_date: form.actual_start_date || null,
        architect: form.architect.trim() || null,
        project_manager: form.project_manager || null,
        surroundings: form.surroundings.trim() || null,
        amenities,
        cover_image_url: form.cover_image_url.trim() || null,
        is_public: form.is_public,
        is_featured: form.is_featured,
        construction_after_sale:
          form.project_type === 'land_share' ? form.construction_after_sale : null,
      };

      let saved: Project;
      if (project) {
        saved = (await projectRepository.update(project.id, payload)) as Project;
      } else {
        saved = await projectRepository.create({
          ...payload,
          code: '',
          status: 'planning',
        });
      }

      // the mapping only — the lands keep their own pipeline status (v29)
      await landProjectMappingRepository.setLandsForProject(saved.id, landIds);

      router.push(`/admin/projects/${saved.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">
      <Card>
        <CardHeader title="Project Information" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Project Name" required error={errors.name} className="xl:col-span-2">
            <TextInput
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Nokshi Green Residence"
              invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label="Project Type" required hint={PROJECT_TYPE_HINT[form.project_type]}>
            <SelectInput
              value={form.project_type}
              onChange={(e) => set('project_type', e.target.value as ProjectType)}
            >
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROJECT_TYPE_LABEL[t]}
                </option>
              ))}
            </SelectInput>
          </Field>

          {form.project_type === 'land_share' && (
            <Field
              label="After the shares are sold"
              className="xl:col-span-3"
              hint="If construction is planned, the project page prompts you to start the construction project once the shares sell out."
            >
              <SelectInput
                value={form.construction_after_sale}
                onChange={(e) =>
                  set('construction_after_sale', e.target.value as ConstructionAfterSale)
                }
              >
                {CONSTRUCTION_AFTER_SALE.map((v) => (
                  <option key={v} value={v}>
                    {CONSTRUCTION_AFTER_SALE_LABEL[v]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}

          <Field
            label="Location Summary"
            className="xl:col-span-2"
            hint="Marketing address for the public site — the mouza/dag details stay on the land record."
          >
            <TextInput
              value={form.location_summary}
              onChange={(e) => set('location_summary', e.target.value)}
              placeholder="e.g. Bashundhara R/A, Dhaka"
            />
          </Field>
          <Field label="Architect">
            <TextInput
              value={form.architect}
              onChange={(e) => set('architect', e.target.value)}
              placeholder="e.g. Volumezero Ltd."
            />
          </Field>
          {/*
            Scope v3 §3.3 — the column has been on `projects` from the start
            and nothing ever set it, so every project read as unmanaged
            (2026-10-04).
          */}
          <Field label="Project Manager">
            <SelectInput
              value={form.project_manager}
              onChange={(e) => set('project_manager', e.target.value)}
            >
              <option value="">Not assigned</option>
              {managers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field
            label="Total Land Area"
            hint={
              landAreaSuggestion
                ? `Linked lands total ${landAreaSuggestion.total} ${LAND_SIZE_UNIT_LABEL[landAreaSuggestion.unit]}`
                : undefined
            }
          >
            <div className="flex gap-2">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                value={form.total_land_area}
                onChange={(e) => set('total_land_area', e.target.value)}
                placeholder="e.g. 24"
              />
              {landAreaSuggestion && (
                <Button
                  variant="outline"
                  size="md"
                  className="shrink-0"
                  onClick={() => {
                    set('total_land_area', String(landAreaSuggestion.total));
                    set('total_land_area_unit', landAreaSuggestion.unit);
                  }}
                >
                  Use sum
                </Button>
              )}
            </div>
          </Field>
          <Field label="Area Unit">
            <SelectInput
              value={form.total_land_area_unit}
              onChange={(e) => set('total_land_area_unit', e.target.value as LandSizeUnit)}
            >
              {Object.entries(LAND_SIZE_UNIT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Timeline" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Expected Start Date" required error={errors.expected_start_date}>
            <TextInput
              type="date"
              value={form.expected_start_date}
              onChange={(e) => set('expected_start_date', e.target.value)}
              invalid={Boolean(errors.expected_start_date)}
            />
          </Field>
          <Field
            label="Expected Completion Date"
            required
            error={errors.expected_completion_date}
          >
            <TextInput
              type="date"
              value={form.expected_completion_date}
              onChange={(e) => set('expected_completion_date', e.target.value)}
              invalid={Boolean(errors.expected_completion_date)}
            />
          </Field>
          <Field
            label="Actual Start Date"
            hint="Stamped automatically when the project moves to Under Construction."
          >
            <TextInput
              type="date"
              value={form.actual_start_date}
              onChange={(e) => set('actual_start_date', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Linked Land"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddingLand('owned')}>
                <KeyRound className="size-4" /> Add owned land
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAddingLand('pipeline')}>
                <ClipboardList className="size-4" /> Land to acquire
              </Button>
            </div>
          }
        />
        <p className="mb-3 flex items-start gap-2 text-xs text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Optional. You can save the project now and link land later. Land still being acquired
          can be linked too: it keeps its own status, and the land has to be secured before
          construction starts.
        </p>
        {availableLands.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No land recorded yet. Add the land this project stands on with the buttons above.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {availableLands.map((land) => {
              const selected = landIds.includes(land.id);
              return (
                <button
                  key={land.id}
                  type="button"
                  onClick={() => toggleLand(land.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                    selected
                      ? 'border-admin-400 bg-admin-50'
                      : 'border-hairline bg-white hover:bg-admin-50/50',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                      selected ? 'bg-admin-500 text-white' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    <MapIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink-muted">
                      {land.code}
                      {otherProjectByLand[land.id] && (
                        <span className="ml-1.5 text-amber-600">
                          · already in {otherProjectByLand[land.id]}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{land.name}</span>
                      <Badge tone={LAND_STATUS_META[land.status].tone}>
                        {landStatusLabel(land.status, land.acquisition_type)}
                      </Badge>
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {land.land_size} {LAND_SIZE_UNIT_LABEL[land.land_size_unit]} ·{' '}
                      {ACQUISITION_TYPE_LABEL[land.acquisition_type]} ·{' '}
                      {formatBdt(land.final_agreed_amount ?? land.asking_price)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {errors.lands && <p className="mt-2 text-xs text-red-600">{errors.lands}</p>}
        <QuickLandModal
          open={addingLand !== null}
          initialMode={addingLand ?? 'owned'}
          onClose={() => setAddingLand(null)}
          onCreated={(land) => {
            setAvailableLands((rows) =>
              [...rows, land].sort((a, b) => a.code.localeCompare(b.code)),
            );
            setLandIds((ids) => [...ids, land.id]);
            setAddingLand(null);
          }}
        />
      </Card>

      <Card>
        <CardHeader title="Amenities & Surroundings" />
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {amenityOptions.map((option) => (
            <Checkbox
              key={option}
              label={option}
              checked={amenities.includes(option)}
              onChange={() => toggleAmenity(option)}
            />
          ))}
        </div>
        <Field
          label="Surroundings"
          hint="School / hospital / market / main road distances — shown on the public project page."
        >
          <TextArea
            value={form.surroundings}
            onChange={(e) => set('surroundings', e.target.value)}
            placeholder="e.g. Scholastica 900m, Evercare Hospital 2km, 100ft road 300m"
          />
        </Field>
      </Card>

      <Card>
        <CardHeader title="Public Website" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Cover image link"
            className="md:col-span-2"
            hint="Only for an image hosted elsewhere. To use your own photos, upload them on the project's Documents tab as “Gallery Image” and pick the display picture there — an uploaded picture takes precedence over this link."
          >
            <TextInput
              value={form.cover_image_url}
              onChange={(e) => set('cover_image_url', e.target.value)}
              placeholder="https://images.unsplash.com/…"
            />
          </Field>
          <div>
            <Checkbox
              label="Show this project on the public website"
              checked={form.is_public}
              onChange={(e) => {
                set('is_public', e.target.checked);
                if (!e.target.checked) set('is_featured', false);
              }}
            />
            {errors.is_public && <p className="mt-1 text-xs text-red-600">{errors.is_public}</p>}
          </div>
          <div>
            <Checkbox
              label="Feature it on the public home page"
              checked={form.is_featured}
              disabled={!form.is_public}
              onChange={(e) => set('is_featured', e.target.checked)}
            />
            {errors.is_featured && <p className="mt-1 text-xs text-red-600">{errors.is_featured}</p>}
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : project ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </form>
  );
}

function toFormState(project: ProjectWithRelations): FormState {
  return {
    ...EMPTY,
    name: project.name,
    project_type: project.project_type,
    total_land_area: str(project.total_land_area),
    total_land_area_unit: project.total_land_area_unit ?? 'katha',
    location_summary: str(project.location_summary),
    expected_start_date: project.expected_start_date,
    expected_completion_date: project.expected_completion_date,
    actual_start_date: str(project.actual_start_date),
    architect: str(project.architect),
    project_manager: str(project.project_manager),
    surroundings: str(project.surroundings),
    cover_image_url: str(project.cover_image_url),
    is_public: project.is_public,
    is_featured: project.is_featured,
    construction_after_sale: project.construction_after_sale ?? 'undecided',
  };
}
