'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, Pencil, RefreshCw, Wallet } from 'lucide-react';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Booking, PaymentInstallment } from '@/lib/db/types';
import {
  INSTALLMENT_STATUS_META,
  daysOverdue,
  installmentStatus,
  outstandingOn,
} from '@/lib/domain/finance';
import {
  paymentInstallmentRepository,
  paymentScheduleRepository,
} from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

/**
 * The buyer's instalment schedule (Section 8.2).
 *
 * Read-mostly on purpose: the lines are generated from the project's plan when
 * the booking is confirmed, and the money against them comes from the receipts
 * on the Payments tab. What Accounts genuinely has to do by hand is put a date
 * on the `manual` and `on_handover` lines, which have none until a milestone
 * is actually reached — so that is the edit this panel offers.
 */
export function InstallmentSchedulePanel({ booking }: { booking: Booking }) {
  const { userId } = useMockSession();
  const [editing, setEditing] = useState<PaymentInstallment | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [busy, setBusy] = useState(false);

  const schedule = useLiveQuery(
    () => paymentScheduleRepository.withInstallments(booking.id),
    [booking.id],
  );
  const today = todayLocal();

  if (schedule === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  if (!schedule) {
    const reason =
      booking.status === 'cancelled'
        ? 'This booking was cancelled before a schedule was drawn up.'
        : booking.status === 'confirmed'
          ? 'The project has no instalment plan template, so there was nothing to generate from. Add one on the project first.'
          : 'A schedule is drawn up when the booking is confirmed — until then the money taken is just the booking advance.';

    return (
      <Card>
        <CardHeader title="Instalment schedule" />
        <EmptyState
          icon={CalendarClock}
          title="No schedule yet"
          description={reason}
          action={
            booking.status === 'confirmed' ? (
              <Button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await paymentScheduleRepository.generateForBooking(booking.id, userId);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                {busy ? 'Generating…' : 'Generate schedule'}
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  const { summary } = schedule;

  const columns: Column<PaymentInstallment>[] = [
    {
      key: 'installment_no',
      header: '#',
      cell: (row) => <span className="text-ink-muted">{row.installment_no}</span>,
      sortValue: (row) => row.installment_no,
    },
    {
      key: 'label',
      header: 'Instalment',
      cell: (row) => <span className="font-medium text-ink">{row.label}</span>,
      sortValue: (row) => row.label,
    },
    {
      key: 'due_date',
      header: 'Due',
      cell: (row) => {
        if (!row.due_date) {
          return <span className="text-ink-muted">not set yet</span>;
        }
        const late = daysOverdue(row, today);
        return (
          <span className="text-sm text-ink">
            {formatDate(row.due_date)}
            {late > 0 && (
              <span className="block text-xs text-red-600">
                {late} day{late === 1 ? '' : 's'} late
              </span>
            )}
          </span>
        );
      },
      sortValue: (row) => row.due_date ?? '9999',
    },
    {
      key: 'amount_due',
      header: 'Amount',
      align: 'right',
      cell: (row) => formatBdt(row.amount_due),
      sortValue: (row) => row.amount_due,
    },
    {
      key: 'amount_paid',
      header: 'Paid',
      align: 'right',
      cell: (row) => {
        const left = outstandingOn(row);
        return (
          <span className="text-sm">
            {formatBdt(row.amount_paid)}
            {left > 0.009 && row.amount_paid > 0 && (
              <span className="block text-xs text-amber-600">{formatBdt(left)} left</span>
            )}
          </span>
        );
      },
      sortValue: (row) => row.amount_paid,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => {
        const meta = INSTALLMENT_STATUS_META[installmentStatus(row, today)];
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      },
      sortValue: (row) => installmentStatus(row, today),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Edit ${row.label}`}
          onClick={() => setEditing(row)}
        >
          <Pencil className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader
          title="Instalment schedule"
          action={
            <span className="text-xs text-ink-muted">
              {schedule.installments.length} instalment
              {schedule.installments.length === 1 ? '' : 's'} · {formatBdt(schedule.total_amount)}
            </span>
          }
        />

        {schedule.stale_total && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-700">
              The booking has been repriced since this schedule was drawn up
            </p>
            <p className="mt-1 text-xs text-amber-700/90">
              Generated against {formatBdt(schedule.total_amount)}, the booking is now{' '}
              {formatBdt(schedule.booking_total)}. The schedule is a snapshot, so it is not rebuilt
              on its own — rebuilding discards any dates and amounts set by hand, which is a
              decision for Accounts, not a side-effect of editing the price.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setConfirmRegenerate(true)}
            >
              <RefreshCw className="size-4" /> Rebuild from the current price
            </Button>
          </div>
        )}

        <div className="mb-4 rounded-xl border border-hairline p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
            <span>Collected</span>
            <span className="font-medium text-ink">{summary.paid_pct}%</span>
          </div>
          <ProgressBar value={summary.paid_pct} size="sm" behind={summary.overdue_count > 0} />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Scheduled', value: formatBdt(summary.total_amount) },
              { label: 'Collected', value: formatBdt(summary.paid) },
              { label: 'Outstanding', value: formatBdt(summary.due) },
              {
                label: 'Overdue',
                value: summary.overdue_count > 0 ? formatBdt(summary.overdue_amount) : '—',
                tone: summary.overdue_count > 0 ? 'text-red-600' : undefined,
              },
            ].map((tile) => (
              <div key={tile.label} className="min-w-0">
                <p className="text-xs text-ink-muted">{tile.label}</p>
                <p className={`truncate text-sm font-semibold ${tile.tone ?? 'text-ink'}`}>
                  {tile.value}
                </p>
              </div>
            ))}
          </div>

          {summary.next_due && (
            <p className="mt-3 flex items-center gap-1.5 border-t border-hairline pt-3 text-xs text-ink-muted">
              <CalendarClock className="size-3.5" />
              Next: {summary.next_due.label} — {formatBdt(summary.next_due.amount)} on{' '}
              {formatDate(summary.next_due.due_date)}
            </p>
          )}

          {schedule.unallocated > 0.009 && (
            <p className="mt-3 flex items-start gap-1.5 border-t border-hairline pt-3 text-xs text-emerald-700">
              <Wallet className="mt-0.5 size-3.5 shrink-0" />
              {formatBdt(schedule.unallocated)} received beyond the whole schedule, held as an
              advance. It is not forced onto a line that did not ask for it.
            </p>
          )}
        </div>

        {/* no initialSort — a schedule reads in instalment order, never sorted */}
        <DataTable
          rows={schedule.installments}
          columns={columns}
          label="instalments"
          emptyState={
            <p className="py-6 text-center text-sm text-ink-muted">
              This schedule has no instalment lines.
            </p>
          }
        />

        <p className="mt-3 text-xs text-ink-muted">
          Money is recorded on the Payments tab as receipts, and spread across these lines oldest
          first — so a lump payment clears several instalments and nothing has to be split.
        </p>
      </Card>

      <InstallmentEditModal
        installment={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />

      <ConfirmDialog
        open={confirmRegenerate}
        title="Rebuild the schedule"
        tone="warning"
        icon={RefreshCw}
        confirmLabel="Rebuild schedule"
        message={`The schedule is rebuilt from ${formatBdt(schedule.booking_total)} and the project's plan template. Any due date or amount set by hand on the current lines is lost. The receipts are untouched and are re-spread across the new lines.`}
        busy={busy}
        onCancel={() => setConfirmRegenerate(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await paymentScheduleRepository.regenerate(booking.id, userId);
            setConfirmRegenerate(false);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

/**
 * Editing one line (Section 8.2 — instalments are individually editable).
 * Mounted only while open and keyed by the row, so the fields start fresh
 * without an effect resetting them.
 */
function InstallmentEditModal({
  installment,
  onClose,
  onSaved,
}: {
  installment: PaymentInstallment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!installment) return null;
  return <EditDialog key={installment.id} installment={installment} onClose={onClose} onSaved={onSaved} />;
}

function EditDialog({
  installment,
  onClose,
  onSaved,
}: {
  installment: PaymentInstallment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { userId } = useMockSession();
  const [label, setLabel] = useState(installment.label);
  const [dueDate, setDueDate] = useState(installment.due_date ?? '');
  const [amount, setAmount] = useState(String(installment.amount_due));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const paid = Number(installment.amount_paid) || 0;

  async function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    setBusy(true);
    try {
      await paymentInstallmentRepository.editLine(
        installment.id,
        { label, due_date: dueDate || null, amount_due: value },
        userId,
      );
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="Edit instalment"
      subtitle={`#${installment.installment_no} · ${installment.label}`}
      icon={CalendarClock}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save instalment'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" className="sm:col-span-2">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field
          label="Due date"
          hint="Blank for a milestone whose date is not settled yet"
        >
          <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Amount (BDT)" error={error || undefined}>
          <TextInput
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            invalid={Boolean(error)}
          />
        </Field>
      </div>

      {paid > 0 && (
        <p className="mt-4 rounded-xl border border-hairline bg-white p-3 text-xs text-ink-muted">
          {formatBdt(paid)} has already been allocated to this line. Changing the amount re-spreads
          every receipt across the schedule, so a later line may gain or lose money too — the
          receipts themselves are not touched.
        </p>
      )}

      <p className="mt-3 text-xs text-ink-muted">
        Changing the whole plan for a project is a different job — that is the project&apos;s
        instalment plan template, which only affects bookings confirmed afterwards.
      </p>
    </Modal>
  );
}
