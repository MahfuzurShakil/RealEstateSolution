'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Receipt, Search, Warehouse } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SUPPLIER_PAYMENT_METHODS } from '@/lib/db/types';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import type { SupplierVoucherWithRelations } from '@/lib/repositories';
import {
  projectRepository,
  supplierRepository,
  supplierVoucherRepository,
} from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * Every supplier payment in one place (Section 7.9).
 *
 * Vouchers are raised from the purchase order they pay, not from here — the
 * project has to come off the order for the Section 7.11 cost chain to hold,
 * so there is deliberately no "New voucher" button on this page.
 */
export default function SupplierVouchersPage() {
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [method, setMethod] = useState('all');

  const vouchers = useLiveQuery(
    () =>
      supplierVoucherRepository.list({
        search,
        supplier_id: supplierId || undefined,
        project_id: projectId || undefined,
        payment_method: method,
      }),
    [search, supplierId, projectId, method],
  );
  const total = useLiveQuery(() => supplierVoucherRepository.count(), []);
  const suppliers = useLiveQuery(() => supplierRepository.list(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);

  const rows = useMemo(() => vouchers ?? [], [vouchers]);
  const paid = useMemo(() => rows.reduce((sum, v) => sum + v.amount, 0), [rows]);
  const loading = vouchers === undefined;
  const hasAny = (total ?? 0) > 0;

  const columns: Column<SupplierVoucherWithRelations>[] = [
    {
      key: 'code',
      header: 'Voucher',
      cell: (row) => <span className="font-medium text-ink">{row.code}</span>,
      sortValue: (row) => row.code,
    },
    {
      /*
       * A payment register reads in date order. This used to sort by voucher
       * code with the date tucked under it and no column of its own, so the
       * page opened as 26 Aug, 12 Aug, 07 Aug, 13 Aug — and there was no
       * header to click to put it right.
       */
      key: 'payment_date',
      header: 'Date',
      cell: (row) => <span className="text-sm text-ink">{formatDate(row.payment_date)}</span>,
      sortValue: (row) => row.payment_date,
    },
    {
      key: 'supplier',
      header: 'Supplier',
      cell: (row) =>
        row.supplier ? (
          <Link
            href={`/admin/suppliers/${row.supplier.id}`}
            className="text-admin-700 hover:underline"
          >
            {row.supplier.name}
          </Link>
        ) : (
          <span className="text-ink-muted">Supplier removed</span>
        ),
      sortValue: (row) => row.supplier?.name ?? '',
    },
    {
      key: 'order',
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
      key: 'project',
      header: 'Booked to',
      cell: (row) =>
        row.project ? (
          <Badge tone="teal">
            <Building2 className="size-3.5" />
            {row.project.name}
          </Badge>
        ) : (
          <Badge tone="neutral">
            <Warehouse className="size-3.5" />
            Central stock
          </Badge>
        ),
      sortValue: (row) => row.project?.name ?? '',
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
      header: 'Paid by',
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
  ];

  return (
    <>
      <PageHeader
        title="Supplier Vouchers"
        subtitle="Every payment made to a supplier, and which order and project it belongs to."
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, reference, supplier…"
              className="pr-9"
            />
          </div>
          <SelectInput
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-auto"
            aria-label="Filter by supplier"
          >
            <option value="">All suppliers</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-auto"
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            <option value="central">Central stock</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-auto"
            aria-label="Filter by method"
          >
            <option value="all">All methods</option>
            {SUPPLIER_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {SUPPLIER_PAYMENT_METHOD_META[m]}
              </option>
            ))}
          </SelectInput>
          <p className="ml-auto text-sm text-ink-muted">
            {loading ? 'Loading…' : `${rows.length} voucher${rows.length === 1 ? '' : 's'} · `}
            {!loading && <span className="font-semibold text-ink">{formatBdt(paid)}</span>}
          </p>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-canvas" />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            initialSort={{ key: 'payment_date', direction: 'desc' }}
            label="vouchers"
            emptyState={
              <EmptyState
                icon={Receipt}
                title={hasAny ? 'No voucher matches these filters' : 'No supplier payment yet'}
                description="Payments are recorded from the purchase order they pay, so the project comes off the order and the cost rolls up to the right place."
                action={
                  <Link href="/admin/purchase-orders">
                    <Button variant="outline">Open purchase orders</Button>
                  </Link>
                }
              />
            }
          />
        )}
      </Card>
    </>
  );
}
