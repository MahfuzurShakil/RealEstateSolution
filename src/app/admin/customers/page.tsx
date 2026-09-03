'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BriefcaseBusiness, Mail, Phone, Plus, Search, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ResultCard } from '@/components/ui/ResultCard';
import { ResultsLayout, ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { BOOKING_STATUS_META } from '@/lib/domain/booking';
import { bookingRepository, customerRepository } from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

type SortKey = 'newest' | 'oldest' | 'name' | 'value_high' | 'bookings';
type BookingState = 'any' | 'none' | 'active' | 'confirmed';

const EMPTY_FILTERS = {
  name: '',
  phone: '',
  nid: '',
  profession: '',
  booking_state: 'any' as BookingState,
};

/** Customer list — Design Reference A.7, profile-style cards (A.10). */
export default function CustomersListPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('grid');

  const set = <K extends keyof typeof EMPTY_FILTERS>(
    key: K,
    value: (typeof EMPTY_FILTERS)[K],
  ) => setFilters((f) => ({ ...f, [key]: value }));

  const customers = useLiveQuery(
    () => customerRepository.list(filters),
    [filters.name, filters.phone, filters.nid, filters.profession, filters.booking_state],
  );
  const allCustomers = useLiveQuery(() => customerRepository.getAll(), []);
  const bookings = useLiveQuery(() => bookingRepository.getAll(), []);

  /** Booking roll-up per customer, so a card can show what they hold. */
  const statsByCustomer = useMemo(() => {
    const map = new Map<string, { count: number; value: number; confirmed: number }>();
    for (const booking of bookings ?? []) {
      const entry = map.get(booking.customer_id) ?? { count: 0, value: 0, confirmed: 0 };
      if (booking.status !== 'cancelled') {
        entry.count += 1;
        entry.value += Number(booking.final_price) || 0;
        if (booking.status === 'confirmed') entry.confirmed += 1;
      }
      map.set(booking.customer_id, entry);
    }
    return map;
  }, [bookings]);

  const rows = useMemo(() => {
    const list = [...(customers ?? [])];
    const value = (id: string) => statsByCustomer.get(id)?.value ?? 0;
    const count = (id: string) => statsByCustomer.get(id)?.count ?? 0;
    switch (sort) {
      case 'oldest':
        return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'value_high':
        return list.sort((a, b) => value(b.id) - value(a.id));
      case 'bookings':
        return list.sort((a, b) => count(b.id) - count(a.id));
      default:
        return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [customers, sort, statsByCustomer]);

  const paged = usePagination(rows);

  const loading = customers === undefined;
  const hasAny = (allCustomers?.length ?? 0) > 0;
  const filtersActive =
    Boolean(filters.name || filters.phone || filters.nid || filters.profession) ||
    filters.booking_state !== 'any';

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Buyers converted from leads, with the units they hold."
        action={
          <Link href="/admin/customers/new">
            <Button>
              <Plus className="size-4" /> Add Customer
            </Button>
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="min-w-0 space-y-5">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">Filters</h2>
            <div className="space-y-4">
              {/* one box per thing you might actually know about a buyer */}
              <Field label="Name / code / email">
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <TextInput
                    value={filters.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="e.g. Kamrul"
                    className="pr-9"
                  />
                </div>
              </Field>

              <Field label="Phone">
                <TextInput
                  value={filters.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="e.g. 01866"
                />
              </Field>

              <Field label="NID">
                <TextInput
                  value={filters.nid}
                  onChange={(e) => set('nid', e.target.value)}
                  placeholder="e.g. 1985447"
                />
              </Field>

              <Field label="Profession">
                <TextInput
                  value={filters.profession}
                  onChange={(e) => set('profession', e.target.value)}
                  placeholder="e.g. Doctor"
                />
              </Field>

              <Field label="Bookings">
                <SelectInput
                  value={filters.booking_state}
                  onChange={(e) => set('booking_state', e.target.value as BookingState)}
                >
                  <option value="any">Any</option>
                  <option value="active">Has an active booking</option>
                  <option value="confirmed">Has a confirmed booking</option>
                  <option value="none">No booking yet</option>
                </SelectInput>
              </Field>

              {filtersActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
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
                : `Showing ${rows.length} customer${rows.length === 1 ? '' : 's'}`}
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
                <option value="name">Name A–Z</option>
                <option value="value_high">Booking value</option>
                <option value="bookings">Most bookings</option>
              </SelectInput>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-2xl border border-hairline bg-white"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title={hasAny ? 'No customer matches these filters' : 'No customer yet'}
              description={
                hasAny
                  ? 'Try a different name, phone number or NID.'
                  : 'A customer is created when a lead commits to a unit — or add a walk-in buyer directly.'
              }
              action={
                hasAny ? (
                  <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/admin/customers/new">
                    <Button>
                      <Plus className="size-4" /> Add Customer
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <ResultsLayout view={view}>
                {paged.pageRows.map((customer) => {
                  const stats = statsByCustomer.get(customer.id);
                  return (
                    <ResultCard
                      key={customer.id}
                      href={`/admin/customers/${customer.id}`}
                      view={view}
                      // contact and booking facts are short, evenly sized
                      // labels — they fill a wide row rather than hugging its
                      // left edge, which is why only this list uses the row
                      // layout
                      listLayout="row"
                      code={customer.code}
                      title={customer.name}
                      subtitle={
                        customer.profession ? (
                          <span className="flex items-center gap-1.5">
                            <BriefcaseBusiness className="size-3" />
                            {customer.profession}
                          </span>
                        ) : undefined
                      }
                      leading={
                        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                          <UserRound className="size-5" />
                        </span>
                      }
                      status={
                        stats && stats.count > 0 ? (
                          <Badge tone={BOOKING_STATUS_META.confirmed.tone}>
                            {stats.confirmed > 0
                              ? `${stats.confirmed} confirmed`
                              : `${stats.count} booking${stats.count === 1 ? '' : 's'}`}
                          </Badge>
                        ) : (
                          <Badge tone="amber">No active booking</Badge>
                        )
                      }
                      footer={`Added ${formatDate(customer.created_at)}`}
                      /* contact on one side, booking facts spread across —
                         previously everything hugged the left of a wide row */
                      facts={
                        <>
                          <Badge>
                            <Phone className="size-3.5" />
                            {formatPhone(customer.phone)}
                          </Badge>
                          {customer.email && (
                            <Badge>
                              <Mail className="size-3.5" />
                              <span className="max-w-[14rem] truncate">{customer.email}</span>
                            </Badge>
                          )}
                          {customer.nid && <Badge>NID {customer.nid}</Badge>}
                          {stats && stats.count > 0 && (
                            <>
                              <Badge tone="teal">
                                {stats.count} booking{stats.count === 1 ? '' : 's'}
                              </Badge>
                              <Badge>{formatBdt(stats.value )}</Badge>
                            </>
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
                label="customers"
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
