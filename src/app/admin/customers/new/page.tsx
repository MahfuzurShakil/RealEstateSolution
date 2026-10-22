'use client';

import { Suspense } from 'react';
import { CustomerForm } from '@/components/admin/customers/CustomerForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader
        title="Add Customer"
        subtitle="A buyer who did not come through Leads. A lead becomes a customer by booking it — use Book a unit on the lead."
      />
      {/* the form reads search params, which needs a Suspense boundary */}
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
        <CustomerForm />
      </Suspense>
    </>
  );
}
