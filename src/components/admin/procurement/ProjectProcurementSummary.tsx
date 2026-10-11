'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeftRight,
  ArrowRight,
  ClipboardList,
  Hammer,
  PackageCheck,
  PackageMinus,
  Receipt,
  ShoppingCart,
  TriangleAlert,
  Truck,
  Warehouse,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { SubTabs } from '@/components/ui/SubTabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PURCHASE_ORDER_STATUS_META, canReceiveAgainst } from '@/lib/domain/procurement';
import { MATERIAL_REQUEST_STATUS_META } from '@/lib/domain/site-progress';
import { GoodsReceiptModal } from '@/components/admin/procurement/GoodsReceiptModal';
import type {
  MaterialRequestWithRelations,
  PurchaseOrderWithRelations,
  StockRowWithRelations,
} from '@/lib/repositories';
import {
  materialRequestRepository,
  procurementCostRepository,
  purchaseOrderRepository,
  stockConsumptionRepository,
  stockRepository,
} from '@/lib/repositories';
import { formatBdt, formatBdtRate, formatDate } from '@/lib/utils/format';

/**
 * The project's Materials tab (client walkthrough 2026-10-10): what was
 * bought, what is on site, and what has been used and what it cost. Read
 * only, apart from raising a request or an order. Moving stock between
 * stores (transfer in, issue) is Procurement's job and stays on the Stock
 * page; the money summary is on the Finance tab.
 *
 * Section 7.11 — the cost chain, read for one project.
 *
 * The chain is `material_requests → purchase_orders → stock → stock_issues →
 * stock_consumptions → supplier_vouchers`, with `stock_transfers` bridging the
 * central-store route. The panel walks it in that order deliberately: the
 * interesting question on a site is never one number but where the money
 * currently sits — committed on an order, standing in the store, standing on
 * the site, or actually built into something.
 */
export function ProjectProcurementSummary({ projectId }: { projectId: string }) {
  const summary = useLiveQuery(() => procurementCostRepository.forProject(projectId), [projectId]);
  const orders = useLiveQuery(
    () => purchaseOrderRepository.list({ project_id: projectId }),
    [projectId],
  );
  const stock = useLiveQuery(() => stockRepository.list({ location: projectId }), [projectId]);
  const [receiving, setReceiving] = useState<PurchaseOrderWithRelations | null>(null);
  const [sub, setSub] = useState<'overview' | 'requests' | 'orders' | 'stock' | 'used'>('overview');
  const requests = useLiveQuery(
    () => materialRequestRepository.list({ project_id: projectId }),
    [projectId],
  );
  const used = useLiveQuery(
    () => stockConsumptionRepository.list({ project_id: projectId }),
    [projectId],
  );
  /** what the site has used to date, one row per item */
  const usedByItem = useMemo(() => {
    const map = new Map<string, { id: string; item: string; unit: string; qty: number; cost: number; last: string }>();
    for (const u of used ?? []) {
      const key = `${u.item_name}|${u.unit}`;
      const row = map.get(key) ?? { id: key, item: u.item_name, unit: u.unit, qty: 0, cost: 0, last: u.used_date };
      row.qty += Number(u.quantity_used) || 0;
      row.cost += Number(u.total_cost) || 0;
      if (u.used_date > row.last) row.last = u.used_date;
      map.set(key, row);
    }
    return [...map.values()];
  }, [used]);

  if (summary === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  const nothingYet =
    summary.ordered_value === 0 &&
    summary.draft_value === 0 &&
    summary.issued_value === 0 &&
    summary.consumed_value === 0 &&
    summary.transferred_in_value === 0 &&
    summary.stock_on_hand_value === 0;

  const chain = [
    {
      label: 'Ordered',
      value: summary.ordered_value,
      hint:
        summary.draft_value > 0
          ? `${summary.open_po_count} still open · ${formatBdt(summary.draft_value)} in drafts`
          : `${summary.open_po_count} order${summary.open_po_count === 1 ? '' : 's'} still open`,
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
    {
      // the site receives what procurement ordered for it (decision 2026-10-11)
      key: 'receive',
      header: '',
      align: 'right',
      cell: (row) =>
        canReceiveAgainst(row.status) ? (
          <Button size="sm" onClick={() => setReceiving(row)}>
            <PackageCheck className="size-4" /> Receive
          </Button>
        ) : null,
    },
  ];

  const requestColumns: Column<MaterialRequestWithRelations>[] = [
    {
      key: 'code',
      header: 'Request',
      cell: (row) => (
        <Link href={`/admin/material-requests/${row.id}`} className="font-medium text-ink hover:text-admin-700">
          {row.code}
          <span className="block text-xs font-normal text-ink-muted">
            {row.items.map((i) => i.item_name).slice(0, 3).join(', ')}
            {row.items.length > 3 ? ` +${row.items.length - 3}` : ''}
          </span>
        </Link>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'request_date',
      header: 'Requested',
      cell: (row) => formatDate(row.request_date),
      sortValue: (row) => row.request_date,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={MATERIAL_REQUEST_STATUS_META[row.status].tone}>
          {MATERIAL_REQUEST_STATUS_META[row.status].label}
        </Badge>
      ),
      sortValue: (row) => row.status,
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
    <div>
      {/* one section at a time; the action that matters is at the top (2026-10-11) */}
      <SubTabs
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'requests', label: `Requests (${requests?.length ?? 0})` },
          { key: 'orders', label: `Orders (${orders?.length ?? 0})` },
          { key: 'stock', label: 'Stock on site' },
          { key: 'used', label: 'Used' },
        ]}
        active={sub}
        onChange={setSub}
        actions={
          <Link href={`/admin/material-requests/new?project=${projectId}`}>
            <Button size="sm">
              <ClipboardList className="size-4" /> Request material
            </Button>
          </Link>
        }
      />
      {sub === 'overview' && (
      <Card>
        <CardHeader
          title="Material flow"
          subtitle="Ordered → received → on site → used"
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
      )}

      {sub === 'requests' && (
      <Card>
        <CardHeader
          title="Material requests"
          subtitle="Raised from this project; procurement orders against them"
        />
        <DataTable
          rows={requests ?? []}
          columns={requestColumns}
          initialSort={{ key: 'request_date', direction: 'desc' }}
          label="requests"
          emptyState={
            <EmptyState
              icon={ClipboardList}
              title="No request raised yet"
              description="Ask procurement for material with New request."
            />
          }
        />
      </Card>
      )}

      {sub === 'orders' && (
      <Card>
        <CardHeader
          title="Orders from procurement"
          subtitle="Procurement orders; the site receives the delivery here, and its value becomes project cost"
        />
        <DataTable
          rows={orders ?? []}
          columns={orderColumns}
          initialSort={{ key: 'order_date', direction: 'desc' }}
          label="orders"
          emptyState={
            <EmptyState
              icon={ClipboardList}
              title="No order for this project yet"
              description="Procurement raises orders against the requests above."
            />
          }
        />
      </Card>
      )}

      {sub === 'stock' && (
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
      )}

      {sub === 'used' && (
      <Card>
        <CardHeader
          title="Materials used to date"
          subtitle="What the site has recorded as used, and what it cost"
          action={
            <span className="text-xs text-ink-muted">
              {formatBdt(usedByItem.reduce((t, r) => t + r.cost, 0))} in total
            </span>
          }
        />
        <DataTable
          rows={usedByItem}
          columns={[
            {
              key: 'item',
              header: 'Item',
              cell: (r) => <span className="font-medium text-ink">{r.item}</span>,
              sortValue: (r) => r.item,
            },
            {
              key: 'qty',
              header: 'Used',
              align: 'right',
              cell: (r) => `${Math.round(r.qty * 100) / 100} ${r.unit}`,
              sortValue: (r) => r.qty,
            },
            {
              key: 'cost',
              header: 'Cost',
              align: 'right',
              cell: (r) => <span className="font-medium text-ink">{formatBdt(r.cost)}</span>,
              sortValue: (r) => r.cost,
            },
            {
              key: 'last',
              header: 'Last used',
              cell: (r) => formatDate(r.last),
              sortValue: (r) => r.last,
            },
          ]}
          initialSort={{ key: 'cost', direction: 'desc' }}
          label="items"
          emptyState={
            <EmptyState
              icon={Hammer}
              title="Nothing recorded as used yet"
              description="Material becomes project cost when the site records it as used."
            />
          }
        />
      </Card>
      )}
      <GoodsReceiptModal
        open={receiving !== null}
        order={receiving!}
        onClose={() => setReceiving(null)}
      />
    </div>
  );
}
