'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrendingUp } from 'lucide-react';
import { WITHDRAWAL_METHOD_LABEL } from '@/lib/domain/revenue-share';
import { customerProfitBalances, customerProfitHistory, profitWithdrawalRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';
import { WithdrawalBadge } from './bits';

/** Plan §5.4 — what the customer sees under My earnings, from the office's side. */
export function CustomerEarnings({ customerId }: { customerId: string }) {
  const balances = useLiveQuery(() => customerProfitBalances(customerId), [customerId]);
  const history = useLiveQuery(() => customerProfitHistory(customerId), [customerId]);
  const requests = useLiveQuery(() => profitWithdrawalRepository.rows({ customer_id: customerId }), [customerId]);
  if (!balances || !history || !requests) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!history.length) {
    return <EmptyState icon={TrendingUp} title="No profit shared yet" description="Declared profit from the projects this customer holds shares in appears here." />;
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Profit balance" subtitle="Credited after tax, less what was paid out or is waiting to be paid." />
        {balances.map((b) => (
          <div key={b.project_id} className="flex flex-wrap justify-between gap-3 border-b border-hairline py-2.5 text-sm last:border-0">
            <span className="font-medium text-ink">{b.project_name}</span>
            <span className="tabular-nums text-ink-muted">
              credited {formatBdt(b.credited)} · paid {formatBdt(b.paid_out)}
              {b.pending > 0 && ` · waiting ${formatBdt(b.pending)}`} · balance{' '}
              <span className="font-semibold text-ink">{formatBdt(b.balance)}</span>
            </span>
          </div>
        ))}
      </Card>
      <Card>
        <CardHeader title="Period by period" />
        {history.map((h) => (
          <div key={h.allocation.id} className="flex flex-wrap justify-between gap-3 border-b border-hairline py-2.5 text-sm last:border-0">
            <span>
              <Link href={`/admin/share-sale/profit/${h.period.id}`} className="font-medium text-admin-700 hover:underline">
                {h.period.label}
              </Link>
              <span className="text-ink-muted">
                {' '}
                · {h.project_name} · {h.sale_code} · {h.allocation.ownership_pct.toFixed(3)}%
              </span>
            </span>
            <span className="tabular-nums text-ink-muted">
              share {formatBdt(h.allocation.gross)} · tax {formatBdt(h.allocation.tax_withheld)}
              {h.allocation.adjusted_to_dues > 0 && ` · to dues ${formatBdt(h.allocation.adjusted_to_dues)}`} ·{' '}
              <span className="font-semibold text-ink">{formatBdt(h.allocation.net_credited)}</span>
            </span>
          </div>
        ))}
      </Card>
      {requests.length > 0 && (
        <Card>
          <CardHeader title="Payout requests" />
          {requests.map((r) => (
            <div key={r.withdrawal.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-2.5 text-sm last:border-0">
              <span className="text-ink-muted">
                <span className="font-medium text-ink">{formatBdt(r.withdrawal.amount)}</span> · {r.project_name} · asked{' '}
                {formatDate(r.withdrawal.requested_on)} · {WITHDRAWAL_METHOD_LABEL[r.withdrawal.method]}
              </span>
              <WithdrawalBadge status={r.withdrawal.status} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
