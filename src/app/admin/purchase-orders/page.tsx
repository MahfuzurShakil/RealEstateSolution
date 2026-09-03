'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  ClipboardList,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  Warehouse,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ResultCard } from '@/components/ui/ResultCard';
import { ResultsLayout, ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from '@/lib/db/types';
import { PURCHASE_ORDER_STATUS_META } from '@/lib/domain/procurement';
import {
  procurementCostRepository,
  projectRepository,
  purchaseOrderRepository,
  supplierRepository,
} from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

type SortKey = 'newest' | 'oldest' | 'value' | 'status' | 'supplier';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  value: 'Order value (high → low)',
  status: 'Status (pipeline order)',
  supplier: 'Supplier (A–Z)',
};

/** Purchase orders (Sections 7.4 / 7.5) — the buying queue. */
export default function PurchaseOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseOrderStatus | 'all'>('all');
  const [projectId, setProjectId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('list');

  const orders = useLiveQuery(
    () =>
      purchaseOrderRepository.list({
        search,
        status,
        project_id: projectId || undefined,
        supplier_id: supplierId || undefined,
        open_only: openOnly,
      }),
    [search, status, projectId, supplierId, openOnly],
  );
  const counts = useLiveQuery(() => purchaseOrderRepository.countByStatus(), []);
  const total = useLiveQuery(() => purchaseOrderRepository.count(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const suppliers = useLiveQuery(() => supplierRepository.list(), []);
  const awaiting = useLiveQuery(() => procurementCostRepository.awaitingPurchase(), []);
  const dashboard = useLiveQuery(() => procurementCostRepository.dashboard(), []);

  const rows = useMemo(() => {
    const list = [...(orders ?? [])];
    switch (sort) {
      case 'oldest':
        return list.sort(
          (a, b) => a.order_date.localeCompare(b.order_date) || a.created_at.localeCompare(b.created_at),
        );
      case 'value':
        return list.sort((a, b) => b.totals.value - a.totals.value);
      case 'status':
        return list.sort(
          (a, b) =>
            PURCHASE_ORDER_STATUSES.indexOf(a.status) - PURCHASE_ORDER_STATUSES.indexOf(b.status) ||
            b.order_date.localeCompare(a.order_date),
        );
      case 'supplier':
        return list.sort(
          (a, b) =>
            (a.supplier?.name ?? '').localeCompare(b.supplier?.name ?? '') ||
            b.order_date.localeCompare(a.order_date),
        );
      default:
        return list.sort(
          (a, b) => b.order_date.localeCompare(a.order_date) || b.created_at.localeCompare(a.created_at),
        );
    }
  }, [orders, sort]);
  const paged = usePagination(rows);

  const loading = orders === undefined;
  const hasAny = (total ?? 0) > 0;
  const filtersActive =
    Boolean(search || projectId || supplierId) || status !== 'all' || openOnly;
  const awaitingCount = awaiting?.length ?? 0;

  function resetFilters() {
    setSearch('');
    setStatus('all');
    setProjectId('');
    setSupplierId('');
    setOpenOnly(false);
  }

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="What has been ordered, from whom, and how much of it has arrived."
        action={
          <Link href="/admin/purchase-orders/new">
            <Button>
              <Plus className="size-4" /> New Order
            </Button>
          </Link>
        }
      />

      {awaitingCount > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white p-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <ClipboardList className="size-5" />
          </span>
          <p className="mr-auto text-sm text-ink">
            <span className="font-semibold">To buy:</span>{' '}
            <span className="text-amber-600">
              {awaitingCount} approved material request{awaitingCount === 1 ? '' : 's'} with no
              order yet
            </span>
          </p>
          <Link href="/admin/material-requests?status=approved">
            <Button size="sm" variant="outline">
              Open the request queue
            </Button>
          </Link>
        </div>
      )}

      {dashboard && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Open orders',
              value: `${dashboard.open_po_count}`,
              hint: formatBdt(dashboard.open_po_value ),
              icon: ShoppingCart,
            },
            {
              label: 'Still to arrive',
              value: formatBdt(dashboard.awaiting_grn_value ),
              hint: 'ordered but not received',
              icon: Package,
            },
            {
              label: 'Stock on hand',
              value: formatBdt(dashboard.stock_value ),
              hint: 'at weighted average cost',
              icon: Warehouse,
            },
            {
              label: 'Unpaid to suppliers',
              value: formatBdt(dashboard.unpaid_value ),
              hint: 'against placed orders',
              icon: Truck,
            },
          ].map((tile) => (
            <Card key={tile.label} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
                <tile.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-ink-muted">{tile.label}</p>
                <p className="truncate text-lg font-semibold text-ink">{tile.value}</p>
                <p className="truncate text-xs text-ink-muted">{tile.hint}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="min-w-0 space-y-5">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">Filters</h2>
            <div className="space-y-4">
              <Field label="Search">
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <TextInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Code, item, supplier…"
                    className="pr-9"
                  />
                </div>
              </Field>

              <Field label="Status">
                <SelectInput
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PurchaseOrderStatus | 'all')}
                >
                  <option value="all">All statuses</option>
                  {PURCHASE_ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PURCHASE_ORDER_STATUS_META[s].label}
                      {counts?.[s] ? ` (${counts[s]})` : ''}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Project" hint="Central purchases carry no project">
                <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">All purchases</option>
                  <option value="central">Central / company stock</option>
                  {(projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Supplier">
                <SelectInput value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">All suppliers</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Button
                size="sm"
                variant={openOnly ? 'primary' : 'outline'}
                className="w-full"
                onClick={() => setOpenOnly(!openOnly)}
              >
                {openOnly ? 'Showing live orders' : 'Show live orders only'}
              </Button>

              {filtersActive && (
                <Button variant="outline" size="sm" className="w-full" onClick={resetFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          </Card>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              {loading ? 'Loading…' : `Showing ${rows.length} order${rows.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex items-center gap-2">
              <ViewToggle value={view} onChange={setView} />
              <SelectInput
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-auto max-w-[14rem]"
                aria-label="Sort orders"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </SelectInput>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl border border-hairline bg-white"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={hasAny ? 'No order matches these filters' : 'No purchase order yet'}
              description={
                hasAny
                  ? 'Try clearing the status, project or supplier filter.'
                  : 'Raise one against an approved material request, or buy into the central store in advance.'
              }
              action={
                hasAny ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/admin/purchase-orders/new">
                    <Button>
                      <Plus className="size-4" /> New Order
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <ResultsLayout view={view}>
                {paged.pageRows.map((order) => {
                  const meta = PURCHASE_ORDER_STATUS_META[order.status];
                  const due = order.totals.value - order.paid_value;
                  const headline = order.items[0]?.item_name ?? 'No items';

                  return (
                    <ResultCard
                      key={order.id}
                      href={`/admin/purchase-orders/${order.id}`}
                      view={view}
                      code={order.code}
                      title={headline}
                      subtitle={
                        order.totals.lines > 1
                          ? `and ${order.totals.lines - 1} more line${order.totals.lines === 2 ? '' : 's'}`
                          : undefined
                      }
                      status={<Badge tone={meta.tone}>{meta.label}</Badge>}
                      footer={`${order.status === 'draft' ? 'Drafted' : 'Ordered'} ${formatDate(
                        order.order_date,
                      )} · ${formatBdt(order.totals.value)}`}
                      facts={
                        <>
                          <Badge tone="teal">
                            <Truck className="size-3.5" />
                            {order.supplier?.name ?? 'Supplier removed'}
                          </Badge>
                          <Badge tone={order.project ? 'blue' : 'neutral'}>
                            {order.project ? (
                              <Building2 className="size-3.5" />
                            ) : (
                              <Warehouse className="size-3.5" />
                            )}
                            {order.project?.name ?? 'Central store'}
                          </Badge>
                          {order.status !== 'draft' && order.status !== 'cancelled' && (
                            <Badge tone={order.totals.fully_received ? 'green' : 'amber'}>
                              <Package className="size-3.5" />
                              {order.totals.received_pct}% received
                            </Badge>
                          )}
                          {/* a cancelled order's undelivered balance is void, so
                              the unpaid remainder is not money owed */}
                          {due > 0.009 &&
                            order.status !== 'draft' &&
                            order.status !== 'cancelled' && (
                              <Badge tone="red">{formatBdt(due)} unpaid on order</Badge>
                            )}
                          {order.request && (
                            <Badge tone="neutral">
                              <ClipboardList className="size-3.5" />
                              {order.request.code}
                            </Badge>
                          )}
                        </>
                      }
                    />
                  );
                })}
              </ResultsLayout>

              <Pagination
                page={paged.page}
                pageCount={paged.pageCount}
                pageSize={paged.pageSize}
                total={paged.total}
                from={paged.from}
                to={paged.to}
                onPageChange={paged.setPage}
                onPageSizeChange={paged.setPageSize}
                label="orders"
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
