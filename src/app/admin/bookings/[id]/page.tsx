'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Building2, Pencil, Trash2, Undo2, UserRound } from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { BookingStatusCard } from '@/components/admin/bookings/BookingStatusCard';
import { InstallmentSchedulePanel } from '@/components/admin/finance/InstallmentSchedulePanel';
import { RefundModal } from '@/components/admin/finance/RefundModal';
import { PaymentPanel } from '@/components/admin/bookings/PaymentPanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { BOOKING_STATUS_META } from '@/lib/domain/booking';
import { LEAD_STATUS_META } from '@/lib/domain/lead';
import { UNIT_STATUS_META } from '@/lib/domain/project';
import { bookingRepository, refundRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

type Tab = 'overview' | 'schedule' | 'payments' | 'documents';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** Booking detail — Design Reference A.8. */
export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const booking = useLiveQuery(() => bookingRepository.getWithRelations(id), [id]);
  // Section 8.2 — what a cancelled booking still owes the buyer back
  const refundable = useLiveQuery(() => refundRepository.refundableFor(id), [id]);
  const refunds = useLiveQuery(() => refundRepository.listForBooking(id), [id]);

  if (booking === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!booking) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This booking no longer exists.</p>
        <Link href="/admin/bookings" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to bookings
          </Button>
        </Link>
      </Card>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'schedule', label: 'Instalments' },
    { key: 'payments', label: 'Payments' },
    { key: 'documents', label: 'Documents' },
  ];

  const priceRows: Array<[string, number, boolean?]> = [
    ['Base price', booking.base_price],
    ['Floor premium', booking.floor_premium],
    ['Facing premium', booking.facing_premium],
    ['Parking charge', booking.parking_charge],
    ['Other charges', booking.other_charges],
    ['Discount', -booking.discount_amount, true],
  ];

  return (
    <>
      <Link
        href="/admin/bookings"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to bookings
      </Link>

      <PageHeader
        title={booking.customer?.name ?? 'Booking'}
        subtitle={`${booking.code} · ${booking.unit?.code ?? 'unit removed'}${
          booking.project ? ` · ${booking.project.name}` : ''
        }`}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/bookings/${booking.id}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" /> Edit
              </Button>
            </Link>
            <Button variant="dangerGhost" onClick={() => setConfirmDelete(true)}>
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
            <div className="space-y-5">
              <Card>
                <CardHeader title="Price Breakdown" />
                <dl className="space-y-2 text-sm">
                  {priceRows.map(([label, value, isDiscount]) =>
                    value === 0 && isDiscount ? null : (
                      <div key={label} className="flex justify-between gap-4">
                        <dt className="text-ink-muted">{label}</dt>
                        <dd className={isDiscount ? 'text-red-600' : 'text-ink'}>
                          {isDiscount ? `− ${formatBdt(Math.abs(value))}` : formatBdt(value)}
                        </dd>
                      </div>
                    ),
                  )}
                  <div className="flex justify-between gap-4 border-t border-hairline pt-2 text-base font-semibold">
                    <dt className="text-ink">Final price</dt>
                    <dd className="text-ink">{formatBdt(booking.final_price)}</dd>
                  </div>
                </dl>

                <div className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-hairline p-3">
                    <p className="text-xs text-ink-muted">Booking amount</p>
                    <p className="mt-1 text-lg font-semibold text-ink">
                      {formatBdt(booking.booking_amount)}
                    </p>
                    <Badge tone={booking.booking_amount_received ? 'green' : 'amber'}>
                      {booking.booking_amount_received ? 'Received' : 'Not received'}
                    </Badge>
                  </div>
                  <div className="rounded-xl border border-hairline p-3">
                    <p className="text-xs text-ink-muted">Received so far</p>
                    <p className="mt-1 text-lg font-semibold text-ink">
                      {formatBdt(booking.amount_received)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatBdt(booking.final_price - booking.amount_received)} outstanding
                      {booking.installment_tenure_months
                        ? ` · ${booking.installment_tenure_months}-month plan`
                        : ''}
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title="Customer" />
                {booking.customer ? (
                  <Link
                    href={`/admin/customers/${booking.customer.id}`}
                    className="flex items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                      <UserRound className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {booking.customer.name}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {booking.customer.code} · {formatPhone(booking.customer.phone)}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <p className="text-sm text-ink-muted">Customer record is missing.</p>
                )}

                {booking.lead && (
                  <Link
                    href={`/admin/leads/${booking.lead.id}`}
                    className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-hairline p-3 text-sm transition-colors hover:bg-admin-50/60"
                  >
                    <span className="text-ink-muted">
                      Converted from lead {booking.lead.code}
                    </span>
                    <Badge tone={LEAD_STATUS_META[booking.lead.status].tone}>
                      {LEAD_STATUS_META[booking.lead.status].label}
                    </Badge>
                  </Link>
                )}
              </Card>

              <Card>
                <CardHeader title="Unit" />
                {booking.unit ? (
                  <>
                    <Link
                      href={`/admin/projects/${booking.project?.id ?? ''}`}
                      className="flex items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                        <Building2 className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {booking.unit.code} · {booking.tower?.name}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {booking.project?.name}
                          {booking.project?.location_summary &&
                            ` · ${booking.project.location_summary}`}
                        </p>
                      </div>
                      <Badge tone={UNIT_STATUS_META[booking.unit.status].tone}>
                        {UNIT_STATUS_META[booking.unit.status].label}
                      </Badge>
                    </Link>
                    <div className="mt-3">
                      <Row label="Type" value={booking.unit.unit_type} />
                      <Row label="Floor" value={booking.unit.floor} />
                      <Row label="Size" value={`${booking.unit.size_sqft} sqft`} />
                      <Row label="Facing" value={booking.unit.facing} />
                      <Row label="Parking" value={booking.unit.parking_allocated} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">Unit record is missing.</p>
                )}
              </Card>
            </div>
          )}

          {/* Section 8.2 — the schedule the receipts are measured against */}
          {tab === 'schedule' && <InstallmentSchedulePanel booking={booking} />}

          {tab === 'payments' && (
            <Card>
              <CardHeader title="Payments received" />
              <PaymentPanel booking={booking} />
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" />
              <DocumentsPanel entityType="booking" entityId={booking.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <BookingStatusCard booking={booking} />

          {/*
            Section 8.2 — a cancelled booking is not finished until the money
            the buyer put in has been dealt with, so the card appears the
            moment it is cancelled rather than being buried on another screen.
          */}
          {booking.status === 'cancelled' && (refundable?.paid ?? 0) > 0 && (
            <Card>
              <CardHeader
                title="Refund"
                action={
                  (refundable?.left ?? 0) <= 0.009 ? (
                    <Badge tone="green">Settled</Badge>
                  ) : (
                    <Badge tone="amber">Owed back</Badge>
                  )
                }
              />
              <Row label="Buyer paid" value={formatBdt(refundable?.paid ?? 0)} />
              <Row label="Already refunded" value={formatBdt(refundable?.refunded ?? 0)} />
              <Row
                label="Left to refund"
                value={
                  (refundable?.left ?? 0) > 0.009 ? (
                    <span className="text-amber-600">{formatBdt(refundable?.left ?? 0)}</span>
                  ) : (
                    <span className="text-emerald-700">Nothing outstanding</span>
                  )
                }
              />

              {(refunds ?? []).length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-hairline pt-3">
                  {(refunds ?? []).map((refund) => (
                    <li key={refund.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-ink-muted">
                        {refund.code} · {formatDate(refund.refund_date)}
                      </span>
                      <span className="font-medium text-ink">{formatBdt(refund.net_refund)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {(refundable?.left ?? 0) > 0.009 && (
                <Button size="sm" className="mt-3 w-full" onClick={() => setRefundOpen(true)}>
                  <Undo2 className="size-4" /> Refund the buyer
                </Button>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Record" />
            <Row label="Status" value={BOOKING_STATUS_META[booking.status].label} />
            <Row label="Booking date" value={formatDate(booking.booking_date)} />
            <Row label="Booked by" value={booking.seller?.name} />
            <Row label="Approved by" value={booking.approver?.name} />
            <Row label="Created" value={formatDate(booking.created_at)} />
            <Row label="Last updated" value={formatDate(booking.updated_at)} />
          </Card>
        </aside>
      </div>

      <RefundModal open={refundOpen} booking={booking} onClose={() => setRefundOpen(false)} />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${booking.code}`}
        subtitle={booking.customer?.name}
        confirmLabel="Delete booking"
        message="This deletes the booking and its documents, and releases the unit back to Available. Cancelling instead keeps the record and the reason — that is usually what you want."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await bookingRepository.removeCascade(booking.id);
          router.push('/admin/bookings');
        }}
      />
    </>
  );
}
