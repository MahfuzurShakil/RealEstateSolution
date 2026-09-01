'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Building2, HardHat, Package, Trash2 } from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { ProgressLogTimeline } from '@/components/admin/site-progress/ProgressLogTimeline';
import { ProgressUpdateModal } from '@/components/admin/site-progress/ProgressUpdateModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LocationCard } from '@/components/ui/map/LocationCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { PROJECT_STATUS_META, TOWER_STATUS_META } from '@/lib/domain/project';
import {
  SCHEDULE_STATE_META,
  WORK_ITEM_STATUS_META,
  plannedPctOn,
  scheduleState,
  varianceOn,
} from '@/lib/domain/site-progress';
import { siteProgressUpdateRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate, todayLocal } from '@/lib/utils/format';

type Tab = 'overview' | 'history' | 'documents';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** One site progress reading (Section 6.3), with its photos (Section 6.4). */
export default function ProgressUpdateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const today = todayLocal();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const update = useLiveQuery(() => siteProgressUpdateRepository.getWithRelations(id), [id]);

  if (update === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!update) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This progress update no longer exists.</p>
        <Link href="/admin/site-progress" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to site progress
          </Button>
        </Link>
      </Card>
    );
  }

  const item = update.work_item;
  const planned = item ? plannedPctOn(item, today) : null;
  const variance = item ? varianceOn(item, today) : null;
  const state = scheduleState(variance);
  const isLatest = item ? Number(item.actual_progress_pct) === Number(update.progress_pct) : false;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'history', label: 'Reading History' },
    { key: 'documents', label: 'Photos & Documents' },
  ];

  return (
    <>
      <Link
        href={
          update.project
            ? `/admin/site-progress/${update.project.id}`
            : '/admin/site-progress'
        }
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" />
        {update.project ? `Back to ${update.project.name}` : 'Back to site progress'}
      </Link>

      <PageHeader
        title={item?.name ?? 'Progress update'}
        subtitle={`${update.project?.name ?? 'Project removed'}${
          update.tower ? ` · ${update.tower.name}` : ''
        } · reported ${formatDate(update.update_date)}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLogOpen(true)}>
              <HardHat className="size-4" /> Log new reading
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 lg:order-1">
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

          {tab === 'overview' && (
            <div className="space-y-5">
              <Card>
                <CardHeader
                  title="Reading"
                  action={
                    <Badge tone={isLatest ? 'green' : 'neutral'}>
                      {isLatest ? 'Current reading' : 'Superseded'}
                    </Badge>
                  }
                />
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-3xl font-semibold text-ink">{update.progress_pct}%</span>
                  <span className="text-sm text-ink-muted">
                    on {formatDate(update.update_date)}
                  </span>
                </div>
                <div className="mt-3">
                  <ProgressBar value={update.progress_pct} planned={planned} />
                </div>
                {planned != null && (
                  <p className="mt-2 text-xs text-ink-muted">
                    Planned {planned.toFixed(0)}% by today — the tick on the bar.
                  </p>
                )}

                {update.remarks ? (
                  <p className="mt-4 whitespace-pre-wrap border-t border-hairline pt-4 text-sm text-ink">
                    {update.remarks}
                  </p>
                ) : (
                  <p className="mt-4 border-t border-hairline pt-4 text-sm text-ink-muted">
                    No remarks were recorded with this reading.
                  </p>
                )}
              </Card>

              {item && (
                <Card>
                  <CardHeader
                    title="Work Item"
                    action={
                      <Badge tone={WORK_ITEM_STATUS_META[item.status].tone}>
                        {WORK_ITEM_STATUS_META[item.status].label}
                      </Badge>
                    }
                  />
                  <Row label="Sequence" value={item.sequence_no} />
                  <Row label="Weight in tower" value={`${item.weight_pct}%`} />
                  <Row label="Stands at today" value={`${item.actual_progress_pct}%`} />
                  <Row label="Planned start" value={formatDate(item.planned_start_date)} />
                  <Row label="Planned end" value={formatDate(item.planned_end_date)} />
                  <Row
                    label="Against plan"
                    value={
                      <Badge tone={SCHEDULE_STATE_META[state].tone}>
                        {SCHEDULE_STATE_META[state].label}
                      </Badge>
                    }
                  />

                  <Link
                    href={`/admin/material-requests/new?project=${update.project?.id ?? ''}&tower=${
                      item.tower_id
                    }&item=${item.id}`}
                    className="mt-4 inline-block"
                  >
                    <Button variant="outline" size="sm">
                      <Package className="size-4" /> Raise a material request
                    </Button>
                  </Link>
                </Card>
              )}

              <LocationCard
                lat={update.gps_lat}
                lng={update.gps_lng}
                title={item?.name ?? 'Site location'}
                address={update.project?.location_summary ?? undefined}
              />
            </div>
          )}

          {tab === 'history' && (
            <Card>
              <CardHeader title="Every reading on this work item" />
              {item ? (
                <ProgressLogTimeline workItemId={item.id} highlightId={update.id} />
              ) : (
                <p className="text-sm text-ink-muted">The work item has been deleted.</p>
              )}
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Site photos" />
              <p className="mb-4 text-sm text-ink-muted">
                Mark a photo public to show it on the project&apos;s page on the website
                (Section 6.7).
              </p>
              <DocumentsPanel entityType="site_progress_update" entityId={update.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          {update.project && (
            <Card>
              <CardHeader title="Project" />
              <Link
                href={`/admin/projects/${update.project.id}`}
                className="block rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{update.project.name}</p>
                    <p className="text-xs text-ink-muted">{update.project.code}</p>
                  </div>
                </div>
                <Badge
                  tone={PROJECT_STATUS_META[update.project.status].tone}
                  className="mt-2.5"
                >
                  {PROJECT_STATUS_META[update.project.status].label}
                </Badge>
              </Link>

              {update.tower && (
                <div className="mt-3">
                  <Row label="Tower" value={update.tower.name} />
                  <Row label="Floors" value={update.tower.floor_count} />
                  <Row
                    label="Tower progress"
                    value={`${Number(update.tower.current_progress_pct ?? 0).toFixed(1)}%`}
                  />
                  <Row
                    label="Tower status"
                    value={
                      <Badge tone={TOWER_STATUS_META[update.tower.status].tone}>
                        {TOWER_STATUS_META[update.tower.status].label}
                      </Badge>
                    }
                  />
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Record" />
            <Row label="Update date" value={formatDate(update.update_date)} />
            <Row label="Reported by" value={update.reporter_name} />
            <Row
              label="GPS"
              value={
                update.gps_lat != null && update.gps_lng != null
                  ? `${update.gps_lat.toFixed(5)}, ${update.gps_lng.toFixed(5)}`
                  : '—'
              }
            />
            <Row label="Logged" value={formatDate(update.created_at)} />
          </Card>
        </aside>
      </div>

      {logOpen && (
        <ProgressUpdateModal
          open
          workItem={item}
          projectId={update.project?.id}
          onClose={() => setLogOpen(false)}
          onSaved={(newId) => router.push(`/admin/site-progress/updates/${newId}`)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this progress update"
        subtitle={item?.name}
        confirmLabel="Delete update"
        message="The photos attached to it go too, and the work item rolls back to the reading before this one — which also moves the tower percentage."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const projectId = update.project?.id;
          await siteProgressUpdateRepository.removeCascade(update.id);
          router.push(projectId ? `/admin/site-progress/${projectId}` : '/admin/site-progress');
        }}
      />
    </>
  );
}
