'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { PROJECT_TYPES, type ProjectType } from '@/lib/db/types';
import { PROJECT_TYPE_LABEL } from '@/lib/domain/project';
import {
  PUBLIC_PRICE_BANDS,
  areaOf,
  PUBLIC_STAGE_LABEL,
  type PublicPriceBand,
  type PublicStage,
} from '@/lib/domain/public-portal';
import {
  publicProjectRepository,
  type PublicProjectFilters,
} from '@/lib/repositories/public/project.public.repository';
import { cn } from '@/lib/utils/cn';
import { ProjectCard, ProjectCardSkeleton } from './ProjectCard';

/*
 * The listing (Public Portal v2.0 §3.4). Filters live in the URL —
 * `?type=apartment&stage=ongoing&price=1_1_5cr&location=…&available=1` — so the
 * home page's "browse by type" tiles can link straight into a filtered list and
 * a buyer can send the link to family.
 */

const STAGES: PublicStage[] = ['upcoming', 'ongoing', 'ready', 'completed'];
/** Homes first — `PROJECT_TYPES` leads with the land types, which is admin order, not a buyer's. */
const TYPE_ORDER: ProjectType[] = ['apartment', 'mixed', 'commercial', 'plot_development', 'land_share'];

function readFilters(params: URLSearchParams): PublicProjectFilters {
  const list = <T extends string>(key: string, allowed: readonly T[]) =>
    params.getAll(key).filter((v): v is T => (allowed as readonly string[]).includes(v));
  return {
    project_types: list<ProjectType>('type', PROJECT_TYPES),
    stages: list<PublicStage>('stage', STAGES),
    price_bands: list<PublicPriceBand>('price', PUBLIC_PRICE_BANDS.map((b) => b.key)),
    location: params.get('location') ?? undefined,
    area: params.get('area') ?? undefined,
    available_only: params.get('available') === '1',
  };
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
        active
          ? 'border-site-primary bg-site-primary text-white'
          : 'border-site-line bg-white text-site-ink hover:border-site-primary',
      )}
    >
      {children}
    </button>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2.5 text-xs tracking-[0.2em] text-site-muted uppercase">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function ProjectsBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = useState(false);

  const filters = readFilters(params);
  const key = params.toString();
  const cards = useLiveQuery(() => publicProjectRepository.list(readFilters(new URLSearchParams(key))), [key]);
  // the filter options only offer what exists, so no chip ever leads to an empty page on its own
  const all = useLiveQuery(() => publicProjectRepository.list(), []);
  const areas = [...new Set((all ?? []).map((c) => areaOf(c.location_summary)).filter((a): a is string => !!a))].sort();
  const types = TYPE_ORDER.filter((t) => all?.some((c) => c.project_type === t));
  const stages = STAGES.filter((s) => all?.some((c) => c.stage === s));

  const update = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggle = (name: string, value: string) =>
    update((next) => {
      const values = next.getAll(name);
      next.delete(name);
      const kept = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
      kept.forEach((v) => next.append(name, v));
    });

  const activeCount =
    (filters.project_types?.length ?? 0) +
    (filters.stages?.length ?? 0) +
    (filters.price_bands?.length ?? 0) +
    (filters.location ? 1 : 0) +
    (filters.area ? 1 : 0) +
    (filters.available_only ? 1 : 0);

  const panel = (
    <div className="space-y-7">
      {types.length > 1 && (
        <FilterGroup title="Type">
          {types.map((t) => (
            <Chip key={t} active={!!filters.project_types?.includes(t)} onClick={() => toggle('type', t)}>
              {PROJECT_TYPE_LABEL[t]}
            </Chip>
          ))}
        </FilterGroup>
      )}
      {stages.length > 1 && (
        <FilterGroup title="Stage">
          {stages.map((s) => (
            <Chip key={s} active={!!filters.stages?.includes(s)} onClick={() => toggle('stage', s)}>
              {PUBLIC_STAGE_LABEL[s]}
            </Chip>
          ))}
        </FilterGroup>
      )}
      <FilterGroup title="Budget">
        {PUBLIC_PRICE_BANDS.map((b) => (
          <Chip key={b.key} active={!!filters.price_bands?.includes(b.key)} onClick={() => toggle('price', b.key)}>
            {b.label}
          </Chip>
        ))}
      </FilterGroup>
      {areas.length > 1 && (
        <FilterGroup title="Area">
          {areas.map((a) => (
            <Chip
              key={a}
              active={filters.area === a}
              onClick={() => update((next) => (filters.area === a ? next.delete('area') : next.set('area', a)))}
            >
              {a}
            </Chip>
          ))}
        </FilterGroup>
      )}
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-site-ink">
        <input
          type="checkbox"
          checked={!!filters.available_only}
          onChange={(e) => update((next) => (e.target.checked ? next.set('available', '1') : next.delete('available')))}
          className="size-4 accent-site-primary"
        />
        Only projects with something available
      </label>
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => router.replace(pathname, { scroll: false })}
          className="text-sm text-site-primary underline underline-offset-4"
        >
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-site-primary uppercase">Our projects</p>
          <h1 className="mt-2 text-4xl text-site-ink">Find your next home</h1>
        </div>
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 rounded-full border border-site-line bg-white px-4 py-2 text-sm text-site-ink lg:hidden"
        >
          <SlidersHorizontal className="size-4" /> Filters{activeCount > 0 && ` (${activeCount})`}
        </button>
      </div>

      <div className="grid gap-10 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block">{panel}</aside>

        <section aria-live="polite">
          {cards !== undefined && (
            <p className="mb-5 text-sm text-site-muted">
              {cards.length === 1 ? '1 project' : `${cards.length} projects`}
            </p>
          )}
          {cards === undefined ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-site-line bg-white/60 px-6 py-14 text-center">
              <p className="text-xl text-site-ink">
                {activeCount > 0 ? 'Nothing matches these filters' : 'No projects on sale yet'}
              </p>
              <p className="mt-2 text-sm text-site-muted">
                {activeCount > 0
                  ? 'Try a wider budget or another area — or call us, new projects open often.'
                  : 'New projects appear here as soon as they open for booking.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <ProjectCard key={card.code} card={card} />
              ))}
            </div>
          )}
        </section>
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-black/40"
            onClick={() => setPanelOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-site-soft p-6">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-xl text-site-ink">Filters</p>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setPanelOpen(false)}
                className="grid size-9 place-items-center rounded-full bg-white"
              >
                <X className="size-4" />
              </button>
            </div>
            {panel}
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="mt-8 w-full rounded-full bg-site-primary py-3 text-sm text-white"
            >
              Show {cards?.length ?? 0} {cards?.length === 1 ? 'project' : 'projects'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
