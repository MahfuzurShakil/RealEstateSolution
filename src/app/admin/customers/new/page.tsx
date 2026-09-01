'use client';

import { Suspense } from 'react';
import { CustomerForm } from '@/components/admin/customers/CustomerForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader
        title="Add Customer"
        subtitle="Pick the lead to copy the buyer's details across, or add a walk-in buyer directly."
      />
      {/* the form reads ?lead= from the URL, which needs a Suspense boundary */}
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
        <CustomerForm />
      </Suspense>
    </>
  );
}
