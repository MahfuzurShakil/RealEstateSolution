'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight, Check, Handshake, Plus, TrendingDown } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { LandNegotiation, NegotiationParty, NegotiationRoundStatus } from '@/lib/db/types';
import {
  landNegotiationRepository,
  landPipelineRepository,
  type LandWithRelations,
} from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

const STATUS_META: Record<NegotiationRoundStatus, { label: string; tone: BadgeTone }> = {
  open: { label: 'On the table', tone: 'amber' },
  accepted: { label: 'Accepted', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  superseded: { label: 'Superseded', tone: 'neutral' },
};

const PARTY_LABEL: Record<NegotiationParty, string> = {
  us: 'Our offer',
  owner: 'Owner’s counter',
};

/**
 * The offer ladder for one land (BRD ACQ-001).
 *
 * This replaces the single "Offered amount" that the pipeline dialog used to
 * take. That field recorded the last number anybody typed and nothing about how
 * it got there. A price without its conditions is not a price: "4.2 crore" and
 * "4.2 crore with possession in six months and the boundary wall rebuilt" are
 * different deals, and only one of them is what was agreed.
 */
export function NegotiationPanel({ land }: { land: LandWithRelations }) {
  const { userId } = useMockSession();
  const [adding, setAdding] = useState(false);
  const [accepting, setAccepting] = useState<LandNegotiation | null>(null);

  const rounds = useLiveQuery(() => landNegotiationRepository.listForLand(land.id), [land.id]);
  const accepted = rounds?.find((r) => r.status === 'accepted');

  /* The gap between the first ask and where it ended — the number a land team
     is actually judged on, and nobody was computing it. */
  const first = rounds?.length ? rounds[rounds.length - 1] : undefined;
  const movement =
    first && accepted && first.id !== accepted.id ? accepted.amount - first.amount : null;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">
          {rounds?.length ?? 0} round{rounds?.length === 1 ? '' : 's'} · newest first
        </p>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Record a round
        </Button>
      </div>

      {accepted && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
            <Handshake className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-emerald-900">
              Agreed at {formatBdt(accepted.amount)} · round {accepted.round_no}
            </p>
            <p className="text-xs text-emerald-800">
              {PARTY_LABEL[accepted.party]} on {formatDate(accepted.offer_date)}
              {movement != null && movement !== 0 && (
                <>
                  {' · '}
                  {movement < 0 ? 'negotiated down' : 'moved up'} {formatBdt(Math.abs(movement))}{' '}
                  from the opening round
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {rounds && rounds.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No rounds recorded yet"
          description="Record each offer and counter-offer as it happens — the amount, the payment terms, what was attached to the price, and which broker was in the room. The accepted round becomes the land's agreed amount."
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Record a round
            </Button>
          }
        />
      ) : (
        <ol className="relative space-y-3 pl-8">
          <span className="absolute bottom-3 left-[11px] top-3 w-px bg-hairline" aria-hidden />
          {rounds?.map((round) => (
            <li key={round.id} className="relative">
              <span
                className={
                  round.status === 'accepted'
                    ? 'absolute -left-8 top-3 grid size-6 place-items-center rounded-full bg-emerald-500 text-white ring-4 ring-white'
                    : round.party === 'us'
                      ? 'absolute -left-8 top-3 grid size-6 place-items-center rounded-full bg-admin-100 text-admin-700 ring-4 ring-white'
                      : 'absolute -left-8 top-3 grid size-6 place-items-center rounded-full bg-slate-100 text-slate-500 ring-4 ring-white'
                }
              >
                {round.status === 'accepted' ? (
                  <Check className="size-3.5" />
                ) : (
                  <span className="text-[11px] font-semibold">{round.round_no}</span>
                )}
              </span>

              <div
                className={
                  round.status === 'superseded'
                    ? 'rounded-xl border border-hairline bg-white p-4 opacity-70'
                    : 'rounded-xl border border-hairline bg-white p-4'
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">
                      {PARTY_LABEL[round.party]}
                    </span>
                    <Badge tone={STATUS_META[round.status].tone}>
                      {STATUS_META[round.status].label}
                    </Badge>
                  </div>
                  <span className="text-sm font-semibold text-ink tabular-nums">
                    {formatBdt(round.amount)}
                  </span>
                </div>

                <p className="mt-1 text-xs text-ink-muted">
                  {formatDate(round.offer_date)}
                  {round.broker_name && ` · via ${round.broker_name}`}
                  {round.broker_commission != null &&
                    ` (commission ${formatBdt(round.broker_commission)})`}
                </p>

                {(round.terms || round.conditions) && (
                  <dl className="mt-3 grid gap-3 border-t border-hairline pt-3 sm:grid-cols-2">
                    {round.terms && (
                      <div>
                        <dt className="text-xs text-ink-muted">Payment terms</dt>
                        <dd className="whitespace-pre-wrap text-sm text-ink">{round.terms}</dd>
                      </div>
                    )}
                    {round.conditions && (
                      <div>
                        <dt className="text-xs text-ink-muted">Conditions</dt>
                        <dd className="whitespace-pre-wrap text-sm text-ink">
                          {round.conditions}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}

                {round.remarks && (
                  <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-sm text-ink-muted">
                    {round.remarks}
                  </p>
                )}

                {round.status === 'open' && (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <Button size="sm" onClick={() => setAccepting(round)}>
                      <Check className="size-4" /> Accept this round
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {adding && (
        <RoundDialog
          land={land}
          previous={rounds?.[0]}
          userId={userId}
          onClose={() => setAdding(false)}
        />
      )}

      {accepting && (
        <AcceptDialog
          round={accepting}
          land={land}
          userId={userId}
          onClose={() => setAccepting(null)}
        />
      )}
    </>
  );
}

/**
 * Accepting a round writes the land's agreed amount.
 *
 * It is the whole point of the ladder: the accepted round *is* the deal, and
 * leaving `final_agreed_amount` to be typed separately is how the two come to
 * disagree. The dialog says so before it does it.
 */
function AcceptDialog({
  round,
  land,
  userId,
  onClose,
}: {
  round: LandNegotiation;
  land: LandWithRelations;
  userId: string | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const current = Number(land.final_agreed_amount) || 0;

  return (
    <ConfirmDialog
      open
      title="Accept this round"
      subtitle={`Round ${round.round_no} · ${formatBdt(round.amount)}`}
      tone="success"
      icon={Handshake}
      confirmLabel="Accept round"
      busy={busy}
      message="Every other round is marked superseded, this amount becomes the land's agreed amount, and the land moves to Agreed."
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        try {
          // writes the agreed amount and makes the land Agreed (L7)
          await landPipelineRepository.acceptNegotiationRound(round.id, userId);
          onClose();
        } finally {
          setBusy(false);
        }
      }}
    >
      {current > 0 && Math.abs(current - round.amount) > 0.01 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          The land currently shows an agreed amount of <strong>{formatBdt(current)}</strong>.
          Accepting this round replaces it with <strong>{formatBdt(round.amount)}</strong>, and the
          payment plan is built from that figure.
        </p>
      )}
    </ConfirmDialog>
  );
}

function RoundDialog({
  land,
  previous,
  userId,
  onClose,
}: {
  land: LandWithRelations;
  previous?: LandNegotiation;
  userId: string | null;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /*
   * A new round defaults to the opposite party from the last one, because a
   * negotiation alternates — and carries the previous terms forward, because
   * what usually changes between rounds is the number, not the whole deal.
   */
  const [form, setForm] = useState({
    party: (previous?.party === 'us' ? 'owner' : 'us') as NegotiationParty,
    amount: '',
    offer_date: todayLocal(),
    terms: previous?.terms ?? '',
    conditions: previous?.conditions ?? '',
    broker_name: previous?.broker_name ?? '',
    broker_commission:
      previous?.broker_commission != null ? String(previous.broker_commission) : '',
    owner_id: previous?.owner_id ?? '',
    remarks: '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.amount.trim() || Number(form.amount) <= 0) {
      setError('A round needs an amount');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await landPipelineRepository.addNegotiationRound(
        {
          land_id: land.id,
          owner_id: form.owner_id || null,
          party: form.party,
          amount: Number(form.amount),
          offer_date: form.offer_date,
          terms: form.terms.trim() || null,
          conditions: form.conditions.trim() || null,
          broker_name: form.broker_name.trim() || null,
          broker_commission: form.broker_commission.trim()
            ? Number(form.broker_commission)
            : null,
          recorded_by: userId,
          remarks: form.remarks.trim() || null,
        },
        userId,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const delta = previous && form.amount ? Number(form.amount) - previous.amount : null;

  return (
    <Modal
      open
      title="Record a negotiation round"
      subtitle={`${land.code} · ${land.name}`}
      icon={ArrowLeftRight}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save round'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {previous && (
          <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
            Round {previous.round_no} was {PARTY_LABEL[previous.party].toLowerCase()} at{' '}
            <strong className="text-ink">{formatBdt(previous.amount)}</strong>. Saving this marks it
            superseded.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Whose move" required>
            <SelectInput
              value={form.party}
              onChange={(e) => set('party', e.target.value as NegotiationParty)}
            >
              <option value="us">Our offer</option>
              <option value="owner">Owner’s counter</option>
            </SelectInput>
          </Field>
          <Field label="Amount" required error={error || undefined}>
            <MoneyInput
              value={form.amount}
              placeholder="e.g. 42000000"
              onChange={(e) => {
                set('amount', e.target.value);
                setError('');
              }}
            />
          </Field>
          <Field label="Date" required>
            <TextInput
              type="date"
              value={form.offer_date}
              onChange={(e) => set('offer_date', e.target.value)}
            />
          </Field>
        </div>

        {delta != null && delta !== 0 && (
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <TrendingDown className="size-3.5" />
            {delta < 0 ? 'Down' : 'Up'} {formatBdt(Math.abs(delta))} from round{' '}
            {previous?.round_no}
          </p>
        )}

        {/* only worth asking when there is more than one owner to distinguish */}
        {land.owners.length > 1 && (
          <Field
            label="With which owner"
            hint="Leave blank when the round is with all of them together"
          >
            <SelectInput value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
              <option value="">All owners</option>
              {land.owners.map((o) => (
                <option key={o.owner_id} value={o.owner_id}>
                  {o.owner?.name ?? 'Unknown owner'}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment terms" hint="Advance, instalments, timing">
            <TextArea
              value={form.terms}
              placeholder="e.g. 30% at agreement, 70% at registration within 90 days"
              onChange={(e) => set('terms', e.target.value)}
            />
          </Field>
          <Field label="Conditions" hint="Everything that is not money">
            <TextArea
              value={form.conditions}
              placeholder="e.g. Vacant possession by 31 March, boundary wall rebuilt by the owner, mango trees to stay"
              onChange={(e) => set('conditions', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Broker / agent">
            <TextInput
              value={form.broker_name}
              placeholder="e.g. Salam Real Estate, Fatullah"
              onChange={(e) => set('broker_name', e.target.value)}
            />
          </Field>
          <Field label="Broker commission" hint="Agreed with that broker, if any">
            <MoneyInput
              value={form.broker_commission}
              placeholder="e.g. 400000"
              onChange={(e) => set('broker_commission', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Remarks">
          <TextArea
            value={form.remarks}
            placeholder="Who was in the room, what was said, what to expect next"
            onChange={(e) => set('remarks', e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
