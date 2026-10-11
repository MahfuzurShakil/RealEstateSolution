'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { MaterialRequestForm } from '@/components/admin/material-requests/MaterialRequestForm';
import { PageHeader } from '@/components/ui/PageHeader';

function NewMaterialRequest() {
  const params = useSearchParams();
  /*
   * Construction review 2026-10-11: raised from a site's workspace, the page
   * sent the engineer back to Procurement's list instead of the site.
   */
  const project = params.get('project');
  const siteRequests = project ? `/admin/site-progress/${project}?tab=materials&sub=requests` : null;

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
        defaults={{
          project_id: params.get('project') ?? undefined,
          tower_id: params.get('tower') ?? undefined,
          work_item_id: params.get('item') ?? undefined,
        }}
      />
    </>
  );
}

/** The Progress tab links in with ?project=&tower=&item=, so Suspense is required. */
export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <NewMaterialRequest />
    </Suspense>
  );
}
