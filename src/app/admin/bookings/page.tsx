'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  FileSignature,
  Plus,
  Search,
  ShieldAlert,
  UserRound,
  Wallet,
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
import { BOOKING_STATUSES, type BookingStatus } from '@/lib/db/types';
import {
  BOOKING_STATUS_META,
  DISCOUNT_APPROVAL_META,
  discountPct,
} from '@/lib/domain/booking';
import {
  bookingRepository,
  customerRepository,
  projectRepository,
  unitRepository,
  userRepository,
} from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

type SortKey = 'newest' | 'oldest' | 'value_high' | 'value_low';

/** Booking list — Design Reference A.7, with the approval queue on top. */
export default function BookingsListPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BookingStatus | 'all'>('all');
  const [projectId, setProjectId] = useState('');
  const [bookedBy, setBookedBy] = useState('all');
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('list');

  const bookings = useLiveQuery(
    () =>
      bookingRepository.list({
        search,
        status,
        project_id: projectId || undefined,
        booked_by: bookedBy,
        awaiting_approval: awaitingOnly,
      }),
    [search, status, projectId, bookedBy, awaitingOnly],
  );

  const allBookings = useLiveQuery(() => bookingRepository.getAll(), []);
  const customers = useLiveQuery(() => customerRepository.getAll(), []);
  const units = useLiveQuery(() => unitRepository.getAll(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);
  const salesTeam = useLiveQuery(() => userRepository.salesTeam(), []);

  const customerById = useMemo(
    () => new Map((customers ?? []).map((c) => [c.id, c])),
    [customers],
  );
  const unitById = useMemo(() => new Map((units ?? []).map((u) => [u.id, u])), [units]);
  const sellerById = useMemo(
    () => new Map((salesTeam ?? []).map((u) => [u.id, u])),
    [salesTeam],
  );

  const pendingCount = useMemo(
    () => (allBookings ?? []).filter((b) => b.discount_approval_status === 'pending').length,
    [allBookings],
  );

  const rows = useMemo(() => {
    const list = [...(bookings ?? [])];
    switch (sort) {
      case 'oldest':
        return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      case 'value_high':
        return list.sort((a, b) => b.final_price - a.final_price);
      case 'value_low':
        return list.sort((a, b) => a.final_price - b.final_price);
      default:
        return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [bookings, sort]);

  const paged = usePagination(rows);

  const loading = bookings === undefined;
  const hasAny = (allBookings?.length ?? 0) > 0;
  const filtersActive =
    Boolean(search) || status !== 'all' || Boolean(projectId) || bookedBy !== 'all' || awaitingOnly;

  function resetFilters() {
    setSearch('');
    setStatus('all');
    setProjectId('');
    setBookedBy('all');
    setAwaitingOnly(false);
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Units taken by customers — on hold, awaiting discount approval, confirmed or cancelled."
        action={
          <Link href="/admin/bookings/new">
            <Button>
              <Plus className="size-4" /> Add Booking
            </Button>
          </Link>
        }
      />

      {pendingCount > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white p-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <ShieldAlert className="size-5" />
          </span>
          <p className="mr-auto text-sm text-ink">
            <span className="font-semibold">Discount approvals:</span>{' '}
            <span className="text-amber-600">
              {pendingCount} booking{pendingCount === 1 ? '' : 's'} waiting
            </span>
          </p>
          <Button
            size="sm"
            variant={awaitingOnly ? 'primary' : 'outline'}
            onClick={() => setAwaitingOnly(!awaitingOnly)}
          >
            {awaitingOnly ? 'Show all' : 'Show pending'}
          </Button>
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
                    placeholder="Code, customer, unit…"
                    className="pr-9"
                  />
                </div>
              </Field>

              <Field label="Status">
                <SelectInput
                  value={status}
                  onChange={(e) => setStatus(e.target.value as BookingStatus | 'all')}
                >
                  <option value="all">All statuses</option>
                  {BOOKING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {BOOKING_STATUS_META[s].label}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Project">
                <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">All projects</option>
                  {(projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Booked By">
                <SelectInput value={bookedBy} onChange={(e) => setBookedBy(e.target.value)}>
                  <option value="all">Everyone</option>
                  {(salesTeam ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>

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
              {loading
                ? 'Loading…'
                : `Showing ${rows.length} booking${rows.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex items-center gap-2">
              <ViewToggle value={view} onChange={setView} />
              <SelectInput
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-auto max-w-[13rem]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="value_high">Value: high to low</option>
                <option value="value_low">Value: low to high</option>
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
              icon={FileSignature}
              title={hasAny ? 'No booking matches these filters' : 'No booking yet'}
              description={
                hasAny
                  ? 'Try clearing a filter or searching for a different code.'
                  : 'When a lead commits to a unit, book it here — the customer record comes across from the lead.'
              }
              action={
                hasAny ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/admin/bookings/new">
                    <Button>
                      <Plus className="size-4" /> Add Booking
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <ResultsLayout view={view}>
                {paged.pageRows.map((booking) => {
                  const meta = BOOKING_STATUS_META[booking.status];
                  const customer = customerById.get(booking.customer_id);
                  const unit = unitById.get(booking.unit_id);
                  const seller = booking.booked_by ? sellerById.get(booking.booked_by) : undefined;
                  const pct = discountPct(booking.base_price, booking.discount_amount);

                  return (
                    <ResultCard
                      key={booking.id}
                      href={`/admin/bookings/${booking.id}`}
                      view={view}
                      code={booking.code}
                      title={customer?.name ?? 'Unknown customer'}
                      status={
                        <>
                          {booking.discount_approval_status === 'pending' && (
                            <Badge tone="amber">
                              <ShieldAlert className="size-3.5" /> Approval pending
                            </Badge>
                          )}
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </>
                      }
                      footer={`Booked ${formatDate(booking.booking_date)}`}
                      facts={
                        <>
                          {unit && (
                            <Badge tone="teal">
                              <Building2 className="size-3.5" />
                              {unit.code} · {unit.size_sqft} sqft
                            </Badge>
                          )}
                          <Badge>
                            <Wallet className="size-3.5" />
                            {formatBdt(booking.final_price )}
                          </Badge>
                          {booking.discount_amount > 0 && (
                            <Badge
                              tone={DISCOUNT_APPROVAL_META[booking.discount_approval_status].tone}
                            >
                              {pct.toFixed(1)}% discount
                            </Badge>
                          )}
                          <Badge tone={booking.booking_amount_received ? 'green' : 'amber'}>
                            {booking.booking_amount_received ? 'Amount received' : 'Amount pending'}
                          </Badge>
                          {seller && (
                            <Badge tone="blue">
                              <UserRound className="size-3.5" />
                              {seller.name}
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
                label="bookings"
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
