'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Trash2, Undo2 } from 'lucide-react';
import { RefundModal } from '@/components/admin/finance/RefundModal';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import type { RefundableBooking, RefundWithRelations } from '@/lib/repositories';
import { projectRepository, refundRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * Money returned on cancelled bookings (Section 8.2).
 *
 * A refund still belongs to a booking — the amount is checked against what
 * that buyer actually paid — so "Record refund" here picks the cancelled
 * booking first and then opens the same dialog the booking page uses. The
 * page used to have no action at all and no explanation of where one came
 * from, which left the only route "know to open the booking".
 */
export default function RefundsPage() {
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RefundWithRelations | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<RefundableBooking | null>(null);

  const refunds = useLiveQuery(
    () => refundRepository.list({ search, project_id: projectId || undefined }),
    [search, projectId],
  );
  const total = useLiveQuery(() => refundRepository.count(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const refundable = useLiveQuery(() => refundRepository.listRefundable(), []);

  const rows = useMemo(() => refunds ?? [], [refunds]);
  const totals = useMemo(
    () => ({
      gross: rows.reduce((sum, r) => sum + r.amount, 0),
      deducted: rows.reduce((sum, r) => sum + r.deduction, 0),
      net: rows.reduce((sum, r) => sum + r.net_refund, 0),
    }),
    [rows],
  );

  const loading = refunds === undefined;
  const hasAny = (total ?? 0) > 0;

  const columns: Column<RefundWithRelations>[] = [
    {
      key: 'code',
      header: 'Refund',
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.code}
          <span className="block text-xs font-normal text-ink-muted">
            {formatDate(row.refund_date)}
          </span>
        </span>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => (
        <span className="text-sm text-ink">
          {row.customer?.name ?? 'Customer removed'}
          <span className="block text-xs text-ink-muted">{row.unit?.code ?? '—'}</span>
        </span>
      ),
      sortValue: (row) => row.customer?.name ?? '',
    },
    {
      key: 'booking',
      header: 'Booking',
      cell: (row) =>
        row.booking ? (
          <Link href={`/admin/bookings/${row.booking.id}`} className="text-admin-700 hover:underline">
            {row.booking.code}
          </Link>
        ) : (
          <span className="text-ink-muted">Booking removed</span>
        ),
      sortValue: (row) => row.booking?.code ?? '',
    },
    {
      key: 'project',
      header: 'Project',
      cell: (row) =>
        row.project ? (
          <Badge tone="teal">
            <Building2 className="size-3.5" />
            {row.project.name}
          </Badge>
        ) : (
          <span className="text-ink-muted">—</span>
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
      key: 'amount',
      header: 'Settled',
      align: 'right',
      cell: (row) => formatBdt(row.amount),
      sortValue: (row) => row.amount,
    },
    {
      key: 'deduction',
      header: 'Charge kept',
      align: 'right',
      cell: (row) =>
        row.deduction > 0 ? (
          <span className="text-amber-600">{formatBdt(row.deduction)}</span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      sortValue: (row) => row.deduction,
    },
    {
      key: 'net_refund',
      header: 'Paid out',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatBdt(row.net_refund)}</span>,
      sortValue: (row) => row.net_refund,
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
          onClick={() => setDeleteTarget(row)}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Refunds"
        subtitle="Money returned after a booking was cancelled, and what was kept as a charge."
        action={
          <Button onClick={() => setPickerOpen(true)} disabled={(refundable ?? []).length === 0}>
            <Undo2 className="size-4" /> Record refund
          </Button>
        }
      />

      {refundable !== undefined && refundable.length === 0 && (
        <p className="mb-5 text-sm text-ink-muted">
          Nothing is waiting to be refunded. A refund can only be raised against a cancelled
          booking that still has money on it, so cancel the booking first — the unit is released
          and the amount left to return is worked out from the receipts taken.
        </p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Settled', value: totals.gross, hint: 'taken off what buyers had paid' },
          { label: 'Charges kept', value: totals.deducted, hint: 'cancellation charges' },
          { label: 'Paid out', value: totals.net, hint: 'actually left the account' },
        ].map((tile) => (
          <Card key={tile.label} className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
              <Undo2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-ink-muted">{tile.label}</p>
              <p className="truncate text-lg font-semibold text-ink">
                {formatBdt(tile.value )}
              </p>
              <p className="truncate text-xs text-ink-muted">{tile.hint}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Code, customer, booking…' }}
          isFiltered={Boolean(search || projectId)}
          onReset={() => {
            setSearch('');
            setProjectId('');
          }}
          resultLabel={loading ? 'Loading…' : `${rows.length} refund${rows.length === 1 ? '' : 's'}`}
        >
          <FilterSelect
            label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
        </FilterBar>

        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-canvas" />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            initialSort={{ key: 'refund_date', direction: 'desc' }}
            label="refunds"
            emptyState={
              <EmptyState
                icon={Undo2}
                title={hasAny ? 'No refund matches these filters' : 'No refund issued'}
                description="A refund is raised from the cancelled booking it belongs to, so the amount can be checked against what that buyer actually paid."
                action={
                  <Link href="/admin/bookings?status=cancelled">
                    <Button variant="outline">Open cancelled bookings</Button>
                  </Link>
                }
              />
            }
          />
        )}
      </Card>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Which booking is this refund against?"
        subtitle="Cancelled bookings that still have money to give back, most recently cancelled first."
      >
        <ul className="space-y-2">
          {(refundable ?? []).map((row) => (
            <li key={row.booking.id}>
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  setRefundTarget(row);
                }}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline p-3 text-left transition-colors hover:bg-admin-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {row.customer?.name ?? 'Customer removed'}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {row.booking.code} · {row.unit?.code ?? '—'}
                    {row.project ? ` · ${row.project.name}` : ''}
                  </span>
                </span>
                <span className="text-right text-sm">
                  <span className="block text-xs text-ink-muted">left to refund</span>
                  <span className="font-semibold text-ink">{formatBdt(row.left)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      {refundTarget && (
        <RefundModal
          open
          booking={refundTarget.booking}
          onClose={() => setRefundTarget(null)}
          onSaved={() => setRefundTarget(null)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.code ?? ''}`}
        confirmLabel="Delete refund"
        message="The refund record and its voucher are removed, and the money counts as unreturned again. Use this for an entry made in error, not for a refund that was reversed."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await refundRepository.removeCascade(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
