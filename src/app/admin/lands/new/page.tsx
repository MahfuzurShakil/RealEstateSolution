'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LandForm } from '@/components/admin/lands/LandForm';
import { PageHeader } from '@/components/ui/PageHeader';

/** `?mode=owned` opens straight on the already-owned entry (v29). */
function NewLandForm() {
  const params = useSearchParams();
  return <LandForm initialMode={params.get('mode') === 'owned' ? 'owned' : 'pipeline'} />;
}

export default function NewLandPage() {
  return (
    <>
      <PageHeader
        title="Add Land"
        subtitle="A land code (LND-YYYY-NNN) is assigned automatically on save."
      />
      <Suspense>
        <NewLandForm />
      </Suspense>
    </>
  );
}
