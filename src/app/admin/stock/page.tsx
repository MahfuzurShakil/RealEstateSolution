'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeftRight,
  Building2,
  HardHat,
  PackageMinus,
  Trash2,
  Undo2,
  Warehouse,
} from 'lucide-react';
import { SiteStockModal } from '@/components/admin/procurement/SiteStockModal';
import { StockIssueModal } from '@/components/admin/procurement/StockIssueModal';
import { StockTransferModal } from '@/components/admin/procurement/StockTransferModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox } from '@/components/ui/Field';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import type {
  StockConsumptionWithRelations,
  StockIssueWithRelations,
  StockReturnWithRelations,
  StockRowWithRelations,
  StockTransferWithRelations,
} from '@/lib/repositories';
import {
  projectRepository,
  siteStockRepository,
  stockConsumptionRepository,
  stockIssueRepository,
  stockRepository,
  stockReturnRepository,
  stockTransferRepository,
} from '@/lib/repositories';
import type { SiteBalanceRow } from '@/lib/domain/procurement';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatBdtRate, formatDate } from '@/lib/utils/format';

type Tab = 'on_hand' | 'at_site' | 'issues' | 'used' | 'returns' | 'transfers';

const TAB_KEYS: Tab[] = ['on_hand', 'at_site', 'issues', 'used', 'returns', 'transfers'];

function StockPage() {
  const params = useSearchParams();
  const initialTab = params.get('tab');
  const [tab, setTab] = useState<Tab>(
    // checked against the tab list rather than a hand-written pair, so a tab
    // added later is linkable without anyone remembering to widen this
    TAB_KEYS.includes(initialTab as Tab) ? (initialTab as Tab) : 'on_hand',
  );
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(params.get('project') ?? '');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [siteMode, setSiteMode] = useState<'use' | 'return' | null>(null);
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
  /*
   * The three views of Section 7.8b. `atSite` is derived — issues minus what
   * was used minus what went back — rather than a stored quantity, so it can
   * never disagree with the three tables it is computed from.
   */
  const atSite = useLiveQuery(
    () =>
      siteStockRepository.balance({
        search,
        project_id: location && location !== 'central' ? location : undefined,
      }),
    [search, location],
  );
  const used = useLiveQuery(
    () =>
      stockConsumptionRepository.list({
        search,
        project_id: location && location !== 'central' ? location : undefined,
      }),
    [search, location],
  );
  const returns = useLiveQuery(
    () =>
      stockReturnRepository.list({
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

  /*
   * Consumed is what the site used, not what left the store. The tile read
   * `issues` and was labelled "consumed on site", which charged a project for
   * a whole delivery the day it was unloaded — the bags still standing on the
   * site were counted as cost and appeared nowhere.
   */
  const consumed = (used ?? []).reduce((sum, u) => sum + u.total_cost, 0);
  const atSiteValue = (atSite ?? []).reduce((sum, r) => sum + r.at_site_value, 0);

  const stockColumns: Column<StockRowWithRelations>[] = [
    {
      key: 'item_name',
      header: 'Item',
      /* Current state, so it reads by the item's current name (Tier 3.1).
         The issues and transfers below deliberately keep the name they were
         recorded under — those are records of something that happened. */
      cell: (row) => <span className="font-medium text-ink">{row.display_name}</span>,
      sortValue: (row) => row.display_name,
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

  /*
   * What is standing on a site. Quantity first and value beside it, because
   * the question this table answers is "have we got any left", not "what is it
   * worth" — the value is there to make the write-off visible at handover.
   */
  const atSiteColumns: Column<SiteBalanceRow>[] = [
    {
      key: 'item_name',
      header: 'Item',
      cell: (row) => <span className="font-medium text-ink">{row.item_name}</span>,
      sortValue: (row) => row.item_name,
    },
    {
      key: 'project',
      header: 'Site',
      cell: (row) => (
        <Link href={`/admin/projects/${row.project_id}`} className="text-admin-700 hover:underline">
          {(projects ?? []).find((p) => p.id === row.project_id)?.name ?? 'Project removed'}
        </Link>
      ),
      sortValue: (row) =>
        (projects ?? []).find((p) => p.id === row.project_id)?.name ?? '',
    },
    {
      key: 'issued_quantity',
      header: 'Issued',
      align: 'right',
      cell: (row) => (
        <span className="text-ink-muted">
          {row.issued_quantity} {row.unit}
        </span>
      ),
      sortValue: (row) => row.issued_quantity,
    },
    {
      key: 'used_quantity',
      header: 'Used',
      align: 'right',
      cell: (row) => (
        <span className="text-ink-muted">
          {row.used_quantity} {row.unit}
        </span>
      ),
      sortValue: (row) => row.used_quantity,
    },
    {
      key: 'returned_quantity',
      header: 'Returned',
      align: 'right',
      cell: (row) => (
        <span className="text-ink-muted">
          {row.returned_quantity > 0 ? `${row.returned_quantity} ${row.unit}` : '—'}
        </span>
      ),
      sortValue: (row) => row.returned_quantity,
    },
    {
      key: 'at_site_quantity',
      header: 'On site',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold text-ink">
          {row.at_site_quantity} {row.unit}
        </span>
      ),
      sortValue: (row) => row.at_site_quantity,
    },
    {
      key: 'at_site_value',
      header: 'Value',
      align: 'right',
      cell: (row) => <span className="text-ink">{formatBdt(row.at_site_value)}</span>,
      sortValue: (row) => row.at_site_value,
    },
  ];

  const usedColumns: Column<StockConsumptionWithRelations>[] = [
    {
      key: 'code',
      header: 'Entry',
      cell: (row) => (
        <span>
          <span className="font-medium text-ink">{row.code}</span>
          <span className="block text-xs text-ink-muted">{row.item_name}</span>
        </span>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'project',
      header: 'Where',
      cell: (row) => (
        <span>
          <span className="text-ink">{row.project?.name ?? 'Project removed'}</span>
          {row.work_item && (
            <span className="block text-xs text-ink-muted">
              {row.work_item.name}
              {row.tower ? ` · ${row.tower.name}` : ''}
            </span>
          )}
        </span>
      ),
      sortValue: (row) => row.project?.name ?? '',
    },
    {
      key: 'quantity_used',
      header: 'Used',
      align: 'right',
      cell: (row) => (
        <span className="text-ink">
          {row.quantity_used} {row.unit}
        </span>
      ),
      sortValue: (row) => row.quantity_used,
    },
    {
      key: 'used_date',
      header: 'Date',
      cell: (row) => <span className="text-ink-muted">{formatDate(row.used_date)}</span>,
      sortValue: (row) => row.used_date,
    },
    {
      key: 'total_cost',
      header: 'Cost',
      align: 'right',
      cell: (row) => (
        <span>
          <span className="font-medium text-ink">{formatBdt(row.total_cost)}</span>
          <span className="block text-xs text-ink-muted">
            @ {formatBdtRate(row.unit_cost_snapshot)}
          </span>
        </span>
      ),
      sortValue: (row) => row.total_cost,
    },
  ];

  const returnColumns: Column<StockReturnWithRelations>[] = [
    {
      key: 'code',
      header: 'Return',
      cell: (row) => (
        <span>
          <span className="font-medium text-ink">{row.code}</span>
          <span className="block text-xs text-ink-muted">{row.item_name}</span>
        </span>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'project',
      header: 'From site',
      cell: (row) => <span className="text-ink">{row.project?.name ?? 'Project removed'}</span>,
      sortValue: (row) => row.project?.name ?? '',
    },
    {
      key: 'quantity_returned',
      header: 'Quantity',
      align: 'right',
      cell: (row) => (
        <span className="text-ink">
          {row.quantity_returned} {row.unit}
        </span>
      ),
      sortValue: (row) => row.quantity_returned,
    },
    {
      key: 'return_date',
      header: 'Date',
      cell: (row) => <span className="text-ink-muted">{formatDate(row.return_date)}</span>,
      sortValue: (row) => row.return_date,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      cell: (row) => (
        <span className="text-ink">
          {formatBdt(row.quantity_returned * row.unit_cost_snapshot)}
        </span>
      ),
      sortValue: (row) => row.quantity_returned * row.unit_cost_snapshot,
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
    on_hand: `In Store (${stock?.length ?? 0})`,
    at_site: `At Site (${atSite?.filter((r) => r.at_site_quantity > 0.0005).length ?? 0})`,
    issues: `Issued to Site (${issues?.length ?? 0})`,
    used: `Used (${used?.length ?? 0})`,
    returns: `Returned (${returns?.length ?? 0})`,
    transfers: `Transfers (${transfers?.length ?? 0})`,
  };

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="What each store holds, what is standing on the sites, what was used, and what moved between them."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight className="size-4" /> Transfer
            </Button>
            <Button variant="outline" onClick={() => setSiteMode('return')}>
              <Undo2 className="size-4" /> Return from Site
            </Button>
            <Button variant="outline" onClick={() => setSiteMode('use')}>
              <HardHat className="size-4" /> Record Use
            </Button>
            <Button onClick={() => setIssueOpen(true)}>
              <PackageMinus className="size-4" /> Issue to Site
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            label: 'Standing on sites',
            value: formatBdt(atSiteValue),
            hint: 'issued, not used or returned yet',
            icon: HardHat,
          },
          {
            label: 'Used on site',
            value: formatBdt(consumed),
            hint: `${used?.length ?? 0} entr${(used?.length ?? 0) === 1 ? 'y' : 'ies'}`,
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
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Item, code, project…' }}
          isFiltered={Boolean(search || location) || (tab === 'on_hand' && !inStockOnly)}
          onReset={() => {
            setSearch('');
            setLocation('');
            setInStockOnly(true);
          }}
        >
          <FilterSelect
            label="Store"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
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
          </FilterSelect>
          {tab === 'on_hand' && (
            <span className="pb-2.5">
              <Checkbox
                label="Hide empty rows"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
            </span>
          )}
        </FilterBar>

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

        {tab === 'at_site' && (
          <DataTable
            rows={(atSite ?? []).filter((r) => r.at_site_quantity > 0.0005)}
            columns={atSiteColumns}
            initialSort={{ key: 'at_site_value', direction: 'desc' }}
            label="site balances"
            emptyState={
              <EmptyState
                icon={HardHat}
                title="Nothing standing on a site"
                description="Every issue has been used or sent back. Material shows here between leaving the store and being laid — which is where over-ordering becomes visible."
              />
            }
          />
        )}

        {tab === 'used' && (
          <DataTable
            rows={used ?? []}
            columns={usedColumns}
            initialSort={{ key: 'used_date', direction: 'desc' }}
            label="consumption entries"
            emptyState={
              <EmptyState
                icon={PackageMinus}
                title="Nothing recorded as used"
                description="This is the project's real material cost — what the site laid, not what the store handed over."
                action={<Button onClick={() => setSiteMode('use')}>Record use</Button>}
              />
            }
          />
        )}

        {tab === 'returns' && (
          <DataTable
            rows={returns ?? []}
            columns={returnColumns}
            initialSort={{ key: 'return_date', direction: 'desc' }}
            label="returns"
            emptyState={
              <EmptyState
                icon={Undo2}
                title="Nothing returned yet"
                description="Unused material goes back to the store at the rate it left with, and from there a transfer can take it to whichever project needs it."
                action={<Button onClick={() => setSiteMode('return')}>Return from site</Button>}
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
      <SiteStockModal
        open={siteMode !== null}
        mode={siteMode ?? 'use'}
        onClose={() => setSiteMode(null)}
      />

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
