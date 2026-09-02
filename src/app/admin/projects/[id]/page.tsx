'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Globe, Map as MapIcon, Pencil, Star, Trash2 } from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { JvAllocationCard } from '@/components/admin/projects/JvAllocationCard';
import { ProjectStatusCard } from '@/components/admin/projects/ProjectStatusCard';
import { ProjectTimeline } from '@/components/admin/projects/ProjectTimeline';
import { TowersUnitsPanel } from '@/components/admin/projects/TowersUnitsPanel';
import { ProjectProcurementSummary } from '@/components/admin/procurement/ProjectProcurementSummary';
import { ProjectProgressSummary } from '@/components/admin/site-progress/ProjectProgressSummary';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { LAND_SIZE_UNIT_LABEL } from '@/lib/domain/land';
import { PROJECT_TYPE_LABEL, UNIT_STATUS_META } from '@/lib/domain/project';
import { projectRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { UNIT_STATUSES } from '@/lib/db/types';

type Tab =
  | 'overview'
  | 'towers'
  | 'progress'
  | 'procurement'
  | 'allocation'
  | 'timeline'
  | 'documents';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** Project detail — Design Reference A.8 (sidebar cards + tabbed main column). */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const project = useLiveQuery(() => projectRepository.getWithRelations(id), [id]);

  if (project === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!project) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This project no longer exists.</p>
        <Link href="/admin/projects" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to projects
          </Button>
        </Link>
      </Card>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'towers', label: `Towers & Units (${project.unit_total})` },
    { key: 'progress', label: 'Site Progress' },
    { key: 'procurement', label: 'Finance & Cost' },
    { key: 'allocation', label: 'JV Allocation' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <>
      <Link
        href="/admin/projects"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to projects
      </Link>

      <PageHeader
        title={project.name}
        subtitle={`${project.code} · ${project.location_summary ?? PROJECT_TYPE_LABEL[project.project_type]}`}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/projects/${project.id}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" /> Edit
              </Button>
            </Link>
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
                <CardHeader title="Project Information" />
                <Row label="Name" value={project.name} />
                <Row label="Code" value={project.code} />
                <Row label="Type" value={PROJECT_TYPE_LABEL[project.project_type]} />
                <Row label="Location summary" value={project.location_summary} />
                <Row
                  label="Total land area"
                  value={
                    project.total_land_area
                      ? `${project.total_land_area} ${LAND_SIZE_UNIT_LABEL[project.total_land_area_unit ?? 'katha']}`
                      : '—'
                  }
                />
                <Row label="Architect" value={project.architect} />
                <Row label="Expected start" value={formatDate(project.expected_start_date)} />
                <Row
                  label="Expected completion"
                  value={formatDate(project.expected_completion_date)}
                />
                <Row label="Actual start" value={formatDate(project.actual_start_date)} />
              </Card>

              <Card>
                <CardHeader title="Linked Land" />
                {project.lands.length === 0 ? (
                  <p className="text-sm text-ink-muted">No land linked to this project.</p>
                ) : (
                  <ul className="space-y-3">
                    {project.lands.map((land) => (
                      <li key={land.id}>
                        <Link
                          href={`/admin/lands/${land.id}`}
                          className="flex items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                            <MapIcon className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">{land.name}</p>
                            <p className="text-xs text-ink-muted">
                              {land.code} · {land.land_size}{' '}
                              {LAND_SIZE_UNIT_LABEL[land.land_size_unit]} ·{' '}
                              {[land.location_area, land.location_district]
                                .filter(Boolean)
                                .join(', ')}
                            </p>
                          </div>
                          {land.acquisition_type === 'joint_venture' && (
                            <Badge tone="teal">Joint Venture</Badge>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {(project.amenities.length > 0 || project.surroundings) && (
                <Card>
                  <CardHeader title="Amenities & Surroundings" />
                  {project.amenities.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {project.amenities.map((a) => (
                        <Badge key={a} tone="teal">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {project.surroundings && (
                    <p className="whitespace-pre-wrap text-sm text-ink-muted">
                      {project.surroundings}
                    </p>
                  )}
                </Card>
              )}
            </div>
          )}

          {tab === 'towers' && <TowersUnitsPanel projectId={project.id} />}

          {tab === 'progress' && <ProjectProgressSummary projectId={project.id} />}

          {/* Section 7.11 — the material cost chain, read for this project */}
          {tab === 'procurement' && <ProjectProcurementSummary projectId={project.id} />}

          {tab === 'allocation' && <JvAllocationCard projectId={project.id} />}

          {tab === 'timeline' && (
            <Card>
              <CardHeader title="Pipeline history" />
              <ProjectTimeline projectId={project.id} />
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" />
              <DocumentsPanel entityType="project" entityId={project.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <ProjectStatusCard project={project} />

          <Card>
            <CardHeader title="Inventory" />
            {project.unit_total === 0 ? (
              <p className="text-sm text-ink-muted">
                No units yet — add a tower and generate them.
              </p>
            ) : (
              <>
                <Row label="Towers" value={project.towers.length} />
                <Row label="Total units" value={project.unit_total} />
                {UNIT_STATUSES.filter((s) => project.unit_counts[s]).map((s) => (
                  <Row
                    key={s}
                    label={UNIT_STATUS_META[s].label}
                    value={<Badge tone={UNIT_STATUS_META[s].tone}>{project.unit_counts[s]}</Badge>}
                  />
                ))}
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="Public Website" />
            <div className="flex flex-wrap gap-2">
              <Badge tone={project.is_public ? 'green' : 'neutral'}>
                <Globe className="size-3.5" /> {project.is_public ? 'Published' : 'Not published'}
              </Badge>
              {project.is_featured && (
                <Badge tone="amber">
                  <Star className="size-3.5" /> Featured
                </Badge>
              )}
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Only whitelisted fields reach the public portal — cost, discount and landowner details
              never leave the admin.
            </p>
          </Card>

          <Card>
            <CardHeader title="Record" />
            <Row label="Created" value={formatDate(project.created_at)} />
            <Row label="Last updated" value={formatDate(project.updated_at)} />
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${project.code}`}
        subtitle={project.name}
        confirmLabel="Delete project"
        message="This deletes the project with its towers, units, land links and documents. Linked lands go back to their acquired / JV-signed status. It cannot be undone."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await projectRepository.removeCascade(project.id);
          router.push('/admin/projects');
        }}
      />
    </>
  );
}
