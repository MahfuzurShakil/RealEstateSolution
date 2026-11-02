'use client';

import { AccountPicker } from '@/components/admin/finance/AccountPicker';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, HandCoins, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { SHARE_PAYMENT_METHODS, type SharePaymentMethod, type ShareOffering, type ShareSale } from '@/lib/db/types';
import {
  FREQUENCY_LABEL,
  SHARE_PAYMENT_METHOD_LABEL,
  allocateSharePayment,
  closesOn,
  daysBetween,
  formatSharePct,
  maxSharePayable,
  type SaleView,
} from '@/lib/domain/share-sale';
import { customerRepository, shareOfferingRepository, shareSaleRepository } from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

export function ErrorNote({ error }: { error: string }) {
  return error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null;
}

export function useAction() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, done: () => void) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

/** Holds shares for a customer — an existing one, or a new customer of type Investor. */
export function ReserveModal({ offering, available, onClose }: { offering: ShareOffering; available: number; onClose: () => void }) {
  const { userId } = useMockSession();
  const customers = useLiveQuery(() => customerRepository.getAll(), []);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [nc, setNc] = useState({ name: '', phone: '', email: '', nid: '', address: '' });
  const [shares, setShares] = useState(String(offering.min_shares));
  const [downPct, setDownPct] = useState(String(offering.min_down_payment_pct));
  const [plan, setPlan] = useState(String(offering.max_installments));
  const [notes, setNotes] = useState('');
  const { error, busy, run } = useAction();

  const n = Number(shares) || 0;
  const total = n * offering.price_per_share;
  const inst = Number(plan) || 0;
  const down = Math.round((total * (Number(downPct) || 0)) / 100);
  const most = Math.min(offering.max_shares, available);

  return (
    <Modal
      open
      title="Reserve shares"
      subtitle={`${offering.code} · ${formatBdt(offering.price_per_share)} per share · ${available} left`}
      icon={Ticket}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  shareSaleRepository.reserve(
                    {
                      offering_id: offering.id,
                      customer_id: mode === 'existing' ? customerId : null,
                      new_customer: mode === 'new' ? nc : null,
                      shares: n,
                      down_payment_pct: Number(downPct),
                      installment_count: inst,
                      notes,
                    },
                    userId,
                  ),
                onClose,
              )
            }
          >
            {busy ? 'Reserving…' : `Reserve ${n || ''} share${n === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-hairline bg-white p-4">
          <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
            {(
              [
                ['existing', 'Existing customer'],
                ['new', 'New customer (Investor)'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={`flex-1 rounded-md px-3 py-1.5 ${mode === k ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'existing' ? (
            <Field label="Customer" required>
              <Combobox
                value={customerId}
                onChange={setCustomerId}
                placeholder="Search by name, phone or code…"
                options={(customers ?? []).map((c) => ({
                  id: c.id,
                  label: c.name,
                  hint: `${c.code} · ${c.phone}${c.customer_type === 'investor' ? ' · Investor' : ''}`,
                  keywords: `${c.phone} ${c.code}`,
                }))}
              />
            </Field>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" required>
                <TextInput value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
              </Field>
              <Field label="Phone" required>
                <TextInput value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} placeholder="01XXXXXXXXX" />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
              </Field>
              <Field label="NID / passport">
                <TextInput value={nc.nid} onChange={(e) => setNc({ ...nc, nid: e.target.value })} />
              </Field>
              <Field label="Address" className="md:col-span-2">
                <TextInput value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} />
              </Field>
              <p className="text-xs text-ink-muted md:col-span-2">Saved as a customer with customer type Investor.</p>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Shares" required hint={`${offering.min_shares}–${most} for one customer`}>
            <TextInput type="number" min={offering.min_shares} max={most} step="1" value={shares} onChange={(e) => setShares(e.target.value)} />
          </Field>
          <Field label="Down payment (%)" required hint={`At least ${offering.min_down_payment_pct}%`}>
            <TextInput type="number" min={offering.min_down_payment_pct} max="100" step="1" value={downPct} onChange={(e) => setDownPct(e.target.value)} />
          </Field>
          <Field label="Installments" required hint={`Up to ${offering.max_installments}, ${FREQUENCY_LABEL[offering.installment_frequency].toLowerCase()}`}>
            <TextInput type="number" min="0" max={offering.max_installments} step="1" value={plan} onChange={(e) => setPlan(e.target.value)} />
          </Field>
          <Field label="Notes" className="md:col-span-3">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline text-sm sm:grid-cols-4">
          {[
            ['Ownership', n ? formatSharePct(n * offering.share_pct) : '—'],
            ['Total price', total ? formatBdt(total) : '—'],
            ['Down payment', total ? formatBdt(down) : '—'],
            ['Each installment', inst > 0 && total ? formatBdt(Math.round((total - down) / inst)) : '—'],
          ].map(([k, v]) => (
            <div key={k} className="bg-white px-4 py-3">
              <p className="text-xs text-ink-muted">{k}</p>
              <p className="mt-0.5 font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-muted">The shares are held for {offering.hold_days} days. Sign the agreement before then, or release them back to the offering.</p>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

/** Money received at the office or by bank; applied to late fees first, then the oldest installment. */
export function RecordPaymentModal({ view, onClose }: { view: SaleView; onClose: () => void }) {
  const { userId } = useMockSession();
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(String(view.due_now || (view.next ? view.next.remaining + view.next.late_fee_due : '')));
  const [method, setMethod] = useState<SharePaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState('');
  const { error, busy, run } = useAction();
  const value = Math.round(Number(amount) || 0);
  const alloc = value > 0 && value <= maxSharePayable(view) ? allocateSharePayment(view, value) : [];

  return (
    <Modal
      open
      title="Record a payment"
      subtitle={`${view.sale.code} · owes ${formatBdt(maxSharePayable(view))} in all${view.due_now ? ` · ${formatBdt(view.due_now)} overdue` : ''}`}
      icon={HandCoins}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => run(() => shareSaleRepository.recordPayment({ sale_id: view.sale.id, paid_on: date, amount: value, method, reference, notes, account_id: accountId || null }, userId), onClose)}
          >
            {busy ? 'Saving…' : 'Record payment'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Amount received" required>
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Received on" required>
          <TextInput type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Method" required>
          <SelectInput value={method} onChange={(e) => setMethod(e.target.value as SharePaymentMethod)}>
            {SHARE_PAYMENT_METHODS.filter((m) => m !== 'online').map((m) => (
              <option key={m} value={m}>
                {SHARE_PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Reference" hint="Deposit slip, cheque or transaction number">
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {/* BUYER-PORTAL-PLAN.md §2.6 — the account puts investor money in Cash Position */}
        <AccountPicker label="Received into" value={accountId} onChange={setAccountId} />
        <Field label="Notes" className="md:col-span-2">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {alloc.length > 0 && (
        <div className="mt-4 rounded-xl border border-hairline bg-white text-sm">
          <p className="border-b border-hairline px-4 py-2.5 font-semibold text-ink">How it is applied</p>
          <ul className="divide-y divide-hairline">
            {alloc.map((a) => {
              const i = view.schedule.find((x) => x.id === a.installment_id)!;
              return (
                <li key={a.installment_id} className="flex justify-between gap-3 px-4 py-2">
                  <span>
                    {i.label} <span className="text-xs text-ink-muted">due {formatDate(i.due_date)}</span>
                    {a.late_fee > 0 && <span className="text-xs text-ink-muted"> · incl. {formatBdt(a.late_fee)} late fee</span>}
                  </span>
                  <span className="tabular-nums">
                    {formatBdt(a.principal + a.late_fee)}
                    {a.principal < i.remaining && <span className="ml-1 text-xs text-amber-700">(part)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ErrorNote error={error} />
    </Modal>
  );
}

/** Release a reservation, or cancel a signed purchase — both need a reason on file. */
export function ReasonModal({ sale, kind, onClose }: { sale: ShareSale; kind: 'release' | 'cancel'; onClose: () => void }) {
  const [note, setNote] = useState('');
  const { error, busy, run } = useAction();
  const release = kind === 'release';
  return (
    <Modal
      open
      title={release ? 'Release reserved shares' : 'Cancel this purchase'}
      subtitle={`${sale.code} · ${sale.shares} shares go back to the offering`}
      tone={release ? 'warning' : 'danger'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => run(() => (release ? shareSaleRepository.release(sale.id, note) : shareSaleRepository.cancelSale(sale.id, note)), onClose)}
          >
            {release ? 'Release shares' : 'Cancel purchase'}
          </Button>
        </>
      }
    >
      <Field label="Reason" required={!release}>
        <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={release ? 'e.g. Hold period ended, customer did not sign' : 'e.g. Unpaid beyond 90 days, cancelled as per agreement'} />
      </Field>
      {!release && <p className="mt-3 text-xs text-ink-muted">Any refund follows the agreement and is paid outside this screen.</p>}
      <ErrorNote error={error} />
    </Modal>
  );
}

/** Opens a draft from a chosen day until its close date — the one planned on the draft, which can still change here. */
export function OpenOfferingModal({ offering, onClose }: { offering: ShareOffering; onClose: () => void }) {
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const [closes, setCloses] = useState(offering.closes_on && offering.closes_on >= today ? offering.closes_on : closesOn(today, offering.validity_days));
  const { error, busy, run } = useAction();
  const days = closes >= date ? daysBetween(date, closes) + 1 : 0;
  return (
    <Modal
      open
      title="Open this offering"
      subtitle={`${offering.total_shares} shares at ${formatBdt(offering.price_per_share)}`}
      icon={CalendarPlus}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !days} onClick={() => run(() => shareOfferingRepository.open(offering.id, date, closes), onClose)}>
            Open for sale
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Opens on" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Closes on" required hint={days ? `Open for ${days} day${days === 1 ? '' : 's'}` : undefined} error={days ? undefined : 'Pick a day on or after the opening day'}>
          <TextInput type="date" value={closes} min={date} onChange={(e) => setCloses(e.target.value)} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-ink-muted">Once open, the price and terms are fixed. Customers who buy keep them, whatever later offerings charge.</p>
      <ErrorNote error={error} />
    </Modal>
  );
}

export function ExtendOfferingModal({ offering, onClose }: { offering: ShareOffering; onClose: () => void }) {
  const [days, setDays] = useState('30');
  const { error, busy, run } = useAction();
  return (
    <Modal
      open
      title="Extend the validity"
      subtitle={`Now closes ${formatDate(offering.closes_on)}`}
      icon={CalendarPlus}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => run(() => shareOfferingRepository.extend(offering.id, Number(days)), onClose)}>
            Extend
          </Button>
        </>
      }
    >
      <Field label="Extra days" required>
        <TextInput type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <ErrorNote error={error} />
    </Modal>
  );
}
