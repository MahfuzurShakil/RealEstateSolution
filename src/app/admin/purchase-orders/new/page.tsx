'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PurchaseOrderForm } from '@/components/admin/procurement/PurchaseOrderForm';
import { PageHeader } from '@/components/ui/PageHeader';

function NewPurchaseOrder() {
  const params = useSearchParams();

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
          request_id: params.get('request') ?? undefined,
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
