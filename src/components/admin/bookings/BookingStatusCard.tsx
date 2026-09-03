'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BadgeCheck, Ban, Check, ShieldCheck, ShieldX } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, TextArea } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Booking } from '@/lib/db/types';
import {
  BOOKING_PIPELINE_STEPS,
  BOOKING_STATUS_META,
  DISCOUNT_APPROVAL_META,
  blockersForConfirm,
  canApproveDiscount,
  discountApprovalExplanation,
  discountPct,
} from '@/lib/domain/booking';
import {
  bookingRepository,
  discountApprovalRuleRepository,
  paymentRepository,
  userRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

type Action = 'approve' | 'reject' | 'resubmit' | 'cancel';

/**
 * The gating panel (Section 5.2 / 5.6). Status is never chosen here — the two
 * facts are set, and the status follows. What is still blocking confirmation
 * is spelled out rather than left for the user to work out.
 */
export function BookingStatusCard({ booking }: { booking: Booking }) {
  const { userId, role } = useMockSession();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /** the seller's ceiling, so the explanation can quote a real number */
  const seller = useLiveQuery(
    () => (booking.booked_by ? userRepository.getById(booking.booked_by) : Promise.resolve(undefined)),
    [booking.booked_by],
  );
  const ceiling = useLiveQuery(
    () => discountApprovalRuleRepository.maxDiscountPctFor(seller?.role),
    [seller?.role],
  );
  const received = useLiveQuery(() => paymentRepository.totalForBooking(booking.id), [booking.id]);

  const isCancelled = booking.status === 'cancelled';
  const currentIndex = BOOKING_PIPELINE_STEPS.indexOf(booking.status);
  const blockers = blockersForConfirm(booking);
  const pct = discountPct(booking.base_price, booking.discount_amount);
  const mayApprove = canApproveDiscount(role);
  const awaitingApproval = booking.discount_approval_status === 'pending';
  const wasRejected = booking.discount_approval_status === 'rejected';

  function open(next: Action) {
    setAction(next);
    setNote('');
    setError('');
  }

  async function confirm() {
    if (!action) return;
    if ((action === 'cancel' || action === 'reject') && !note.trim()) {
      setError('A reason is required');
      return;
    }
    setBusy(true);
    try {
      if (action === 'approve') await bookingRepository.decideDiscount(booking.id, 'approved', userId, note, userId);
      if (action === 'reject') await bookingRepository.decideDiscount(booking.id, 'rejected', userId, note, userId);
      if (action === 'resubmit') await bookingRepository.resubmitDiscount(booking.id, note, userId);
      if (action === 'cancel') await bookingRepository.cancel(booking.id, note.trim(), userId);
      setAction(null);
    } finally {
      setBusy(false);
    }
  }

  const dialog: Record<
    Action,
    {
      title: string;
      message: string;
      confirmLabel: string;
      tone: 'default' | 'danger' | 'success' | 'warning';
      needsNote: boolean;
    }
  > = {
    approve: {
      title: 'Approve this discount',
      message: `${pct.toFixed(2)}% (${formatBdt(booking.discount_amount)}) will be approved. If the booking amount is already received, the booking confirms straight away.`,
      confirmLabel: 'Approve discount',
      tone: 'success',
      needsNote: false,
    },
    reject: {
      title: 'Reject this discount',
      message:
        'The booking goes back to Hold. The sales person can adjust the discount and submit it again.',
      confirmLabel: 'Reject discount',
      tone: 'danger',
      needsNote: true,
    },
    resubmit: {
      title: 'Send this discount back for approval',
      message: `${pct.toFixed(2)}% (${formatBdt(
        booking.discount_amount,
      )}) goes back into the approval queue unchanged. If the figure should come down instead, edit the booking — a discount inside the seller's limit needs no approval at all.`,
      confirmLabel: 'Resubmit for approval',
      tone: 'default',
      needsNote: false,
    },
    cancel: {
      title: `Cancel ${booking.code}`,
      message:
        received && received > 0
          ? `The unit is released back to Available. ${formatBdt(received)} has already been received — a refund is raised in the Finance module. A reason is required.`
          : 'The unit is released back to Available. A reason is required.',
      confirmLabel: 'Cancel booking',
      tone: 'danger',
      needsNote: true,
    },
  };

  const config = action ? dialog[action] : null;

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
              // pending_approval is skipped entirely when no approval is needed
              const skipped =
                step === 'pending_approval' &&
                booking.discount_approval_status === 'not_required';
              const done = i < currentIndex;
              const current = i === currentIndex;
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
                      current ? 'font-medium text-ink' : done ? 'text-ink-muted' : 'text-slate-400',
                      skipped && 'line-through',
                    )}
                  >
                    {BOOKING_STATUS_META[step].label}
                    {skipped && <span className="ml-1 text-xs">(not needed)</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {!isCancelled && booking.status !== 'confirmed' && blockers.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">Before this can confirm</p>
            <ul className="mt-1 space-y-1 text-xs text-amber-700">
              {blockers.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          </div>
        )}

        {!isCancelled && (
          <div className="space-y-2">
            {awaitingApproval &&
              (mayApprove ? (
                <>
                  <Button size="sm" className="w-full" onClick={() => open('approve')}>
                    <ShieldCheck className="size-4" /> Approve discount
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    className="w-full"
                    onClick={() => open('reject')}
                  >
                    <ShieldX className="size-4" /> Reject discount
                  </Button>
                </>
              ) : (
                <p className="rounded-xl border border-hairline p-3 text-xs text-ink-muted">
                  Waiting on a Sales Manager or above. Switch role from the topbar to approve.
                </p>
              ))}

            {/*
              A rejection leaves the booking on hold with the note "adjust it
              and submit again", and the only route back was re-saving the Edit
              form. This is the same transition with a name on it.
            */}
            {wasRejected && (
              <Button size="sm" className="w-full" onClick={() => open('resubmit')}>
                <ShieldCheck className="size-4" /> Resubmit for approval
              </Button>
            )}

            <Button size="sm" variant="danger" className="w-full" onClick={() => open('cancel')}>
              <Ban className="size-4" /> Cancel booking
            </Button>
          </div>
        )}

        {booking.status === 'confirmed' && (
          <p className="mt-3 flex items-start gap-2 text-xs text-emerald-700">
            <BadgeCheck className="mt-0.5 size-3.5 shrink-0" />
            Confirmed — the unit is marked booked. Instalments are raised in the Finance module.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Discount Approval"
          action={
            <Badge tone={DISCOUNT_APPROVAL_META[booking.discount_approval_status].tone}>
              {DISCOUNT_APPROVAL_META[booking.discount_approval_status].label}
            </Badge>
          }
        />
        {booking.discount_amount > 0 && (
          <p className="text-sm text-ink">
            {formatBdt(booking.discount_amount)}{' '}
            <span className="text-ink-muted">({pct.toFixed(2)}% of base price)</span>
          </p>
        )}
        {/* spell the rule out — "(not needed)" alone left people guessing */}
        <p className="mt-2 text-xs text-ink-muted">
          {discountApprovalExplanation(booking, seller?.name, ceiling ?? null)}
        </p>
        {booking.discount_decision_note && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            {booking.discount_decision_note}
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={action !== null && config !== null}
        title={config?.title ?? ''}
        subtitle={booking.code}
        tone={config?.tone ?? 'default'}
        icon={action === 'approve' ? ShieldCheck : action === 'cancel' ? Ban : ShieldX}
        confirmLabel={config?.confirmLabel ?? 'Confirm'}
        message={config?.message}
        busy={busy}
        onCancel={() => setAction(null)}
        onConfirm={confirm}
      >
        {config?.needsNote && (
          <Field label="Reason (required)" error={error || undefined}>
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                action === 'cancel'
                  ? 'Why is the booking being cancelled?'
                  : 'What should the sales person change?'
              }
              invalid={Boolean(error)}
            />
          </Field>
        )}
        {action === 'approve' && (
          <Field label="Note">
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — why this discount was allowed"
            />
          </Field>
        )}
      </ConfirmDialog>
    </>
  );
}
