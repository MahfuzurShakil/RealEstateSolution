'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Search, Trash2, Truck } from 'lucide-react';
import { SupplierFormModal } from '@/components/admin/procurement/SupplierFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SUPPLIER_TYPES, type Supplier, type SupplierType } from '@/lib/db/types';
import { SUPPLIER_TYPE_META } from '@/lib/domain/procurement';
import type { SupplierWithStats } from '@/lib/repositories';
import { supplierBalance, supplierRepository } from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

/** Supplier master list (Section 7.3) — reused across purchase orders. */
export default function SuppliersPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<SupplierType | 'all'>('all');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SupplierWithStats | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);

  const suppliers = useLiveQuery(() => supplierRepository.list({ search, type }), [search, type]);
  const total = useLiveQuery(() => supplierRepository.count(), []);

  const loading = suppliers === undefined;
  const rows = suppliers ?? [];
  const hasAny = (total ?? 0) > 0;

  async function requestDelete(supplier: SupplierWithStats) {
    const orders = await supplierRepository.blockedByOrders(supplier.id);
    if (orders > 0) {
      setDeleteBlocked(
        `${supplier.name} is on ${orders} purchase order${orders === 1 ? '' : 's'}. Deleting them would leave those orders — and any payment made against them — without a counterparty, so the supplier stays.`,
      );
      return;
    }
    setDeleteTarget(supplier);
  }

  const columns: Column<SupplierWithStats>[] = [
    {
      key: 'name',
      header: 'Supplier',
      cell: (row) => (
        <Link
          href={`/admin/suppliers/${row.id}`}
          className="font-medium text-ink hover:text-admin-700"
        >
          {row.name}
          <span className="block text-xs font-normal text-ink-muted">{row.code}</span>
        </Link>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: 'type',
      header: 'Type',
      cell: (row) => (
        <Badge tone={SUPPLIER_TYPE_META[row.type].tone}>{SUPPLIER_TYPE_META[row.type].label}</Badge>
      ),
      sortValue: (row) => row.type,
    },
    {
      key: 'phone',
      header: 'Contact',
      cell: (row) => (
        <span className="text-sm text-ink">
          {formatPhone(row.phone)}
          {row.contact_person && (
            <span className="block text-xs text-ink-muted">{row.contact_person}</span>
          )}
        </span>
      ),
      sortValue: (row) => row.phone,
    },
    {
      key: 'po_count',
      header: 'Orders',
      align: 'right',
      cell: (row) => (
        <span className="text-sm">
          {row.po_count > 0 ? row.po_count : <span className="text-ink-muted">—</span>}
          {row.draft_count > 0 && (
            <span className="block text-xs text-ink-muted">+{row.draft_count} draft</span>
          )}
        </span>
      ),
      sortValue: (row) => row.po_count,
    },
    {
      key: 'ordered_value',
      header: 'Ordered',
      align: 'right',
      cell: (row) => (
        <span className="text-sm">
          {formatBdt(row.ordered_value)}
          {row.awaiting_delivery_value > 0.009 && (
            <span className="block text-xs text-ink-muted">
              {formatBdt(row.awaiting_delivery_value)} not yet delivered
            </span>
          )}
        </span>
      ),
      sortValue: (row) => row.ordered_value,
    },
    {
      key: 'received_value',
      header: 'Received',
      align: 'right',
      cell: (row) => formatBdt(row.received_value),
      sortValue: (row) => row.received_value,
    },
    {
      key: 'paid_value',
      header: 'Paid',
      align: 'right',
      cell: (row) => {
        // owed against what has arrived, not against what was ordered
        const { due, advance } = supplierBalance(row);
        return (
          <span className="text-sm">
            {formatBdt(row.paid_value)}
            {due > 0.009 && (
              <span className="block text-xs text-amber-600">{formatBdt(due)} due</span>
            )}
            {advance > 0.009 && (
              <span className="block text-xs text-blue-700">
                {formatBdt(advance)} advance held
              </span>
            )}
          </span>
        );
      },
      sortValue: (row) => row.paid_value,
    },
    {
      key: 'last_order_date',
      header: 'Last order',
      cell: (row) => formatDate(row.last_order_date),
      sortValue: (row) => row.last_order_date ?? '',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${row.name}`}
            onClick={() => {
              setEditing(row);
              setModalOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${row.name}`}
            onClick={() => requestDelete(row)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Who the company buys from. The same list serves contractors when that module arrives."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="size-4" /> New Supplier
          </Button>
        }
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, contact person…"
              className="pr-9"
            />
          </div>
          <SelectInput
            value={type}
            onChange={(e) => setType(e.target.value as SupplierType | 'all')}
            className="w-auto"
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            {SUPPLIER_TYPES.map((t) => (
              <option key={t} value={t}>
                {SUPPLIER_TYPE_META[t].label}
              </option>
            ))}
          </SelectInput>
          <p className="ml-auto text-sm text-ink-muted">
            {loading ? 'Loading…' : `${rows.length} supplier${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-canvas" />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            initialSort={{ key: 'name' }}
            label="suppliers"
            emptyState={
              <EmptyState
                icon={Truck}
                title={hasAny ? 'No supplier matches this search' : 'No supplier yet'}
                description={
                  hasAny
                    ? 'Try a different name or clear the type filter.'
                    : 'Add the vendors you buy from — a purchase order needs one.'
                }
                action={
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setModalOpen(true);
                    }}
                  >
                    <Plus className="size-4" /> New Supplier
                  </Button>
                }
              />
            }
          />
        )}
      </Card>

      <SupplierFormModal
        open={modalOpen}
        supplier={editing ?? undefined}
        onClose={() => setModalOpen(false)}
        onSaved={() => setModalOpen(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name ?? ''}`}
        confirmLabel="Delete supplier"
        message="The supplier and any documents attached to them are removed. Nothing has been ordered from them, so nothing else is affected."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await supplierRepository.removeCascade(deleteTarget.id);
          setDeleteTarget(null);
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
