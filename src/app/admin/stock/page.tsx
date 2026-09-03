'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeftRight,
  Building2,
  PackageMinus,
  Search,
  Trash2,
  Warehouse,
} from 'lucide-react';
import { StockIssueModal } from '@/components/admin/procurement/StockIssueModal';
import { StockTransferModal } from '@/components/admin/procurement/StockTransferModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import type {
  StockIssueWithRelations,
  StockRowWithRelations,
  StockTransferWithRelations,
} from '@/lib/repositories';
import {
  projectRepository,
  stockIssueRepository,
  stockRepository,
  stockTransferRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatBdtRate, formatDate } from '@/lib/utils/format';

type Tab = 'on_hand' | 'issues' | 'transfers';

const TAB_KEYS: Tab[] = ['on_hand', 'issues', 'transfers'];

function StockPage() {
  const params = useSearchParams();
  const initialTab = params.get('tab');
  const [tab, setTab] = useState<Tab>(
    initialTab === 'issues' || initialTab === 'transfers' ? initialTab : 'on_hand',
  );
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(params.get('project') ?? '');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteIssue, setDeleteIssue] = useState<StockIssueWithRelations | null>(null);
  const [deleteTransfer, setDeleteTransfer] = useState<StockTransferWithRelations | null>(null);

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const stock = useLiveQuery(
    () => stockRepository.list({ search, location, in_stock_only: inStockOnly }),
    [search, location, inStockOnly],
  );
  const issues = useLiveQuery(
    () =>
      stockIssueRepository.list({
        search,
        project_id: location && location !== 'central' ? location : undefined,
      }),
    [search, location],
  );
  const transfers = useLiveQuery(
    () =>
      stockTransferRepository.list({
        search,
        project_id: location && location !== 'central' ? location : undefined,
      }),
    [search, location],
  );

  const totals = useMemo(() => {
    const rows = stock ?? [];
    return {
      value: rows.reduce((sum, r) => sum + r.value, 0),
      items: rows.length,
      central: rows.filter((r) => !r.project_id).length,
    };
  }, [stock]);

  const consumed = (issues ?? []).reduce((sum, i) => sum + i.total_cost, 0);

  const stockColumns: Column<StockRowWithRelations>[] = [
    {
      key: 'item_name',
      header: 'Item',
      cell: (row) => <span className="font-medium text-ink">{row.item_name}</span>,
      sortValue: (row) => row.item_name,
    },
    {
      key: 'location',
      header: 'Store',
      cell: (row) =>
        row.project ? (
          <Link
            href={`/admin/projects/${row.project.id}`}
            className="text-admin-700 hover:underline"
          >
            {row.project.name}
          </Link>
        ) : (
          <Badge tone="neutral">
            <Warehouse className="size-3.5" /> Central Store
          </Badge>
        ),
      sortValue: (row) => row.location_label,
    },
    {
      key: 'quantity_available',
      header: 'Available',
      align: 'right',
      cell: (row) => (
        <span className={row.quantity_available > 0 ? 'font-medium text-ink' : 'text-ink-muted'}>
          {row.quantity_available} {row.unit}
        </span>
      ),
      sortValue: (row) => row.quantity_available,
    },
    {
      key: 'average_unit_price',
      header: 'Avg. cost',
      align: 'right',
      cell: (row) => (
        <span className="text-sm text-ink">
          {formatBdtRate(row.average_unit_price)}
          <span className="block text-xs text-ink-muted">per {row.unit}</span>
        </span>
      ),
      sortValue: (row) => row.average_unit_price,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatBdt(row.value)}</span>,
      sortValue: (row) => row.value,
    },
  ];

  const issueColumns: Column<StockIssueWithRelations>[] = [
    {
      key: 'code',
      header: 'Issue',
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.code}
          <span className="block text-xs font-normal text-ink-muted">{row.item_name}</span>
        </span>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'project',
      header: 'Project',
      cell: (row) => row.project?.name ?? <span className="text-ink-muted">Project removed</span>,
      sortValue: (row) => row.project?.name ?? '',
    },
    {
      key: 'work_item',
      header: 'Used for',
      cell: (row) =>
        row.work_item ? (
          <span className="text-sm text-ink">
            {row.work_item.name}
            {row.tower && <span className="block text-xs text-ink-muted">{row.tower.name}</span>}
          </span>
        ) : (
          <span className="text-ink-muted">Not recorded</span>
        ),
      sortValue: (row) => row.work_item?.name ?? '',
    },
    {
      key: 'quantity_issued',
      header: 'Issued',
      align: 'right',
      cell: (row) => `${row.quantity_issued} ${row.unit}`,
      sortValue: (row) => row.quantity_issued,
    },
    {
      key: 'issue_date',
      header: 'Date',
      cell: (row) => formatDate(row.issue_date),
      sortValue: (row) => row.issue_date,
    },
    {
      key: 'total_cost',
      header: 'Cost',
      align: 'right',
      cell: (row) => (
        <span className="text-sm font-medium text-ink">
          {formatBdt(row.total_cost)}
          <span className="block text-xs font-normal text-ink-muted">
            @ {formatBdtRate(row.unit_cost_snapshot)}
          </span>
        </span>
      ),
      sortValue: (row) => row.total_cost,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${row.code}`}
          onClick={() => setDeleteIssue(row)}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  const transferColumns: Column<StockTransferWithRelations>[] = [
    {
      key: 'code',
      header: 'Transfer',
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.code}
          <span className="block text-xs font-normal text-ink-muted">{row.item_name}</span>
        </span>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'route',
      header: 'Route',
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
          <Badge tone={row.from_project_id ? 'blue' : 'neutral'}>
            {row.from_project_id ? (
              <Building2 className="size-3.5" />
            ) : (
              <Warehouse className="size-3.5" />
            )}
            {row.from_label}
          </Badge>
          <ArrowLeftRight className="size-3.5 text-slate-400" />
          <Badge tone="teal">
            <Building2 className="size-3.5" />
            {row.to_label}
          </Badge>
        </span>
      ),
      sortValue: (row) => `${row.from_label}${row.to_label}`,
    },
    {
      key: 'quantity',
      header: 'Quantity',
      align: 'right',
      cell: (row) => `${row.quantity} ${row.unit}`,
      sortValue: (row) => row.quantity,
    },
    {
      key: 'transfer_date',
      header: 'Date',
      cell: (row) => formatDate(row.transfer_date),
      sortValue: (row) => row.transfer_date,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatBdt(row.value)}</span>,
      sortValue: (row) => row.value,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${row.code}`}
          onClick={() => setDeleteTransfer(row)}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  const TAB_LABELS: Record<Tab, string> = {
    on_hand: `On Hand (${stock?.length ?? 0})`,
    issues: `Issues to Site (${issues?.length ?? 0})`,
    transfers: `Transfers (${transfers?.length ?? 0})`,
  };

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="What each store holds, what the site consumed, and what moved between them."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight className="size-4" /> Transfer
            </Button>
            <Button onClick={() => setIssueOpen(true)}>
              <PackageMinus className="size-4" /> Issue to Site
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Stock value',
            value: formatBdt(totals.value ),
            hint: `${totals.items} item row${totals.items === 1 ? '' : 's'}`,
            icon: Warehouse,
          },
          {
            label: 'In the central store',
            value: `${totals.central}`,
            hint: 'items bought ahead of a project',
            icon: Building2,
          },
          {
            label: 'Consumed on site',
            value: formatBdt(consumed ),
            hint: `${issues?.length ?? 0} issue${(issues?.length ?? 0) === 1 ? '' : 's'}`,
            icon: PackageMinus,
          },
        ].map((tile) => (
          <Card key={tile.label} className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
              <tile.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-ink-muted">{tile.label}</p>
              <p className="truncate text-lg font-semibold text-ink">{tile.value}</p>
              <p className="truncate text-xs text-ink-muted">{tile.hint}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b border-hairline">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              tab === key
                ? 'border-admin-500 text-admin-700'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Item, code, project…"
              className="pr-9"
            />
          </div>
          <SelectInput
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-auto"
            aria-label="Filter by store"
          >
            <option value="">All stores</option>
            {/* the central store has no project, so issues and transfers
                filtered by project deliberately ignore this option */}
            {tab === 'on_hand' && <option value="central">Central Store</option>}
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
          {tab === 'on_hand' && (
            <Checkbox
              label="Hide empty rows"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
          )}
        </div>

        {tab === 'on_hand' && (
          <DataTable
            rows={stock ?? []}
            columns={stockColumns}
            initialSort={{ key: 'item_name' }}
            label="stock rows"
            emptyState={
              <EmptyState
                icon={Warehouse}
                title="Nothing in stock"
                description="Stock appears when a goods receipt passes its quality check — that is the only way material gets in (Section 7.6)."
                action={
                  <Link href="/admin/purchase-orders">
                    <Button variant="outline">Open purchase orders</Button>
                  </Link>
                }
              />
            }
          />
        )}

        {tab === 'issues' && (
          <DataTable
            rows={issues ?? []}
            columns={issueColumns}
            initialSort={{ key: 'issue_date', direction: 'desc' }}
            label="issues"
            emptyState={
              <EmptyState
                icon={PackageMinus}
                title="Nothing issued to site yet"
                description="Issuing material takes it out of the store and books its cost to the project — this is the figure the cost report reads."
                action={<Button onClick={() => setIssueOpen(true)}>Issue material</Button>}
              />
            }
          />
        )}

        {tab === 'transfers' && (
          <DataTable
            rows={transfers ?? []}
            columns={transferColumns}
            initialSort={{ key: 'transfer_date', direction: 'desc' }}
            label="transfers"
            emptyState={
              <EmptyState
                icon={ArrowLeftRight}
                title="No transfer recorded"
                description="Material bought in advance sits in the central store until a project needs it — a transfer is how it gets there."
                action={
                  <Button variant="outline" onClick={() => setTransferOpen(true)}>
                    Transfer stock
                  </Button>
                }
              />
            }
          />
        )}
      </Card>

      <StockIssueModal
        open={issueOpen}
        defaults={{ project_id: location && location !== 'central' ? location : undefined }}
        onClose={() => setIssueOpen(false)}
      />
      <StockTransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />

      <ConfirmDialog
        open={deleteIssue !== null}
        title={`Delete ${deleteIssue?.code ?? ''}`}
        confirmLabel="Delete issue"
        message="The material goes back onto the project's store at the rate it left, and the cost booked against the project is removed."
        onCancel={() => setDeleteIssue(null)}
        onConfirm={async () => {
          if (deleteIssue) await stockIssueRepository.removeCascade(deleteIssue.id);
          setDeleteIssue(null);
        }}
      />

      <ConfirmDialog
        open={deleteTransfer !== null}
        title={`Delete ${deleteTransfer?.code ?? ''}`}
        confirmLabel="Delete transfer"
        message="The move is reversed — the quantity comes out of the destination store and goes back to the source at the cost it travelled with."
        onCancel={() => setDeleteTransfer(null)}
        onConfirm={async () => {
          if (deleteTransfer) await stockTransferRepository.removeCascade(deleteTransfer.id);
          setDeleteTransfer(null);
        }}
      />
    </>
  );
}

/** The PO page links in with ?tab=transfers, so Suspense is required. */
export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <StockPage />
    </Suspense>
  );
}
