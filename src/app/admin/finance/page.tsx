'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CircleDollarSign,
  ReceiptText,
  TrendingUp,
  Undo2,
  Wallet,
} from 'lucide-react';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import type { ProjectFinanceSummary } from '@/lib/domain/finance';
import { financeDashboardRepository } from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/**
 * The management dashboard of Section 8.3.
 *
 * Sales and collection count company-owned units only — a landowner's own flat
 * may carry a booking so the inventory stays honest, but that money is not the
 * company's. Cost carries no such filter: building the landowner's flat costs
 * the developer exactly as much as building its own, which is why a
 * JV project's profit line looks thinner than its sales suggest.
 */
export default function FinanceOverviewPage() {
  const today = todayLocal();
  const data = useLiveQuery(() => financeDashboardRepository.company(today), [today]);

  if (data === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  const tiles = [
    {
      label: 'Sales value',
      value: data.sales_value,
      hint: 'company-owned units, live bookings',
      icon: Building2,
    },
    {
      label: 'Collected',
      value: data.collected,
      // every receipt, including booking money taken before a schedule exists —
      // the collections queue counts only what is allocated, and says so
      hint: 'every receipt taken, allocated or not',
      icon: Wallet,
    },
    { label: 'Due', value: data.due, hint: 'sales value not yet collected', icon: CircleDollarSign },
    { label: 'Refunded', value: data.refunded, hint: 'paid back on cancellations', icon: Undo2 },
    { label: 'Total cost', value: data.total_cost, hint: 'ledger + procurement', icon: ReceiptText },
    {
      label: 'Estimated profit',
      value: data.estimated_profit,
      hint: 'sales − cost, so far',
      icon: TrendingUp,
      accent: data.estimated_profit >= 0,
    },
  ];

  const columns: Column<ProjectFinanceSummary & { id: string }>[] = [
    {
      key: 'project',
      header: 'Project',
      cell: (row) => (
        <Link href={`/admin/projects/${row.project_id}`} className="font-medium text-ink hover:text-admin-700">
          {row.project_name}
          <span className="block text-xs font-normal text-ink-muted">
            {row.project_code} · {row.booking_count} booking{row.booking_count === 1 ? '' : 's'}
          </span>
        </Link>
      ),
      sortValue: (row) => row.project_name,
    },
    {
      key: 'sales_value',
      header: 'Sales',
      align: 'right',
      cell: (row) => formatBdt(row.sales_value ),
      sortValue: (row) => row.sales_value,
    },
    {
      key: 'collected',
      header: 'Collected',
      align: 'right',
      cell: (row) => (
        <span className="text-sm text-ink">
          {formatBdt(row.collected )}
          {row.sales_value > 0 && (
            <span className="mt-1 block w-24">
              <ProgressBar
                value={Math.min(100, (row.collected / row.sales_value) * 100)}
                size="sm"
                tone="teal"
              />
            </span>
          )}
        </span>
      ),
      sortValue: (row) => row.collected,
    },
    {
      key: 'due',
      header: 'Due',
      align: 'right',
      cell: (row) => formatBdt(row.due ),
      sortValue: (row) => row.due,
    },
    {
      key: 'overdue',
      header: 'Overdue',
      align: 'right',
      cell: (row) =>
        row.overdue_count > 0 ? (
          <Link href={`/admin/collections?status=overdue&project=${row.project_id}`}>
            <span className="font-medium text-red-600">
              {formatBdt(row.overdue_amount )}
              <span className="block text-xs font-normal">
                {row.overdue_count} instalment{row.overdue_count === 1 ? '' : 's'}
              </span>
            </span>
          </Link>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      sortValue: (row) => row.overdue_amount,
    },
    {
      key: 'total_cost',
      header: 'Cost',
      align: 'right',
      cell: (row) => (
        <span className="text-sm text-ink">
          {formatBdt(row.total_cost )}
          <span className="block text-xs text-ink-muted">
            {formatBdt(row.cost_procurement )} material
          </span>
        </span>
      ),
      sortValue: (row) => row.total_cost,
    },
    {
      key: 'estimated_profit',
      header: 'Est. profit',
      align: 'right',
      cell: (row) => (
        <span
          className={
            row.estimated_profit >= 0 ? 'font-medium text-emerald-700' : 'font-medium text-red-600'
          }
        >
          {formatBdt(row.estimated_profit )}
        </span>
      ),
      sortValue: (row) => row.estimated_profit,
    },
  ];

  const rows = data.projects.map((p) => ({ ...p, id: p.project_id }));

  return (
    <>
      <PageHeader
        title="Finance Overview"
        subtitle="What each project has sold, collected, spent and is owed — the Section 8.3 roll-up."
        action={
          <div className="flex gap-2">
            <Link href="/admin/collections">
              <Button variant="outline">Collections</Button>
            </Link>
            <Link href="/admin/expenses">
              <Button variant="outline">Expenses</Button>
            </Link>
          </div>
        }
      />

      {data.overdue_count > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white p-4 shadow-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle className="size-5" />
          </span>
          <p className="mr-auto text-sm text-ink">
            <span className="font-semibold">Overdue collections:</span>{' '}
            <span className="text-red-600">
              {formatBdt(data.overdue_amount)} across {data.overdue_count} instalment
              {data.overdue_count === 1 ? '' : 's'}
            </span>
          </p>
          <Link href="/admin/collections?status=overdue">
            <Button size="sm" variant="outline">
              Open the collections queue
            </Button>
          </Link>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label} className="flex items-center gap-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                tile.accent === false ? 'bg-red-50 text-red-600' : 'bg-admin-50 text-admin-600'
              }`}
            >
              <tile.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-ink-muted">{tile.label}</p>
              <p
                className={`truncate text-xl font-semibold ${
                  tile.accent === false ? 'text-red-600' : 'text-ink'
                }`}
              >
                {formatBdt(tile.value )}
              </p>
              <p className="truncate text-xs text-ink-muted">{tile.hint}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="By project"
          action={
            <span className="text-xs text-ink-muted">
              company-owned sales only (Section 8.3)
            </span>
          }
        />
        <DataTable
          rows={rows}
          columns={columns}
          initialSort={{ key: 'sales_value', direction: 'desc' }}
          label="projects"
          emptyState={
            <EmptyState
              icon={Banknote}
              title="Nothing to report yet"
              description="Figures appear once a project has bookings, costs or purchase orders against it."
            />
          }
        />

        {data.unallocated_cost > 0 && (
          <p className="mt-4 flex items-start gap-1.5 text-xs text-ink-muted">
            <Badge tone="neutral" className="shrink-0">
              {formatBdt(data.unallocated_cost )}
            </Badge>
            <span>
              of cost belongs to no single project — company-level expenses and material bought
              into the central store before a project claimed it. It is counted in the company
              total above but sits in no project row, which is why the rows do not add up to it.
            </span>
          </p>
        )}
      </Card>
    </>
  );
}
