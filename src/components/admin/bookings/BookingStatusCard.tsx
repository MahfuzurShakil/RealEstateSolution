'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Ban, BadgeCheck, Check, CircleDollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, TextArea } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Booking } from '@/lib/db/types';
import { BOOKING_PIPELINE_STEPS, BOOKING_STATUS_META } from '@/lib/domain/booking';
import { bookingRepository, paymentRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';
import { RecordPaymentModal } from './RecordPaymentModal';

/**
 * Booking status (SALES-FLOW-PLAN.md S1). Status is never chosen here: the
 * booking money comes in and the booking confirms. The only thing a person
 * does by hand is cancel.
 */
export function BookingStatusCard({ booking }: { booking: Booking }) {
  const { userId } = useMockSession();
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const received = useLiveQuery(() => paymentRepository.totalForBooking(booking.id), [booking.id]);

  const isCancelled = booking.status === 'cancelled';
  const currentIndex = BOOKING_PIPELINE_STEPS.indexOf(booking.status);
  const bookingMoneyLeft = Math.max(booking.booking_amount - (received ?? 0), 0);

  async function cancel() {
    if (!note.trim()) {
      setError('A reason is required');
      return;
    }
    setBusy(true);
    try {
      await bookingRepository.cancel(booking.id, note.trim(), userId);
      setCancelling(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Booking Status"
          action={
            <Badge tone={BOOKING_STATUS_META[booking.status].tone}>
              {BOOKING_STATUS_META[booking.status].label}
            </Badge>
          }
        />

        {isCancelled ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">Booking cancelled</p>
            {booking.cancellation_reason && (
              <p className="mt-1 whitespace-pre-wrap text-xs text-red-600">
                {booking.cancellation_reason}
              </p>
            )}
            <p className="mt-2 text-xs text-red-600/80">The unit has been released.</p>
          </div>
        ) : (
          <ol className="mb-4 space-y-2">
            {BOOKING_PIPELINE_STEPS.map((step, i) => {
              const done = i < currentIndex || (step === 'confirmed' && currentIndex === i);
              const current = i === currentIndex && step !== 'confirmed';
              return (
                <li key={step} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                      done && 'bg-admin-500 text-white',
                      current && 'bg-admin-100 text-admin-700 ring-2 ring-admin-300',
                      !done && !current && 'bg-slate-100 text-slate-400',
                    )}
                  >
                    {done ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      'text-sm',
                      current || done ? 'font-medium text-ink' : 'text-slate-400',
                    )}
                  >
                    {BOOKING_STATUS_META[step].label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {booking.status === 'hold' && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">Waiting for the booking money</p>
            <p className="mt-1 text-xs text-amber-700">
              {formatBdt(received ?? 0)} of {formatBdt(booking.booking_amount)} received —{' '}
              {formatBdt(bookingMoneyLeft)} more confirms the booking.
            </p>
            <Button size="sm" className="mt-3 w-full" onClick={() => setPaying(true)}>
              <CircleDollarSign className="size-4" /> Receive booking money
            </Button>
          </div>
        )}

        {booking.status === 'confirmed' && (
          <p className="mb-4 flex items-start gap-2 text-xs text-emerald-700">
            <BadgeCheck className="mt-0.5 size-3.5 shrink-0" />
            Confirmed — the booking money is in and the unit is marked booked.
          </p>
        )}

        {!isCancelled && (
          <Button
            size="sm"
            variant="danger"
            className="w-full"
            onClick={() => {
              setNote('');
              setError('');
              setCancelling(true);
            }}
          >
            <Ban className="size-4" /> Cancel booking
          </Button>
        )}
      </Card>

      <RecordPaymentModal
        open={paying}
        booking={booking}
        defaultAmount={bookingMoneyLeft}
        onClose={() => setPaying(false)}
      />

      <ConfirmDialog
        open={cancelling}
        title={`Cancel ${booking.code}`}
        subtitle={booking.code}
        tone="danger"
        icon={Ban}
        confirmLabel="Cancel booking"
        message={
          received && received > 0
            ? `The unit is released back to Available. ${formatBdt(received)} has already been received — refund it from the booking page afterwards. A reason is required.`
            : 'The unit is released back to Available. A reason is required.'
        }
        busy={busy}
        onCancel={() => setCancelling(false)}
        onConfirm={cancel}
      >
        <Field label="Reason (required)" error={error || undefined}>
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is the booking being cancelled?"
            invalid={Boolean(error)}
          />
        </Field>
      </ConfirmDialog>
    </>
  );
}
