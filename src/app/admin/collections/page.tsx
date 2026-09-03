'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Search,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { INSTALLMENT_STATUS_META, daysOverdue } from '@/lib/domain/finance';
import type { CollectionRow } from '@/lib/repositories';
import { collectionRepository, projectRepository } from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone, todayLocal } from '@/lib/utils/format';
import { RecordPaymentModal } from '@/components/admin/bookings/RecordPaymentModal';

type StatusFilter = 'all' | 'pending' | 'partially_paid' | 'paid' | 'overdue';

/**
 * The collections queue (Section 8.2).
 *
 * Every instalment across every live booking, overdue first — this is meant to
 * be worked through from the top. Cancelled bookings are excluded by the
 * repository: chasing an instalment on a booking that no longer exists is the
 * mistake this list is here to prevent.
 */
function CollectionsPage() {
  const params = useSearchParams();
  const initialStatus = params.get('status');

  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [status, setStatus] = useState<StatusFilter>(
    initialStatus === 'overdue' || initialStatus === 'pending' || initialStatus === 'paid'
      ? initialStatus
      : 'all',
  );
  const [payFor, setPayFor] = useState<CollectionRow | null>(null);
  const [dueOnly, setDueOnly] = useState(true);

  const today = todayLocal();
  const rows = useLiveQuery(
    () =>
      collectionRepository.list(
        {
          search,
          project_id: projectId || undefined,
          status,
          due_only: dueOnly && status === 'all',
        },
        today,
      ),
    [search, projectId, status, dueOnly, today],
  );
  const summary = useLiveQuery(() => collectionRepository.summary(today), [today]);
  const projects = useLiveQuery(() => projectRepository.list(), []);

  const loading = rows === undefined;
  const list = rows ?? [];

  const columns: Column<CollectionRow>[] = [
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.customer?.name ?? 'Customer removed'}
          <span className="block text-xs font-normal text-ink-muted">
            {row.customer ? formatPhone(row.customer.phone) : '—'}
          </span>
        </span>
      ),
      sortValue: (row) => row.customer?.name ?? '',
    },
    {
      key: 'booking',
      header: 'Booking',
      cell: (row) => (
        <Link
          href={`/admin/bookings/${row.booking.id}`}
          className="text-admin-700 hover:underline"
        >
          {row.booking.code}
          <span className="block text-xs text-ink-muted">{row.unit?.code ?? '—'}</span>
        </Link>
      ),
      sortValue: (row) => row.booking.code,
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
      key: 'label',
      header: 'Instalment',
      cell: (row) => <span className="text-sm text-ink">{row.installment.label}</span>,
      sortValue: (row) => row.installment.installment_no,
    },
    {
      key: 'due_date',
      header: 'Due',
      cell: (row) => {
        if (!row.installment.due_date) return <span className="text-ink-muted">not set</span>;
        const late = daysOverdue(row.installment, today);
        return (
          <span className="text-sm text-ink">
            {formatDate(row.installment.due_date)}
            {late > 0 && (
              <span className="block text-xs text-red-600">
                {late} day{late === 1 ? '' : 's'} late
              </span>
            )}
          </span>
        );
      },
      sortValue: (row) => row.installment.due_date ?? '9999',
    },
    {
      key: 'amount_due',
      header: 'Amount',
      align: 'right',
      cell: (row) => formatBdt(row.installment.amount_due),
      sortValue: (row) => row.installment.amount_due,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <span
          className={
            row.status === 'overdue'
              ? 'font-medium text-red-600'
              : row.outstanding > 0.009
                ? 'font-medium text-ink'
                : 'text-emerald-700'
          }
        >
          {row.outstanding > 0.009 ? formatBdt(row.outstanding) : 'settled'}
        </span>
      ),
      sortValue: (row) => row.outstanding,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => {
        const meta = INSTALLMENT_STATUS_META[row.status];
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      },
      sortValue: (row) => row.status,
    },
    {
      /*
       * Taking the money was four steps from the screen built for chasing it:
       * open the booking, Payments tab, dialog, save. The same dialog opens
       * here with this instalment's shortfall filled in — the receipt is still
       * allocated oldest-first by the finance repository, so it lands where the
       * schedule says, not necessarily on the row that was clicked.
       */
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) =>
        row.outstanding > 0.009 ? (
          <Button size="sm" variant="outline" onClick={() => setPayFor(row)}>
            <CircleDollarSign className="size-4" /> Record payment
          </Button>
        ) : null,
    },
  ];

  const tiles = summary
    ? [
        {
          label: 'Billed',
          value: formatBdt(summary.billed ),
          hint: 'across every live schedule',
          icon: CalendarClock,
        },
        {
          /*
           * Deliberately not called "Collected". The Finance Overview counts
           * every receipt, including money taken on a booking that is still on
           * hold and therefore has no schedule to sit on — so the two pages
           * showed different figures under the same word.
           */
          label: 'Allocated to instalments',
          value: formatBdt(summary.collected),
          hint: 'confirmed bookings only',
          icon: Wallet,
        },
        {
          label: 'Due this month',
          value: formatBdt(summary.due_this_month ),
          hint: 'not yet overdue',
          icon: CircleDollarSign,
        },
        {
          label: 'Overdue',
          value: formatBdt(summary.overdue_amount ),
          hint: `${summary.overdue_count} instalment${summary.overdue_count === 1 ? '' : 's'}`,
          icon: AlertTriangle,
          alert: summary.overdue_count > 0,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle="What every buyer owes and when — overdue first, so the list reads as a worklist."
      />

      {summary && summary.overdue_count > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white p-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle className="size-5" />
          </span>
          <p className="mr-auto text-sm text-ink">
            <span className="font-semibold">Overdue:</span>{' '}
            <span className="text-red-600">
              {formatBdt(summary.overdue_amount)} across {summary.overdue_count} instalment
              {summary.overdue_count === 1 ? '' : 's'}
            </span>
          </p>
          <Button
            size="sm"
            variant={status === 'overdue' ? 'primary' : 'outline'}
            onClick={() => setStatus(status === 'overdue' ? 'all' : 'overdue')}
          >
            {status === 'overdue' ? 'Show all' : 'Show overdue only'}
          </Button>
        </div>
      )}

      {tiles.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <Card key={tile.label} className="flex items-center gap-3">
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                  tile.alert ? 'bg-red-50 text-red-600' : 'bg-admin-50 text-admin-600'
                }`}
              >
                <tile.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-ink-muted">{tile.label}</p>
                <p className="truncate text-lg font-semibold text-ink">{tile.value}</p>
                <p className="truncate text-xs text-ink-muted">{tile.hint}</p>
              </div>
            </Card>
          ))}
          <p className="col-span-full text-xs text-ink-muted">
            A booking only gets a schedule when it is confirmed, so money taken while one is still
            on hold has no instalment to sit against and is not counted here. The Finance
            Overview&rsquo;s &ldquo;Collected&rdquo; counts every receipt, which is why it reads
            higher.
          </p>
        </div>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer, booking, unit…"
              className="pr-9"
            />
          </div>
          <SelectInput
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-auto"
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="w-auto"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="overdue">Overdue</option>
            <option value="pending">Pending</option>
            <option value="partially_paid">Partly paid</option>
            <option value="paid">Paid</option>
          </SelectInput>
          {status === 'all' && (
            <Button size="sm" variant={dueOnly ? 'primary' : 'outline'} onClick={() => setDueOnly(!dueOnly)}>
              {dueOnly ? 'Hiding settled' : 'Show settled too'}
            </Button>
          )}
          <p className="ml-auto text-sm text-ink-muted">
            {loading ? 'Loading…' : `${list.length} instalment${list.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-canvas" />
        ) : (
          <DataTable
            rows={list}
            columns={columns}
            label="instalments"
            /*
             * Nine columns is a table a phone cannot use — the outstanding
             * amount, which is the whole reason this screen exists, was three
             * swipes to the right. The card leads with who owes and how much.
             */
            mobileCard={(row) => {
              const meta = INSTALLMENT_STATUS_META[row.status];
              const late = daysOverdue(row.installment, today);
              return (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {row.customer?.name ?? 'Customer removed'}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {row.booking.code} · {row.unit?.code ?? '—'}
                      </p>
                    </div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>

                  <p className="text-xs text-ink-muted">
                    {row.installment.label}
                    {row.project ? ` · ${row.project.name}` : ''}
                  </p>

                  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                    <p className="text-xs text-ink-muted">
                      Due{' '}
                      {row.installment.due_date ? formatDate(row.installment.due_date) : 'not set'}
                      {late > 0 && (
                        <span className="block text-red-600">
                          {late} day{late === 1 ? '' : 's'} late
                        </span>
                      )}
                    </p>
                    <p className="text-right text-sm">
                      <span className="block text-xs text-ink-muted">
                        {row.outstanding > 0.009 ? 'outstanding' : 'settled'}
                      </span>
                      <span
                        className={
                          row.status === 'overdue'
                            ? 'font-semibold text-red-600'
                            : row.outstanding > 0.009
                              ? 'font-semibold text-ink'
                              : 'font-medium text-emerald-700'
                        }
                      >
                        {row.outstanding > 0.009 ? formatBdt(row.outstanding) : '—'}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        of {formatBdt(row.installment.amount_due)}
                      </span>
                    </p>
                  </div>

                  {row.outstanding > 0.009 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setPayFor(row)}
                    >
                      <CircleDollarSign className="size-4" /> Record payment
                    </Button>
                  )}
                </div>
              );
            }}
            emptyState={
              <EmptyState
                icon={CircleDollarSign}
                title={
                  status === 'overdue' ? 'Nothing is overdue' : 'No instalment matches these filters'
                }
                description={
                  status === 'overdue'
                    ? 'Every buyer is current on their schedule.'
                    : 'Schedules are drawn up when a booking is confirmed — a booking still on hold has no instalments yet.'
                }
                action={
                  <Link href="/admin/bookings">
                    <Button variant="outline">Open bookings</Button>
                  </Link>
                }
              />
            }
          />
        )}
      </Card>

      {payFor && (
        <RecordPaymentModal
          open
          booking={payFor.booking}
          defaultAmount={payFor.outstanding}
          subtitle={`${payFor.customer?.name ?? payFor.booking.code} · ${
            payFor.installment.label
          } · ${formatBdt(payFor.outstanding)} outstanding`}
          onClose={() => setPayFor(null)}
        />
      )}
    </>
  );
}

/** The finance dashboard links in with ?status= and ?project=. */
export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <CollectionsPage />
    </Suspense>
  );
}
