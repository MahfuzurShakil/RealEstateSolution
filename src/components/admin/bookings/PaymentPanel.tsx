'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleDollarSign, Receipt, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Booking, Payment } from '@/lib/db/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/domain/booking';
import { bookingRepository, paymentRepository, userRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';
import { RecordPaymentModal } from './RecordPaymentModal';

/**
 * Receipts taken against a booking (Section 8.2 `payments`).
 *
 * The booking's "amount received" flag is derived from what is listed here, so
 * money can never be ticked off without saying when it came in, how, and
 * against which reference — which is what a receipt or an audit later needs.
 */
export function PaymentPanel({ booking }: { booking: Booking }) {
  const { userId } = useMockSession();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const payments = useLiveQuery(() => paymentRepository.listForBooking(booking.id), [booking.id]);
  const users = useLiveQuery(() => userRepository.getAll(), []);
  const received = (payments ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const outstanding = booking.final_price - received;

  const userName = (id?: string | null) =>
    users?.find((u) => u.id === id)?.name ?? '—';

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline p-3">
          <p className="text-xs text-ink-muted">Received</p>
          <p className="mt-1 text-lg font-semibold text-emerald-700">{formatBdt(received)}</p>
        </div>
        <div className="rounded-xl border border-hairline p-3">
          <p className="text-xs text-ink-muted">Outstanding</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatBdt(outstanding)}</p>
        </div>
        <div className="rounded-xl border border-hairline p-3">
          <p className="text-xs text-ink-muted">Booking money</p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {formatBdt(booking.booking_amount)}
          </p>
          <Badge tone={booking.booking_amount_received ? 'green' : 'amber'}>
            {booking.booking_amount_received ? 'Covered' : 'Not covered yet'}
          </Badge>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {payments === undefined
            ? 'Loading…'
            : `${payments.length} receipt${payments.length === 1 ? '' : 's'}`}
        </p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={outstanding <= 0}>
          <CircleDollarSign className="size-4" /> Record payment
        </Button>
      </div>

      {payments === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No money received yet"
          description="Record the booking money here — the date, how it was paid and the reference. The booking confirms itself once the full booking amount is in."
          action={
            <Button onClick={() => setOpen(true)}>
              <CircleDollarSign className="size-4" /> Record payment
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Reference</th>
                <th className="py-2 pr-3">Received by</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-hairline last:border-0">
                  <td className="py-2.5 pr-3 text-ink">{formatDate(payment.payment_date)}</td>
                  <td className="py-2.5 pr-3 font-medium text-ink">{formatBdt(payment.amount)}</td>
                  <td className="py-2.5 pr-3">
                    <Badge>{PAYMENT_METHOD_LABEL[payment.payment_method]}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-ink-muted">{payment.reference_no || '—'}</td>
                  <td className="py-2.5 pr-3 text-ink-muted">{userName(payment.received_by)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete receipt"
                      onClick={() => setDeleteTarget(payment)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        The full instalment schedule — monthly dues, milestones, overdue tracking — is raised in
        the Finance module. These receipts feed straight into it.
      </p>

      <RecordPaymentModal
        open={open}
        booking={booking}
        onClose={() => setOpen(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this receipt"
        subtitle={deleteTarget ? formatBdt(deleteTarget.amount) : ''}
        confirmLabel="Delete receipt"
        message="Only delete a receipt entered by mistake. The booking status is recalculated from what is left, so it may drop back out of Confirmed."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await bookingRepository.removePayment(booking.id, deleteTarget.id, userId);
          }
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
