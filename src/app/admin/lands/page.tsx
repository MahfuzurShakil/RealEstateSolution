'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, KeyRound, MapPin, Plus, Ruler, Search, Wallet, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ResultCard } from '@/components/ui/ResultCard';
import { ResultsLayout, ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { ACQUISITION_TYPES, LAND_STATUSES, type AcquisitionType, type LandStatus } from '@/lib/db/types';
import {
  ACQUISITION_TYPE_LABEL,
  LAND_SIZE_UNIT_LABEL,
  LAND_STAGES,
  LAND_STAGE_META,
  LAND_STATUS_META,
  WAITING_KEYS,
  WAITING_LABEL,
  landHeadlineAmount,
  landSizeSqft,
  landStage,
  landStatusLabel,
  type LandStage,
  type WaitingKey,
} from '@/lib/domain/land';
import { landPipelineRepository, landProjectMappingRepository, landRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

type SortKey = 'newest' | 'oldest' | 'price_high' | 'price_low' | 'size_high';

interface Filters {
  search: string;
  stage: LandStage | 'all';
  status: LandStatus | 'all';
  waiting: WaitingKey | 'all';
  acquisitionType: AcquisitionType | 'all';
  district: string;
  sort: SortKey;
  view: ViewMode;
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  stage: 'all',
  status: 'all',
  waiting: 'all',
  acquisitionType: 'all',
  district: '',
  sort: 'newest',
  view: 'list',
};

/*
 * Filters survive opening a land and coming back (2026-10-22). Kept in module
 * memory, which lives as long as the app is open in the tab: moving between
 * pages keeps it, a full reload starts clean. Browser storage would also
 * survive a reload, but reading it during the first render disagrees with the
 * server-rendered page.
 */
let remembered: Filters = DEFAULT_FILTERS;

const tally = <K extends string>(keys: K[]) => {
  const out = new Map<K, number>();
  for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1);
  return out;
};

/**
 * Land list — Design Reference A.7 (filter sidebar + result cards, grid/list toggle).
 *
 * 2026-10-22 review of the filters:
 *  - Stage is a row of tabs over the results, with counts, and the Status
 *    dropdown lists only that stage's statuses — two separate dropdowns could
 *    be set to contradict each other and return nothing without saying why.
 *  - Every option carries its count (faceted on the other filters), and an
 *    option with nothing in it is disabled rather than a dead end.
 *  - Active filters show as removable chips above the results.
 *  - "Largest size" compares square feet, not the raw number in mixed units.
 */
export default function LandsListPage() {
  const [filters, setFilters] = useState<Filters>(() => remembered);
  const { search, stage, status, waiting, acquisitionType, district, sort, view } = filters;

  useEffect(() => {
    remembered = filters;
  }, [filters]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({
      ...f,
      [key]: value,
      // a status from another stage would contradict the stage just picked
      ...(key === 'stage' && f.status !== 'all' && value !== 'all' &&
      !LAND_STAGE_META[value as LandStage].statuses.includes(f.status as LandStatus)
        ? { status: 'all' as const }
        : {}),
    }));

  /*
   * One query for the lands and what each is waiting on, then the facets
   * narrow in order — stage, status, waiting — each counted against what the
   * filters before it left, so a count is what you get by picking it.
   */
  const result = useLiveQuery(async () => {
    const base = await landRepository.list({ search, acquisition_type: acquisitionType, district });
    const waitingOn = await landPipelineRepository.waitingOnForLands(base);

    const stageCounts = tally(base.map((l) => landStage(l.status)));
    const inStage = stage === 'all' ? base : base.filter((l) => landStage(l.status) === stage);
    const statusCounts = tally(inStage.map((l) => l.status));
    const inStatus = status === 'all' ? inStage : inStage.filter((l) => l.status === status);
    const waitingCounts = tally(
      inStatus.map((l) => waitingOn.get(l.id)?.key).filter((k): k is WaitingKey => Boolean(k)),
    );
    const lands =
      waiting === 'all' ? inStatus : inStatus.filter((l) => waitingOn.get(l.id)?.key === waiting);

    return { lands, waitingOn, base: base.length, stageCounts, statusCounts, waitingCounts };
  }, [search, stage, status, waiting, acquisitionType, district]);
  const lands = result?.lands;
  const waitingOn = result?.waitingOn;

  const allLands = useLiveQuery(() => landRepository.getAll(), []);
  // QA audit L-04 — which plots are already spoken for by a project
  const inProject = useLiveQuery(() => landProjectMappingRepository.projectCodeByLand(), []);
  const districts = useMemo(
    () => [...new Set((allLands ?? []).map((l) => l.location_district).filter(Boolean))].sort(),
    [allLands],
  );
  const typeCounts = useMemo(() => tally((allLands ?? []).map((l) => l.acquisition_type)), [allLands]);
  const districtCounts = useMemo(
    () => tally((allLands ?? []).map((l) => l.location_district).filter(Boolean) as string[]),
    [allLands],
  );

  const rows = useMemo(() => {
    const list = [...(lands ?? [])];
    switch (sort) {
      case 'oldest':
        return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      /*
       * Sorted on the figure the row actually shows, not on `asking_price`.
       * A JV has no asking price, so sorting by it silently ranked every joint
       * venture at zero — a list ordered by a number the reader cannot see.
       */
      case 'price_high':
        return list.sort(
          (a, b) => (landHeadlineAmount(b).amount ?? 0) - (landHeadlineAmount(a).amount ?? 0),
        );
      case 'price_low':
        return list.sort(
          (a, b) => (landHeadlineAmount(a).amount ?? 0) - (landHeadlineAmount(b).amount ?? 0),
        );
      // in square feet — 3 bigha is larger than 18 katha, though 18 > 3
      case 'size_high':
        return list.sort((a, b) => landSizeSqft(b) - landSizeSqft(a));
      default:
        return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [lands, sort]);

  const paged = usePagination(rows);

  const loading = lands === undefined;
  const hasAnyLand = (allLands?.length ?? 0) > 0;

  /* what is narrowing the list, as chips the user can take off one by one */
  const chips: Array<{ label: string; clear: () => void }> = [];
  if (search) chips.push({ label: `“${search}”`, clear: () => set('search', '') });
  if (stage !== 'all') chips.push({ label: `Stage: ${LAND_STAGE_META[stage].label}`, clear: () => set('stage', 'all') });
  if (status !== 'all') chips.push({ label: `Status: ${LAND_STATUS_META[status].label}`, clear: () => set('status', 'all') });
  if (waiting !== 'all') chips.push({ label: `Waiting on: ${WAITING_LABEL[waiting]}`, clear: () => set('waiting', 'all') });
  if (acquisitionType !== 'all')
    chips.push({ label: ACQUISITION_TYPE_LABEL[acquisitionType], clear: () => set('acquisitionType', 'all') });
  if (district) chips.push({ label: district, clear: () => set('district', '') });

  function resetFilters() {
    setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort, view: f.view }));
  }

  const statusOptions = stage === 'all' ? LAND_STATUSES : LAND_STAGE_META[stage].statuses;
  const n = (count: number | undefined) => (count ? ` (${count})` : ' (0)');

  return (
    <>
      <PageHeader
        title="Lands"
        subtitle="Land already owned, and land being acquired from first contact through registration or JV."
        action={
          <div className="flex flex-wrap gap-2">
            {/* v29 — land already ours skips the acquisition pipeline */}
            <Link href="/admin/lands/new?mode=owned">
              <Button variant="outline">
                <KeyRound className="size-4" /> Add owned land
              </Button>
            </Link>
            <Link href="/admin/lands/new">
              <Button>
                <Plus className="size-4" /> Add Land
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="min-w-0 space-y-5">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Filters</h2>
              {chips.length > 0 && (
                <button type="button" onClick={resetFilters} className="text-xs font-medium text-admin-700 hover:underline">
                  Clear all
                </button>
              )}
            </div>
            <div className="space-y-4">
              <Field label="Search" hint="Code, name, owner, area, road, mouza, dag or khatian">
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <TextInput
                    value={search}
                    onChange={(e) => set('search', e.target.value)}
                    placeholder="Search lands…"
                    className="pr-9"
                  />
                </div>
              </Field>

              <Field label="Status" hint={stage === 'all' ? undefined : `Within ${LAND_STAGE_META[stage].label}`}>
                <SelectInput value={status} onChange={(e) => set('status', e.target.value as LandStatus | 'all')}>
                  <option value="all">All statuses</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s} disabled={!result?.statusCounts.get(s) && status !== s}>
                      {LAND_STATUS_META[s].label}
                      {n(result?.statusCounts.get(s))}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Waiting on" hint="What is holding each land where it is">
                <SelectInput value={waiting} onChange={(e) => set('waiting', e.target.value as WaitingKey | 'all')}>
                  <option value="all">Anything</option>
                  {WAITING_KEYS.map((key) => (
                    <option key={key} value={key} disabled={!result?.waitingCounts.get(key) && waiting !== key}>
                      {key === 'nothing' ? 'Nothing — in a project or closed' : WAITING_LABEL[key]}
                      {n(result?.waitingCounts.get(key))}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Acquisition type">
                <SelectInput
                  value={acquisitionType}
                  onChange={(e) => set('acquisitionType', e.target.value as AcquisitionType | 'all')}
                >
                  <option value="all">All types</option>
                  {ACQUISITION_TYPES.map((t) => (
                    <option key={t} value={t} disabled={!typeCounts.get(t) && acquisitionType !== t}>
                      {ACQUISITION_TYPE_LABEL[t]}
                      {n(typeCounts.get(t))}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="District">
                <SelectInput value={district} onChange={(e) => set('district', e.target.value)}>
                  <option value="">All districts</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                      {n(districtCounts.get(d))}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          </Card>
        </aside>

        <section className="min-w-0">
          {/* stage — the coarse cut, as free-standing pills with counts (no bar behind them) */}
          <div className="mb-4 flex flex-wrap gap-2">
            {(['all', ...LAND_STAGES] as const).map((key) => {
              const count = key === 'all' ? result?.base : result?.stageCounts.get(key);
              const active = stage === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('stage', key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-admin-500 bg-admin-500 text-white shadow-sm'
                      : 'border-hairline bg-white text-ink-muted hover:border-admin-300 hover:text-admin-700',
                  )}
                >
                  {key === 'all' ? 'All' : LAND_STAGE_META[key].label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px] tabular-nums',
                      active ? 'bg-white/20' : 'bg-slate-100 text-ink-muted',
                    )}
                  >
                    {count ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="text-sm text-ink-muted">
                {loading ? 'Loading…' : `${rows.length} land${rows.length === 1 ? '' : 's'}`}
              </p>
              {chips.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1 rounded-full border border-admin-200 bg-admin-50 py-0.5 pl-2.5 pr-1 text-xs text-admin-800"
                >
                  {c.label}
                  <button
                    type="button"
                    aria-label={`Remove ${c.label}`}
                    onClick={c.clear}
                    className="rounded-full p-0.5 hover:bg-admin-100"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <ViewToggle value={view} onChange={(v) => set('view', v)} />
              <SelectInput
                value={sort}
                onChange={(e) => set('sort', e.target.value as SortKey)}
                className="w-auto max-w-[10rem]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                {/* "Value" rather than "Price": for a JV the figure is the
                    cash payable to the owner, not a price */}
                <option value="price_high">Value: high to low</option>
                <option value="price_low">Value: low to high</option>
                <option value="size_high">Largest size</option>
              </SelectInput>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl border border-hairline bg-white" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title={hasAnyLand ? 'No land matches these filters' : 'No land recorded yet'}
              description={
                hasAnyLand
                  ? 'Remove a filter above, or search for a different code, owner or area.'
                  : 'Add the first land opportunity to start tracking it through the pipeline.'
              }
              action={
                hasAnyLand ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/admin/lands/new">
                    <Button>
                      <Plus className="size-4" /> Add Land
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <ResultsLayout view={view}>
                {paged.pageRows.map((land) => {
                  const meta = LAND_STATUS_META[land.status];
                  const projectCode = inProject?.get(land.id);
                  const wait = waitingOn?.get(land.id);
                  return (
                    <ResultCard
                      key={land.id}
                      href={`/admin/lands/${land.id}`}
                      view={view}
                      code={land.code}
                      title={land.name}
                      status={
                        /*
                         * "Ready for Project" on a plot a project already
                         * stands on read as free land (QA audit L-04).
                         */
                        projectCode && land.status === 'ready_for_project' ? (
                          <Badge tone="teal">In project</Badge>
                        ) : (
                          <Badge tone={meta.tone}>
                            {landStatusLabel(land.status, land.acquisition_type)}
                          </Badge>
                        )
                      }
                      footer={
                        wait && wait.key !== 'nothing'
                          ? `Waiting on: ${wait.text} · added ${formatDate(land.created_at)}`
                          : `Added ${formatDate(land.created_at)}`
                      }
                      facts={
                        <>
                          <Badge>
                            <MapPin className="size-3.5" />
                            {[land.location_area, land.location_district]
                              .filter(Boolean)
                              .join(', ')}
                          </Badge>
                          <Badge>
                            <Ruler className="size-3.5" />
                            {land.land_size} {LAND_SIZE_UNIT_LABEL[land.land_size_unit]}
                          </Badge>
                          {/*
                            No badge rather than "BDT 0". A joint venture still
                            in the pipeline has no cash figure yet, and printing
                            zero beside it reads as a broken record instead of
                            an agreement that has not been struck.
                          */}
                          {(landHeadlineAmount(land).amount ?? 0) > 0 && (
                            <Badge>
                              <Wallet className="size-3.5" />
                              {formatBdt(landHeadlineAmount(land).amount)}
                            </Badge>
                          )}
                          <Badge
                            tone={land.acquisition_type === 'joint_venture' ? 'teal' : 'neutral'}
                          >
                            {ACQUISITION_TYPE_LABEL[land.acquisition_type]}
                          </Badge>
                          {projectCode && (
                            <Badge tone="blue">
                              <Building2 className="size-3.5" />
                              {projectCode}
                            </Badge>
                          )}
                        </>
                      }
                    />
                  );
                })}
              </ResultsLayout>

              <Pagination
                page={paged.page}
                pageCount={paged.pageCount}
                pageSize={paged.pageSize}
                total={paged.total}
                from={paged.from}
                to={paged.to}
                onPageChange={paged.setPage}
                onPageSizeChange={paged.setPageSize}
                label="lands"
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
