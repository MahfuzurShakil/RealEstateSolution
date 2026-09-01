'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  HardHat,
  Package,
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
  dayHeading,
  isSiteActive,
} from '@/lib/domain/site-progress';
import { projectProgressRepository } from '@/lib/repositories';
import { formatDate, todayLocal } from '@/lib/utils/format';
import { ProgressBar } from './ProgressBar';
import { ProgressSparkline } from './ProgressSparkline';
import { PublicProgressPreview } from './PublicProgressPreview';

function varianceLabel(variance: number | null): string {
  if (variance === null) return '—';
  const sign = variance > 0 ? '+' : variance < 0 ? '−' : '';
  return `${sign}${Math.abs(variance).toFixed(1)}%`;
}

/**
 * Construction summary on the project record.
 *
 * The project page is about the project as an asset — its land, its units, its
 * JV terms, its documents. Construction is an operation that runs on it, so
 * this is a read-only window with a way in, not a second copy of the Site
 * Progress module. Editing the WBS and logging readings happen in one place.
 */
export function ProjectProgressSummary({ projectId }: { projectId: string }) {
  const today = todayLocal();

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

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Construction Progress"
          action={
            <Badge tone={SCHEDULE_STATE_META[rollup.state].tone}>
              {SCHEDULE_STATE_META[rollup.state].label}
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
                {rollup.planned_pct === null
                  ? 'no planned dates set'
                  : `planned ${rollup.planned_pct.toFixed(1)}% by today · ${varianceLabel(rollup.variance)}`}
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
                    {towerRollup.actual_pct.toFixed(0)}%
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

      <Link href={`/admin/site-progress/${projectId}`}>
        <Button className="w-full sm:w-auto">
          <HardHat className="size-4" /> Open site progress
          <ArrowRight className="size-4" />
        </Button>
      </Link>
    </div>
  );
}
