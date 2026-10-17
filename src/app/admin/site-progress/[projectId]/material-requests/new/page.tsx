'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { RaiseMaterialRequest } from '@/components/admin/material-requests/RaiseMaterialRequest';

/**
 * Raising a request belongs to the site (client feedback 2026-10-17): it sits
 * under Construction so the sidebar stays there, not on Procurement.
 */
function SiteMaterialRequest() {
  const { projectId } = useParams<{ projectId: string }>();
  const params = useSearchParams();
  return (
    <RaiseMaterialRequest
      projectId={projectId}
      towerId={params.get('tower') ?? undefined}
      workItemId={params.get('item') ?? undefined}
    />
  );
}

/** The Progress tab links in with ?tower=&item=, so Suspense is required. */
export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <SiteMaterialRequest />
    </Suspense>
  );
}
