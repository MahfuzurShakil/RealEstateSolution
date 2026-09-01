'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { MaterialRequestForm } from '@/components/admin/material-requests/MaterialRequestForm';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { materialRequestRepository } from '@/lib/repositories';

export default function EditMaterialRequestPage() {
  const { id } = useParams<{ id: string }>();
  const request = useLiveQuery(() => materialRequestRepository.getWithRelations(id), [id]);

  if (request === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!request) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This request no longer exists.</p>
        <Link href="/admin/material-requests" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to material requests
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <>
      <Link
        href={`/admin/material-requests/${request.id}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to {request.code}
      </Link>

      <PageHeader
        title={`Edit ${request.code}`}
        subtitle="Quantities already approved stay on the lines they belong to."
      />

      <MaterialRequestForm request={request} />
    </>
  );
}
