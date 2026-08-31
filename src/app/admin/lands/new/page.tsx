'use client';

import { LandForm } from '@/components/admin/lands/LandForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default function NewLandPage() {
  return (
    <>
      <PageHeader
        title="Add Land"
        subtitle="A land code (LND-YYYY-NNN) is assigned automatically on save."
      />
      <LandForm />
    </>
  );
}
