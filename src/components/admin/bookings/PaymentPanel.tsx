'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CircleDollarSign, Printer, Receipt, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Booking, Payment } from '@/lib/db/types';
import { PAYMENT_METHOD_LABEL, hasAgreement } from '@/lib/domain/booking';
import { INSTALLMENT_STATUS_META } from '@/lib/domain/installment-ledger';
import {
  bankAccountRepository,
  bookingLedgerRepository,
  bookingRepository,
  paymentRepository,
  userRepository,
} from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';
import { RecordPaymentModal } from './RecordPaymentModal';

/**
 * The buyer's money in one place (SALES-FLOW-PLAN.md S4, BUYER-PORTAL-PLAN.md §2).
 *
 * On top: what the buyer owes in total, what is in, what is left and what is
 * overdue. Then the schedule — booking money and each installment, with what
 * has been paid on it and any late fee — kept by the same ledger as a Share
 * Sale purchase. Below: every receipt and the rows it paid, each one money
 * into a bank or cash account, so the same rows are what Cash Position and
 * the project's money statement count.
 */
export function PaymentPanel({ booking }: { booking: Booking }) {
  const { userId } = useMockSession();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const today = todayLocal();
  const payments = useLiveQuery(() => paymentRepository.listForBooking(booking.id), [booking.id]);
  const ledger = useLiveQuery(() => bookingLedgerRepository.view(booking.id, today), [booking.id, today]);
  const users = useLiveQuery(() => userRepository.getAll(), []);
  const accounts = useLiveQuery(() => bankAccountRepository.options(), []);

  const total = Number(booking.final_price) || 0;
  const received = ledger?.paid ?? 0;
  const balance = Math.max(total - received, 0);
  const lateFees = ledger?.late_fees ?? 0;
  const owing = balance + lateFees;
  const pct = total > 0 ? Math.min((received / total) * 100, 100) : 0;
  const agreed = hasAgreement(booking);
  const next = ledger?.next ?? null;
  const overdue = ledger && ledger.due_now > 0.5 ? ledger : null;

  const userName = (id?: string | null) => users?.find((u) => u.id === id)?.name ?? '—';
  const accountName = (id?: string | null) =>
    accounts?.find((a) => a.id === id)?.name ?? (id ? 'Account removed' : null);
  const rowLabel = (id: string) => ledger?.schedule.find((r) => r.id === id)?.label ?? 'Earlier row';

  const suggested = overdue ? overdue.due_now : next ? next.remaining + next.late_fee_due : balance;

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Total to receive" value={formatBdt(total)} hint="final price" />
        <Tile label="Received" value={formatBdt(received)} hint={`${pct.toFixed(0)}% of the price`} tone="green" />
        <Tile label="Balance" value={formatBdt(balance)} hint="still to come" />
        <Tile
          label="Overdue"
          value={overdue ? formatBdt(overdue.due_now) : 'Nothing'}
          hint={
            lateFees > 0
              ? `incl. ${formatBdt(lateFees)} late fee`
              : agreed
                ? `${ledger?.overdue_count ?? 0} row${ledger?.overdue_count === 1 ? '' : 's'} past due`
                : 'only the booking money, until an agreement is recorded'
          }
          tone={overdue ? 'red' : undefined}
        />
      </div>

      <div className="mb-4">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {next
            ? next.due_date < today
              ? `Late since ${formatDate(next.due_date)}: ${next.label} — ${formatBdt(next.remaining)} still owed on it`
              : `Next: ${next.label} — ${formatBdt(next.remaining)} on ${formatDate(next.due_date)}`
            : balance <= 0.5
              ? `Fully paid${booking.fully_paid_on ? ` on ${formatDate(booking.fully_paid_on)}` : ''} — ready for registration and handover.`
              : agreed
                ? 'No more dates in the agreement — the balance is due now.'
                : 'No agreement recorded yet — add one on the Agreement tab to track installment dates.'}
        </p>
      </div>

      {overdue && booking.status !== 'cancelled' && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {formatBdt(overdue.overdue_amount)} overdue on {overdue.overdue_count} row
          {overdue.overdue_count === 1 ? '' : 's'}
          {lateFees > 0 ? `, plus ${formatBdt(lateFees)} late fee` : ''}. A payment goes to late fees first, then the
          oldest row.
        </p>
      )}

      {ledger && ledger.schedule.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold text-ink">Schedule</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3 text-right">Paid</th>
                  <th className="py-2 pr-3 text-right">Late fee</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {ledger.schedule.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-hairline last:border-0 ${r.status === 'overdue' ? 'bg-red-50/60' : ''}`}
                  >
                    <td className="py-2 pr-3 text-ink">{r.label}</td>
                    <td className="py-2 pr-3 text-ink-muted">{formatDate(r.due_date)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatBdt(r.amount)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.paid_amount > 0 ? formatBdt(r.paid_amount) : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.late_fee_due > 0 ? (
                        <span className="text-red-600">{formatBdt(r.late_fee_due)} due</span>
                      ) : r.late_fee_paid > 0 ? (
                        `${formatBdt(r.late_fee_paid)} paid`
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={INSTALLMENT_STATUS_META[r.status].tone}>
                        {r.paid_amount > 0 && r.remaining > 0 ? 'Part paid' : INSTALLMENT_STATUS_META[r.status].label}
                      </Badge>
                      {r.status === 'overdue' && <span className="ml-1.5 text-xs text-red-600">{r.days_late} days</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ledger.unallocated > 0.5 && (
            <p className="mt-2 text-xs text-ink-muted">
              {formatBdt(ledger.unallocated)} received beyond the rows above. It counts toward the price and moves onto
              the installments once the agreement is recorded.
            </p>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {payments === undefined
            ? 'Loading…'
            : `${payments.length} receipt${payments.length === 1 ? '' : 's'}`}
        </p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={owing <= 0 || booking.status === 'cancelled'}>
          <CircleDollarSign className="size-4" /> Receive payment
        </Button>
      </div>

      {payments === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No money received yet"
          description="Record each payment the buyer makes — the date, the account it went into and the reference. The booking confirms once the booking money is in."
          action={
            booking.status !== 'cancelled' ? (
              <Button onClick={() => setOpen(true)}>
                <CircleDollarSign className="size-4" /> Receive payment
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Paid for</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Into account</th>
                <th className="py-2 pr-3">Reference</th>
                <th className="py-2 pr-3">Received by</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-hairline last:border-0">
                  <td className="py-2.5 pr-3 text-ink">{formatDate(payment.payment_date)}</td>
                  <td className="py-2.5 pr-3 text-right font-medium text-ink">{formatBdt(payment.amount)}</td>
                  <td className="py-2.5 pr-3 text-xs text-ink-muted">
                    {(payment.allocations ?? []).length
                      ? (payment.allocations ?? [])
                          .map((a) => `${rowLabel(a.installment_id)}${a.late_fee ? ` + ${formatBdt(a.late_fee)} fee` : ''}`)
                          .join(', ')
                      : 'Advance'}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge>{PAYMENT_METHOD_LABEL[payment.payment_method]}</Badge>
                    {payment.channel === 'online' && <Badge tone="blue" className="ml-1">Online</Badge>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {accountName(payment.account_id) ?? <Badge tone="amber">Not set</Badge>}
                  </td>
                  <td className="py-2.5 pr-3 text-ink-muted">{payment.reference_no || '—'}</td>
                  <td className="py-2.5 pr-3 text-ink-muted">{userName(payment.received_by)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right">
                    {/* a new tab: printing is a detour from whatever else is on this page */}
                    <Link href={`/admin/collections/receipt/${payment.id}/print`} target="_blank" rel="noopener">
                      <Button size="sm" variant="ghost" aria-label="Print money receipt">
                        <Printer className="size-4" />
                      </Button>
                    </Link>
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
            <tfoot>
              <tr className="text-sm font-semibold text-ink">
                <td className="pt-3">Total</td>
                <td className="pt-3 pr-3 text-right">
                  {formatBdt(payments.reduce((t, p) => t + (Number(p.amount) || 0), 0))}
                </td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <RecordPaymentModal
        open={open}
        booking={booking}
        defaultAmount={Math.min(suggested, owing) || undefined}
        onClose={() => setOpen(false)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this receipt"
        subtitle={deleteTarget ? formatBdt(deleteTarget.amount) : ''}
        confirmLabel="Delete receipt"
        message="Only delete a receipt entered by mistake. It also leaves Cash Position, the later receipts are re-applied to the schedule, and the booking may drop back to Hold if the booking money is no longer covered."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await bookingRepository.removePayment(booking.id, deleteTarget.id, userId);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'green' | 'red';
}) {
  return (
    <div className="rounded-xl border border-hairline p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          tone === 'green' ? 'text-emerald-700' : tone === 'red' ? 'text-red-600' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  );
}
