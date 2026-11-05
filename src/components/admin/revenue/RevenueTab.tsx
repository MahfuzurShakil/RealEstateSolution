'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CalendarRange,
  CircleDollarSign,
  HandCoins,
  Landmark,
  PiggyBank,
  Plus,
  Receipt,
  Settings2,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { Kpi } from '@/components/admin/share-sale/bits';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubTabs } from '@/components/ui/SubTabs';
import type { RevenueEntry } from '@/lib/db/types';
import {
  DISTRIBUTION_FREQUENCY_LABEL,
  ELIGIBILITY_LABEL,
  ENTRY_FREQUENCY_LABEL,
  LENDER_TYPE_LABEL,
  LOSS_RULE_LABEL,
  MGMT_FEE_LABEL,
  WITHDRAWAL_WINDOW_LABEL,
} from '@/lib/domain/revenue-share';
import {
  bankAccountRepository,
  loanRepository,
  projectCapTable,
  projectProfitBalances,
  revenueEntryRepository,
  revenueOverview,
  type CapTableRow,
  type HolderBalance,
  type LoanRow,
  type PeriodRow,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';
import { PeriodBadge } from './bits';
import {
  ClosePeriodModal,
  DaySheetModal,
  EntryModal,
  LoanModal,
  OfficeWithdrawalModal,
  PolicyModal,
  RepayModal,
} from './RevenueModals';

type Sub = 'periods' | 'register' | 'owners' | 'loans' | 'settings';

type ModalState =
  | { kind: 'policy' }
  | { kind: 'entry' }
  | { kind: 'day' }
  | { kind: 'close'; index: number }
  | { kind: 'loan' }
  | { kind: 'repay'; row: LoanRow }
  | { kind: 'pay'; balance: HolderBalance }
  | null;

/**
 * Income & Profit (REVENUE-SHARE-PLAN.md R1–R4): a running project's
 * register, its periods from running to declared, who owns it, and the loans
 * that kept it going. Switching it on is saving the settings.
 */
export function RevenueTab({ projectId, mayEdit }: { projectId: string; mayEdit: boolean }) {
  const overview = useLiveQuery(() => revenueOverview(projectId), [projectId]);
  const [sub, setSub] = useState<Sub>('periods');
  const [modal, setModal] = useState<ModalState>(null);

  if (overview === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  const close = () => setModal(null);
  const modals = (
    <>
      {modal?.kind === 'policy' && <PolicyModal projectId={projectId} policy={overview?.policy} onClose={close} />}
      {modal?.kind === 'entry' && <EntryModal projectId={projectId} onClose={close} />}
      {modal?.kind === 'day' && <DaySheetModal projectId={projectId} onClose={close} />}
      {modal?.kind === 'close' && <ClosePeriodModal projectId={projectId} index={modal.index} onClose={close} />}
      {modal?.kind === 'loan' && <LoanModal projectId={projectId} onClose={close} />}
      {modal?.kind === 'repay' && <RepayModal row={modal.row} onClose={close} />}
      {modal?.kind === 'pay' && <OfficeWithdrawalModal balance={modal.balance} onClose={close} />}
    </>
  );

  if (!overview) {
    return (
      <>
        <EmptyState
          icon={TrendingUp}
          title="Revenue sharing is off for this project"
          description="For a project that earns money — a hotel, rented floors, a resort. Record its income and cost, work out each period's profit, and share it with the customers who bought shares and the owners."
          action={
            mayEdit && (
              <Button onClick={() => setModal({ kind: 'policy' })}>
                <Settings2 className="size-4" /> Turn on revenue sharing
              </Button>
            )
          }
        />
        {modals}
      </>
    );
  }

  const due = overview.periods.filter((p) => p.status === 'due');

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Income to date" value={formatBdt(overview.income_to_date)} icon={TrendingUp} />
        <Kpi
          label="Profit to date"
          value={formatBdt(overview.income_to_date - overview.cost_to_date)}
          hint={`after ${formatBdt(overview.cost_to_date)} running cost`}
          icon={CircleDollarSign}
          tone={overview.income_to_date < overview.cost_to_date ? 'danger' : 'default'}
        />
        <Kpi label="Shared to date" value={formatBdt(overview.declared_to_date)} icon={HandCoins} />
        <Kpi
          label="Loss to recover"
          value={formatBdt(overview.loss_to_recover)}
          hint={overview.loss_to_recover > 0 ? 'filled before anything is shared' : 'none carried'}
          icon={AlertTriangle}
          tone={overview.loss_to_recover > 0 ? 'danger' : 'default'}
        />
        <Kpi label="Reserve held" value={formatBdt(overview.reserve_balance)} icon={PiggyBank} />
        <Kpi label="Loans outstanding" value={formatBdt(overview.loans_outstanding)} icon={Landmark} />
      </div>

      {due.length > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          {due.map((p) => p.dates.label).join(', ')} {due.length === 1 ? 'has' : 'have'} ended and can be closed.
        </p>
      )}

      <SubTabs
        tabs={[
          { key: 'periods', label: `Periods (${DISTRIBUTION_FREQUENCY_LABEL[overview.policy.distribution_frequency]})` },
          { key: 'register', label: 'Income & cost' },
          { key: 'owners', label: 'Who owns it' },
          { key: 'loans', label: 'Loans' },
          { key: 'settings', label: 'Settings' },
        ]}
        active={sub}
        onChange={setSub}
        actions={
          mayEdit &&
          (sub === 'register' || sub === 'periods' ? (
            <>
              {overview.policy.entry_frequency === 'daily' && (
                <Button variant="outline" size="sm" onClick={() => setModal({ kind: 'day' })}>
                  <CalendarRange className="size-4" /> Daily sheet
                </Button>
              )}
              <Button size="sm" onClick={() => setModal({ kind: 'entry' })}>
                <Plus className="size-4" /> Income or cost
              </Button>
            </>
          ) : sub === 'loans' ? (
            <Button size="sm" onClick={() => setModal({ kind: 'loan' })}>
              <Landmark className="size-4" /> Take a loan
            </Button>
          ) : sub === 'settings' ? (
            <Button variant="outline" size="sm" onClick={() => setModal({ kind: 'policy' })}>
              <Settings2 className="size-4" /> Edit settings
            </Button>
          ) : null)
        }
      />

      {sub === 'periods' && (
        <PeriodsTable rows={overview.periods} mayEdit={mayEdit} onClose={(index) => setModal({ kind: 'close', index })} />
      )}
      {sub === 'register' && <Register projectId={projectId} mayEdit={mayEdit} />}
      {sub === 'owners' && <Owners projectId={projectId} mayEdit={mayEdit} onPay={(balance) => setModal({ kind: 'pay', balance })} />}
      {sub === 'loans' && <Loans projectId={projectId} mayEdit={mayEdit} onRepay={(row) => setModal({ kind: 'repay', row })} />}
      {sub === 'settings' && <SettingsCard overview={overview} />}
      {modals}
    </div>
  );
}

/* ----------------------------------------------------------------- periods */

function PeriodsTable({ rows, mayEdit, onClose }: { rows: PeriodRow[]; mayEdit: boolean; onClose: (index: number) => void }) {
  const columns: Column<PeriodRow & { id: string }>[] = [
    {
      key: 'label',
      header: 'Period',
      cell: (r) => (
        <div>
          <p className="font-medium text-ink">{r.dates.label}</p>
          <p className="text-xs text-ink-muted">
            {formatDate(r.dates.start)} – {formatDate(r.dates.end)}
          </p>
        </div>
      ),
    },
    { key: 'income', header: 'Income', align: 'right', cell: (r) => formatBdt(r.income) },
    { key: 'cost', header: 'Cost', align: 'right', cell: (r) => formatBdt(r.cost) },
    {
      key: 'profit',
      header: 'Profit / loss',
      align: 'right',
      cell: (r) => <span className={cn('whitespace-nowrap', r.profit < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatBdt(r.profit)}</span>,
    },
    { key: 'shared', header: 'Shared', align: 'right', cell: (r) => (r.shared === null ? '—' : formatBdt(r.shared)) },
    { key: 'status', header: 'Status', cell: (r) => <PeriodBadge status={r.status} /> },
    {
      key: 'action',
      header: '',
      align: 'right',
      cell: (r) =>
        r.stored ? (
          <Link href={`/admin/share-sale/profit/${r.stored.id}`}>
            <Button variant="outline" size="sm">
              Open
            </Button>
          </Link>
        ) : (
          <Button variant={r.status === 'due' ? 'primary' : 'ghost'} size="sm" onClick={() => onClose(r.dates.index)}>
            {r.status === 'due' && mayEdit ? 'Close period' : 'Preview'}
          </Button>
        ),
    },
  ];
  return (
    <Card className="p-0">
      <DataTable
        rows={rows.map((r) => ({ ...r, id: r.dates.start }))}
        columns={columns}
        label="periods"
        emptyState={<p className="p-6 text-sm text-ink-muted">The first period has not started yet.</p>}
        mobileCard={(r) => (
          <div className="space-y-1 p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-ink">{r.dates.label}</p>
              <PeriodBadge status={r.status} />
            </div>
            <p className="text-sm text-ink-muted">
              Profit <span className={r.profit < 0 ? 'text-red-600' : 'text-ink'}>{formatBdt(r.profit)}</span>
              {r.shared !== null && ` · shared ${formatBdt(r.shared)}`}
            </p>
            {r.stored ? (
              <Link href={`/admin/share-sale/profit/${r.stored.id}`} className="text-sm font-medium text-admin-700">
                Open →
              </Link>
            ) : (
              <button type="button" className="text-sm font-medium text-admin-700" onClick={() => onClose(r.dates.index)}>
                {r.status === 'due' && mayEdit ? 'Close period →' : 'Preview →'}
              </button>
            )}
          </div>
        )}
      />
    </Card>
  );
}

/* ---------------------------------------------------------------- register */

function Register({ projectId, mayEdit }: { projectId: string; mayEdit: boolean }) {
  const entries = useLiveQuery(() => revenueEntryRepository.forProject(projectId), [projectId]);
  const accounts = useLiveQuery(() => bankAccountRepository.list(), []);
  const [filter, setFilter] = useState<'all' | 'income' | 'cost'>('all');
  const [removing, setRemoving] = useState<RevenueEntry | null>(null);
  const [error, setError] = useState('');
  const account = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const rows = (entries ?? []).filter((e) => filter === 'all' || e.direction === filter);

  const columns: Column<RevenueEntry>[] = [
    { key: 'date', header: 'Date', sortValue: (e) => e.entry_date, cell: (e) => formatDate(e.entry_date) },
    {
      key: 'head',
      header: 'Head',
      cell: (e) => (
        <span className="flex items-center gap-2">
          <Badge tone={e.direction === 'income' ? 'green' : 'neutral'}>{e.direction === 'income' ? 'Income' : 'Cost'}</Badge>
          {e.head}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (e) => e.amount,
      cell: (e) => <span className={e.direction === 'cost' ? 'text-red-600' : 'text-ink'}>{formatBdt(e.amount)}</span>,
    },
    { key: 'account', header: 'Account', cell: (e) => account.get(e.account_id ?? '') ?? '—' },
    { key: 'ref', header: 'Ref.', cell: (e) => <span className="text-xs text-ink-muted">{e.reference_no ?? e.code}</span> },
    {
      key: 'x',
      header: '',
      align: 'right',
      cell: (e) =>
        mayEdit && (
          <button type="button" aria-label="Remove" className="text-slate-400 hover:text-red-600" onClick={() => setRemoving(e)}>
            <Trash2 className="size-4" />
          </button>
        ),
    },
  ];

  return (
    <Card className="p-0">
      <div className="flex flex-wrap gap-1 border-b border-hairline p-3">
        {(['all', 'income', 'cost'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm',
              filter === k ? 'bg-admin-50 font-medium text-admin-700' : 'text-ink-muted hover:text-ink',
            )}
          >
            {k === 'all' ? 'All' : k === 'income' ? 'Income' : 'Cost'}
          </button>
        ))}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        initialSort={{ key: 'date', direction: 'desc' }}
        label="entries"
        emptyState={
          <div className="p-6">
            <EmptyState icon={Receipt} title="Nothing recorded yet" description="Add the business's takings and bills as they happen." />
          </div>
        }
        mobileCard={(e) => (
          <div className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-ink">{e.head}</p>
              <p className="text-xs text-ink-muted">
                {formatDate(e.entry_date)} · {account.get(e.account_id ?? '') ?? '—'}
              </p>
            </div>
            <span className={cn('text-sm tabular-nums', e.direction === 'cost' ? 'text-red-600' : 'text-ink')}>
              {e.direction === 'cost' ? '− ' : ''}
              {formatBdt(e.amount)}
            </span>
          </div>
        )}
      />
      <ConfirmDialog
        open={!!removing}
        title="Remove this entry?"
        message={removing ? `${removing.head}, ${formatBdt(removing.amount)} on ${formatDate(removing.entry_date)}.${error ? ` ${error}` : ''}` : ''}
        confirmLabel="Remove"
        onCancel={() => {
          setRemoving(null);
          setError('');
        }}
        onConfirm={async () => {
          try {
            await revenueEntryRepository.removeEntry(removing!.id);
            setRemoving(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not remove.');
          }
        }}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ owners */

function Owners({ projectId, mayEdit, onPay }: { projectId: string; mayEdit: boolean; onPay: (b: HolderBalance) => void }) {
  const cap = useLiveQuery(() => projectCapTable(projectId), [projectId]);
  const balances = useLiveQuery(() => projectProfitBalances(projectId), [projectId]);
  if (!cap) return <p className="text-sm text-ink-muted">Loading…</p>;
  const balanceOf = new Map((balances ?? []).map((b) => [b.holder_id, b]));

  const columns: Column<CapTableRow & { id: string }>[] = [
    {
      key: 'name',
      header: 'Holder',
      cell: (r) => (
        <div>
          {r.href ? (
            <Link href={r.href} className="font-medium text-admin-700 hover:underline">
              {r.name}
            </Link>
          ) : (
            <p className="font-medium text-ink">{r.name}</p>
          )}
          <p className="text-xs text-ink-muted">
            {r.kind === 'customer' ? `${r.code} · ${r.shares} shares · ${r.paid_pct}% paid` : `${r.code ?? ''} · owner`}
          </p>
        </div>
      ),
    },
    { key: 'pct', header: 'Ownership', align: 'right', cell: (r) => `${r.ownership_pct.toFixed(3)}%` },
    {
      key: 'credited',
      header: 'Profit credited',
      align: 'right',
      cell: (r) => {
        const b = r.kind === 'owner' ? balanceOf.get(r.key) : undefined;
        return b ? formatBdt(b.credited) : r.kind === 'owner' ? '—' : <span className="text-xs text-ink-muted">see customer</span>;
      },
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (r) => {
        const b = r.kind === 'owner' ? balanceOf.get(r.key) : undefined;
        if (!b) return '—';
        return (
          <span className="flex items-center justify-end gap-2">
            {formatBdt(b.balance)}
            {mayEdit && b.balance > 0 && (
              <Button size="sm" variant="outline" onClick={() => onPay(b)}>
                Pay
              </Button>
            )}
          </span>
        );
      },
    },
  ];

  const customerBalances = (balances ?? []).filter((b) => b.holder_type === 'customer');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Ownership today" subtitle="Owners hold whatever customers do not — unsold shares included — split by partner share." />
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="bg-admin-500" style={{ width: `${cap.customers_pct}%` }} />
          <div className="bg-amber-400" style={{ width: `${cap.owners_pct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted">
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-admin-500" />
            Customers {cap.customers_pct.toFixed(2)}%
          </span>
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-amber-400" />
            Owners {cap.owners_pct.toFixed(2)}%
          </span>
        </div>
      </Card>
      <Card className="p-0">
        <DataTable rows={cap.rows.map((r) => ({ ...r, id: r.key }))} columns={columns} label="holders" pageSize={50} />
      </Card>
      {customerBalances.length > 0 && (
        <Card>
          <CardHeader title="Customer profit balances" subtitle="Customers ask for payment from the Customer Portal; requests land in Share Sale → Profit Withdrawals." />
          <div className="divide-y divide-hairline">
            {customerBalances.map((b) => (
              <div key={b.holder_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink">{b.holder_name}</span>
                <span className="tabular-nums text-ink-muted">
                  credited {formatBdt(b.credited)} · balance <span className="font-medium text-ink">{formatBdt(b.balance)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- loans */

function Loans({ projectId, mayEdit, onRepay }: { projectId: string; mayEdit: boolean; onRepay: (r: LoanRow) => void }) {
  const rows = useLiveQuery(() => loanRepository.rows(projectId), [projectId]);
  const columns: Column<LoanRow & { id: string }>[] = [
    {
      key: 'lender',
      header: 'Lender',
      cell: (r) => (
        <div>
          <p className="font-medium text-ink">{r.loan.lender_name}</p>
          <p className="text-xs text-ink-muted">
            {r.loan.code} · {LENDER_TYPE_LABEL[r.loan.lender_type]} · {r.loan.interest_pct}% interest
          </p>
        </div>
      ),
    },
    { key: 'taken', header: 'Taken', cell: (r) => formatDate(r.loan.taken_on) },
    { key: 'principal', header: 'Borrowed', align: 'right', cell: (r) => formatBdt(r.loan.principal) },
    { key: 'repaid', header: 'Repaid', align: 'right', cell: (r) => formatBdt(r.repaid) },
    { key: 'out', header: 'Owed', align: 'right', cell: (r) => <span className="font-medium">{formatBdt(r.outstanding)}</span> },
    {
      key: 'status',
      header: '',
      align: 'right',
      cell: (r) =>
        r.loan.status === 'active' ? (
          mayEdit && (
            <Button size="sm" variant="outline" onClick={() => onRepay(r)}>
              Repay
            </Button>
          )
        ) : (
          <Badge tone="green">Repaid</Badge>
        ),
    },
  ];
  return (
    <Card className="p-0">
      <DataTable
        rows={(rows ?? []).map((r) => ({ ...r, id: r.loan.id }))}
        columns={columns}
        label="loans"
        emptyState={
          <div className="p-6">
            <EmptyState icon={Landmark} title="No loans" description="Money borrowed from a person, a bank or a partner — often to cover a loss period." />
          </div>
        }
      />
    </Card>
  );
}

/* ---------------------------------------------------------------- settings */

function SettingsCard({ overview }: { overview: NonNullable<Awaited<ReturnType<typeof revenueOverview>>> }) {
  const p = overview.policy;
  const rows: [string, string][] = [
    ['Income and cost typed', ENTRY_FREQUENCY_LABEL[p.entry_frequency]],
    ['Profit shared', DISTRIBUTION_FREQUENCY_LABEL[p.distribution_frequency]],
    ['First period starts', formatDate(p.first_period_start)],
    ['Past losses', LOSS_RULE_LABEL[p.loss_rule]],
    ['Reserve kept back', `${p.reserve_pct}%`],
    [
      'Management fee',
      p.mgmt_fee_type === 'none' ? MGMT_FEE_LABEL.none : p.mgmt_fee_type === 'fixed' ? `${formatBdt(p.mgmt_fee_value)} a period` : `${p.mgmt_fee_value}${MGMT_FEE_LABEL[p.mgmt_fee_type]}`,
    ],
    ['Loan principal set aside first', p.repay_loans_first ? 'Yes' : 'No'],
    ['Customer holdings share', ELIGIBILITY_LABEL[p.eligibility_rule]],
    ['Days held counted', p.prorate_days ? 'Yes' : 'No'],
    ['Tax withheld', `${p.tax_withholding_pct}%`],
    ['Overdue installments paid first', p.adjust_overdue_first ? 'Yes' : 'No'],
    ['Minimum withdrawal', formatBdt(p.min_withdrawal)],
    [
      'Customers can ask',
      p.withdrawal_window === 'anytime'
        ? WITHDRAWAL_WINDOW_LABEL.anytime
        : p.withdrawal_window === 'after_declare'
          ? `Within ${p.withdrawal_window_days} days of a declaration`
          : `On day ${p.withdrawal_window_days} of each month`,
    ],
  ];
  return (
    <Card>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-hairline py-2.5 text-sm last:border-0">
          <span className="text-ink-muted">{k}</span>
          <span className="text-right font-medium text-ink">{v}</span>
        </div>
      ))}
    </Card>
  );
}
