'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, Handshake, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Land, PaymentInstallment } from '@/lib/db/types';
import {
  INSTALLMENT_STATUS_META,
  daysOverdue,
  installmentStatus,
  outstandingOn,
} from '@/lib/domain/finance';
import { validateLandTerms } from '@/lib/domain/land-schedule';
import { paymentInstallmentRepository, paymentScheduleRepository } from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

/**
 * What was agreed with the landowner, and how much of it has been paid
 * (Tier 3.4, Section 8.2).
 *
 * The mirror image of the buyer's schedule: the same table, the opposite
 * direction of money. The lines are what we owe, and they are settled from the
 * cost ledger — land-payment expenses allocated oldest-first — so nothing here
 * is typed in twice. Recording the payment in Finance is what moves this panel.
 */
export function LandPaymentPlanPanel({ land }: { land: Land }) {
  const { userId } = useMockSession();
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<PaymentInstallment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const schedule = useLiveQuery(
    () => paymentScheduleRepository.withInstallmentsForLand(land.id),
    [land.id],
  );
  const today = todayLocal();

  if (schedule === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  const agreed = Number(land.final_agreed_amount) || 0;

  if (!schedule) {
    /*
     * A joint venture used to be told, flatly, that it has no payment plan:
     * the owner is paid in units, so there is nothing to schedule.
     *
     * That is only half true, and the half it leaves out is money that really
     * moves. A JV in this market routinely carries signing money against the
     * agreement, and often rent for the owner for the duration of construction
     * — real cash, on dates, that somebody has to be chased for. It is now
     * captured at the signing step as "cash payable to the landowner" and lands
     * in `final_agreed_amount`, the same field a purchase uses.
     *
     * So the rule is the figure, not the acquisition type: a JV with a cash
     * side gets the same plan a purchase gets, and a JV with none is told why
     * — which is the honest version of the old message.
     */
    const jv = land.acquisition_type !== 'direct_purchase';
    const jvWithoutCash = jv && agreed <= 0;
    return (
      <>
        <Card>
          <CardHeader title="Payment plan" />
          <EmptyState
            icon={jvWithoutCash ? Handshake : CalendarClock}
            title={
              jvWithoutCash ? 'This joint venture has no cash side' : 'No payment plan recorded'
            }
            description={
              jvWithoutCash
                ? 'No cash was recorded as payable to the landowner, so there is nothing to schedule — the owner is paid in units, and the split is on the Joint Venture tab. If signing money or rent during construction was agreed, record it on the land as the cash payable and the plan can be built from it.'
                : agreed > 0
                  ? jv
                    ? 'Schedule the cash side of the agreement — the signing money, and any rent payable to the owner during construction. Payments already in the cost ledger settle against it straight away.'
                    : 'Record what was agreed with the owner — the advance, the monthly instalments and anything held back until registration. Payments already in the cost ledger settle against it straight away.'
                  : 'Set the final agreed amount on this land first — the plan is built from it, and without it there is no total to divide.'
            }
            action={
              agreed > 0 ? (
                <Button onClick={() => setGenerating(true)}>Record the agreed plan</Button>
              ) : undefined
            }
          />
        </Card>
        {generating && (
          <GeneratePlanModal
            land={land}
            agreed={agreed}
            userId={userId}
            onClose={() => setGenerating(false)}
          />
        )}
      </>
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
        if (!row.due_date) return <span className="text-ink-muted">not set yet</span>;
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
      header: 'Agreed',
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
          title={`Payment plan — ${schedule.installments.length} instalment${
            schedule.installments.length === 1 ? '' : 's'
          } agreed with the owner`}
          action={
            <Button variant="dangerGhost" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete plan
            </Button>
          }
        />

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Figure label="Agreed" value={formatBdt(schedule.total_amount)} />
          <Figure label="Paid" value={formatBdt(summary.paid)} />
          <Figure label="Still owed" value={formatBdt(summary.due)} />
        </div>

        {/*
          The agreed amount on the land has moved since the plan was built, so
          the plan no longer describes the deal. Said plainly rather than
          silently re-splitting lines somebody may have re-dated by hand.
        */}
        {schedule.stale_total && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            The agreed amount is now {formatBdt(schedule.agreed_total)}, but this plan was built
            from {formatBdt(schedule.total_amount)}. Delete it and record the plan again to bring
            them back in line.
          </p>
        )}

        {schedule.unallocated > 0.009 && (
          <p className="mb-4 rounded-xl border border-hairline bg-canvas p-3 text-sm text-ink-muted">
            {formatBdt(schedule.unallocated)} has been paid beyond what this plan accounts for. It
            is real money in the ledger — the plan is what needs correcting.
          </p>
        )}

        <DataTable
          rows={schedule.installments}
          columns={columns}
          label="instalments"
          emptyState={
            <p className="py-6 text-center text-sm text-ink-muted">
              This plan has no instalment lines.
            </p>
          }
        />

        <p className="mt-4 text-xs text-ink-muted">
          Paid comes from the cost ledger — land-payment costs booked against this land, applied to
          the oldest instalment first. Record a payment in Finance and it lands here; nothing on
          this table is ticked off by hand.
        </p>
      </Card>

      {editing && <EditLineModal line={editing} userId={userId} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this payment plan"
        tone="warning"
        icon={Trash2}
        confirmLabel="Delete plan"
        message="The plan is what was agreed, not what was paid — deleting it leaves every cost in the ledger exactly where it is. Use this when the terms were entered wrongly, or renegotiated."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await paymentScheduleRepository.removeForLand(land.id);
          setConfirmDelete(false);
        }}
      />
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

/** Advance, monthlies, registration — the shape a plot is actually bought in. */
function GeneratePlanModal({
  land,
  agreed,
  userId,
  onClose,
}: {
  land: Land;
  agreed: number;
  userId: string | null;
  onClose: () => void;
}) {
  const [advance, setAdvance] = useState('');
  const [monthlyCount, setMonthlyCount] = useState('6');
  const [registration, setRegistration] = useState('');
  const [agreementDate, setAgreementDate] = useState(todayLocal());
  const [registrationAfter, setRegistrationAfter] = useState('7');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const terms = {
    totalAmount: agreed,
    agreementDate,
    advanceAmount: Number(advance) || 0,
    monthlyCount: Number(monthlyCount) || 0,
    registrationAmount: Number(registration) || 0,
    registrationAfterMonths: Number(registrationAfter) || 0,
  };
  const problems = validateLandTerms(terms);
  const problemFor = (field: string) => problems.find((p) => p.field === field)?.message;

  const monthlyTotal = agreed - terms.advanceAmount - terms.registrationAmount;

  return (
    <Modal
      open
      onClose={onClose}
      title="Record the agreed plan"
      subtitle={`${land.code} · agreed at ${formatBdt(agreed)}`}
      icon={CalendarClock}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving || problems.length > 0}
            onClick={async () => {
              setSaving(true);
              setFailed(false);
              try {
                const created = await paymentScheduleRepository.generateForLand(
                  land.id,
                  {
                    agreementDate,
                    advanceAmount: terms.advanceAmount,
                    monthlyCount: terms.monthlyCount,
                    registrationAmount: terms.registrationAmount,
                    registrationAfterMonths: terms.registrationAfterMonths,
                  },
                  userId,
                );
                if (created) onClose();
                else setFailed(true);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Recording…' : 'Record plan'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Agreement date" required>
          <TextInput
            type="date"
            value={agreementDate}
            onChange={(e) => setAgreementDate(e.target.value)}
          />
        </Field>

        <Field
          label="Advance (bayna)"
          error={problemFor('advanceAmount')}
          hint="Paid at agreement. Leave blank if there is none."
        >
          <TextInput
            type="number"
            min={0}
            step="any"
            value={advance}
            onChange={(e) => setAdvance(e.target.value)}
          />
        </Field>

        <Field
          label="Monthly instalments"
          error={problemFor('monthlyCount')}
          hint={
            monthlyTotal > 0 && Number(monthlyCount) > 0
              ? `${formatBdt(monthlyTotal)} split across them`
              : 'How many months between the advance and registration'
          }
        >
          <TextInput
            type="number"
            min={0}
            step={1}
            value={monthlyCount}
            onChange={(e) => setMonthlyCount(e.target.value)}
          />
        </Field>

        <Field
          label="Held back for registration"
          error={problemFor('registrationAmount')}
          hint="Paid when the deed is registered. Leave blank if there is none."
        >
          <TextInput
            type="number"
            min={0}
            step="any"
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
          />
        </Field>

        {Number(registration) > 0 && (
          <Field label="Registration after (months)">
            <TextInput
              type="number"
              min={0}
              step={1}
              value={registrationAfter}
              onChange={(e) => setRegistrationAfter(e.target.value)}
            />
          </Field>
        )}
      </div>

      {/*
        The plan has to total the agreement exactly, or the land's balance never
        reaches zero however much is paid. Shown as it is typed rather than only
        when the button is pressed.
      */}
      <div className="mt-4 rounded-xl border border-hairline bg-canvas p-3 text-sm text-ink-muted">
        {problems.length > 0 ? (
          <span className="text-amber-800">{problems[0].message}</span>
        ) : (
          <>
            The advance, {monthlyCount || 0} monthly instalment
            {Number(monthlyCount) === 1 ? '' : 's'} and the registration payment come to{' '}
            <span className="font-medium text-ink">{formatBdt(agreed)}</span> — the agreed amount.
          </>
        )}
      </div>

      {failed && (
        <p className="mt-3 text-sm text-red-600">
          The plan could not be recorded. Check that the land has a final agreed amount, and that
          the advance, the instalments and the registration payment add up to it.
        </p>
      )}
    </Modal>
  );
}

/** Re-dating or re-sizing one line, for when the owner agrees a change. */
function EditLineModal({
  line,
  userId,
  onClose,
}: {
  line: PaymentInstallment;
  userId: string | null;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(line.label);
  const [dueDate, setDueDate] = useState(line.due_date ?? '');
  const [amount, setAmount] = useState(String(line.amount_due));
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit instalment"
      subtitle={line.label}
      icon={Pencil}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await paymentInstallmentRepository.editLine(
                  line.id,
                  { label, due_date: dueDate, amount_due: Number(amount) || 0 },
                  userId,
                );
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Label">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Due date">
          <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field
          label="Agreed amount"
          hint="Changing one line does not re-split the others — the plan may stop totalling the agreement."
        >
          <TextInput
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
