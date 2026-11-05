'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleDollarSign, Clock3, HandCoins, Landmark, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/public/ui/Button';
import { WITHDRAWAL_METHODS, type WithdrawalMethod } from '@/lib/db/types';
import { formatDay, formatTaka } from '@/lib/domain/investor-portal';
import { WITHDRAWAL_METHOD_LABEL, WITHDRAWAL_STATUS_META } from '@/lib/domain/revenue-share';
import { earningsRepository, type EarningBalance, type Earnings } from '@/lib/repositories/investor/earnings.repository';
import { cn } from '@/lib/utils/cn';
import { PortalDialog } from '../PortalDialog';
import { EmptyNote, Money, PageHeading, Panel, StatCard } from '../ui';

const input =
  'h-12 w-full rounded-xl border-2 border-site-line bg-white px-4 text-[15px] transition-colors focus:border-site-primary focus:outline-none';

const STATUS_CLS: Record<keyof typeof WITHDRAWAL_STATUS_META, string> = {
  requested: 'bg-site-booked-soft text-site-booked',
  approved: 'bg-site-sold-soft text-site-sold',
  paid: 'bg-site-primary-soft text-site-primary-dark',
  rejected: 'bg-red-50 text-site-danger',
};

/**
 * Earnings (REVENUE-SHARE-PLAN.md §5.3–§5.4): what each project earned the
 * customer, period by period, the balance waiting for them, and asking for
 * it to be paid once it reaches the project's minimum.
 */
export function EarningsPage() {
  const data = useLiveQuery(() => earningsRepository.earnings(), []);
  const [asking, setAsking] = useState<EarningBalance | null>(null);

  if (data === undefined) return <p className="text-site-muted">Loading…</p>;
  if (!data) return null;
  const pending = data.requests.filter((r) => r.status === 'requested' || r.status === 'approved');

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Profit share"
        title="My earnings"
        description="Your share of each project's profit, after tax withheld. Ask for your balance to be paid once it reaches the minimum."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Earned to date" value={<Money amount={data.total_credited} />} icon={TrendingUp} />
        <StatCard label="Balance to withdraw" value={<Money amount={data.total_balance} />} icon={Wallet} tone="primary" />
        <StatCard
          label="Being paid"
          value={<Money amount={pending.reduce((t, r) => t + r.amount, 0)} />}
          hint={pending.length ? `${pending.length} request${pending.length === 1 ? '' : 's'} with our office` : 'No open requests'}
          icon={Clock3}
        />
      </div>

      {data.balances.length === 0 ? (
        <Panel>
          <EmptyNote
            icon={CircleDollarSign}
            title="No profit shared yet"
            body="When a project you hold shares in declares a profit, your share appears here."
          />
        </Panel>
      ) : (
        <Panel title="Balance by project" padded={false}>
          <ul className="divide-y divide-site-line">
            {data.balances.map((b) => (
              <li key={b.project_id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-site-primary-soft text-site-primary">
                  <Landmark className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{b.project_name}</p>
                  <p className="text-[13px] text-site-muted">
                    Earned <Money amount={b.credited} /> · paid <Money amount={b.paid_out} />
                    {b.pending > 0 && (
                      <>
                        {' '}
                        · <Money amount={b.pending} /> on its way
                      </>
                    )}
                  </p>
                  {!b.can_request && b.reason && <p className="mt-0.5 text-[13px] text-site-faint">{b.reason}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <Money amount={b.balance} className="text-lg font-semibold" />
                  <Button size="sm" disabled={!b.can_request} onClick={() => setAsking(b)} icon={<HandCoins className="size-4" />}>
                    Request payout
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {data.lines.length > 0 && <PeriodTable data={data} />}

      {data.requests.length > 0 && (
        <Panel title="Payout requests" padded={false}>
          <ul className="divide-y divide-site-line">
            {data.requests.map((r) => (
              <li key={r.code} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <Money amount={r.amount} /> · {r.project_name}
                  </p>
                  <p className="text-[13px] text-site-muted">
                    {r.code} · asked {formatDay(r.requested_on)} · {WITHDRAWAL_METHOD_LABEL[r.method]} to {r.pay_to}
                  </p>
                  {r.status === 'paid' && (
                    <p className="text-[13px] text-site-muted">
                      Paid {formatDay(r.paid_on)}
                      {r.reference ? ` · ref. ${r.reference}` : ''}
                    </p>
                  )}
                  {r.status === 'rejected' && r.reject_reason && <p className="text-[13px] text-site-danger">{r.reject_reason}</p>}
                </div>
                <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', STATUS_CLS[r.status])}>
                  {WITHDRAWAL_STATUS_META[r.status].label}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {asking && <RequestDialog balance={asking} data={data} onClose={() => setAsking(null)} />}
    </div>
  );
}

function PeriodTable({ data }: { data: Earnings }) {
  return (
    <Panel title="Period by period" padded={false}>
      <ul className="divide-y divide-site-line sm:hidden">
        {data.lines.map((l) => (
          <li key={l.id} className="px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">
                {l.period_label} · {l.project_name}
              </span>
              <Money amount={l.net} className="font-semibold" />
            </div>
            <p className="mt-0.5 text-[13px] text-site-muted">
              Project profit {formatTaka(l.project_profit)} · your {l.ownership_pct.toFixed(3)}%
              {l.counted_pct < 100 ? ` (${l.counted_pct}% counted)` : ''} · tax {formatTaka(l.tax)}
              {l.to_dues > 0 ? ` · ${formatTaka(l.to_dues)} paid onto your installments` : ''}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[820px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-site-line text-xs tracking-wide text-site-muted uppercase">
              <th className="px-6 py-3 font-semibold">Period</th>
              <th className="px-3 py-3 text-right font-semibold">Project profit</th>
              <th className="px-3 py-3 text-right font-semibold">Shared</th>
              <th className="px-3 py-3 text-right font-semibold">Your part</th>
              <th className="px-3 py-3 text-right font-semibold">Your share</th>
              <th className="px-3 py-3 text-right font-semibold">Tax</th>
              <th className="px-6 py-3 text-right font-semibold">Credited</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-site-line">
            {data.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-6 py-3.5">
                  <p className="font-semibold">{l.period_label}</p>
                  <p className="text-[13px] text-site-muted">
                    {l.project_name}
                    {l.holding_code ? ` · ${l.holding_code}` : ''}
                  </p>
                </td>
                <td className="px-3 py-3.5 text-right">
                  <Money amount={l.project_profit} />
                  <p className="text-[12px] text-site-faint">
                    {formatTaka(l.project_income)} in − {formatTaka(l.project_cost)} cost
                  </p>
                </td>
                <td className="px-3 py-3.5 text-right">
                  <Money amount={l.project_declared} />
                </td>
                <td className="tabular px-3 py-3.5 text-right">
                  {l.ownership_pct.toFixed(3)}%
                  {l.counted_pct < 100 && <p className="text-[12px] text-site-faint">{l.counted_pct}% counted</p>}
                </td>
                <td className="px-3 py-3.5 text-right">
                  <Money amount={l.gross} />
                </td>
                <td className="px-3 py-3.5 text-right text-site-muted">
                  <Money amount={l.tax} />
                </td>
                <td className="px-6 py-3.5 text-right">
                  <Money amount={l.net} className="font-semibold" />
                  {l.to_dues > 0 && (
                    <p className="text-[12px] text-site-faint">
                      after <Money amount={l.to_dues} /> to your installments
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RequestDialog({ balance, data, onClose }: { balance: EarningBalance; data: Earnings; onClose: () => void }) {
  const [amount, setAmount] = useState(String(balance.balance));
  const [method, setMethod] = useState<WithdrawalMethod>(data.bank_on_file ? 'bank_transfer' : 'bkash');
  const [payTo, setPayTo] = useState(data.bank_on_file ?? data.phone);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function send() {
    setError('');
    setBusy(true);
    try {
      await earningsRepository.requestPayout({ project_id: balance.project_id, amount: Number(amount), method, pay_to: payTo });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalDialog
      open
      onClose={onClose}
      title={done ? 'Request sent' : 'Request payout'}
      description={done ? undefined : `${balance.project_name} · balance ${formatTaka(balance.balance)}`}
      footer={
        <div className="flex justify-end gap-2">
          {done ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={send} disabled={busy}>
                {busy ? 'Sending…' : `Request ${formatTaka(Number(amount) || 0)}`}
              </Button>
            </>
          )}
        </div>
      }
    >
      {done ? (
        <p className="text-[15px] text-site-muted">
          Our accounts team will pay {formatTaka(Number(amount) || 0)} to {payTo}. You will see it here and in your notifications once it is paid.
        </p>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Amount</span>
            <input type="number" min={balance.min_withdrawal} max={balance.balance} className={input} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="mt-1 block text-[13px] text-site-muted">At least {formatTaka(Math.min(balance.min_withdrawal, balance.balance))}, up to {formatTaka(balance.balance)}.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Pay me by</span>
            <select
              className={input}
              value={method}
              onChange={(e) => {
                const m = e.target.value as WithdrawalMethod;
                setMethod(m);
                setPayTo(m === 'bank_transfer' ? (data.bank_on_file ?? '') : m === 'bkash' || m === 'nagad' ? data.phone : '');
              }}
            >
              {WITHDRAWAL_METHODS.filter((m) => m !== 'cash').map((m) => (
                <option key={m} value={m}>
                  {WITHDRAWAL_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">{method === 'bank_transfer' ? 'Bank account' : method === 'cheque' ? 'Cheque in the name of' : 'Wallet number'}</span>
            <input className={input} value={payTo} onChange={(e) => setPayTo(e.target.value)} />
          </label>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-site-danger">{error}</p>}
        </div>
      )}
    </PortalDialog>
  );
}
