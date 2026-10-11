'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Building2, Package, Plus } from 'lucide-react';
import { ActivityTimeline } from '@/components/admin/site-progress/ActivityTimeline';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { ConstructionMaterialsTab } from '@/components/admin/construction/ConstructionMaterialsTab';
import { ProjectProgressSummary } from '@/components/admin/site-progress/ProjectProgressSummary';
import { ProgressPhotoGallery } from '@/components/admin/site-progress/ProgressPhotoGallery';
import { ProgressUpdateModal } from '@/components/admin/site-progress/ProgressUpdateModal';
import { PublicProgressPreview } from '@/components/admin/site-progress/PublicProgressPreview';
import { TowerProgressPanel } from '@/components/admin/site-progress/TowerProgressPanel';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { ViewOnlyArea, ViewOnlyNotice } from '@/components/ui/ViewOnly';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import {
  materialRequestRepository,
  projectProgressRepository,
  projectRepository,
} from '@/lib/repositories';
import { PROJECT_STATUS_META } from '@/lib/domain/project';
import { cn } from '@/lib/utils/cn';
import { todayLocal } from '@/lib/utils/format';

type Tab = 'overview' | 'breakdown' | 'log' | 'materials' | 'photos' | 'timeline';


/**
 * The Construction workspace for one project (PLATFORM-REPLAN.md Phase 2,
 * client decision 2026-10-11).
 *
 * Everything that happens on site, in one place, for a project whose
 * construction has started: the overview, the work breakdown, the site log,
 * materials (request, receive, stock, use), photos and documents, and the
 * activity trail. The project page keeps what the project *is*; this page
 * is the work on it.
 */
export default function ProjectProgressPage() {
  const { role } = useMockSession();
  const { projectId } = useParams<{ projectId: string }>();
  const today = todayLocal();
  const [tab, setTab] = useState<Tab>('overview');
  const [logOpen, setLogOpen] = useState(false);
  // QA audit X-01 — the site team and the PM log and edit; others read
  const mayEdit = canEdit(role, 'site_progress');

  const row = useLiveQuery(
    () => projectProgressRepository.forProject(projectId, today),
    [projectId, today],
  );
  // QA audit C-06 — tell "not under construction" apart from "gone"
  const plain = useLiveQuery(
    async () => (await projectRepository.getById(projectId)) ?? null,
    [projectId],
  );
  const requests = useLiveQuery(
    () => materialRequestRepository.list({ project_id: projectId }),
    [projectId],
  );

  if (row === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!row) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">
          {plain
            ? `${plain.code} ${plain.name} is not under construction (${PROJECT_STATUS_META[plain.status].label}), so it has no construction workspace yet.`
            : 'This project no longer exists.'}
        </p>
        {plain && (
          <Link href={`/admin/projects/${plain.id}`} className="mt-3 mr-2 inline-block">
            <Button variant="outline" size="sm">
              <Building2 className="size-4" /> Open the project
            </Button>
          </Link>
        )}
        <Link href="/admin/site-progress" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to construction
          </Button>
        </Link>
      </Card>
    );
  }

  const { project } = row;
  const pendingRequests = requests?.filter((r) => r.status === 'pending').length ?? 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'breakdown', label: `Work Breakdown (${row.work_item_count})` },
    { key: 'log', label: 'Site Log' },
    {
      key: 'materials',
      label: pendingRequests > 0 ? `Materials (${pendingRequests} pending)` : 'Materials',
    },
    { key: 'photos', label: 'Photos & Documents' },
    { key: 'timeline', label: 'Activity' },
  ];

  return (
    <>
      <Link
        href="/admin/site-progress"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to construction
      </Link>

      <PageHeader
        title={project.name}
        subtitle={`${project.code}${project.location_summary ? ` · ${project.location_summary}` : ''}`}
        action={
          <div className="flex flex-wrap gap-2">
            {canEdit(role, 'material_request') && (
              <Link href={`/admin/material-requests/new?project=${project.id}`}>
                <Button variant="outline">
                  <Package className="size-4" /> Request material
                </Button>
              </Link>
            )}
            {mayEdit && (
              <Button onClick={() => setLogOpen(true)}>
                <Plus className="size-4" /> Log Update
              </Button>
            )}
            <Link href={`/admin/projects/${project.id}`}>
              <Button variant="ghost">
                <Building2 className="size-4" /> Project record
              </Button>
            </Link>
          </div>
        }
      />

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

      {!mayEdit && <ViewOnlyNotice what="site" />}

      <ViewOnlyArea readOnly={!mayEdit}>
      {tab === 'overview' && <ProjectProgressSummary projectId={project.id} view="overview" />}

      {tab === 'breakdown' && <TowerProgressPanel projectId={project.id} showRollup={false} />}

      {tab === 'log' && <ProjectProgressSummary projectId={project.id} view="log" />}

      {/* requests, deliveries to receive, and the site's materials — quantities only */}
      {tab === 'materials' && <ConstructionMaterialsTab projectId={project.id} />}

      {tab === 'photos' && (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Site photos" subtitle="Taken with the site log updates" />
            <ProgressPhotoGallery projectId={project.id} />
          </Card>
          <Card>
            <CardHeader title="Documents" subtitle="Drawings, approvals, test reports and other site papers" />
            <DocumentsPanel entityType="project" entityId={project.id} />
          </Card>
          {/* the public/internal flag is set here, so its consequence shows here */}
          <PublicProgressPreview projectId={project.id} isPublic={project.is_public} />
        </div>
      )}

      {tab === 'timeline' && (
        <Card>
          <CardHeader title="Everything that has happened on this site" />
          <ActivityTimeline projectId={project.id} />
        </Card>
      )}

      </ViewOnlyArea>

      {logOpen && (
        <ProgressUpdateModal open projectId={project.id} onClose={() => setLogOpen(false)} />
      )}
    </>
  );
}

