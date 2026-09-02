'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { PurchaseOrderForm } from '@/components/admin/procurement/PurchaseOrderForm';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { purchaseOrderRepository } from '@/lib/repositories';

export default function EditPurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const order = useLiveQuery(() => purchaseOrderRepository.getWithRelations(id), [id]);

  if (order === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!order) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This purchase order no longer exists.</p>
        <Link href="/admin/purchase-orders" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to purchase orders
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <>
      <Link
        href={`/admin/purchase-orders/${order.id}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to {order.code}
      </Link>

      <PageHeader
        title={`Edit ${order.code}`}
        subtitle="Quantities already received stay on their lines — a delivery cannot be edited away."
      />

      <PurchaseOrderForm order={order} />
    </>
  );
}
