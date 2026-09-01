'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { CustomerForm } from '@/components/admin/customers/CustomerForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { customerRepository } from '@/lib/repositories';

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const customer = useLiveQuery(() => customerRepository.getWithRelations(id), [id]);

  if (customer === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!customer) return <p className="text-sm text-ink-muted">This customer no longer exists.</p>;

  return (
    <>
      <PageHeader title={`Edit ${customer.code}`} subtitle={customer.name} />
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
        <CustomerForm customer={customer} />
      </Suspense>
    </>
  );
}
