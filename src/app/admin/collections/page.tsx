'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Building2, CalendarClock, CircleDollarSign, Wallet } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { ExportCsvButton } from '@/components/ui/ExportCsvButton';
import { PageHeader } from '@/components/ui/PageHeader';
import type { CollectionRow } from '@/lib/repositories';
import type { CsvColumn } from '@/lib/utils/csv';
import { collectionRepository, projectRepository } from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone, todayLocal } from '@/lib/utils/format';
import { RecordPaymentModal } from '@/components/admin/bookings/RecordPaymentModal';

type StateFilter = 'all' | CollectionRow['state'];

const STATE_META: Record<CollectionRow['state'], { label: string; tone: BadgeTone }> = {
  behind: { label: 'Behind', tone: 'red' },
  on_track: { label: 'On track', tone: 'blue' },
  paid: { label: 'Fully paid', tone: 'green' },
};

/*
 * Amounts go out as plain numbers and dates as ISO, so a spreadsheet can sum
 * and sort them — `formatBdt` text would arrive as "BDT 1,500,000".
 */
const COLLECTION_CSV_COLUMNS: CsvColumn<CollectionRow>[] = [
  { header: 'Booking', value: (r) => r.booking.code },
  { header: 'Customer', value: (r) => r.customer?.name ?? '' },
  { header: 'Phone', value: (r) => r.customer?.phone ?? '' },
  { header: 'Project', value: (r) => r.project?.name ?? '' },
  { header: 'Unit', value: (r) => r.unit?.code ?? '' },
  { header: 'Total price', value: (r) => r.total },
  { header: 'Received', value: (r) => r.received },
  { header: 'Balance', value: (r) => r.balance },
  { header: 'Expected by today', value: (r) => r.expected },
  { header: 'Behind', value: (r) => r.behind },
  { header: 'Next due date', value: (r) => r.next?.date ?? '' },
  { header: 'Next due amount', value: (r) => r.next?.amount ?? '' },
  { header: 'State', value: (r) => r.state },
];

/**
 * Collections — one row per live booking (SALES-FLOW-PLAN.md S5).
 *
 * What each buyer owes, has paid, and how far behind their agreement they are,
 * most behind first, so it reads as a worklist. "Expected" comes from the
 * agreement's terms; a booking with no agreement only expects its booking money.
 */
function CollectionsPage() {
  const params = useSearchParams();
  const initial = params.get('state') ?? (params.get('status') === 'overdue' ? 'behind' : null);

  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [state, setState] = useState<StateFilter>(
    initial === 'behind' || initial === 'on_track' || initial === 'paid' ? initial : 'all',
  );
  const [payFor, setPayFor] = useState<CollectionRow | null>(null);

  const today = todayLocal();
  const rows = useLiveQuery(
    () => collectionRepository.list({ search, project_id: projectId || undefined, state }, today),
    [search, projectId, state, today],
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
        <Link href={`/admin/bookings/${row.booking.id}?tab=payments`} className="text-admin-700 hover:underline">
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
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (row) => formatBdt(row.total),
      sortValue: (row) => row.total,
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      cell: (row) => <span className="text-emerald-700">{formatBdt(row.received)}</span>,
      sortValue: (row) => row.received,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatBdt(row.balance)}</span>,
      sortValue: (row) => row.balance,
    },
    {
      key: 'behind',
      header: 'Behind',
      align: 'right',
      cell: (row) =>
        row.behind > 0.5 ? (
          <span className="font-medium text-red-600">{formatBdt(row.behind)}</span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      sortValue: (row) => row.behind,
    },
    {
      key: 'next',
      header: 'Next due',
      cell: (row) =>
        row.next ? (
          <span className={row.next.date < today ? 'text-sm text-red-600' : 'text-sm text-ink'}>
            {formatDate(row.next.date)}
            {row.next.date < today && ' · late'}
            <span className="block text-xs text-ink-muted">
              {row.next.label} · {formatBdt(row.next.amount)}
            </span>
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      sortValue: (row) => row.next?.date ?? '9999',
    },
    {
      key: 'state',
      header: 'State',
      cell: (row) => <Badge tone={STATE_META[row.state].tone}>{STATE_META[row.state].label}</Badge>,
      sortValue: (row) => row.state,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) =>
        row.balance > 0.5 ? (
          <Button size="sm" variant="outline" onClick={() => setPayFor(row)}>
            <CircleDollarSign className="size-4" /> Receive
          </Button>
        ) : null,
    },
  ];

  const tiles = summary
    ? [
        { label: 'Total sales', value: formatBdt(summary.billed), hint: 'live bookings', icon: CalendarClock },
        { label: 'Received', value: formatBdt(summary.collected), hint: 'every receipt so far', icon: Wallet },
        {
          label: 'Due this month',
          value: formatBdt(summary.due_this_month),
          hint: 'falling due later this month',
          icon: CircleDollarSign,
        },
        {
          label: 'Behind',
          value: formatBdt(summary.overdue_amount),
          hint: `${summary.overdue_count} buyer${summary.overdue_count === 1 ? '' : 's'}`,
          icon: AlertTriangle,
          alert: summary.overdue_count > 0,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle="What every buyer owes against their agreement — the most behind first."
        action={
          <ExportCsvButton rows={rows ?? []} columns={COLLECTION_CSV_COLUMNS} filenamePrefix="collections" />
        }
      />

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
        </div>
      )}

      <Card>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Customer, booking, unit…' }}
          isFiltered={Boolean(search || projectId) || state !== 'all'}
          onReset={() => {
            setSearch('');
            setProjectId('');
            setState('all');
          }}
          resultLabel={loading ? 'Loading…' : `${list.length} booking${list.length === 1 ? '' : 's'}`}
        >
          <FilterSelect label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="State" value={state} onChange={(e) => setState(e.target.value as StateFilter)}>
            <option value="all">All</option>
            <option value="behind">Behind</option>
            <option value="on_track">On track</option>
            <option value="paid">Fully paid</option>
          </FilterSelect>
        </FilterBar>

        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-canvas" />
        ) : (
          <DataTable
            rows={list}
            columns={columns}
            label="bookings"
            mobileCard={(row) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{row.customer?.name ?? 'Customer removed'}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {row.booking.code} · {row.unit?.code ?? '—'}
                      {row.project ? ` · ${row.project.name}` : ''}
                    </p>
                  </div>
                  <Badge tone={STATE_META[row.state].tone}>{STATE_META[row.state].label}</Badge>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <p className="text-xs text-ink-muted">
                    {formatBdt(row.received)} of {formatBdt(row.total)} in
                    {row.next && (
                      <span className="block">
                        Next {formatDate(row.next.date)} · {formatBdt(row.next.amount)}
                      </span>
                    )}
                  </p>
                  <p className="text-right text-sm">
                    <span className="block text-xs text-ink-muted">{row.behind > 0.5 ? 'behind' : 'balance'}</span>
                    <span className={row.behind > 0.5 ? 'font-semibold text-red-600' : 'font-semibold text-ink'}>
                      {formatBdt(row.behind > 0.5 ? row.behind : row.balance)}
                    </span>
                  </p>
                </div>
                {row.balance > 0.5 && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setPayFor(row)}>
                    <CircleDollarSign className="size-4" /> Receive payment
                  </Button>
                )}
              </div>
            )}
            emptyState={
              <EmptyState
                icon={CircleDollarSign}
                title={state === 'behind' ? 'Nobody is behind' : 'No booking matches these filters'}
                description={
                  state === 'behind'
                    ? 'Every buyer has paid what their agreement asks for by today.'
                    : 'Bookings appear here as soon as they are made.'
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
          defaultAmount={payFor.behind > 0.5 ? payFor.behind : (payFor.next?.amount ?? undefined)}
          subtitle={`${payFor.customer?.name ?? payFor.booking.code} · balance ${formatBdt(payFor.balance)}`}
          onClose={() => setPayFor(null)}
        />
      )}
    </>
  );
}

/** The dashboard links in with ?state= (or the old ?status=overdue) and ?project=. */
export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <CollectionsPage />
    </Suspense>
  );
}
