'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  PackageCheck,
  Pencil,
  Receipt,
  Trash2,
  Truck,
  Warehouse,
} from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { GoodsReceiptModal } from '@/components/admin/procurement/GoodsReceiptModal';
import { PurchaseOrderStatusCard } from '@/components/admin/procurement/PurchaseOrderStatusCard';
import { SupplierVoucherModal } from '@/components/admin/procurement/SupplierVoucherModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import type { PurchaseOrderItem } from '@/lib/db/types';
import {
  MATERIAL_REQUEST_STATUS_META,
} from '@/lib/domain/site-progress';
import {
  QUALITY_CHECK_META,
  SUPPLIER_PAYMENT_METHOD_META,
  canReceiveAgainst,
  lineTotal,
  outstanding,
  paymentSummary,
} from '@/lib/domain/procurement';
import type { GoodsReceiptWithRelations, SupplierVoucherWithRelations } from '@/lib/repositories';
import {
  goodsReceiptRepository,
  purchaseOrderRepository,
  supplierVoucherRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatBdtRate, formatDate } from '@/lib/utils/format';

type Tab = 'items' | 'receipts' | 'payments' | 'documents';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** One purchase order (Section 7.4) — its lines, its deliveries, its payments. */
export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('items');
  const [grnOpen, setGrnOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);
  const [deleteGrn, setDeleteGrn] = useState<GoodsReceiptWithRelations | null>(null);
  const [deleteVoucher, setDeleteVoucher] = useState<SupplierVoucherWithRelations | null>(null);

  const order = useLiveQuery(() => purchaseOrderRepository.getWithRelations(id), [id]);
  const receipts = useLiveQuery(() => goodsReceiptRepository.listForOrder(id), [id]);
  const vouchers = useLiveQuery(() => supplierVoucherRepository.list({ po_id: id }), [id]);

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

  const summary = paymentSummary(order.totals.value, order.vouchers);
  const canReceive = canReceiveAgainst(order.status);

  const itemColumns: Column<PurchaseOrderItem>[] = [
    {
      key: 'item_name',
      header: 'Item',
      cell: (row) => <span className="font-medium text-ink">{row.item_name}</span>,
      sortValue: (row) => row.item_name,
    },
    {
      key: 'quantity_ordered',
      header: 'Ordered',
      align: 'right',
      cell: (row) => `${row.quantity_ordered} ${row.unit}`,
      sortValue: (row) => row.quantity_ordered,
    },
    {
      key: 'unit_price',
      header: 'Rate',
      align: 'right',
      cell: (row) => formatBdtRate(row.unit_price),
      sortValue: (row) => row.unit_price,
    },
    {
      key: 'quantity_received',
      header: 'Accepted',
      align: 'right',
      cell: (row) => {
        const left = outstanding(row);
        /*
         * "Accepted", not "Received": a batch that arrived and failed its
         * quality check is on the GRN but never counts here, so a line can
         * read "nothing yet" while a delivery has been and gone. The
         * Deliveries tab is where that batch is, and it says why.
         */
        const arrived = (receipts ?? [])
          .flatMap((r) => r.items ?? [])
          .filter((i) => i.po_item_id === row.id)
          .reduce((sum, i) => sum + (Number(i.quantity_received) || 0), 0);
        const rejected = Math.round((arrived - row.quantity_received) * 1000) / 1000;

        if (row.quantity_received <= 0) {
          return (
            <span className="text-ink-muted">
              nothing yet
              {rejected > 0 && (
                <span className="block text-xs text-red-600">
                  {rejected} {row.unit} arrived, not accepted
                </span>
              )}
            </span>
          );
        }
        return (
          <span className={left > 0 ? 'font-medium text-amber-600' : 'font-medium text-emerald-700'}>
            {row.quantity_received} {row.unit}
            {left > 0 && (
              <span className="block text-xs font-normal text-ink-muted">
                {left} {row.unit} to come
              </span>
            )}
            {rejected > 0 && (
              <span className="block text-xs font-normal text-red-600">
                {rejected} {row.unit} arrived, not accepted
              </span>
            )}
          </span>
        );
      },
      sortValue: (row) => row.quantity_received,
    },
    {
      key: 'total',
      header: 'Line total',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatBdt(lineTotal(row))}</span>,
      sortValue: (row) => lineTotal(row),
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
      key: 'paid_by',
      header: 'By',
      cell: (row) => row.paid_by_name ?? '—',
      sortValue: (row) => row.paid_by_name ?? '',
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatBdt(row.amount)}</span>,
      sortValue: (row) => row.amount,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${row.code}`}
          onClick={() => setDeleteVoucher(row)}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'items', label: `Items (${order.totals.lines})` },
    { key: 'receipts', label: `Goods Receipts (${receipts?.length ?? 0})` },
    { key: 'payments', label: `Payments (${vouchers?.length ?? 0})` },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <>
      <Link
        href="/admin/purchase-orders"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to purchase orders
      </Link>

      <PageHeader
        title={order.code}
        subtitle={`${order.supplier?.name ?? 'Supplier removed'} · ${
          order.project?.name ?? 'Central / company stock'
        } · ${formatBdt(order.totals.value)}`}
        action={
          <div className="flex flex-wrap gap-2">
            {canReceive && (
              <Button onClick={() => setGrnOpen(true)}>
                <PackageCheck className="size-4" /> Record Receipt
              </Button>
            )}
            {order.status !== 'draft' && (
              <Button variant="outline" onClick={() => setVoucherOpen(true)}>
                <Receipt className="size-4" /> Pay Supplier
              </Button>
            )}
            <Link href={`/admin/purchase-orders/${order.id}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" /> Edit
              </Button>
            </Link>
            <Button
              variant="dangerGhost"
              onClick={async () => {
                const paid = await purchaseOrderRepository.blockedByVouchers(order.id);
                if (paid > 0) {
                  setDeleteBlocked(
                    `${paid} payment${paid === 1 ? ' has' : 's have'} been made against ${order.code}. Delete the vouchers first if the money really did not move — an order cannot be deleted out from under a payment.`,
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

          {tab === 'items' && (
            <Card>
              <CardHeader
                title="Items ordered"
                action={
                  <span className="text-xs text-ink-muted">
                    {order.totals.received_pct}% received by value
                  </span>
                }
              />
              {/* no initialSort — the lines read in the order they were written */}
              <DataTable
                rows={order.items}
                columns={itemColumns}
                label="items"
                emptyState={
                  <p className="py-6 text-center text-sm text-ink-muted">
                    This order has no items — edit it to add some.
                  </p>
                }
              />
              <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
                <span className="text-sm text-ink-muted">Order value</span>
                <span className="text-lg font-semibold text-ink">
                  {formatBdt(order.totals.value)}
                </span>
              </div>
            </Card>
          )}

          {tab === 'receipts' && (
            <Card>
              <CardHeader
                title="Goods receipts"
                action={
                  canReceive ? (
                    <Button size="sm" variant="outline" onClick={() => setGrnOpen(true)}>
                      <PackageCheck className="size-4" /> Record receipt
                    </Button>
                  ) : undefined
                }
              />
              {(receipts ?? []).length === 0 ? (
                <EmptyState
                  icon={PackageCheck}
                  title="Nothing has arrived yet"
                  description={
                    canReceive
                      ? 'Record the delivery when the material reaches the store — only quantities that pass the quality check go into stock.'
                      : 'This order has to be placed with the supplier before anything can be received against it.'
                  }
                />
              ) : (
                <div className="space-y-3">
                  {(receipts ?? []).map((receipt) => (
                    <div key={receipt.id} className="rounded-xl border border-hairline p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">{receipt.code}</p>
                          <p className="text-xs text-ink-muted">
                            {formatDate(receipt.receipt_date)}
                            {receipt.received_by_name && ` · received by ${receipt.received_by_name}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink">
                            {formatBdt(receipt.value)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${receipt.code}`}
                            onClick={() => setDeleteGrn(receipt)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      <ul className="mt-3 space-y-2 border-t border-hairline pt-3">
                        {receipt.items.map((line) => (
                          <li
                            key={line.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-sm"
                          >
                            <span className="min-w-0 truncate text-ink">
                              {line.po_item?.item_name ?? 'Line removed'}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-ink-muted">
                                {line.quantity_received} {line.po_item?.unit ?? ''}
                              </span>
                              <Badge tone={QUALITY_CHECK_META[line.quality_check].tone}>
                                {QUALITY_CHECK_META[line.quality_check].label}
                              </Badge>
                            </span>
                          </li>
                        ))}
                      </ul>

                      {receipt.notes && (
                        <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-xs text-ink-muted">
                          {receipt.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === 'payments' && (
            <Card>
              <CardHeader
                title="Payments to the supplier"
                action={
                  order.status !== 'draft' ? (
                    <Button size="sm" variant="outline" onClick={() => setVoucherOpen(true)}>
                      <Receipt className="size-4" /> Pay supplier
                    </Button>
                  ) : undefined
                }
              />
              <DataTable
                rows={vouchers ?? []}
                columns={voucherColumns}
                initialSort={{ key: 'payment_date', direction: 'desc' }}
                label="payments"
                emptyState={
                  <EmptyState
                    icon={Receipt}
                    title="Nothing paid yet"
                    description={
                      order.status === 'draft'
                        ? 'Place the order first — a draft is not a commitment to pay.'
                        : 'Supplier vouchers are paid directly, with no approval step (Section 7.9).'
                    }
                  />
                }
              />
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" />
              <DocumentsPanel entityType="purchase_order" entityId={order.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <PurchaseOrderStatusCard order={order} />

          <Card>
            <CardHeader
              title="Payment"
              action={
                summary.overpaid ? (
                  <Badge tone="red">Overpaid</Badge>
                ) : summary.due <= 0.009 && summary.paid > 0 ? (
                  <Badge tone="green">Settled</Badge>
                ) : undefined
              }
            />
            <Row label="Order value" value={formatBdt(summary.po_value)} />
            <Row label="Paid" value={formatBdt(summary.paid)} />
            <Row
              label="Still due"
              value={
                /* cancelling voids the undelivered balance, so what is left
                   unpaid on a cancelled order is not a debt — and any voucher
                   already raised against it is money sitting with the supplier */
                order.status === 'cancelled' ? (
                  <span className="text-ink-muted">Order cancelled</span>
                ) : summary.due > 0.009 ? (
                  <span className="text-amber-600">{formatBdt(summary.due)}</span>
                ) : (
                  <span className="text-emerald-700">Nothing outstanding</span>
                )
              }
            />
            {/* only the part that bought nothing is money sitting with the
                supplier; what arrived before the cancellation is in the store */}
            {order.status === 'cancelled' &&
              summary.paid - order.totals.received_value > 0.009 && (
                <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                  {formatBdt(summary.paid - order.totals.received_value)} of what was paid bought
                  nothing — the order was cancelled before it arrived — and is still held by the
                  supplier. Recovering it needs a debit note, which is Phase 2 (Section 7.6).
                </p>
              )}
            {summary.overpaid && (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                {formatBdt(summary.paid - summary.po_value)} more has been paid than this order is
                worth — usually a duplicate voucher.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Supplier" />
            {order.supplier ? (
              <Link
                href={`/admin/suppliers/${order.supplier.id}`}
                className="block rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                    <Truck className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{order.supplier.name}</p>
                    <p className="text-xs text-ink-muted">{order.supplier.phone}</p>
                  </div>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-ink-muted">The supplier record has been removed.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Goes to" />
            {order.project ? (
              <Link
                href={`/admin/projects/${order.project.id}`}
                className="block rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{order.project.name}</p>
                    <p className="text-xs text-ink-muted">{order.project.code}</p>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="rounded-xl border border-hairline p-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                    <Warehouse className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Central / company stock</p>
                    <p className="text-xs text-ink-muted">
                      Bought in advance — transfer it to a project when one needs it.
                    </p>
                  </div>
                </div>
                <Link href="/admin/stock?tab=transfers" className="mt-3 block">
                  <Button size="sm" variant="outline" className="w-full">
                    Open stock transfers
                  </Button>
                </Link>
              </div>
            )}
          </Card>

          {order.request && (
            <Card>
              <CardHeader
                title="Material request"
                action={
                  <Badge tone={MATERIAL_REQUEST_STATUS_META[order.request.status].tone}>
                    {MATERIAL_REQUEST_STATUS_META[order.request.status].label}
                  </Badge>
                }
              />
              <Link
                href={`/admin/material-requests/${order.request.id}`}
                className="block rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                    <ClipboardList className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{order.request.code}</p>
                    <p className="text-xs text-ink-muted">
                      Raised {formatDate(order.request.request_date)}
                    </p>
                  </div>
                </div>
              </Link>
              <p className="mt-3 text-xs text-ink-muted">
                The request closes as Fulfilled on its own once this order is fully received.
              </p>
            </Card>
          )}

          <Card>
            <CardHeader title="Record" />
            <Row label="Order date" value={formatDate(order.order_date)} />
            <Row label="Lines" value={order.totals.lines} />
            <Row label="Created" value={formatDate(order.created_at)} />
            <Row label="Last updated" value={formatDate(order.updated_at)} />
          </Card>

          {order.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-wrap text-sm text-ink">{order.notes}</p>
            </Card>
          )}
        </aside>
      </div>

      <GoodsReceiptModal open={grnOpen} order={order} onClose={() => setGrnOpen(false)} />
      <SupplierVoucherModal
        open={voucherOpen}
        order={order}
        onClose={() => setVoucherOpen(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${order.code}`}
        confirmLabel="Delete order"
        message={
          order.totals.received_value > 0
            ? 'The order, its lines and its goods receipts are removed — and the stock those receipts added is taken back out. Cancelling instead keeps the record and the reason, which is usually what you want.'
            : 'The order and its lines are removed. Cancelling instead keeps the record and the reason, which is usually what you want.'
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await purchaseOrderRepository.removeCascade(order.id);
          router.push('/admin/purchase-orders');
        }}
      />

      <ConfirmDialog
        open={deleteBlocked !== null}
        title="This order cannot be deleted"
        tone="warning"
        message={deleteBlocked ?? ''}
        confirmLabel="Understood"
        cancelLabel="Close"
        onCancel={() => setDeleteBlocked(null)}
        onConfirm={() => setDeleteBlocked(null)}
      />

      <ConfirmDialog
        open={deleteGrn !== null}
        title={`Delete ${deleteGrn?.code ?? ''}`}
        confirmLabel="Delete receipt"
        message="The received quantity goes back onto the order and comes out of stock. The store's average price is not rewound — a running average cannot be un-averaged, and the material may already have been issued at that rate."
        onCancel={() => setDeleteGrn(null)}
        onConfirm={async () => {
          if (deleteGrn) await goodsReceiptRepository.removeCascade(deleteGrn.id);
          setDeleteGrn(null);
        }}
      />

      <ConfirmDialog
        open={deleteVoucher !== null}
        title={`Delete ${deleteVoucher?.code ?? ''}`}
        confirmLabel="Delete voucher"
        message="The payment is removed and the order goes back to showing the amount as due. Use this for a voucher entered by mistake, not for a refund."
        onCancel={() => setDeleteVoucher(null)}
        onConfirm={async () => {
          if (deleteVoucher) await supplierVoucherRepository.removeCascade(deleteVoucher.id);
          setDeleteVoucher(null);
        }}
      />
    </>
  );
}
