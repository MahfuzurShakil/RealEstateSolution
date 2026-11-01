'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { OfferingForm } from '@/components/admin/share-sale/OfferingForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { shareOfferingRepository } from '@/lib/repositories';

export default function EditOfferingPage() {
  const { id } = useParams<{ id: string }>();
  const offering = useLiveQuery(() => shareOfferingRepository.getById(id), [id]);
  if (offering === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (offering.status !== 'draft') return <p className="text-sm text-ink-muted">Only a draft offering can be changed.</p>;
  return (
    <>
      <PageHeader title={`Edit ${offering.code}`} subtitle="Draft — nothing is on sale until it is opened." />
      <OfferingForm offering={offering} />
    </>
  );
}
