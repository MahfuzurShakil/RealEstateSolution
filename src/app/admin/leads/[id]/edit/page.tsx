'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { LeadForm } from '@/components/admin/leads/LeadForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { leadRepository } from '@/lib/repositories';

export default function EditLeadPage() {
  const { id } = useParams<{ id: string }>();
  const lead = useLiveQuery(() => leadRepository.getWithRelations(id), [id]);

  if (lead === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!lead) return <p className="text-sm text-ink-muted">This lead no longer exists.</p>;

  return (
    <>
      <PageHeader title={`Edit ${lead.code}`} subtitle={lead.name} />
      <LeadForm lead={lead} />
    </>
  );
}
