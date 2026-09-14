'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Land } from '@/lib/db/types';
import { INSTALLMENT_STATUS_META, installmentStatus } from '@/lib/domain/finance';
import { validateLandTerms } from '@/lib/domain/land-schedule';
import { ownerSettlementRepository, type OwnerSettlement } from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

/**
 * One settlement per landowner (BRD ACQ-003, LAND-002, BR-003).
 *
 * A land with three owners is three settlements: agreed at three prices and
 * paid on three sets of dates, because owner A takes his bayna in January and
 * owner B in March. A single land-level plan cannot say what any one of them is
 * owed today, which is the question the office actually asks.
 *
 * Shown only when a plot has more than one owner. On a single-owner plot the
 * land's own plan already *is* that owner's settlement, and a second copy of it
 * would be two answers to one question.
 */
export function OwnerSettlementPanel({ land }: { land: Land }) {
  const { userId } = useMockSession();
  const [planning, setPlanning] = useState<OwnerSettlement | null>(null);
  const [removing, setRemoving] = useState<OwnerSettlement | null>(null);

  const position = useLiveQuery(
    () => ownerSettlementRepository.positionForLand(land.id),
    [land.id],
  );

  if (!position) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (position.owners.length <= 1) return null;

  const today = todayLocal();

  return (
    <Card className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
          <Users className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Settlement by owner</p>
          <p className="text-xs text-ink-muted">
            {formatBdt(position.paidTotal)} paid of {formatBdt(position.agreedTotal)} agreed across{' '}
            {position.owners.length} owners
          </p>
        </div>
      </div>

      {/*
        The owner amounts are what the land is actually made of, so when they
        do not add up to the agreed total somebody has to see it before a
        cheque is written. Reported rather than blocked: a land where two of
        three owners have settled is mid-work, not wrong.
      */}
      {position.mismatch && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          The owners&rsquo; agreed amounts total {formatBdt(position.agreedTotal)}, but the land is
          agreed at {formatBdt(position.landAgreed)} —{' '}
          {formatBdt(Math.abs(position.agreedTotal - position.landAgreed))}{' '}
          {position.agreedTotal > position.landAgreed ? 'over' : 'short'}. Fix it on the Edit Land
          form before settling anybody.
        </p>
      )}

      {position.unattributed > 0 && (
        <p className="mb-3 rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
          <strong className="text-ink">{formatBdt(position.unattributed)}</strong> of land payments
          names no owner — recorded against the plot as a whole. Edit those costs and pick an owner
          to have them count against a settlement.
        </p>
      )}

      <ul className="space-y-3">
        {position.owners.map((o) => (
          <li key={o.mapping.id} className="rounded-xl border border-hairline bg-white">
            <div className="flex flex-wrap items-start gap-3 p-3">
              <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                <p className="text-sm font-medium text-ink">
                  {o.owner?.name ?? 'Unknown owner'}
                  {o.mapping.is_primary_contact && (
                    <Badge tone="teal" className="ml-2">
                      Primary
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {o.mapping.ownership_share_pct}% share
                  {o.agreed > 0 ? ` · agreed ${formatBdt(o.agreed)}` : ' · no amount agreed yet'}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-medium tabular-nums text-ink">{formatBdt(o.paid)} paid</p>
                <p
                  className={
                    o.outstanding > 0
                      ? 'text-xs font-medium tabular-nums text-amber-700'
                      : 'text-xs tabular-nums text-emerald-700'
                  }
                >
                  {o.agreed <= 0
                    ? '—'
                    : o.outstanding > 0
                      ? `${formatBdt(o.outstanding)} outstanding`
                      : 'settled in full'}
                </p>
              </div>

              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                {o.schedule ? (
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(o)}>
                    <Trash2 className="size-4" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={o.agreed <= 0}
                    title={
                      o.agreed <= 0
                        ? 'Record what was agreed with this owner on the Edit Land form first'
                        : undefined
                    }
                    onClick={() => setPlanning(o)}
                  >
                    <CalendarClock className="size-4" /> Build plan
                  </Button>
                )}
              </div>
            </div>

            {o.installments.length > 0 && (
              <div className="overflow-x-auto border-t border-hairline">
                <table className="w-full min-w-[440px] text-sm">
                  <tbody>
                    {o.installments.map((line) => {
                      const status = installmentStatus(line, today);
                      return (
                        <tr key={line.id}>
                          <td className="px-3 py-2 text-ink">{line.label}</td>
                          <td className="px-3 py-2 text-ink-muted">
                            {line.due_date ? formatDate(line.due_date) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink">
                            {formatBdt(line.amount_due)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                            {formatBdt(line.amount_paid)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Badge tone={INSTALLMENT_STATUS_META[status].tone}>
                              {INSTALLMENT_STATUS_META[status].label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {o.payments.length > 0 && o.installments.length === 0 && (
              <p className="border-t border-hairline px-3 py-2 text-xs text-ink-muted">
                {o.payments.length} payment{o.payments.length === 1 ? '' : 's'} recorded in the cost
                ledger, no instalment plan built.
              </p>
            )}
          </li>
        ))}
      </ul>

      {planning && (
        <OwnerPlanDialog owner={planning} userId={userId} onClose={() => setPlanning(null)} />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Delete this owner's plan"
        subtitle={removing?.owner?.name}
        tone="danger"
        confirmLabel="Delete plan"
        message="The instalment lines are removed. The payments already recorded in the cost ledger are untouched — they keep counting against what this owner is owed."
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await ownerSettlementRepository.removeForMapping(removing.mapping.id);
          setRemoving(null);
        }}
      />
    </Card>
  );
}

function OwnerPlanDialog({
  owner,
  userId,
  onClose,
}: {
  owner: OwnerSettlement;
  userId: string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    agreementDate: todayLocal(),
    advanceAmount: '',
    monthlyCount: '3',
    registrationAmount: '',
    registrationAfterMonths: '4',
  });
  const [saving, setSaving] = useState(false);

  const terms = {
    totalAmount: owner.agreed,
    agreementDate: form.agreementDate,
    advanceAmount: Number(form.advanceAmount) || 0,
    monthlyCount: Number(form.monthlyCount) || 0,
    registrationAmount: Number(form.registrationAmount) || 0,
    registrationAfterMonths: Number(form.registrationAfterMonths) || 0,
  };
  const problems = validateLandTerms(terms);

  return (
    <Modal
      open
      title={`Settlement plan — ${owner.owner?.name ?? 'owner'}`}
      subtitle={`${formatBdt(owner.agreed)} agreed with this owner`}
      icon={CalendarClock}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setSaving(true);
              try {
                await ownerSettlementRepository.generateForMapping(
                  owner.mapping.id,
                  terms,
                  userId,
                );
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving || problems.length > 0}
          >
            {saving ? 'Building…' : 'Build plan'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
          The same terms a land purchase takes — bayna, monthly instalments, balance at
          registration — carved out of this owner&rsquo;s share rather than the whole plot.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Agreement date" required>
            <TextInput
              type="date"
              value={form.agreementDate}
              onChange={(e) => setForm((f) => ({ ...f, agreementDate: e.target.value }))}
            />
          </Field>
          <Field label="Bayna / advance">
            <TextInput
              type="number"
              min="0"
              value={form.advanceAmount}
              placeholder="e.g. 2000000"
              onChange={(e) => setForm((f) => ({ ...f, advanceAmount: e.target.value }))}
            />
          </Field>
          <Field label="Monthly instalments">
            <TextInput
              type="number"
              min="0"
              value={form.monthlyCount}
              onChange={(e) => setForm((f) => ({ ...f, monthlyCount: e.target.value }))}
            />
          </Field>
          <Field label="Balance at registration">
            <TextInput
              type="number"
              min="0"
              value={form.registrationAmount}
              placeholder="e.g. 5000000"
              onChange={(e) => setForm((f) => ({ ...f, registrationAmount: e.target.value }))}
            />
          </Field>
          <Field label="Registration after (months)">
            <TextInput
              type="number"
              min="0"
              value={form.registrationAfterMonths}
              onChange={(e) =>
                setForm((f) => ({ ...f, registrationAfterMonths: e.target.value }))
              }
            />
          </Field>
        </div>

        {problems.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {problems.map((p) => (
              <li key={`${p.field}-${p.message}`}>{p.message}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
