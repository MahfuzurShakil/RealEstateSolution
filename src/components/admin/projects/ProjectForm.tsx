'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Info, Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import {
  PROJECT_TYPES,
  type Land,
  type LandSizeUnit,
  type Project,
  type ProjectType,
} from '@/lib/db/types';
import { ACQUISITION_TYPE_LABEL, LAND_SIZE_UNIT_LABEL } from '@/lib/domain/land';
import { PROJECT_TYPE_LABEL } from '@/lib/domain/project';
import {
  landProjectMappingRepository,
  landRepository,
  lookupRepository,
  projectRepository,
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
  surroundings: string;
  cover_image_url: string;
  is_public: boolean;
  is_featured: boolean;
}

const EMPTY: FormState = {
  name: '',
  project_type: 'residential',
  total_land_area: '',
  total_land_area_unit: 'katha',
  location_summary: '',
  expected_start_date: '',
  expected_completion_date: '',
  actual_start_date: '',
  architect: '',
  surroundings: '',
  cover_image_url: '',
  is_public: false,
  is_featured: false,
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: string) => (v.trim() === '' ? null : Number(v));

/**
 * Add / Edit form for Module 2 (Design Reference A.9).
 *
 * A project is created against acquired or JV-signed land, so the land picker
 * only offers those — plus whatever this project already holds.
 */
export function ProjectForm({ project }: { project?: ProjectWithRelations }) {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(project ? toFormState(project) : EMPTY);
  const [landIds, setLandIds] = useState<string[]>(project?.lands.map((l) => l.id) ?? []);
  const [amenities, setAmenities] = useState<string[]>(project?.amenities ?? []);
  const [availableLands, setAvailableLands] = useState<Land[]>([]);
  /** lands already carrying another project — legal, but worth flagging */
  const [otherProjectByLand, setOtherProjectByLand] = useState<Record<string, string>>({});
  const [amenityOptions, setAmenityOptions] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const alreadyMine = new Set(project?.lands.map((l) => l.id) ?? []);
    landRepository.getAll().then((rows) =>
      setAvailableLands(
        rows
          .filter(
            (l) =>
              alreadyMine.has(l.id) ||
              l.status === 'acquired' ||
              l.status === 'jv_signed' ||
              l.status === 'linked_to_project',
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
    if (landIds.length === 0) next.lands = 'Link at least one land to this project';
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
        surroundings: form.surroundings.trim() || null,
        amenities,
        cover_image_url: form.cover_image_url.trim() || null,
        is_public: form.is_public,
        is_featured: form.is_featured,
      };

      let saved: Project;
      if (project) {
        saved = (await projectRepository.update(project.id, payload)) as Project;
      } else {
        saved = await projectRepository.create({
          ...payload,
          code: '',
          status: 'planning',
          project_manager: null,
        });
      }

      // Also flips the linked lands to `linked_to_project` (Module 1 leaves
      // that transition to Module 2).
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
          <Field label="Project Type" required>
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
        <CardHeader title="Linked Land" />
        <p className="mb-3 flex items-start gap-2 text-xs text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Only acquired or JV-signed lands can carry a project. Linking moves the land to
          &ldquo;Linked to Project&rdquo;.
        </p>
        {availableLands.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No acquired or JV-signed land yet — finish a land in the pipeline first.
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
                    <span className="block truncate text-sm font-medium text-ink">{land.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {land.land_size} {LAND_SIZE_UNIT_LABEL[land.land_size_unit]} ·{' '}
                      {ACQUISITION_TYPE_LABEL[land.acquisition_type]} ·{' '}
                      {formatBdt(land.final_agreed_amount ?? land.negotiated_price ?? land.asking_price )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {errors.lands && <p className="mt-2 text-xs text-red-600">{errors.lands}</p>}
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
          <Field label="Cover Image URL" className="md:col-span-2">
            <TextInput
              value={form.cover_image_url}
              onChange={(e) => set('cover_image_url', e.target.value)}
              placeholder="https://images.unsplash.com/…"
            />
          </Field>
          <Checkbox
            label="Show this project on the public website"
            checked={form.is_public}
            onChange={(e) => {
              set('is_public', e.target.checked);
              if (!e.target.checked) set('is_featured', false);
            }}
          />
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
    surroundings: str(project.surroundings),
    cover_image_url: str(project.cover_image_url),
    is_public: project.is_public,
    is_featured: project.is_featured,
  };
}
