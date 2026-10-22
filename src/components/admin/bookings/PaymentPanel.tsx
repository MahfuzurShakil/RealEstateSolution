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
import { PAYMENT_METHOD_LABEL, buyerLedger, hasAgreement } from '@/lib/domain/booking';
import {
  bankAccountRepository,
  bookingRepository,
  paymentRepository,
  userRepository,
} from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';
import { RecordPaymentModal } from './RecordPaymentModal';

/**
 * The buyer's money in one place (SALES-FLOW-PLAN.md S4).
 *
 * On top: what the buyer owes in total, what is in, what is left, and — when
 * an agreement is recorded — how far behind its dates they are. Below: every
 * receipt, each one money into a bank or cash account, so the same rows are
 * what Cash Position and the project's money statement count.
 */
export function PaymentPanel({ booking }: { booking: Booking }) {
  const { userId } = useMockSession();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const payments = useLiveQuery(() => paymentRepository.listForBooking(booking.id), [booking.id]);
  const users = useLiveQuery(() => userRepository.getAll(), []);
  const accounts = useLiveQuery(() => bankAccountRepository.options(), []);

  const received = (payments ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const today = todayLocal();
  const ledger = buyerLedger(booking, received, today);
  const pct = ledger.total > 0 ? Math.min((received / ledger.total) * 100, 100) : 0;
  const agreed = hasAgreement(booking);

  const userName = (id?: string | null) => users?.find((u) => u.id === id)?.name ?? '—';
  const accountName = (id?: string | null) =>
    accounts?.find((a) => a.id === id)?.name ?? (id ? 'Account removed' : null);

  const suggested = ledger.behind > 0.5 ? ledger.behind : (ledger.next?.amount ?? ledger.balance);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Total to receive" value={formatBdt(ledger.total)} hint="final price" />
        <Tile label="Received" value={formatBdt(received)} hint={`${pct.toFixed(0)}% of the price`} tone="green" />
        <Tile label="Balance" value={formatBdt(ledger.balance)} hint="still to come" />
        <Tile
          label="Behind"
          value={ledger.behind > 0.5 ? formatBdt(ledger.behind) : 'Nothing'}
          hint={
            agreed
              ? `${formatBdt(ledger.expected)} expected by today`
              : 'only the booking money, until an agreement is recorded'
          }
          tone={ledger.behind > 0.5 ? 'red' : undefined}
        />
      </div>

      <div className="mb-4">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {ledger.next
            ? ledger.next.date < today
              ? `Late since ${formatDate(ledger.next.date)}: ${ledger.next.label} — ${formatBdt(ledger.next.amount)} still owed on it`
              : `Next: ${ledger.next.label} — ${formatBdt(ledger.next.amount)} on ${formatDate(ledger.next.date)}`
            : ledger.balance <= 0.5
              ? 'Fully paid.'
              : agreed
                ? 'No more dates in the agreement — the balance is due now.'
                : 'No agreement recorded yet — add one on the Agreement tab to track kisti dates.'}
        </p>
      </div>

      {ledger.behind > 0.5 && booking.status !== 'cancelled' && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {formatBdt(ledger.behind)} less than the agreement asks for by today.
        </p>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {payments === undefined
            ? 'Loading…'
            : `${payments.length} receipt${payments.length === 1 ? '' : 's'}`}
        </p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={ledger.balance <= 0 || booking.status === 'cancelled'}>
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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3 text-right">Amount</th>
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
                  <td className="py-2.5 pr-3">
                    <Badge>{PAYMENT_METHOD_LABEL[payment.payment_method]}</Badge>
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
                <td className="pt-3 pr-3 text-right">{formatBdt(received)}</td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <RecordPaymentModal
        open={open}
        booking={booking}
        defaultAmount={Math.min(suggested, ledger.balance) || undefined}
        onClose={() => setOpen(false)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this receipt"
        subtitle={deleteTarget ? formatBdt(deleteTarget.amount) : ''}
        confirmLabel="Delete receipt"
        message="Only delete a receipt entered by mistake. It also leaves Cash Position, and the booking may drop back to Hold if the booking money is no longer covered."
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
