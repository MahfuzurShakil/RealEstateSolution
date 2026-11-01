'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { OfferingForm } from '@/components/admin/share-sale/OfferingForm';
import { PageHeader } from '@/components/ui/PageHeader';

function NewOffering() {
  const project = useSearchParams().get('project');
  return (
    <>
      <PageHeader
        title="New share offering"
        subtitle="Value the project, choose how much of it goes to the market and in how many shares, and set the payment limits. An offering code (SHO-YYYY-NNN) is assigned on save."
      />
      <OfferingForm projectId={project} />
    </>
  );
}

export default function NewOfferingPage() {
  return (
    <Suspense>
      <NewOffering />
    </Suspense>
  );
}
