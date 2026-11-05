'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BadgeCheck, Banknote, Clock, HandCoins, Wallet } from 'lucide-react';
import { WithdrawalBadge } from '@/components/admin/revenue/bits';
import { PayWithdrawalModal, RejectWithdrawalModal } from '@/components/admin/revenue/RevenueModals';
import { Kpi } from '@/components/admin/share-sale/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { WITHDRAWAL_STATUSES, type WithdrawalStatus } from '@/lib/db/types';
import { canEdit } from '@/lib/domain/access';
import { WITHDRAWAL_METHOD_LABEL, WITHDRAWAL_STATUS_META } from '@/lib/domain/revenue-share';
import { profitWithdrawalRepository, type WithdrawalRow } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * Profit payouts (REVENUE-SHARE-PLAN.md §5.3): customers ask from the
 * Customer Portal, the office asks for partners; Accounts approves, rejects
 * with a reason, or records the payment — which reaches Cash Position.
 */
export default function WithdrawalsPage() {
  const { role, userId } = useMockSession();
  const mayEdit = canEdit(role, 'share_sale');
  const rows = useLiveQuery(() => profitWithdrawalRepository.rows(), []);
  const [status, setStatus] = useState<WithdrawalStatus | 'open' | ''>('open');
  const [pay, setPay] = useState<WithdrawalRow | null>(null);
  const [reject, setReject] = useState<WithdrawalRow | null>(null);
  if (!rows) return <p className="text-sm text-ink-muted">Loading…</p>;

  const open = (r: WithdrawalRow) => r.withdrawal.status === 'requested' || r.withdrawal.status === 'approved';
  const shown = rows.filter((r) => (status === 'open' ? open(r) : !status || r.withdrawal.status === status));
  const total = (f: (r: WithdrawalRow) => boolean) => rows.filter(f).reduce((s, r) => s + r.withdrawal.amount, 0);

  const columns: Column<WithdrawalRow & { id: string }>[] = [
    {
      key: 'who',
      header: 'Who',
      cell: (r) => (
        <div>
          <p className="font-medium text-ink">{r.holder_name}</p>
          <p className="text-xs text-ink-muted">
            {r.withdrawal.code} · {r.withdrawal.holder_type === 'customer' ? 'Customer' : 'Owner'} ·{' '}
            {r.withdrawal.channel === 'portal' ? 'from the portal' : 'by the office'}
          </p>
        </div>
      ),
    },
    { key: 'project', header: 'Project', cell: (r) => r.project_name },
    { key: 'asked', header: 'Asked on', sortValue: (r) => r.withdrawal.requested_on, cell: (r) => formatDate(r.withdrawal.requested_on) },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (r) => r.withdrawal.amount, cell: (r) => <span className="font-medium">{formatBdt(r.withdrawal.amount)}</span> },
    {
      key: 'to',
      header: 'Pay to',
      cell: (r) => (
        <div className="text-sm">
          <p>{WITHDRAWAL_METHOD_LABEL[r.withdrawal.method]}</p>
          <p className="text-xs text-ink-muted">{r.withdrawal.pay_to}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div>
          <WithdrawalBadge status={r.withdrawal.status} />
          {r.withdrawal.status === 'paid' && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {formatDate(r.withdrawal.paid_on)} · {r.account_name}
            </p>
          )}
          {r.withdrawal.status === 'rejected' && <p className="mt-0.5 max-w-48 text-xs text-ink-muted">{r.withdrawal.reject_reason}</p>}
        </div>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (r) =>
        mayEdit &&
        open(r) && (
          <div className="flex justify-end gap-2">
            {r.withdrawal.status === 'requested' && (
              <Button size="sm" variant="outline" onClick={() => profitWithdrawalRepository.approve(r.withdrawal.id, userId)}>
                Approve
              </Button>
            )}
            <Button size="sm" onClick={() => setPay(r)}>
              Pay
            </Button>
            <Button size="sm" variant="dangerGhost" onClick={() => setReject(r)}>
              Reject
            </Button>
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Profit Withdrawals"
        subtitle="Customers ask for their profit balance from the Customer Portal; partners are paid from the project's Income & Profit tab."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="New requests" value={rows.filter((r) => r.withdrawal.status === 'requested').length} icon={Clock} />
        <Kpi label="Approved, to pay" value={formatBdt(total((r) => r.withdrawal.status === 'approved'))} icon={BadgeCheck} />
        <Kpi label="Waiting in total" value={formatBdt(total(open))} icon={Wallet} />
        <Kpi label="Paid out" value={formatBdt(total((r) => r.withdrawal.status === 'paid'))} icon={Banknote} />
      </div>
      <Card className="p-0">
        <div className="border-b border-hairline p-4">
          <FilterBar>
            <FilterSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value as WithdrawalStatus | 'open' | '')}>
              <option value="open">Waiting (new + approved)</option>
              <option value="">All</option>
              {WITHDRAWAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {WITHDRAWAL_STATUS_META[s].label}
                </option>
              ))}
            </FilterSelect>
          </FilterBar>
        </div>
        <DataTable
          rows={shown.map((r) => ({ ...r, id: r.withdrawal.id }))}
          columns={columns}
          initialSort={{ key: 'asked', direction: 'desc' }}
          label="requests"
          emptyState={
            <div className="p-6">
              <EmptyState icon={HandCoins} title="Nothing waiting" description="Payout requests from customers and partners appear here." />
            </div>
          }
          mobileCard={(r) => (
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{r.holder_name}</p>
                <WithdrawalBadge status={r.withdrawal.status} />
              </div>
              <p className="text-sm text-ink-muted">
                {formatBdt(r.withdrawal.amount)} · {r.project_name} · {WITHDRAWAL_METHOD_LABEL[r.withdrawal.method]}
              </p>
              {mayEdit && open(r) && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setPay(r)}>
                    Pay
                  </Button>
                  <Button size="sm" variant="dangerGhost" onClick={() => setReject(r)}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        />
      </Card>
      {pay && <PayWithdrawalModal id={pay.withdrawal.id} amount={pay.withdrawal.amount} who={`${pay.holder_name} · ${pay.withdrawal.pay_to}`} onClose={() => setPay(null)} />}
      {reject && <RejectWithdrawalModal id={reject.withdrawal.id} onClose={() => setReject(null)} />}
    </>
  );
}
