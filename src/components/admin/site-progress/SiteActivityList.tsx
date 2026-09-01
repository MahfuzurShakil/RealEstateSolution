'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, HardHat, Layers, MapPin, Search, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ResultCard } from '@/components/ui/ResultCard';
import { ResultsLayout, ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { SCHEDULE_STATE_META, scheduleState, varianceOn } from '@/lib/domain/site-progress';
import {
  projectRepository,
  siteProgressUpdateRepository,
  towerRepository,
  userRepository,
} from '@/lib/repositories';
import { formatDate, todayLocal } from '@/lib/utils/format';

type SortKey = 'newest' | 'oldest' | 'progress_high' | 'progress_low';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  progress_high: 'Progress: high to low',
  progress_low: 'Progress: low to high',
};

/**
 * Every reading ever logged, across every project.
 *
 * This is the page the Site Progress module used to open on, and it was the
 * wrong front door — but it is the right tool for exactly one job: "what did
 * Jahangir report last week", the audit question. So it is kept, demoted to a
 * tab behind the project board.
 */
export function SiteActivityList() {
  const today = todayLocal();

  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [towerId, setTowerId] = useState('');
  const [reporter, setReporter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('list');

  const updates = useLiveQuery(
    () =>
      siteProgressUpdateRepository.list({
        search,
        project_id: projectId || undefined,
        tower_id: towerId || undefined,
        updated_by: reporter,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }),
    [search, projectId, towerId, reporter, fromDate, toDate],
  );

  const total = useLiveQuery(() => siteProgressUpdateRepository.count(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const towers = useLiveQuery(
    () => (projectId ? towerRepository.listForProject(projectId) : Promise.resolve([])),
    [projectId],
  );
  const siteTeam = useLiveQuery(
    () => userRepository.listByRole(['site_manager', 'project_manager']),
    [],
  );

  /*
   * The repository hands these back newest-first; re-sorting here rather than
   * in the query keeps the sort a view concern, the same way the bookings list
   * does it.
   */
  const rows = useMemo(() => {
    const list = [...(updates ?? [])];
    switch (sort) {
      case 'oldest':
        return list.sort(
          (a, b) =>
            a.update_date.localeCompare(b.update_date) ||
            a.created_at.localeCompare(b.created_at),
        );
      case 'progress_high':
        return list.sort((a, b) => b.progress_pct - a.progress_pct);
      case 'progress_low':
        return list.sort((a, b) => a.progress_pct - b.progress_pct);
      default:
        return list.sort(
          (a, b) =>
            b.update_date.localeCompare(a.update_date) ||
            b.created_at.localeCompare(a.created_at),
        );
    }
  }, [updates, sort]);

  const paged = usePagination(rows);
  const loading = updates === undefined;
  const hasAny = (total ?? 0) > 0;
  const filtersActive =
    Boolean(search || projectId || towerId || fromDate || toDate) || reporter !== 'all';

  function resetFilters() {
    setSearch('');
    setProjectId('');
    setTowerId('');
    setReporter('all');
    setFromDate('');
    setToDate('');
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="min-w-0 space-y-5">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-ink">Filters</h2>
          <div className="space-y-4">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <TextInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Remarks, work item, tower…"
                  className="pr-9"
                />
              </div>
            </Field>

            <Field label="Project">
              <SelectInput
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setTowerId('');
                }}
              >
                <option value="">All projects</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="Tower">
              <SelectInput
                value={towerId}
                onChange={(e) => setTowerId(e.target.value)}
                disabled={!projectId}
              >
                <option value="">All towers</option>
                {(towers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="Reported by">
              <SelectInput value={reporter} onChange={(e) => setReporter(e.target.value)}>
                <option value="all">Everyone</option>
                {(siteTeam ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </SelectInput>
            </Field>

            {/* stacked, not side by side: two date controls in a 280px
                sidebar leave ~115px each and the picker gets clipped */}
            <Field label="Reported from">
              <TextInput
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </Field>
            <Field label="Reported up to">
              <TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </Field>

            {filtersActive && (
              <Button variant="outline" size="sm" className="w-full" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </Card>
      </aside>

      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {loading ? 'Loading…' : `Showing ${rows.length} update${rows.length === 1 ? '' : 's'}`}
          </p>
          <div className="flex items-center gap-2">
            <ViewToggle value={view} onChange={setView} />
            <SelectInput
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="w-auto max-w-[13rem]"
              aria-label="Sort updates"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </SelectInput>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-hairline bg-white"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={HardHat}
            title={hasAny ? 'No update matches these filters' : 'No site update logged yet'}
            description={
              hasAny
                ? 'Try a wider date range or clear the project filter.'
                : 'Every tower opens with a default work breakdown. Log a reading against one of its items and the tower percentage follows.'
            }
            action={
              hasAny ? (
                <Button variant="outline" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ResultsLayout view={view}>
              {paged.pageRows.map((update) => {
                const variance = update.work_item ? varianceOn(update.work_item, today) : null;
                const state = scheduleState(variance);

                return (
                  <ResultCard
                    key={update.id}
                    href={`/admin/site-progress/updates/${update.id}`}
                    view={view}
                    code={update.project?.name ?? 'Project removed'}
                    title={update.work_item?.name ?? 'Work item removed'}
                    subtitle={update.remarks ?? undefined}
                    status={
                      <>
                        <Badge tone="teal">{update.progress_pct}%</Badge>
                        {state !== 'no_plan' && (
                          <Badge tone={SCHEDULE_STATE_META[state].tone}>
                            {SCHEDULE_STATE_META[state].label}
                          </Badge>
                        )}
                      </>
                    }
                    footer={`Reported ${formatDate(update.update_date)}`}
                    facts={
                      <>
                        {update.tower && (
                          <Badge tone="blue">
                            <Building2 className="size-3.5" />
                            {update.tower.name}
                          </Badge>
                        )}
                        <Badge>
                          <Layers className="size-3.5" />
                          Weight {update.work_item?.weight_pct ?? 0}%
                        </Badge>
                        {update.reporter_name && (
                          <Badge tone="neutral">
                            <UserRound className="size-3.5" />
                            {update.reporter_name}
                          </Badge>
                        )}
                        {update.gps_lat != null && update.gps_lng != null && (
                          <Badge tone="green">
                            <MapPin className="size-3.5" /> GPS
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
              label="updates"
            />
          </>
        )}
      </section>
    </div>
  );
}
