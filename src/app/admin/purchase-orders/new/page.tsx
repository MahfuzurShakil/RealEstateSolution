'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { PurchaseOrderForm } from '@/components/admin/procurement/PurchaseOrderForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { materialRequestRepository } from '@/lib/repositories';

function NewPurchaseOrder() {
  const params = useSearchParams();
  const requestId = params.get('request');

  /*
   * The request is resolved here rather than inside the form, so the form can
   * seed its project and its lines from plain `useState` initialisers.
   *
   * Loading it in the form meant a first render with no request — which painted
   * the order as a central-store purchase with no lines, and left re-picking the
   * request from the dropdown as the only way to fill it in.
   */
  const request = useLiveQuery(
    () => (requestId ? materialRequestRepository.getWithRelations(requestId) : Promise.resolve(null)),
    [requestId],
  );

  // `undefined` is "still loading"; `null` is "there is no request to wait for"
  if (requestId && request === undefined) {
    return <p className="text-sm text-ink-muted">Loading the material request…</p>;
  }

  return (
    <>
      <Link
        href="/admin/purchase-orders"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to purchase orders
      </Link>

      <PageHeader
        title="New Purchase Order"
        subtitle="Against an approved material request, or straight into the central store for later."
      />

      <PurchaseOrderForm
        defaults={{
          request: request ?? undefined,
          project_id: params.get('project') ?? undefined,
        }}
      />
    </>
  );
}

/** The material request page links in with ?request=, so Suspense is required. */
export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <NewPurchaseOrder />
    </Suspense>
  );
}
