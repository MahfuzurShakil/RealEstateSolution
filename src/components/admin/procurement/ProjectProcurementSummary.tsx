'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeftRight,
  ArrowRight,
  ClipboardList,
  PackageMinus,
  Receipt,
  ShoppingCart,
  TriangleAlert,
  Truck,
  Warehouse,
} from 'lucide-react';
import { ProjectFinanceCard } from '@/components/admin/finance/ProjectFinanceCard';
import { StockIssueModal } from '@/components/admin/procurement/StockIssueModal';
import { StockTransferModal } from '@/components/admin/procurement/StockTransferModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PURCHASE_ORDER_STATUS_META } from '@/lib/domain/procurement';
import type { PurchaseOrderWithRelations, StockRowWithRelations } from '@/lib/repositories';
import {
  procurementCostRepository,
  purchaseOrderRepository,
  stockIssueRepository,
  stockRepository,
} from '@/lib/repositories';
import { formatBdt, formatBdtRate, formatDate } from '@/lib/utils/format';

/**
 * Section 7.11 — the cost chain, read for one project.
 *
 * The chain is `material_requests → purchase_orders → stock → stock_issues →
 * supplier_vouchers`, with `stock_transfers` bridging the central-store route.
 * The panel walks it in that order deliberately: the interesting question on a
 * site is never one number but where the money currently sits — committed on
 * an order, standing in the store, or actually consumed.
 */
export function ProjectProcurementSummary({ projectId }: { projectId: string }) {
  const [issueOpen, setIssueOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const summary = useLiveQuery(() => procurementCostRepository.forProject(projectId), [projectId]);
  const orders = useLiveQuery(
    () => purchaseOrderRepository.list({ project_id: projectId }),
    [projectId],
  );
  const stock = useLiveQuery(() => stockRepository.list({ location: projectId }), [projectId]);
  const issues = useLiveQuery(
    () => stockIssueRepository.list({ project_id: projectId }),
    [projectId],
  );

  if (summary === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  const nothingYet =
    summary.ordered_value === 0 &&
    summary.issued_value === 0 &&
    summary.consumed_value === 0 &&
    summary.transferred_in_value === 0 &&
    summary.stock_on_hand_value === 0;

  const chain = [
    {
      label: 'Ordered',
      value: summary.ordered_value,
      hint: `${summary.open_po_count} order${summary.open_po_count === 1 ? '' : 's'} still open`,
      icon: ShoppingCart,
    },
    {
      label: 'Received',
      value: summary.received_value,
      hint: 'delivered at order prices',
      icon: Warehouse,
    },
    {
      label: 'In store',
      value: summary.stock_on_hand_value,
      hint: 'not issued yet',
      icon: Warehouse,
    },
    /*
     * "Issued" and "Consumed" were one tile reading `issued_value`, labelled
     * the real material cost. Material leaving the store is not material used:
     * a delivery became project cost the day it was unloaded, and whatever the
     * site had not laid yet was charged and invisible. The two are separate
     * now, and the gap between them is the third tile — which is the number
     * this whole change exists to make visible.
     */
    {
      label: 'At site',
      value: summary.at_site_value,
      hint: 'issued, not used yet',
      icon: Truck,
    },
    {
      label: 'Consumed',
      value: summary.consumed_value,
      hint: 'the real material cost',
      icon: PackageMinus,
    },
    /* Only when there is any — a zero write-off tile on every project would
       teach people to stop reading the row. */
    ...(summary.written_off_value > 0
      ? [
          {
            label: 'Written off',
            value: summary.written_off_value,
            hint: 'spoiled, lost or stolen',
            icon: TriangleAlert,
          },
        ]
      : []),
    {
      label: 'Paid out',
      value: summary.paid_value,
      hint: 'to suppliers on these orders',
      icon: Receipt,
    },
  ];

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
            {row.supplier?.name ?? 'Supplier removed'}
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
  ];

  const stockColumns: Column<StockRowWithRelations>[] = [
    {
      key: 'item_name',
      header: 'Item',
      cell: (row) => <span className="font-medium text-ink">{row.item_name}</span>,
      sortValue: (row) => row.item_name,
    },
    {
      key: 'quantity_available',
      header: 'Available',
      align: 'right',
      cell: (row) => `${row.quantity_available} ${row.unit}`,
      sortValue: (row) => row.quantity_available,
    },
    {
      key: 'average_unit_price',
      header: 'Avg. cost',
      align: 'right',
      cell: (row) => formatBdtRate(row.average_unit_price),
      sortValue: (row) => row.average_unit_price,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatBdt(row.value)}</span>,
      sortValue: (row) => row.value,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Section 8.3 roll-up, above the material chain that feeds part of it */}
      <ProjectFinanceCard projectId={projectId} />

      <Card>
        <CardHeader
          title="Material cost chain"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="size-4" /> Transfer in
              </Button>
              <Button size="sm" onClick={() => setIssueOpen(true)}>
                <PackageMinus className="size-4" /> Issue
              </Button>
            </div>
          }
        />

        {nothingYet ? (
          <EmptyState
            icon={ShoppingCart}
            title="Nothing procured for this project yet"
            description="Approve a material request and raise a purchase order against it, or transfer material in from the central store."
            action={
              <Link href={`/admin/purchase-orders/new?project=${projectId}`}>
                <Button variant="outline">Raise a purchase order</Button>
              </Link>
            }
          />
        ) : (
          <>
            {/* scrolls inside itself rather than pushing the page sideways on a phone */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex min-w-max items-stretch gap-2">
                {chain.map((step, index) => (
                  <div key={step.label} className="flex items-center gap-2">
                    <div className="w-40 rounded-xl border border-hairline p-3">
                      <span className="mb-2 grid size-8 place-items-center rounded-lg bg-admin-50 text-admin-600">
                        <step.icon className="size-4" />
                      </span>
                      <p className="text-xs text-ink-muted">{step.label}</p>
                      <p className="truncate text-base font-semibold text-ink">
                        {formatBdt(step.value)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">{step.hint}</p>
                    </div>
                    {index < chain.length - 1 && (
                      <ArrowRight className="size-4 shrink-0 text-slate-300" aria-hidden />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {(summary.transferred_in_value > 0 || summary.transferred_out_value > 0) && (
              <p className="mt-4 rounded-xl border border-hairline p-3 text-xs text-ink-muted">
                <ArrowLeftRight className="mr-1.5 inline size-3.5" />
                {summary.transferred_in_value > 0 &&
                  `${formatBdt(summary.transferred_in_value)} came in from the central store or another project`}
                {summary.transferred_in_value > 0 && summary.transferred_out_value > 0 && '; '}
                {summary.transferred_out_value > 0 &&
                  `${formatBdt(summary.transferred_out_value)} was moved out to another project`}
                . Transferred material is not counted in “Ordered”, which only holds what was bought
                against this project directly — Section 7.8a is what closes that gap.
              </p>
            )}

            <p className="mt-3 text-xs text-ink-muted">
              {summary.request_count} material request
              {summary.request_count === 1 ? '' : 's'} raised from this site ·{' '}
              <Link
                href={`/admin/material-requests?project=${projectId}`}
                className="text-admin-700 hover:underline"
              >
                open the request list
              </Link>
            </p>
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Purchase orders"
          action={
            <Link href={`/admin/purchase-orders/new?project=${projectId}`}>
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
              icon={ClipboardList}
              title="No order raised for this project"
              description="Material may still reach it by transfer from the central store."
            />
          }
        />
      </Card>

      <Card>
        <CardHeader
          title="Stock on this site"
          action={
            <span className="text-xs text-ink-muted">
              {formatBdt(summary.stock_on_hand_value)} on hand
            </span>
          }
        />
        <DataTable
          rows={(stock ?? []).filter((r) => r.quantity_available > 0)}
          columns={stockColumns}
          initialSort={{ key: 'value', direction: 'desc' }}
          label="stock rows"
          emptyState={
            <EmptyState
              icon={Warehouse}
              title="This site's store is empty"
              description="Receive a purchase order against the project, or transfer material in from the central store."
            />
          }
        />
      </Card>

      <Card>
        <CardHeader
          title="Recent issues to site"
          action={
            <Link href={`/admin/stock?tab=issues&project=${projectId}`}>
              <Button size="sm" variant="ghost">
                See all
              </Button>
            </Link>
          }
        />
        {(issues ?? []).length === 0 ? (
          <EmptyState
            icon={PackageMinus}
            title="Nothing consumed yet"
            description="Issuing material is what turns stock into project cost (Section 7.8)."
          />
        ) : (
          <ul className="space-y-2">
            {(issues ?? []).slice(0, 6).map((issue) => (
              <li
                key={issue.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{issue.item_name}</p>
                  <p className="text-xs text-ink-muted">
                    {issue.quantity_issued} {issue.unit} · {formatDate(issue.issue_date)}
                    {issue.work_item && ` · ${issue.work_item.name}`}
                  </p>
                </div>
                <span className="text-sm font-medium text-ink">{formatBdt(issue.total_cost)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <StockIssueModal
        open={issueOpen}
        defaults={{ project_id: projectId }}
        onClose={() => setIssueOpen(false)}
      />
      <StockTransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
    </div>
  );
}
