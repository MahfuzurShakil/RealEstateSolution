'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { RaiseMaterialRequest } from '@/components/admin/material-requests/RaiseMaterialRequest';

/**
 * Procurement's all-project entry. A link that already names the project
 * belongs to the site, so it is sent to the Construction route instead.
 */
function NewMaterialRequest() {
  const router = useRouter();
  const params = useSearchParams();
  const project = params.get('project');

  useEffect(() => {
    if (!project) return;
    const rest = new URLSearchParams(params);
    rest.delete('project');
    const query = rest.toString();
    router.replace(`/admin/site-progress/${project}/material-requests/new${query ? `?${query}` : ''}`);
  }, [project, params, router]);

  if (project) return <p className="text-sm text-ink-muted">Loading…</p>;
  return <RaiseMaterialRequest />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <NewMaterialRequest />
    </Suspense>
  );
}
