'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  Image as ImageIcon,
  Info,
  LandPlot,
  Layers,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useBlobUrl } from '@/components/ui/useBlobUrl';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Checkbox, Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import {
  CONSTRUCTION_AFTER_SALE,
  PROJECT_TYPES,
  type ConstructionAfterSale,
  type Land,
  type LandSizeUnit,
  type Project,
  type ProjectType,
} from '@/lib/db/types';
import { LAND_SIZE_UNIT_LABEL, developmentGateBlockReason } from '@/lib/domain/land';
import { isSiteActive } from '@/lib/domain/site-progress';
import {
  CONSTRUCTION_AFTER_SALE_LABEL,
  PROJECT_TYPE_HINT,
  PROJECT_TYPE_LABEL,
  siteRoadWidthFt,
} from '@/lib/domain/project';
import {
  companySettingsRepository,
  documentRepository,
  landDevelopmentRepository,
  landProjectMappingRepository,
  landRepository,
  lookupRepository,
  projectRepository,
  userRepository,
  type ProjectWithRelations,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { LandFacts, LandPickerModal } from './LandPickerModal';

interface FormState {
  name: string;
  project_type: ProjectType;
  location_summary: string;
  expected_start_date: string;
  expected_completion_date: string;
  actual_start_date: string;
  project_manager: string;
  surroundings: string;
  construction_after_sale: ConstructionAfterSale;
}

const EMPTY: FormState = {
  name: '',
  project_type: 'apartment',
  location_summary: '',
  expected_start_date: '',
  expected_completion_date: '',
  actual_start_date: '',
  project_manager: '',
  surroundings: '',
  construction_after_sale: 'undecided',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

type Kind = 'built' | 'plot' | 'share';
const kindOf = (t: ProjectType): Kind =>
  t === 'land_share' ? 'share' : t === 'plot_development' ? 'plot' : 'built';

/** The two dates mean different things per type (client walkthrough 2026-10-10). */
const TIMELINE: Record<Kind, { title: string; start: string; end: string; startHint: string; endHint: string }> = {
  built: {
    title: 'Construction timeline',
    start: 'Construction start',
    end: 'Handover target',
    startHint: 'When piling or foundation work is expected to begin',
    endHint: 'When flats are expected to be handed over',
  },
  plot: {
    title: 'Development timeline',
    start: 'Development start',
    end: 'Plot handover target',
    startHint: 'Filling, roads and drains begin',
    endHint: 'When plots are expected to be handed over',
  },
  share: {
    title: 'Sale period',
    start: 'Sales start',
    end: 'Target sell-out',
    startHint: 'Nothing is built: this is only the selling window',
    endHint: 'When all shares are expected to be sold',
  },
};

const TYPE_ICON: Record<Kind, typeof Building2> = { built: Building2, plot: LandPlot, share: Layers };

/**
 * Add / Edit form for Module 2, rebuilt after the client walkthrough
 * (PROJECT-FLOW-REVIEW.md, batch 1).
 *
 * Order: what the project is, then its type, then the fields that type needs,
 * then the land. The land is picked and confirmed in a dialog and then shown
 * read only; its area is never typed here, it comes from the land. A land
 * belongs to one project only (D3). Publishing lives on the Sales card.
 */
export function ProjectForm({ project }: { project?: ProjectWithRelations }) {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(project ? toFormState(project) : EMPTY);
  const managers =
    useLiveQuery(() => userRepository.listByRole(['project_manager', 'management']), []) ?? [];
  const [lands, setLands] = useState<Land[]>(project?.lands ?? []);
  const [amenities, setAmenities] = useState<string[]>(project?.amenities ?? []);
  const [amenityOptions, setAmenityOptions] = useState<string[]>([]);
  const [picking, setPicking] = useState<{ replace?: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  /** the display picture, uploaded rather than linked (client feedback 2026-10-11) */
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const currentCover = useLiveQuery(
    () =>
      project?.cover_image_document_id
        ? documentRepository.getById(project.cover_image_document_id)
        : Promise.resolve(undefined),
    [project?.cover_image_document_id],
  );
  const coverPreview = useBlobUrl(coverFile ?? currentCover?.file_data ?? null);

  useEffect(() => {
    lookupRepository.options('amenity').then((rows) => setAmenityOptions(rows.map((r) => r.value)));
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const kind = kindOf(form.project_type);
  const timeline = TIMELINE[kind];
  // the inventory is shaped by the type, so the type is fixed once there is any —
  // a tower counts too: it carries a work breakdown a share or plot never has (QA P-12)
  const typeLocked = Boolean(project && (project.unit_total > 0 || project.towers.length > 0));
  /*
   * QA audit P-10: a project in Planning or Design often has no real dates
   * yet, and forcing them produced made-up dates that later drove "behind
   * schedule". They are asked for from Approval on.
   */
  const datesRequired = Boolean(project && !['planning', 'design'].includes(project.status));
  // QA audit P-11 — the actual start belongs to a project whose construction has begun
  const showActualStart = Boolean(project && isSiteActive(project.status)) || Boolean(project?.actual_start_date);

  const roadWidth = siteRoadWidthFt(lands);

  /** Area from the land, never typed: summed when the lands share a unit. */
  const area = useMemo(() => {
    if (lands.length === 0) return null;
    const units = new Set(lands.map((l) => l.land_size_unit));
    if (units.size !== 1) return { total: null, unit: lands[0].land_size_unit as LandSizeUnit };
    const total = lands.reduce((s, l) => s + (Number(l.land_size) || 0), 0);
    return { total: Number(total.toFixed(4)), unit: lands[0].land_size_unit as LandSizeUnit };
  }, [lands]);

  // gate G3 (BRD DEV-004), for land newly added to this project
  const gateOn = useLiveQuery(
    async () => (await companySettingsRepository.get())?.require_development_ready ?? false,
    [],
  );
  const alreadyLinked = useMemo(() => new Set(project?.lands.map((l) => l.id) ?? []), [project]);
  const blockedLands =
    useLiveQuery(async () => {
      const reasons: string[] = [];
      for (const land of lands) {
        if (alreadyLinked.has(land.id)) continue;
        const readiness = await landDevelopmentRepository.readinessForLand(land.id);
        const reason = developmentGateBlockReason(land, readiness);
        if (reason) reasons.push(reason);
      }
      return reasons;
    }, [lands.map((l) => l.id).join(','), alreadyLinked]) ?? [];

  // QA 2026-10-11 — two projects with one name are two answers to "which one?"
  const takenNames = useLiveQuery(
    async () =>
      new Set(
        (await projectRepository.getAll())
          .filter((p) => p.id !== project?.id)
          .map((p) => p.name.trim().toLowerCase()),
      ),
    [project?.id],
  );

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Project name is required';
    else if (takenNames?.has(form.name.trim().toLowerCase()))
      next.name = 'Another project already has this name';
    if (datesRequired && !form.expected_start_date) next.expected_start_date = 'Required';
    if (datesRequired && !form.expected_completion_date) next.expected_completion_date = 'Required';
    else if (form.expected_start_date && form.expected_completion_date && form.expected_completion_date < form.expected_start_date) {
      next.expected_completion_date = `${timeline.end} cannot be before ${timeline.start.toLowerCase()}`;
    }
    if (gateOn && blockedLands.length > 0) next.lands = blockedLands.join(' ');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    /*
     * QA audit P-08: the land link is checked before anything is written, so a
     * land taken by another project in the meantime no longer leaves a new
     * project saved without its land.
     */
    for (const land of lands) {
      const holders = (await landProjectMappingRepository.projectsForLand(land.id)).filter(
        (p) => p.id !== project?.id,
      );
      if (holders.length > 0) {
        setErrors((prev) => ({
          ...prev,
          lands: `${land.code} is already the land of ${holders[0].code}. A land can belong to one project only.`,
        }));
        setSaving(false);
        return;
      }
    }
    try {
      const payload = {
        name: form.name.trim(),
        project_type: form.project_type,
        // from the land, read only (client walkthrough 2026-10-10)
        total_land_area: area?.total ?? null,
        total_land_area_unit: area?.unit ?? 'katha',
        location_summary: form.location_summary.trim() || null,
        expected_start_date: form.expected_start_date || null,
        expected_completion_date: form.expected_completion_date || null,
        actual_start_date: kind === 'built' ? form.actual_start_date || null : null,
        // the architect comes from Design Complete; a land share has none
        ...(kind === 'share' ? { architect: null } : {}),
        project_manager: form.project_manager || null,
        surroundings: form.surroundings.trim() || null,
        amenities: kind === 'share' ? [] : amenities,
        construction_after_sale: kind === 'share' ? form.construction_after_sale : null,
      };

      let saved: Project;
      if (project) {
        saved = (await projectRepository.update(project.id, payload)) as Project;
      } else {
        saved = await projectRepository.create({
          ...payload,
          code: '',
          status: 'planning',
          is_public: false,
          is_featured: false,
        });
      }

      // the uploaded picture becomes a gallery document and the display picture
      if (coverFile) {
        const doc = await documentRepository.create({
          entity_type: 'project',
          entity_id: saved.id,
          document_type: 'gallery_image',
          custom_type_name: null,
          file_url: coverFile.name,
          file_data: coverFile,
          file_name: coverFile.name,
          file_size: coverFile.size,
          mime_type: coverFile.type,
          is_public: true,
          uploaded_by: null,
          uploaded_at: new Date().toISOString(),
          notes: 'Display picture, uploaded with the project',
        });
        await projectRepository.update(saved.id, { cover_image_document_id: doc.id, cover_image_url: null });
      }

      try {
        await landProjectMappingRepository.setLandsForProject(
          saved.id,
          lands.map((l) => l.id),
        );
      } catch (err) {
        setErrors((prev) => ({ ...prev, lands: err instanceof Error ? err.message : String(err) }));
        if (!project) router.push(`/admin/projects/${saved.id}/edit`);
        return;
      }
      router.push(`/admin/projects/${saved.id}`);
    } catch (err) {
      // QA audit P-08 — a failure is said, not swallowed
      setErrors((prev) => ({ ...prev, form: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSaving(false);
    }
  }

  const TypeIcon = TYPE_ICON[kind];

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">
      {/* 1 — what the project is */}
      <Card>
        <CardHeader title="Project information" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Project name" required error={errors.name} className="xl:col-span-2">
            <TextInput
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Nokshi Green Residence"
              invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label="Project manager">
            <SelectInput value={form.project_manager} onChange={(e) => set('project_manager', e.target.value)}>
              <option value="">Not assigned</option>
              {managers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field
            label="Location summary"
            className="xl:col-span-3"
            hint="Marketing address for the public site. Mouza and dag stay on the land record."
          >
            <TextInput
              value={form.location_summary}
              onChange={(e) => set('location_summary', e.target.value)}
              placeholder="e.g. Bashundhara R/A, Dhaka"
            />
          </Field>
        </div>
      </Card>

      {/* 2 — the type, which shapes everything after it */}
      <Card>
        <CardHeader
          title="Project type"
          subtitle={
            typeLocked
              ? 'Fixed: this project already has towers or inventory.'
              : project && project.project_type !== form.project_type && kindOf(form.project_type) === 'share'
                ? 'Saving as a land share clears the architect, amenities and actual start.'
                : 'Decides what is sold and which details are asked below'
          }
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {PROJECT_TYPES.map((t) => {
            const Icon = TYPE_ICON[kindOf(t)];
            const active = form.project_type === t;
            return (
              <button
                key={t}
                type="button"
                disabled={typeLocked && !active}
                onClick={() => set('project_type', t)}
                aria-pressed={active}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl border p-3 text-left transition',
                  active
                    ? 'border-admin-500 bg-admin-50 ring-2 ring-admin-500/20'
                    : 'border-hairline bg-white hover:border-admin-300',
                  typeLocked && !active && 'cursor-not-allowed opacity-50',
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-admin-600" />
                <span>
                  <span className="block text-sm font-semibold text-ink">{PROJECT_TYPE_LABEL[t]}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{PROJECT_TYPE_HINT[t]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 3 — what this type needs */}
      <Card>
        <CardHeader
          title={`${PROJECT_TYPE_LABEL[form.project_type]} details`}
          action={<TypeIcon className="size-5 text-admin-500" />}
        />
        {/* 2026-10-23 — the architect is named when Design is completed, not here */}
        {kind === 'share' && (
          <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field
              label="After the shares are sold"
              className="xl:col-span-3"
              hint="If construction is planned, the project prompts you to start the construction project once every share is sold."
            >
              <SelectInput
                value={form.construction_after_sale}
                onChange={(e) => set('construction_after_sale', e.target.value as ConstructionAfterSale)}
              >
                {CONSTRUCTION_AFTER_SALE.map((v) => (
                  <option key={v} value={v}>
                    {CONSTRUCTION_AFTER_SALE_LABEL[v]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        )}

        <p className="mb-3 text-sm font-medium text-ink">{timeline.title}</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field
            label={timeline.start}
            required={datesRequired}
            hint={datesRequired ? timeline.startHint : `${timeline.startHint}. Can be left empty until Approval.`}
            error={errors.expected_start_date}
          >
            <TextInput
              type="date"
              value={form.expected_start_date}
              onChange={(e) => set('expected_start_date', e.target.value)}
              invalid={Boolean(errors.expected_start_date)}
            />
          </Field>
          <Field label={timeline.end} required={datesRequired} hint={timeline.endHint} error={errors.expected_completion_date}>
            <TextInput
              type="date"
              value={form.expected_completion_date}
              onChange={(e) => set('expected_completion_date', e.target.value)}
              invalid={Boolean(errors.expected_completion_date)}
            />
          </Field>
          {kind === 'built' && showActualStart && (
            <Field label="Actual construction start" hint="Stamped when the project moves to Under Construction">
              <TextInput
                type="date"
                value={form.actual_start_date}
                onChange={(e) => set('actual_start_date', e.target.value)}
              />
            </Field>
          )}
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {kind === 'share'
            ? 'Shares are generated from the linked land on the project page. Their price is set there, with the land cost per share beside it.'
            : kind === 'plot'
              ? 'Plots are generated on the project page; their total cannot exceed the land.'
              : 'Towers and units are added on the project page after saving.'}
        </p>
      </Card>

      {/* 4 — the land, picked and confirmed, then read only */}
      <Card>
        <CardHeader
          title="Land"
          subtitle="Optional now. A land belongs to one project only."
          action={
            <Button variant="outline" size="sm" onClick={() => setPicking({})}>
              <Plus className="size-4" /> {lands.length ? 'Add another land' : 'Select land'}
            </Button>
          }
        />
        {lands.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline p-5 text-center text-sm text-ink-muted">
            <MapIcon className="mx-auto mb-2 size-6 text-slate-300" />
            No land selected. Pick an available land; new land is added under Lands first.
          </div>
        ) : (
          <div className="space-y-4">
            {lands.map((land) => (
              <div key={land.id}>
                <LandFacts land={land} />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPicking({ replace: land.id })}>
                    <RefreshCw className="size-4" /> Change land
                  </Button>
                  <Button
                    variant="dangerGhost"
                    size="sm"
                    onClick={() => setLands((rows) => rows.filter((l) => l.id !== land.id))}
                  >
                    <Trash2 className="size-4" /> Remove
                  </Button>
                </div>
              </div>
            ))}
            <div className="grid gap-4 rounded-xl bg-admin-50/60 p-3 sm:grid-cols-3">
              <Field label="Total land area" hint="From the land record; change it on the land">
                <TextInput
                  value={
                    area?.total != null
                      ? `${area.total} ${LAND_SIZE_UNIT_LABEL[area.unit]}`
                      : 'Lands are in different units'
                  }
                  readOnly
                  disabled
                />
              </Field>
              <Field label="Area unit">
                <TextInput value={area ? LAND_SIZE_UNIT_LABEL[area.unit] : ''} readOnly disabled />
              </Field>
              {/* 2026-10-22 — read from the land, never typed here, so the two can't disagree */}
              <Field label="Front road width" hint="Widest road among the lands">
                <TextInput value={roadWidth != null ? `${roadWidth} ft` : 'Not set on the land'} readOnly disabled />
              </Field>
            </div>
          </div>
        )}
        {errors.lands && <p className="mt-2 text-xs text-red-600">{errors.lands}</p>}
        <LandPickerModal
          open={picking !== null}
          projectId={project?.id}
          exclude={lands.map((l) => l.id)}
          onClose={() => setPicking(null)}
          onConfirm={async (land) => {
            const fresh = (await landRepository.getById(land.id)) ?? land;
            setLands((rows) =>
              picking?.replace
                ? rows.map((l) => (l.id === picking.replace ? fresh : l))
                : [...rows, fresh],
            );
            setPicking(null);
          }}
        />
      </Card>

      {/* 5 — what buyers see */}
      <Card>
        <CardHeader title={kind === 'share' ? 'Surroundings' : 'Amenities & surroundings'} />
        {kind !== 'share' && (
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {amenityOptions
              // a plot scheme has no building: no lift, rooftop or gym (walkthrough 2026-10-17)
              .filter((o) => kind !== 'plot' || !/lift|rooftop|gym|fire fighting/i.test(o))
              .map((option) => (
              <Checkbox
                key={option}
                label={option}
                checked={amenities.includes(option)}
                onChange={() =>
                  setAmenities((list) =>
                    list.includes(option) ? list.filter((a) => a !== option) : [...list, option],
                  )
                }
              />
            ))}
          </div>
        )}
        <Field label="Surroundings" hint="School, hospital, market, main road distances">
          <TextArea
            value={form.surroundings}
            onChange={(e) => set('surroundings', e.target.value)}
            placeholder="e.g. Scholastica 900m, Evercare Hospital 2km, 100ft road 300m"
          />
        </Field>
      </Card>

      {/* 6 — the display picture, on its own line (client feedback 2026-10-11) */}
      <Card>
        <CardHeader
          title="Project picture"
          subtitle="Shown on the project list and the public website. More photos go on the Documents tab."
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-hairline bg-slate-50">
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreview} alt="Project picture" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-8 text-slate-300" />
            )}
          </div>
          <div className="space-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-admin-50">
              <Upload className="size-4" />
              {coverPreview ? 'Replace picture' : 'Upload picture'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-xs text-ink-muted">
              {coverFile ? coverFile.name : 'JPG or PNG. Publishing is on the Sales card.'}
            </p>
          </div>
        </div>
      </Card>

      {errors.form && <p className="text-right text-sm text-red-600">{errors.form}</p>}
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
    location_summary: str(project.location_summary),
    expected_start_date: project.expected_start_date ?? '',
    expected_completion_date: project.expected_completion_date ?? '',
    actual_start_date: str(project.actual_start_date),
    project_manager: str(project.project_manager),
    surroundings: str(project.surroundings),
    construction_after_sale: project.construction_after_sale ?? 'undecided',
  };
}
