'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  HardHat,
  Package,
  Plus,
  Scale,
  Search,
  TrendingDown,
} from 'lucide-react';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { ProgressSparkline } from '@/components/admin/site-progress/ProgressSparkline';
import { ProgressUpdateModal } from '@/components/admin/site-progress/ProgressUpdateModal';
import { SiteActivityList } from '@/components/admin/site-progress/SiteActivityList';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { PROJECT_STATUSES } from '@/lib/db/types';
import { PROJECT_STATUS_META } from '@/lib/domain/project';
import { STALE_AFTER_DAYS, scheduleBadge, scheduleCaption } from '@/lib/domain/site-progress';
import { projectProgressRepository, type ProjectProgressRow } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate, todayLocal } from '@/lib/utils/format';

type Mode = 'projects' | 'activity';


/**
 * The Site Progress board.
 *
 * This page used to be a flat list of every reading ever logged. That answered
 * "what was typed in", but the question it is actually opened to answer is
 * "which project needs me today" — and on a real build the reading list runs
 * to thousands of rows, so it could never answer it. One card per project,
 * worst first; the raw log is still one tab away for the audit case.
 */
export default function SiteProgressBoardPage() {
  const router = useRouter();
  const today = todayLocal();

  const [mode, setMode] = useState<Mode>('projects');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const [projectStatus, setProjectStatus] = useState('all');
  const [logOpen, setLogOpen] = useState(false);

  const rows = useLiveQuery(
    () => projectProgressRepository.board(today, { search, state, project_status: projectStatus }),
    [today, search, state, projectStatus],
  );
  const attention = useLiveQuery(() => projectProgressRepository.attention(today), [today]);

  const loading = rows === undefined;
  const filtersActive = Boolean(search) || state !== 'all' || projectStatus !== 'all';

  function resetFilters() {
    setSearch('');
    setState('all');
    setProjectStatus('all');
  }

  const alerts = [
    {
      key: 'stale',
      show: (attention?.stale_projects ?? 0) > 0,
      icon: CalendarClock,
      tone: 'text-red-600 bg-red-50',
      label: `${attention?.stale_projects} active site${attention?.stale_projects === 1 ? '' : 's'} with no update in ${STALE_AFTER_DAYS} days`,
      onClick: () => setState('stale'),
      href: undefined as string | undefined,
    },
    {
      key: 'behind',
      show: (attention?.behind_items ?? 0) > 0,
      icon: TrendingDown,
      tone: 'text-amber-600 bg-amber-50',
      label: `${attention?.behind_items} work item${attention?.behind_items === 1 ? '' : 's'} behind schedule`,
      onClick: () => setState('behind'),
      href: undefined as string | undefined,
    },
    {
      key: 'requests',
      show: (attention?.pending_requests ?? 0) > 0,
      icon: Package,
      tone: 'text-amber-600 bg-amber-50',
      label: `${attention?.pending_requests} material request${attention?.pending_requests === 1 ? '' : 's'} waiting`,
      onClick: undefined as (() => void) | undefined,
      href: '/admin/material-requests' as string | undefined,
    },
    {
      key: 'weights',
      show: (attention?.unbalanced_towers ?? 0) > 0,
      icon: Scale,
      tone: 'text-slate-600 bg-slate-100',
      label: `${attention?.unbalanced_towers} tower${attention?.unbalanced_towers === 1 ? '' : 's'} whose WBS weights do not make 100%`,
      onClick: undefined as (() => void) | undefined,
      href: undefined as string | undefined,
    },
  ].filter((a) => a.show);

  return (
    <>
      <PageHeader
        title="Site Progress"
        subtitle="Where every project stands on the ground — the ones that need you first."
        action={
          <Button onClick={() => setLogOpen(true)}>
            <Plus className="size-4" /> Log Update
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-hairline bg-white p-1 sm:w-fit">
        {(
          [
            ['projects', 'Projects'],
            ['activity', 'All Activity'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              mode === key
                ? 'bg-admin-500 text-white'
                : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'activity' ? (
        <SiteActivityList />
      ) : (
        <>
          {alerts.length > 0 && (
            <Card className="mb-5">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-ink">Needs attention</h2>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {alerts.map((alert) => {
                  const Icon = alert.icon;
                  const inner = (
                    <span className="flex w-full items-center gap-3 rounded-xl border border-hairline p-3 text-left text-sm text-ink transition-colors hover:bg-admin-50/50">
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg',
                          alert.tone,
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      {alert.label}
                    </span>
                  );
                  return (
                    <li key={alert.key} className="min-w-0">
                      {alert.href ? (
                        <Link href={alert.href}>{inner}</Link>
                      ) : alert.onClick ? (
                        <button type="button" onClick={alert.onClick} className="w-full">
                          {inner}
                        </button>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

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
                        placeholder="Project name or code…"
                        className="pr-9"
                      />
                    </div>
                  </Field>

                  <Field label="Against schedule">
                    <SelectInput value={state} onChange={(e) => setState(e.target.value)}>
                      <option value="all">Everything</option>
                      <option value="behind">Behind schedule</option>
                      <option value="on_track">On track</option>
                      <option value="ahead">Ahead of plan</option>
                      <option value="stale">Gone quiet</option>
                      <option value="no_plan">No plan dates</option>
                    </SelectInput>
                  </Field>

                  <Field label="Project stage">
                    <SelectInput
                      value={projectStatus}
                      onChange={(e) => setProjectStatus(e.target.value)}
                    >
                      <option value="all">All stages</option>
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PROJECT_STATUS_META[s].label}
                        </option>
                      ))}
                    </SelectInput>
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
              <p className="mb-4 text-sm text-ink-muted">
                {loading
                  ? 'Loading…'
                  : `${rows.length} project${rows.length === 1 ? '' : 's'} — sites under construction first, most delayed at the top`}
              </p>

              {loading ? (
                <div className="space-y-4">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-44 animate-pulse rounded-2xl border border-hairline bg-white"
                    />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={HardHat}
                  title={filtersActive ? 'No project matches these filters' : 'No project yet'}
                  description={
                    filtersActive
                      ? 'Try clearing the schedule or stage filter.'
                      : 'Create a project and add a tower — its work breakdown is created with it, ready to report against.'
                  }
                  action={
                    filtersActive ? (
                      <Button variant="outline" onClick={resetFilters}>
                        Clear filters
                      </Button>
                    ) : (
                      <Link href="/admin/projects/new">
                        <Button>Create a project</Button>
                      </Link>
                    )
                  }
                />
              ) : (
                <ul className="space-y-4">
                  {rows.map((row) => (
                    <li key={row.project.id}>
                      <ProjectCard row={row} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {logOpen && (
        <ProgressUpdateModal
          open
          onClose={() => setLogOpen(false)}
          onSaved={(id) => router.push(`/admin/site-progress/updates/${id}`)}
        />
      )}
    </>
  );
}

/** One project on the board. */
function ProjectCard({ row }: { row: ProjectProgressRow }) {
  const { project, rollup } = row;
  const stage = PROJECT_STATUS_META[project.status];

  return (
    <Link
      href={`/admin/site-progress/${project.id}`}
      className={cn(
        'block rounded-2xl border bg-white p-5 shadow-sm transition-colors hover:bg-admin-50/30',
        // a site nobody has reported on is the loudest thing on the board
        row.is_stale ? 'border-red-200' : 'border-hairline',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">{project.code}</p>
            <p className="truncate text-base font-semibold text-ink">{project.name}</p>
            {project.location_summary && (
              <p className="truncate text-xs text-ink-muted">{project.location_summary}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {row.is_stale && (
            <Badge tone="red">
              <CalendarClock className="size-3.5" />
              {row.days_since_update === null
                ? 'Never reported'
                : `Quiet ${row.days_since_update}d`}
            </Badge>
          )}
          <Badge tone={scheduleBadge(rollup.state, row.is_stale).tone}>
            {scheduleBadge(rollup.state, row.is_stale).label}
          </Badge>
          <Badge tone={stage.tone}>{stage.label}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px] md:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-semibold text-ink">{rollup.actual_pct.toFixed(1)}%</span>
            <span className="text-sm text-ink-muted">
              {scheduleCaption(rollup)}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar
              value={rollup.actual_pct}
              planned={rollup.planned_pct}
              behind={rollup.state === 'behind'}
            />
          </div>
        </div>

        <div className="min-w-0">
          <ProgressSparkline series={row.series} />
          <p className="mt-1 text-[11px] text-slate-400">actual vs planned over time</p>
        </div>
      </div>

      {row.towers.length > 0 && (
        <ul className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {row.towers.map(({ tower, rollup: towerRollup }) => (
            <li key={tower.id} className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-ink">{tower.name}</span>
                <span className="text-xs font-semibold text-ink">
                  {towerRollup.actual_pct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5">
                <ProgressBar
                  value={towerRollup.actual_pct}
                  planned={towerRollup.planned_pct}
                  behind={towerRollup.state === 'behind'}
                  size="sm"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        {row.behind_count > 0 && (
          <Badge tone="red">
            <TrendingDown className="size-3.5" />
            {row.behind_count} of {row.work_item_count} items behind
          </Badge>
        )}
        {row.pending_requests > 0 && (
          <Badge tone="amber">
            <Package className="size-3.5" />
            {row.pending_requests} request{row.pending_requests === 1 ? '' : 's'} waiting
          </Badge>
        )}
        <Badge tone="neutral">
          {row.update_count} update{row.update_count === 1 ? '' : 's'}
        </Badge>
        <span className="ml-auto text-xs text-ink-muted">
          {row.last_update
            ? `Last reported ${formatDate(row.last_update.update_date)}${
                row.last_update_by ? ` by ${row.last_update_by}` : ''
              }`
            : 'Nothing reported yet'}
        </span>
      </div>
    </Link>
  );
}
