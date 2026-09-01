'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Building2,
  FileSignature,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { BOOKING_STATUS_META } from '@/lib/domain/booking';
import { LEAD_STATUS_META } from '@/lib/domain/lead';
import { customerRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

type Tab = 'overview' | 'bookings' | 'documents';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** Customer detail — Design Reference A.11 (profile card + related records). */
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const customer = useLiveQuery(() => customerRepository.getWithRelations(id), [id]);

  if (customer === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!customer) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This customer no longer exists.</p>
        <Link href="/admin/customers" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to customers
          </Button>
        </Link>
      </Card>
    );
  }

  const active = customer.bookings.filter((b) => b.status !== 'cancelled');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'bookings', label: `Bookings (${customer.bookings.length})` },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <>
      <Link
        href="/admin/customers"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to customers
      </Link>

      <PageHeader
        title={customer.name}
        subtitle={`${customer.code} · ${formatPhone(customer.phone)}`}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/bookings/new?customer=${customer.id}`}>
              <Button variant="outline">
                <Plus className="size-4" /> Book a unit
              </Button>
            </Link>
            <Link href={`/admin/customers/${customer.id}/edit`}>
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
        <div className="min-w-0 lg:order-1">
          <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-hairline bg-white p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'bg-admin-500 text-white'
                    : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <Card>
              <CardHeader title="Customer Information" />
              <Row label="Name" value={customer.name} />
              <Row label="Code" value={customer.code} />
              <Row
                label="Phone"
                value={
                  <a href={`tel:${customer.phone}`} className="text-admin-700 hover:underline">
                    {formatPhone(customer.phone)}
                  </a>
                }
              />
              <Row
                label="Email"
                value={
                  customer.email ? (
                    <a
                      href={`mailto:${customer.email}`}
                      className="text-admin-700 hover:underline"
                    >
                      {customer.email}
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
              <Row label="NID" value={customer.nid} />
              <Row label="Profession" value={customer.profession} />
              <Row label="Address" value={customer.address} />
              <Row label="Customer since" value={formatDate(customer.created_at)} />
            </Card>
          )}

          {tab === 'bookings' && (
            <Card>
              <CardHeader
                title="Bookings"
                action={
                  <Link href={`/admin/bookings/new?customer=${customer.id}`}>
                    <Button size="sm">
                      <Plus className="size-4" /> Book a unit
                    </Button>
                  </Link>
                }
              />
              {customer.bookings.length === 0 ? (
                <EmptyState
                  icon={FileSignature}
                  title="No booking yet"
                  description="This customer has not taken a unit. Book one to get started."
                  action={
                    <Link href={`/admin/bookings/new?customer=${customer.id}`}>
                      <Button>
                        <Plus className="size-4" /> Book a unit
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {customer.bookings.map((booking) => (
                    <li key={booking.id}>
                      <Link
                        href={`/admin/bookings/${booking.id}`}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                          <Building2 className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{booking.code}</p>
                          <p className="text-xs text-ink-muted">
                            {formatDate(booking.booking_date)} ·{' '}
                            {formatBdt(booking.final_price, { compact: true })}
                            {booking.status !== 'cancelled' && (
                              <>
                                {' · '}
                                {formatBdt(
                                  customer.finance.received_by_booking[booking.id] ?? 0,
                                  { compact: true },
                                )}{' '}
                                received
                                {booking.installment_tenure_months
                                  ? ` · ${booking.installment_tenure_months}-month plan`
                                  : ''}
                              </>
                            )}
                          </p>
                        </div>
                        <Badge tone={BOOKING_STATUS_META[booking.status].tone}>
                          {BOOKING_STATUS_META[booking.status].label}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" />
              <DocumentsPanel entityType="customer" entityId={customer.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <Card>
            <div className="flex flex-col items-center text-center">
              <span className="mb-3 grid size-16 place-items-center rounded-full bg-admin-50 text-admin-600">
                <UserRound className="size-8" />
              </span>
              <p className="text-base font-semibold text-ink">{customer.name}</p>
              <p className="text-sm text-ink-muted">{customer.profession ?? 'Customer'}</p>
              <a href={`tel:${customer.phone}`} className="mt-3 w-full">
                <Button variant="outline" size="sm" className="w-full">
                  Call {formatPhone(customer.phone)}
                </Button>
              </a>
            </div>
          </Card>

          <Card>
            <CardHeader title="Holdings" />
            <Row label="Active bookings" value={active.length} />
            <Row
              label="Confirmed"
              value={active.filter((b) => b.status === 'confirmed').length}
            />
            <Row
              label="Cancelled"
              value={customer.bookings.filter((b) => b.status === 'cancelled').length}
            />
          </Card>

          {/*
            Instalments belong to a booking, not to a customer — two flats mean
            two schedules — so what a customer page can honestly show is the
            total across them.
          */}
          <Card>
            <CardHeader title="Money" />
            <Row label="Total value" value={formatBdt(customer.finance.total_value)} />
            <Row
              label="Received"
              value={
                <span className="text-emerald-700">
                  {formatBdt(customer.finance.total_received)}
                </span>
              }
            />
            <Row label="Outstanding" value={formatBdt(customer.finance.outstanding)} />
            {customer.finance.total_value > 0 && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width]"
                    style={{
                      width: `${Math.min(
                        100,
                        (customer.finance.total_received / customer.finance.total_value) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  {Math.round(
                    (customer.finance.total_received / customer.finance.total_value) * 100,
                  )}
                  % collected. The instalment schedule behind these numbers is raised in the
                  Finance module.
                </p>
              </div>
            )}
          </Card>

          {customer.lead && (
            <Card>
              <CardHeader title="Origin" />
              <Link
                href={`/admin/leads/${customer.lead.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-hairline p-3 text-sm transition-colors hover:bg-admin-50/60"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {customer.lead.code}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    Converted from this lead
                  </span>
                </span>
                <Badge tone={LEAD_STATUS_META[customer.lead.status].tone}>
                  {LEAD_STATUS_META[customer.lead.status].label}
                </Badge>
              </Link>
            </Card>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${customer.code}`}
        subtitle={customer.name}
        confirmLabel="Delete customer"
        message={
          deleteError ||
          'This deletes the customer record and its documents. It cannot be undone.'
        }
        tone={deleteError ? 'warning' : 'danger'}
        onCancel={() => {
          setConfirmDelete(false);
          setDeleteError('');
        }}
        onConfirm={async () => {
          const result = await customerRepository.removeCascade(customer.id);
          if (!result.removed) {
            setDeleteError(result.reason ?? 'This customer cannot be deleted.');
            return;
          }
          router.push('/admin/customers');
        }}
      />
    </>
  );
}
