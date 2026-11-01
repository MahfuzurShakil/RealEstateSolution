'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Banknote, Inbox, PieChart, Plus, Store, Wallet } from 'lucide-react';
import { AvailabilityBar, Kpi, OfferingBadge } from '@/components/admin/share-sale/bits';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import { formatCrore, formatSharePct } from '@/lib/domain/share-sale';
import { customerPortalInbox, shareSaleOverview, type OfferingRow } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

type Filter = 'all' | 'open' | 'draft' | 'ended';

/**
 * Share Offerings (PROJECT-SHARE-SALE-PLAN.md §4 steps 1–2): every offering
 * of every project — its valuation, what went to the market, how much is
 * sold, reserved and left — with the money it has brought in.
 */
export default function ShareOfferingsPage() {
  const router = useRouter();
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'share_sale');
  const data = useLiveQuery(() => shareSaleOverview(), []);
  const inbox = useLiveQuery(() => customerPortalInbox(), []);
  const [filter, setFilter] = useState<Filter>('all');

  if (!data) return <p className="text-sm text-ink-muted">Loading…</p>;
  const t = data.totals;
  const match = (r: OfferingRow) =>
    filter === 'all' ||
    (filter === 'open' && r.state === 'open') ||
    (filter === 'draft' && r.state === 'draft') ||
    (filter === 'ended' && (r.state === 'expired' || r.state === 'closed' || r.state === 'cancelled'));
  const rows = data.offerings.filter(match).map((r) => ({ ...r, id: r.offering.id }));

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'code',
      header: 'Offering',
      cell: (r) => (
        <span className="block">
          <span className="block font-medium text-ink">{r.project?.name ?? '—'}</span>
          <span className="block text-xs text-ink-muted">
            {r.offering.code} · Round {r.offering.round_no}
          </span>
        </span>
      ),
      sortValue: (r) => r.offering.code,
    },
    {
      key: 'valuation',
      header: 'Valuation',
      cell: (r) => (
        <span className="block">
          <span className="block font-medium tabular-nums">{formatCrore(r.offering.valuation)}</span>
          <span className="block text-xs text-ink-muted tabular-nums">
            NAV {formatCrore(r.offering.net_asset_value)} + {formatCrore(r.offering.premium_value)}
          </span>
        </span>
      ),
      sortValue: (r) => r.offering.valuation,
    },
    {
      key: 'offered',
      header: 'Offered',
      cell: (r) => (
        <span className="block tabular-nums">
          <span className="block font-medium">{formatSharePct(r.offering.offered_pct)}</span>
          <span className="block text-xs text-ink-muted">{r.offering.total_shares} shares</span>
        </span>
      ),
      sortValue: (r) => r.offering.offered_pct,
    },
    { key: 'price', header: 'Price / share', align: 'right', cell: (r) => <span className="tabular-nums">{formatBdt(r.offering.price_per_share)}</span>, sortValue: (r) => r.offering.price_per_share },
    { key: 'sold', header: 'Shares', cell: (r) => <AvailabilityBar a={r.availability} total={r.offering.total_shares} compact />, sortValue: (r) => r.availability.sold_pct },
    {
      key: 'money',
      header: 'Sold / collected',
      align: 'right',
      cell: (r) => (
        <span className="block tabular-nums">
          <span className="block font-medium">{formatBdt(r.sold_value)}</span>
          <span className="block text-xs text-ink-muted">{formatBdt(r.collected)} in</span>
        </span>
      ),
      sortValue: (r) => r.sold_value,
    },
    {
      key: 'closes',
      header: 'Valid until',
      cell: (r) => (r.offering.closes_on ? formatDate(r.offering.closes_on) : <span className="text-xs text-ink-muted">{r.offering.validity_days} days once opened</span>),
      sortValue: (r) => r.offering.closes_on ?? '',
    },
    { key: 'status', header: 'Status', cell: (r) => <OfferingBadge state={r.state} />, sortValue: (r) => r.state },
  ];

  const counts = {
    all: data.offerings.length,
    open: data.offerings.filter((r) => r.state === 'open').length,
    draft: data.offerings.filter((r) => r.state === 'draft').length,
    ended: data.offerings.filter((r) => ['expired', 'closed', 'cancelled'].includes(r.state)).length,
  };

  return (
    <>
      <PageHeader
        title="Share Offerings"
        subtitle="Sell part of a project as equal shares: valuation (NAV + premium), the % offered, the number of shares, how long it is valid and the longest installment plan."
        action={
          mayEdit && (
            <Link href="/admin/share-sale/offerings/new">
              <Button>
                <Plus className="size-4" /> New offering
              </Button>
            </Link>
          )
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Open offerings" value={t.open_offerings} hint={`${data.offerings.length} in all`} icon={Store} />
        <Kpi label="Shares sold" value={t.shares_sold} hint={t.shares_reserved ? `+ ${t.shares_reserved} reserved` : 'none reserved'} icon={PieChart} />
        <Kpi label="Sold value" value={formatBdt(t.sold_value)} hint={`${t.customers} investor${t.customers === 1 ? '' : 's'}`} icon={Banknote} />
        <Kpi label="Collected" value={formatBdt(t.collected)} hint={`${formatBdt(t.outstanding)} still to come`} icon={Wallet} />
        <Kpi
          label="Overdue now"
          value={formatBdt(t.overdue)}
          hint={t.overdue_sales ? `${t.overdue_sales} purchase${t.overdue_sales > 1 ? 's' : ''} late — see dues` : 'nothing late'}
          icon={AlertTriangle}
          tone={t.overdue ? 'danger' : 'default'}
          href="/admin/share-sale/investors?show=overdue"
        />
      </div>

      {inbox && (() => {
        const requests = inbox.requests.filter((r) => r.request.status === 'new').length;
        const docs = inbox.uploads.filter((u) => u.upload.status === 'under_review').length;
        if (!requests && !docs) return null;
        return (
          <Link
            href={requests ? '/admin/share-sale/requests' : '/admin/share-sale/requests?tab=documents'}
            className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:border-amber-300"
          >
            <Inbox className="size-5 shrink-0" />
            <span className="flex-1">
              From the Customer Portal:{' '}
              {[requests && `${requests} new purchase request${requests > 1 ? 's' : ''}`, docs && `${docs} document${docs > 1 ? 's' : ''} to review`].filter(Boolean).join(' and ')}
            </span>
            <span className="font-medium">Open Customer Requests →</span>
          </Link>
        );
      })()}

      <Card className="p-0">
        <div className="flex flex-wrap gap-1 border-b border-hairline px-5 pt-3">
          {(
            [
              ['all', 'All'],
              ['open', 'Open'],
              ['draft', 'Drafts'],
              ['ended', 'Ended'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                filter === key ? 'border-admin-500 text-admin-700' : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {label}
              <span className={cn('rounded-full px-1.5 text-[11px]', filter === key ? 'bg-admin-50 text-admin-700' : 'bg-slate-100 text-ink-muted')}>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="p-5">
          <DataTable
            rows={rows}
            columns={columns}
            label="offerings"
            onRowClick={(r) => router.push(`/admin/share-sale/offerings/${r.offering.id}`)}
            emptyState={
              <EmptyState
                icon={PieChart}
                title={data.offerings.length ? 'No offerings here' : 'No share offerings yet'}
                description={data.offerings.length ? 'Try another tab.' : 'Start with a project: value it, then choose how much of it to sell as shares.'}
              />
            }
            mobileCard={(r) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block font-medium text-ink">{r.project?.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {r.offering.code} · Round {r.offering.round_no} · {formatBdt(r.offering.price_per_share)}/share
                    </span>
                  </span>
                  <OfferingBadge state={r.state} />
                </div>
                <AvailabilityBar a={r.availability} total={r.offering.total_shares} />
              </div>
            )}
          />
        </div>
      </Card>
    </>
  );
}
