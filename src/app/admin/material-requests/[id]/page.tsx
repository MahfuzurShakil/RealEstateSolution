'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Building2,
  Check,
  CircleDashed,
  ListChecks,
  Pencil,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { MaterialRequestStatusCard } from '@/components/admin/material-requests/MaterialRequestStatusCard';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import type { MaterialRequestItem } from '@/lib/db/types';
import { PROJECT_STATUS_META } from '@/lib/domain/project';
import {
  MATERIAL_REQUEST_STATUS_META,
  WORK_ITEM_STATUS_META,
  approvalSummary,
  requestTotals,
} from '@/lib/domain/site-progress';
import { PURCHASE_ORDER_STATUS_META } from '@/lib/domain/procurement';
import { materialRequestRepository, purchaseOrderRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** One material request (Sections 6.5 / 6.6). */
export default function MaterialRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const request = useLiveQuery(() => materialRequestRepository.getWithRelations(id), [id]);
  // Section 7.2 — what Procurement actually bought against this request
  const orders = useLiveQuery(() => purchaseOrderRepository.list({ request_id: id }), [id]);

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

  const totals = requestTotals(request.items);
  const decided = request.status !== 'pending';

  const columns: Column<MaterialRequestItem>[] = [
    {
      key: 'item_name',
      header: 'Item',
      cell: (row) => <span className="font-medium text-ink">{row.item_name}</span>,
      sortValue: (row) => row.item_name,
    },
    {
      key: 'quantity_requested',
      header: 'Requested',
      align: 'right',
      cell: (row) => `${row.quantity_requested} ${row.unit}`,
      sortValue: (row) => row.quantity_requested,
    },
    {
      key: 'quantity_approved',
      header: 'Approved',
      align: 'right',
      cell: (row) => {
        if (row.quantity_approved == null) {
          return <span className="text-ink-muted">not decided</span>;
        }
        const trimmed = row.quantity_approved < row.quantity_requested;
        return (
          <span className={trimmed ? 'font-medium text-amber-600' : 'font-medium text-emerald-700'}>
            {row.quantity_approved} {row.unit}
          </span>
        );
      },
      sortValue: (row) => row.quantity_approved ?? -1,
    },
  ];

  return (
    <>
      <Link
        href="/admin/material-requests"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to material requests
      </Link>

      <PageHeader
        title={request.code}
        subtitle={`${request.project?.name ?? 'Project removed'}${
          request.tower ? ` · ${request.tower.name}` : ' · whole site'
        } · ${totals.lines} item${totals.lines === 1 ? '' : 's'}`}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/material-requests/${request.id}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" /> Edit
              </Button>
            </Link>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5 lg:order-1">
          <Card>
            <CardHeader
              title="Items requested"
              action={
                decided ? (
                  <span className="text-xs text-ink-muted">{approvalSummary(totals)}</span>
                ) : undefined
              }
            />
            {/* no initialSort — the lines read in the order they were written */}
            <DataTable
              rows={request.items}
              columns={columns}
              label="items"
              emptyState={
                <p className="py-6 text-center text-sm text-ink-muted">
                  This request has no items — edit it to add some.
                </p>
              }
            />
          </Card>

          {request.notes && (
            <Card>
              <CardHeader title="Notes from the site" />
              <p className="whitespace-pre-wrap text-sm text-ink">{request.notes}</p>
            </Card>
          )}

          {request.history.length > 0 && (
            <Card>
              <CardHeader title="Decision trail" />
              {/* same tree-style trail as the land and project timelines, so an
                  audit trail always looks the same in this app */}
              <ol className="relative space-y-4 pl-8">
                <span className="absolute bottom-3 left-[11px] top-3 w-px bg-hairline" aria-hidden />
                {request.history.map((event, index) => {
                  const isLast = index === request.history.length - 1;
                  const meta = MATERIAL_REQUEST_STATUS_META[event.to_status];
                  return (
                    <li key={event.id} className="relative">
                      <span
                        className={`absolute -left-8 top-3 grid size-6 place-items-center rounded-full ring-4 ring-white ${
                          isLast ? 'bg-admin-500 text-white' : 'bg-admin-100 text-admin-700'
                        }`}
                      >
                        {isLast ? (
                          <CircleDashed className="size-3.5" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                      </span>

                      <div className="rounded-xl border border-hairline p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            <span className="text-xs text-ink-muted">
                              from {MATERIAL_REQUEST_STATUS_META[event.from_status].label}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-ink">
                            {formatDate(event.event_date)}
                          </span>
                        </div>
                        {event.note && (
                          <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-sm text-ink-muted">
                            {event.note}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {request.work_item && (
            <Card>
              <CardHeader
                title="Work item this is for"
                action={
                  <Badge tone={WORK_ITEM_STATUS_META[request.work_item.status].tone}>
                    {WORK_ITEM_STATUS_META[request.work_item.status].label}
                  </Badge>
                }
              />
              <div className="flex items-center gap-3 rounded-xl border border-hairline p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                  <ListChecks className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {request.work_item.sequence_no}. {request.work_item.name}
                  </p>
                  <div className="mt-1.5">
                    <ProgressBar value={request.work_item.actual_progress_pct} size="sm" />
                  </div>
                </div>
                <span className="text-sm font-semibold text-ink">
                  {request.work_item.actual_progress_pct}%
                </span>
              </div>
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <MaterialRequestStatusCard request={request} />

          {(orders ?? []).length > 0 && (
            <Card>
              <CardHeader title={`Purchase orders (${orders?.length ?? 0})`} />
              <ul className="space-y-2">
                {(orders ?? []).map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/purchase-orders/${order.id}`}
                      className="block rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                          <ShoppingCart className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{order.code}</p>
                          <p className="truncate text-xs text-ink-muted">
                            {order.supplier?.name ?? 'Supplier removed'} ·{' '}
                            {formatBdt(order.totals.value)}
                          </p>
                        </div>
                      </div>
                      <Badge
                        tone={PURCHASE_ORDER_STATUS_META[order.status].tone}
                        className="mt-2.5"
                      >
                        {PURCHASE_ORDER_STATUS_META[order.status].label}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {request.project && (
            <Card>
              <CardHeader title="Project" />
              <Link
                href={`/admin/projects/${request.project.id}`}
                className="block rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{request.project.name}</p>
                    <p className="text-xs text-ink-muted">{request.project.code}</p>
                  </div>
                </div>
                <Badge
                  tone={PROJECT_STATUS_META[request.project.status].tone}
                  className="mt-2.5"
                >
                  {PROJECT_STATUS_META[request.project.status].label}
                </Badge>
              </Link>
            </Card>
          )}

          <Card>
            <CardHeader title="Record" />
            <Row label="Request date" value={formatDate(request.request_date)} />
            <Row label="Requested by" value={request.requester_name} />
            <Row label="Tower" value={request.tower?.name ?? 'Whole site'} />
            <Row label="Created" value={formatDate(request.created_at)} />
            <Row label="Last updated" value={formatDate(request.updated_at)} />
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${request.code}`}
        confirmLabel="Delete request"
        message="The request and its item lines are removed. Rejecting instead keeps the record and the reason — that is usually what you want."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await materialRequestRepository.removeCascade(request.id);
          router.push('/admin/material-requests');
        }}
      />
    </>
  );
}
