'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  HardHat,
  Package,
  Plus,
  TrendingDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ACTIVITY_META,
  SCHEDULE_STATE_META,
  STALE_AFTER_DAYS,
  scheduleBadge,
  scheduleCaption,
  dayHeading,
  isSiteActive,
} from '@/lib/domain/site-progress';
import { projectProgressRepository, siteProgressUpdateRepository } from '@/lib/repositories';
import { DataTable } from '@/components/ui/DataTable';
import { SubTabs } from '@/components/ui/SubTabs';
import { formatDate, todayLocal } from '@/lib/utils/format';
import { ProgressBar } from './ProgressBar';
import { ProgressUpdateModal } from './ProgressUpdateModal';
import { ProgressSparkline } from './ProgressSparkline';
import { PublicProgressPreview } from './PublicProgressPreview';


/**
 * Construction summary on the project record.
 *
 * The project page is about the project as an asset — its land, its units, its
 * JV terms, its documents. Construction is an operation that runs on it, so
 * this is mostly a read-only window. Since 2026-10-11 the daily log is
 * written from here too (the Site Progress menu is gone); the work items and
 * the full log stay on the site progress page this links to.
 */
export function ProjectProgressSummary({
  projectId,
  view,
}: {
  projectId: string;
  /**
   * Fixed view, for the Construction workspace (2026-10-11), which has its
   * own tabs and actions; without it the summary shows its own sub-tabs.
   */
  view?: 'overview' | 'log';
}) {
  const today = todayLocal();
  const [logOpen, setLogOpen] = useState(false);
  const [subState, setSub] = useState<'overview' | 'log'>('overview');
  const sub = view ?? subState;
  // every update logged on this project, newest first (client feedback 2026-10-11)
  const updates = useLiveQuery(
    () => siteProgressUpdateRepository.list({ project_id: projectId }),
    [projectId],
  );

  const row = useLiveQuery(
    () => projectProgressRepository.forProject(projectId, today),
    [projectId, today],
  );
  const activity = useLiveQuery(
    () => projectProgressRepository.activity(projectId),
    [projectId],
  );

  if (row === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!row) return null;

  const { rollup } = row;

  if (row.work_item_count === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No tower to report on yet"
        description="Site progress is tracked per tower. Add a tower on the Towers & Units tab — its default work breakdown, Foundation through External Works, is created with it."
      />
    );
  }

  const recent = (activity ?? []).slice(0, 5);

  // the actions sit at the top, beside the sub-tabs (client feedback 2026-10-11)
  const header = view ? null : (
    <SubTabs
      tabs={[
        { key: 'overview', label: 'Overview' },
        { key: 'log', label: `Log updates (${updates?.length ?? 0})` },
      ]}
      active={sub}
      onChange={setSub}
      actions={
        <>
          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="size-4" /> Log site update
          </Button>
          <Link href={`/admin/site-progress/${projectId}`}>
            <Button size="sm" variant="outline">
              <HardHat className="size-4" /> Work items
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </>
      }
    />
  );
  const logModal = logOpen && (
    <ProgressUpdateModal open projectId={projectId} onClose={() => setLogOpen(false)} />
  );

  if (sub === 'log') {
    return (
      <div>
        {header}
        <Card>
          <DataTable
            rows={updates ?? []}
            columns={[
              {
                key: 'update_date',
                header: 'Date',
                cell: (u) => (
                  <Link href={`/admin/site-progress/updates/${u.id}`} className="font-medium text-ink hover:text-admin-700">
                    {formatDate(u.update_date)}
                  </Link>
                ),
                sortValue: (u) => `${u.update_date}|${u.created_at}`,
              },
              {
                key: 'tower',
                header: 'Tower',
                cell: (u) => u.tower?.name ?? '—',
                sortValue: (u) => u.tower?.name ?? '',
              },
              {
                key: 'work',
                header: 'Work item',
                cell: (u) => u.work_item?.name ?? '—',
                sortValue: (u) => u.work_item?.name ?? '',
              },
              {
                key: 'progress',
                header: 'Progress',
                align: 'right',
                cell: (u) => `${u.progress_pct}%`,
                sortValue: (u) => u.progress_pct,
              },
              {
                key: 'by',
                header: 'Logged by',
                cell: (u) => u.reporter_name ?? '—',
                sortValue: (u) => u.reporter_name ?? '',
              },
              {
                key: 'remarks',
                header: 'Remarks',
                cell: (u) => <span className="line-clamp-1 text-ink-muted">{u.remarks ?? ''}</span>,
              },
            ]}
            initialSort={{ key: 'update_date', direction: 'desc' }}
            label="updates"
            emptyState={
              <EmptyState
                icon={HardHat}
                title="Nothing logged yet"
                description="Log the first site update with the button above."
              />
            }
          />
        </Card>
        {logModal}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      <Card>
        <CardHeader
          title="Construction Progress"
          action={
            <Badge tone={scheduleBadge(rollup.state, row.is_stale).tone}>
              {scheduleBadge(rollup.state, row.is_stale).label}
            </Badge>
          }
        />

        <div className="grid gap-5 md:grid-cols-[1fr_200px] md:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold text-ink">
                {rollup.actual_pct.toFixed(1)}%
              </span>
              <span className="text-sm text-ink-muted">
                {scheduleCaption(rollup)}
              </span>
            </div>
            <div className="mt-3">
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

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
          {row.is_stale && (
            <Badge tone="red">
              <CalendarClock className="size-3.5" />
              {row.days_since_update === null
                ? 'Never reported'
                : `No update for ${row.days_since_update} days`}
            </Badge>
          )}
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
            {row.update_count} update{row.update_count === 1 ? '' : 's'} logged
          </Badge>
          <span className="text-xs text-ink-muted">
            {row.last_update
              ? `Last reported ${formatDate(row.last_update.update_date)}${
                  row.last_update_by ? ` by ${row.last_update_by}` : ''
                }`
              : row.project && isSiteActive(row.project.status)
                ? `Nothing reported yet — flagged after ${STALE_AFTER_DAYS} days without a report`
                : 'Nothing reported yet — reporting starts once construction does'}
          </span>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Towers" />
          <ul className="space-y-3">
            {row.towers.map(({ tower, rollup: towerRollup }) => (
              <li key={tower.id} className="min-w-0 rounded-xl border border-hairline p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{tower.name}</span>
                  <span className="text-sm font-semibold text-ink">
                    {towerRollup.actual_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar
                    value={towerRollup.actual_pct}
                    planned={towerRollup.planned_pct}
                    behind={towerRollup.state === 'behind'}
                    size="sm"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  {SCHEDULE_STATE_META[towerRollup.state].label}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Latest on site" />
          {recent.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nothing has been reported from this site yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((event) => (
                <li
                  key={event.id}
                  className="rounded-xl border border-hairline p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-medium text-ink">{event.title}</p>
                    <Badge tone={ACTIVITY_META[event.kind].tone}>
                      {ACTIVITY_META[event.kind].label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {dayHeading(event.date, today)}
                    {event.context ? ` · ${event.context}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <PublicProgressPreview projectId={projectId} isPublic={row.project.is_public} />

      {logModal}
    </div>
  );
}
