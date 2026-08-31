'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { LandForm } from '@/components/admin/lands/LandForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { landRepository } from '@/lib/repositories';

export default function EditLandPage() {
  const { id } = useParams<{ id: string }>();
  const land = useLiveQuery(() => landRepository.getWithRelations(id), [id]);

  if (land === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (land === null || !land) return <p className="text-sm text-ink-muted">This land no longer exists.</p>;

  return (
    <>
      <PageHeader title={`Edit ${land.code}`} subtitle={land.name} />
      <LandForm land={land} />
    </>
  );
}
