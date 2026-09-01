'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { MaterialRequestForm } from '@/components/admin/material-requests/MaterialRequestForm';
import { PageHeader } from '@/components/ui/PageHeader';

function NewMaterialRequest() {
  const params = useSearchParams();

  return (
    <>
      <Link
        href="/admin/material-requests"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to material requests
      </Link>

      <PageHeader
        title="Raise Material Request"
        subtitle="What the site needs, and where. Procurement decides on it from the same list."
      />

      <MaterialRequestForm
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
