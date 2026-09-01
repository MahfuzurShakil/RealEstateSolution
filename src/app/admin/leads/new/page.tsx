'use client';

import { LeadForm } from '@/components/admin/leads/LeadForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default function NewLeadPage() {
  return (
    <>
      <PageHeader
        title="Add Lead"
        subtitle="The phone number is the dedup key — a repeat caller is added to their existing lead."
      />
      <LeadForm />
    </>
  );
}
