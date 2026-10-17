'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MaterialRequestForm } from '@/components/admin/material-requests/MaterialRequestForm';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * The "Raise Material Request" page body, shared by the site's own route
 * (`/admin/site-progress/[projectId]/material-requests/new`, under
 * Construction) and Procurement's all-project one.
 */
export function RaiseMaterialRequest({
  projectId,
  towerId,
  workItemId,
}: {
  projectId?: string;
  towerId?: string;
  workItemId?: string;
}) {
  const siteRequests = projectId
    ? `/admin/site-progress/${projectId}?tab=materials&sub=requests`
    : null;

  return (
    <>
      <Link
        href={siteRequests ?? '/admin/material-requests'}
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> {siteRequests ? 'Back to the site' : 'Back to material requests'}
      </Link>

      <PageHeader
        title="Raise Material Request"
        subtitle="What the site needs, where and by when. The Project Manager approves it; procurement then buys or sends it."
      />

      <MaterialRequestForm
        returnTo={siteRequests ?? undefined}
        defaults={{ project_id: projectId, tower_id: towerId, work_item_id: workItemId }}
      />
    </>
  );
}
