'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CalendarClock, Package, Plus, TrendingDown } from 'lucide-react';
import { ActivityTimeline } from '@/components/admin/site-progress/ActivityTimeline';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { ProgressPhotoGallery } from '@/components/admin/site-progress/ProgressPhotoGallery';
import { ProgressSparkline } from '@/components/admin/site-progress/ProgressSparkline';
import { ProgressUpdateModal } from '@/components/admin/site-progress/ProgressUpdateModal';
import { PublicProgressPreview } from '@/components/admin/site-progress/PublicProgressPreview';
import { TowerProgressPanel } from '@/components/admin/site-progress/TowerProgressPanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PROJECT_STATUS_META } from '@/lib/domain/project';
import {
  MATERIAL_REQUEST_STATUS_META,
  SCHEDULE_STATE_META,
  STALE_AFTER_DAYS,
  isSiteActive,
} from '@/lib/domain/site-progress';
import { materialRequestRepository, projectProgressRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate, todayLocal } from '@/lib/utils/format';

type Tab = 'breakdown' | 'timeline' | 'requests' | 'photos';

function varianceLabel(variance: number | null): string {
  if (variance === null) return '—';
  const sign = variance > 0 ? '+' : variance < 0 ? '−' : '';
  return `${sign}${Math.abs(variance).toFixed(1)}%`;
}

/**
 * Construction of one project, end to end.
 *
 * Four views of the same site: what the work breaks down into, what has
 * happened on it, what it has asked for, and what it looks like. They sit
 * together because that is how a project review meeting runs — the numbers
 * only mean something next to the story behind them.
 */
export default function ProjectProgressPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const today = todayLocal();
  const [tab, setTab] = useState<Tab>('breakdown');
  const [logOpen, setLogOpen] = useState(false);

  const row = useLiveQuery(
    () => projectProgressRepository.forProject(projectId, today),
    [projectId, today],
  );
  const requests = useLiveQuery(
    () => materialRequestRepository.list({ project_id: projectId }),
    [projectId],
  );

  if (row === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!row) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This project no longer exists.</p>
        <Link href="/admin/site-progress" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to site progress
          </Button>
        </Link>
      </Card>
    );
  }

  const { project, rollup } = row;
  const pendingRequests = requests?.filter((r) => r.status === 'pending').length ?? 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'breakdown', label: `Work Breakdown (${row.work_item_count})` },
    { key: 'timeline', label: 'Activity Timeline' },
    { key: 'requests', label: `Material Requests (${requests?.length ?? 0})` },
    { key: 'photos', label: 'Photos' },
  ];

  return (
    <>
      <Link
        href="/admin/site-progress"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to site progress
      </Link>

      <PageHeader
        title={project.name}
        subtitle={`${project.code}${project.location_summary ? ` · ${project.location_summary}` : ''}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/material-requests/new?project=${project.id}`}>
              <Button variant="outline">
                <Package className="size-4" /> Request material
              </Button>
            </Link>
            <Button onClick={() => setLogOpen(true)}>
              <Plus className="size-4" /> Log Update
            </Button>
          </div>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-5 md:grid-cols-[1fr_220px] md:items-end">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={SCHEDULE_STATE_META[rollup.state].tone}>
                {SCHEDULE_STATE_META[rollup.state].label}
              </Badge>
              <Badge tone={PROJECT_STATUS_META[project.status].tone}>
                {PROJECT_STATUS_META[project.status].label}
              </Badge>
              {row.is_stale && (
                <Badge tone="red">
                  <CalendarClock className="size-3.5" />
                  {row.days_since_update === null
                    ? 'Never reported'
                    : `No update for ${row.days_since_update} days`}
                </Badge>
              )}
              <Link
                href={`/admin/projects/${project.id}`}
                className="ml-auto text-sm text-admin-700 hover:underline"
              >
                Project record →
              </Link>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-4xl font-semibold text-ink">
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

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {row.behind_count > 0 && (
                <Badge tone="red">
                  <TrendingDown className="size-3.5" />
                  {row.behind_count} of {row.work_item_count} items behind
                </Badge>
              )}
              {pendingRequests > 0 && (
                <Badge tone="amber">
                  <Package className="size-3.5" />
                  {pendingRequests} request{pendingRequests === 1 ? '' : 's'} waiting
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
                  : isSiteActive(project.status)
                    ? `Nothing reported yet — flagged after ${STALE_AFTER_DAYS} days without a report`
                    : 'Nothing reported yet — reporting starts once construction does'}
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <ProgressSparkline series={row.series} height={72} />
            <p className="mt-1 text-[11px] text-slate-400">
              actual (solid) vs planned (dashed), rebuilt from the log
            </p>
          </div>
        </div>

        {row.towers.length > 0 && (
          <ul className="mt-5 grid gap-3 border-t border-hairline pt-5 sm:grid-cols-2 lg:grid-cols-4">
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
        )}
      </Card>

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-hairline bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'bg-admin-500 text-white'
                : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'breakdown' && <TowerProgressPanel projectId={project.id} showRollup={false} />}

      {tab === 'timeline' && (
        <Card>
          <CardHeader title="Everything that has happened on this site" />
          <ActivityTimeline projectId={project.id} />
        </Card>
      )}

      {tab === 'requests' && (
        <Card>
          <CardHeader
            title="Material requests"
            action={
              <Link href={`/admin/material-requests/new?project=${project.id}`}>
                <Button size="sm" variant="outline">
                  <Plus className="size-4" /> Raise request
                </Button>
              </Link>
            }
          />
          {requests === undefined ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Nothing has been requested for this project"
              description="When the site runs short, raise the request here — Procurement picks it up from the same list."
            />
          ) : (
            <ul className="space-y-2">
              {requests.map((request) => (
                <li key={request.id}>
                  <Link
                    href={`/admin/material-requests/${request.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                      <Package className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {request.items[0]?.item_name ?? request.code}
                        {request.items.length > 1 && ` +${request.items.length - 1} more`}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {request.code} · {request.tower?.name ?? 'Whole site'}
                        {request.work_item ? ` · ${request.work_item.name}` : ''} ·{' '}
                        {formatDate(request.request_date)}
                      </p>
                    </div>
                    <Badge tone={MATERIAL_REQUEST_STATUS_META[request.status].tone}>
                      {MATERIAL_REQUEST_STATUS_META[request.status].label}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'photos' && (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Site photos" />
            <ProgressPhotoGallery projectId={project.id} />
          </Card>

          {/* the public/internal flag is set on this tab, so the consequence
              of setting it belongs on this tab too */}
          <PublicProgressPreview projectId={project.id} isPublic={project.is_public} />
        </div>
      )}

      {logOpen && (
        <ProgressUpdateModal open projectId={project.id} onClose={() => setLogOpen(false)} />
      )}
    </>
  );
}

