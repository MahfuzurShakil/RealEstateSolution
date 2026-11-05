'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HandCoins, Megaphone, Receipt, TrendingUp } from 'lucide-react';
import { PeriodBadge } from '@/components/admin/revenue/bits';
import { Kpi } from '@/components/admin/share-sale/bits';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import type { RevenuePeriodStatus } from '@/lib/db/types';
import { PERIOD_STATUS_META } from '@/lib/domain/revenue-share';
import { profitDistributions, type DistributionRow } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * Every closed period across projects (REVENUE-SHARE-PLAN.md §10): what each
 * made, what was declared, and how it split between customers and owners.
 * Income is recorded on each project's Income & Profit tab.
 */
export default function ProfitDistributionsPage() {
  const rows = useLiveQuery(() => profitDistributions(), []);
  const [project, setProject] = useState('');
  const [status, setStatus] = useState<RevenuePeriodStatus | ''>('');
  if (!rows) return <p className="text-sm text-ink-muted">Loading…</p>;

  const projects = [...new Map(rows.map((r) => [r.period.project_id, r.project_name])).entries()];
  const shown = rows.filter((r) => (!project || r.period.project_id === project) && (!status || r.period.status === status));
  const declared = rows.filter((r) => r.period.status === 'declared');
  const sumOf = (f: (r: DistributionRow) => number) => declared.reduce((s, r) => s + f(r), 0);
  const waiting = rows.filter((r) => r.period.status !== 'declared' && r.period.operating_profit > 0).length;

  const columns: Column<DistributionRow & { id: string }>[] = [
    {
      key: 'period',
      header: 'Period',
      sortValue: (r) => r.period.period_end,
      cell: (r) => (
        <div>
          <Link href={`/admin/share-sale/profit/${r.period.id}`} className="font-medium text-admin-700 hover:underline">
            {r.period.label}
          </Link>
          <p className="text-xs text-ink-muted">{r.project_name}</p>
        </div>
      ),
    },
    { key: 'income', header: 'Income', align: 'right', cell: (r) => formatBdt(r.period.income) },
    {
      key: 'profit',
      header: 'Profit / loss',
      align: 'right',
      sortValue: (r) => r.period.operating_profit,
      cell: (r) => (
        <span className={r.period.operating_profit < 0 ? 'text-red-600' : 'text-emerald-700'}>{formatBdt(r.period.operating_profit)}</span>
      ),
    },
    { key: 'declared', header: 'Declared', align: 'right', cell: (r) => (r.period.status === 'closed' ? '—' : formatBdt(r.period.declared)) },
    { key: 'customers', header: 'To customers', align: 'right', cell: (r) => (r.holders ? formatBdt(r.customers_gross) : '—') },
    { key: 'owners', header: 'To owners', align: 'right', cell: (r) => (r.holders ? formatBdt(r.owners_gross) : '—') },
    { key: 'on', header: 'Declared on', cell: (r) => formatDate(r.period.declared_on) },
    { key: 'status', header: 'Status', cell: (r) => <PeriodBadge status={r.period.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Profit Distributions"
        subtitle="Each project's closed periods: what it made, what was shared, and with whom. Income is recorded on the project's Income & Profit tab."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Declared to date" value={formatBdt(sumOf((r) => r.period.declared))} icon={Megaphone} />
        <Kpi label="To customers" value={formatBdt(sumOf((r) => r.customers_gross))} icon={HandCoins} />
        <Kpi label="To owners" value={formatBdt(sumOf((r) => r.owners_gross))} icon={TrendingUp} />
        <Kpi label="Tax withheld" value={formatBdt(sumOf((r) => r.tax))} hint={waiting ? `${waiting} period(s) waiting` : undefined} icon={Receipt} />
      </div>
      <Card className="p-0">
        <div className="border-b border-hairline p-4">
          <FilterBar>
            <FilterSelect label="Project" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">All projects</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value as RevenuePeriodStatus | '')}>
              <option value="">Any status</option>
              {(['closed', 'approved', 'declared'] as const).map((s) => (
                <option key={s} value={s}>
                  {PERIOD_STATUS_META[s].label}
                </option>
              ))}
            </FilterSelect>
          </FilterBar>
        </div>
        <DataTable
          rows={shown.map((r) => ({ ...r, id: r.period.id }))}
          columns={columns}
          initialSort={{ key: 'period', direction: 'desc' }}
          label="periods"
          emptyState={
            <div className="p-6">
              <EmptyState
                icon={TrendingUp}
                title="No closed periods yet"
                description="Turn on revenue sharing on a project's Income & Profit tab, record its income and cost, and close a period."
              />
            </div>
          }
          mobileCard={(r) => (
            <Link href={`/admin/share-sale/profit/${r.period.id}`} className="block space-y-1 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{r.period.label}</p>
                <PeriodBadge status={r.period.status} />
              </div>
              <p className="text-xs text-ink-muted">{r.project_name}</p>
              <p className="text-sm">
                Profit <span className={r.period.operating_profit < 0 ? 'text-red-600' : ''}>{formatBdt(r.period.operating_profit)}</span>
                {r.period.status !== 'closed' && ` · declared ${formatBdt(r.period.declared)}`}
              </p>
            </Link>
          )}
        />
      </Card>
    </>
  );
}
