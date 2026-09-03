'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Pencil, Receipt, ShoppingCart, Trash2, Truck } from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { SupplierFormModal } from '@/components/admin/procurement/SupplierFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  PURCHASE_ORDER_STATUS_META,
  SUPPLIER_PAYMENT_METHOD_META,
  SUPPLIER_TYPE_META,
} from '@/lib/domain/procurement';
import type { PurchaseOrderWithRelations, SupplierVoucherWithRelations } from '@/lib/repositories';
import {
  purchaseOrderRepository,
  supplierBalance,
  supplierRepository,
  supplierVoucherRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

type Tab = 'orders' | 'payments' | 'documents';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** One supplier (Section 7.3) — their orders, their payments, their paperwork. */
export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('orders');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);

  const supplier = useLiveQuery(() => supplierRepository.getWithStats(id), [id]);
  const orders = useLiveQuery(() => purchaseOrderRepository.list({ supplier_id: id }), [id]);
  const vouchers = useLiveQuery(() => supplierVoucherRepository.list({ supplier_id: id }), [id]);

  if (supplier === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!supplier) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This supplier no longer exists.</p>
        <Link href="/admin/suppliers" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to suppliers
          </Button>
        </Link>
      </Card>
    );
  }

  const { due, advance } = supplierBalance(supplier);

  const orderColumns: Column<PurchaseOrderWithRelations>[] = [
    {
      key: 'code',
      header: 'Order',
      cell: (row) => (
        <Link
          href={`/admin/purchase-orders/${row.id}`}
          className="font-medium text-ink hover:text-admin-700"
        >
          {row.code}
          <span className="block text-xs font-normal text-ink-muted">
            {row.project?.name ?? 'Central store'}
          </span>
        </Link>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'order_date',
      header: 'Ordered',
      cell: (row) => formatDate(row.order_date),
      sortValue: (row) => row.order_date,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={PURCHASE_ORDER_STATUS_META[row.status].tone}>
          {PURCHASE_ORDER_STATUS_META[row.status].label}
        </Badge>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      cell: (row) => formatBdt(row.totals.value),
      sortValue: (row) => row.totals.value,
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      cell: (row) => formatBdt(row.paid_value),
      sortValue: (row) => row.paid_value,
    },
  ];

  const voucherColumns: Column<SupplierVoucherWithRelations>[] = [
    {
      key: 'code',
      header: 'Voucher',
      cell: (row) => <span className="font-medium text-ink">{row.code}</span>,
      sortValue: (row) => row.code,
    },
    {
      key: 'po',
      header: 'Against',
      cell: (row) =>
        row.order ? (
          <Link
            href={`/admin/purchase-orders/${row.order.id}`}
            className="text-admin-700 hover:underline"
          >
            {row.order.code}
          </Link>
        ) : (
          <span className="text-ink-muted">Order removed</span>
        ),
      sortValue: (row) => row.order?.code ?? '',
    },
    {
      key: 'payment_date',
      header: 'Paid on',
      cell: (row) => formatDate(row.payment_date),
      sortValue: (row) => row.payment_date,
    },
    {
      key: 'payment_method',
      header: 'Method',
      cell: (row) => (
        <span className="text-sm text-ink">
          {SUPPLIER_PAYMENT_METHOD_META[row.payment_method]}
          {row.reference_no && (
            <span className="block text-xs text-ink-muted">{row.reference_no}</span>
          )}
        </span>
      ),
      sortValue: (row) => row.payment_method,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatBdt(row.amount)}</span>,
      sortValue: (row) => row.amount,
    },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'orders', label: `Purchase Orders (${orders?.length ?? 0})` },
    { key: 'payments', label: `Payments (${vouchers?.length ?? 0})` },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <>
      <Link
        href="/admin/suppliers"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to suppliers
      </Link>

      <PageHeader
        title={supplier.name}
        subtitle={`${supplier.code} · ${SUPPLIER_TYPE_META[supplier.type].label}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
            <Button
              variant="dangerGhost"
              onClick={async () => {
                const count = await supplierRepository.blockedByOrders(supplier.id);
                if (count > 0) {
                  setDeleteBlocked(
                    `${supplier.name} is on ${count} purchase order${count === 1 ? '' : 's'}. Deleting them would leave those orders without a counterparty.`,
                  );
                  return;
                }
                setConfirmDelete(true);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5 lg:order-1">
          <div className="flex flex-wrap gap-2 border-b border-hairline">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'border-admin-500 text-admin-700'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'orders' && (
            <Card>
              <CardHeader
                title="Purchase orders"
                action={
                  <Link href={`/admin/purchase-orders/new`}>
                    <Button size="sm" variant="outline">
                      <ShoppingCart className="size-4" /> New order
                    </Button>
                  </Link>
                }
              />
              <DataTable
                rows={orders ?? []}
                columns={orderColumns}
                initialSort={{ key: 'order_date', direction: 'desc' }}
                label="orders"
                emptyState={
                  <EmptyState
                    icon={ShoppingCart}
                    title="Nothing ordered from them yet"
                    description="Raise a purchase order and it will show up here."
                  />
                }
              />
            </Card>
          )}

          {tab === 'payments' && (
            <Card>
              <CardHeader title="Payments made" />
              <DataTable
                rows={vouchers ?? []}
                columns={voucherColumns}
                initialSort={{ key: 'payment_date', direction: 'desc' }}
                label="payments"
                emptyState={
                  <EmptyState
                    icon={Receipt}
                    title="No payment recorded"
                    description="Vouchers are raised from the purchase order they pay."
                  />
                }
              />
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" />
              <DocumentsPanel entityType="supplier" entityId={supplier.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <Card>
            <CardHeader
              title="Account"
              action={
                <Badge tone={SUPPLIER_TYPE_META[supplier.type].tone}>
                  {SUPPLIER_TYPE_META[supplier.type].label}
                </Badge>
              }
            />
            <Row label="Orders placed" value={supplier.po_count} />
            {supplier.draft_count > 0 && (
              <Row
                label="Drafts, not placed"
                value={`${supplier.draft_count} · ${formatBdt(supplier.draft_value)}`}
              />
            )}
            <Row label="Ordered value" value={formatBdt(supplier.ordered_value)} />
            <Row label="Received" value={formatBdt(supplier.received_value)} />
            {supplier.awaiting_delivery_value > 0.009 && (
              <Row
                label="Awaiting delivery"
                value={formatBdt(supplier.awaiting_delivery_value)}
              />
            )}
            <Row label="Paid" value={formatBdt(supplier.paid_value)} />
            <Row
              label="Outstanding"
              value={
                due > 0.009 ? (
                  <span className="text-amber-600">{formatBdt(due)}</span>
                ) : advance > 0.009 ? (
                  <span className="text-blue-700">{formatBdt(advance)} advance held</span>
                ) : (
                  <span className="text-emerald-700">Settled</span>
                )
              }
            />
            <Row label="Last order" value={formatDate(supplier.last_order_date)} />
          </Card>

          <Card>
            <CardHeader title="Contact" />
            <Row label="Phone" value={formatPhone(supplier.phone)} />
            <Row label="Contact person" value={supplier.contact_person} />
            <Row label="Address" value={supplier.address} />
          </Card>

          {supplier.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-wrap text-sm text-ink">{supplier.notes}</p>
            </Card>
          )}

          <Card>
            <CardHeader title="Record" />
            <Row label="Code" value={supplier.code} />
            <Row label="Added" value={formatDate(supplier.created_at)} />
            <Row label="Last updated" value={formatDate(supplier.updated_at)} />
          </Card>
        </aside>
      </div>

      <SupplierFormModal
        open={editOpen}
        supplier={supplier}
        onClose={() => setEditOpen(false)}
        onSaved={() => setEditOpen(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${supplier.name}`}
        confirmLabel="Delete supplier"
        icon={Truck}
        message="The supplier and any documents attached to them are removed."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await supplierRepository.removeCascade(supplier.id);
          router.push('/admin/suppliers');
        }}
      />

      <ConfirmDialog
        open={deleteBlocked !== null}
        title="This supplier cannot be deleted"
        tone="warning"
        message={deleteBlocked ?? ''}
        confirmLabel="Understood"
        cancelLabel="Close"
        onCancel={() => setDeleteBlocked(null)}
        onConfirm={() => setDeleteBlocked(null)}
      />
    </>
  );
}
