'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Plus, ReceiptText, Search, Wallet, X } from 'lucide-react';
import { ExpenseFormModal } from '@/components/admin/finance/ExpenseFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { ExportCsvButton } from '@/components/ui/ExportCsvButton';
import { PageHeader } from '@/components/ui/PageHeader';
import type { CostCategory } from '@/lib/db/types';
import { costCategoryLabel, costCategoryTone } from '@/lib/domain/finance';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import type { ExpenseWithRelations } from '@/lib/repositories';
import type { CsvColumn } from '@/lib/utils/csv';
import { expenseRepository, lookupRepository, projectRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * The cost ledger (Section 8.3).
 *
 * Deliberately one flat list rather than a screen per cost type: land
 * payments, contractor bills and a one-off generator repair are the same shape
 * of record, and splitting them up is what leaves irregular costs unrecorded.
 * Procurement's supplier vouchers are NOT shown here — they live in their own
 * module and are added to this at roll-up time (8.3), so nothing is counted
 * twice.
 */
/* Amounts and dates go out raw, for the reason given on the collections
 * export: a spreadsheet cannot sum "BDT 1,500,000". */
const expenseCsvColumns = (
  categoryOptions: { code?: string | null; value: string }[],
): CsvColumn<ExpenseWithRelations>[] => [
  { header: 'Code', value: (r) => r.code },
  { header: 'Date', value: (r) => r.expense_date },
  { header: 'Category', value: (r) => costCategoryLabel(r.cost_category, categoryOptions) },
  { header: 'Reason', value: (r) => r.cost_reason },
  { header: 'Project', value: (r) => r.project?.name ?? '' },
  { header: 'Land', value: (r) => r.land?.name ?? '' },
  { header: 'Paid to', value: (r) => r.paid_to },
  { header: 'Method', value: (r) => SUPPLIER_PAYMENT_METHOD_META[r.payment_method] },
  { header: 'Reference', value: (r) => r.reference_no ?? '' },
  { header: 'Paid by', value: (r) => r.paid_by_name ?? '' },
  { header: 'Amount', value: (r) => r.amount },
];

function ExpensesPage() {
  const params = useSearchParams();

  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  /*
   * Arrived from a land page's "View the payments" link. Held in state rather
   * than read on every render so the user can drop it, and surfaced as a
   * removable chip — an invisible filter that survives every other control
   * being cleared is how a list comes to look wrong for no reason.
   */
  const [landId, setLandId] = useState(params.get('land') ?? '');
  const [category, setCategory] = useState<CostCategory | 'all'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const expenses = useLiveQuery(
    () =>
      expenseRepository.list({
        search,
        project_id: projectId || undefined,
        land_id: landId || undefined,
        cost_category: category,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }),
    [search, projectId, landId, category, fromDate, toDate],
  );
  const total = useLiveQuery(() => expenseRepository.count(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);
  /*
   * The category list is data now (Tier 3.3), so the dropdown, the badges and
   * the breakdown all read it live — rename a category in Master Data and this
   * screen follows without a reload.
   */
  const categories = useLiveQuery(() => lookupRepository.costCategories(), []);
  // every option, so a retired category still labels the costs that carry it
  const categoryOptions = useMemo(() => categories ?? [], [categories]);
  // only the live ones are offered as a filter
  const activeCategories = useMemo(
    () => categoryOptions.filter((c) => c.is_active),
    [categoryOptions],
  );
  // The export names the category by its current label, like the table above it
  const csvColumns = useMemo(() => expenseCsvColumns(categoryOptions), [categoryOptions]);

  const rows = useMemo(() => expenses ?? [], [expenses]);
  const sum = useMemo(() => rows.reduce((acc, r) => acc + r.amount, 0), [rows]);
  const byCategory = useMemo(() => {
    const map = new Map<CostCategory, number>();
    for (const row of rows) map.set(row.cost_category, (map.get(row.cost_category) ?? 0) + row.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const loading = expenses === undefined;
  const hasAny = (total ?? 0) > 0;
  const filtersActive =
    Boolean(search || projectId || landId || fromDate || toDate) || category !== 'all';

  function resetFilters() {
    setSearch('');
    setProjectId('');
    setLandId('');
    setCategory('all');
    setFromDate('');
    setToDate('');
  }

  /*
   * Sorting is lifted out of the table so the dropdown and the column headers
   * are the same control. The list happened to arrive date-descending and
   * there was no way to say otherwise — and below `md` there are no headers
   * to click at all.
   */
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'expense_date',
    direction: 'desc',
  });

  const SORT_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'expense_date:desc', label: 'Newest first' },
    { value: 'expense_date:asc', label: 'Oldest first' },
    { value: 'amount:desc', label: 'Amount: high to low' },
    { value: 'amount:asc', label: 'Amount: low to high' },
    { value: 'cost_category:asc', label: 'Category' },
    { value: 'paid_to:asc', label: 'Payee' },
    { value: 'code:asc', label: 'Cost code' },
  ];

  const columns: Column<ExpenseWithRelations>[] = [
    {
      key: 'code',
      header: 'Cost',
      cell: (row) => (
        <Link href={`/admin/expenses/${row.id}`} className="font-medium text-ink hover:text-admin-700">
          {row.code}
          <span className="block text-xs font-normal text-ink-muted">{row.cost_reason}</span>
        </Link>
      ),
      sortValue: (row) => row.code,
    },
    {
      key: 'cost_category',
      header: 'Category',
      cell: (row) => (
        <Badge tone={costCategoryTone(row.cost_category)}>
          {costCategoryLabel(row.cost_category, categoryOptions)}
        </Badge>
      ),
      sortValue: (row) => row.cost_category,
    },
    {
      key: 'project',
      header: 'Charged to',
      cell: (row) =>
        row.project ? (
          <span className="text-sm text-ink">
            {row.project.name}
            {row.land && <span className="block text-xs text-ink-muted">{row.land.code}</span>}
          </span>
        ) : (
          <Badge tone="neutral">Company-level</Badge>
        ),
      sortValue: (row) => row.project?.name ?? '',
    },
    {
      key: 'paid_to',
      header: 'Paid to',
      cell: (row) => (
        <span className="text-sm text-ink">
          {row.paid_to}
          <span className="block text-xs text-ink-muted">
            {SUPPLIER_PAYMENT_METHOD_META[row.payment_method]}
            {row.reference_no ? ` · ${row.reference_no}` : ''}
          </span>
        </span>
      ),
      sortValue: (row) => row.paid_to,
    },
    {
      key: 'expense_date',
      header: 'Date',
      cell: (row) => formatDate(row.expense_date),
      sortValue: (row) => row.expense_date,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (row) => <span className="font-medium text-ink">{formatBdt(row.amount)}</span>,
      sortValue: (row) => row.amount,
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Every cost the company carries — land, contractors, marketing, admin, and the one-offs nothing else covers."
        action={
          <div className="flex flex-wrap gap-2">
            <ExportCsvButton
              rows={rows}
              columns={csvColumns}
              filenamePrefix="expenses"
            />
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="size-4" /> Record Cost
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
            <Wallet className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">{filtersActive ? 'Matching costs' : 'Total recorded'}</p>
            <p className="truncate text-lg font-semibold text-ink">{formatBdt(sum)}</p>
            <p className="truncate text-xs text-ink-muted">
              {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}
            </p>
          </div>
        </Card>

        <Card className="sm:col-span-1 xl:col-span-2">
          <p className="mb-2 text-xs text-ink-muted">By category</p>
          {byCategory.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing to break down yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {/*
                The breakdown was read-only, so seeing that Contractor Payment
                is the biggest line and then wanting only those meant going to
                the Category dropdown and finding it again. Clicking a slice
                filters; clicking the active one clears.
              */}
              {byCategory.map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(category === key ? 'all' : key)}
                  aria-pressed={category === key}
                  title={
                    category === key
                      ? `Showing ${costCategoryLabel(key, categoryOptions)} only — click to clear`
                      : `Show ${costCategoryLabel(key, categoryOptions)} only`
                  }
                  className={cn(
                    'rounded-full transition-shadow',
                    category === key && 'ring-2 ring-admin-500 ring-offset-1',
                  )}
                >
                  <Badge tone={costCategoryTone(key)}>
                    {costCategoryLabel(key, categoryOptions)} · {formatBdt(value)}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Search" className="xl:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reason, payee, reference…"
                className="pr-9"
              />
            </div>
          </Field>
          <Field label="Project">
            <SelectInput value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All costs</option>
              <option value="company">Company-level only</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Category">
            <SelectInput
              value={category}
              onChange={(e) => setCategory(e.target.value as CostCategory | 'all')}
            >
              <option value="all">All categories</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.code ?? c.value}>
                  {c.value}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </Field>
            <Field label="To">
              <TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          {landId && (
            <button
              type="button"
              onClick={() => setLandId('')}
              className="inline-flex items-center gap-1.5 rounded-full border border-admin-200 bg-admin-50 px-3 py-1 text-xs font-medium text-admin-700 hover:bg-admin-100"
            >
              {rows[0]?.land?.code
                ? `Costs against ${rows[0].land.code}`
                : 'Costs against one land record'}
              <X className="size-3.5" />
            </button>
          )}
          {filtersActive && (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          )}
          <label className="ml-auto flex items-center gap-2 whitespace-nowrap text-xs text-ink-muted">
            Sort
            <SelectInput
              value={`${sort.key}:${sort.direction}`}
              onChange={(e) => {
                const [key, direction] = e.target.value.split(':');
                setSort({ key, direction: direction as 'asc' | 'desc' });
              }}
              className="h-9 w-auto py-1 text-xs"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectInput>
          </label>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-canvas" />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            sort={sort}
            onSortChange={setSort}
            label="costs"
            mobileCard={(row) => (
              <Link href={`/admin/expenses/${row.id}`} className="block space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{row.cost_reason}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {row.code} · {formatDate(row.expense_date)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-ink">{formatBdt(row.amount)}</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={costCategoryTone(row.cost_category)}>
                    {costCategoryLabel(row.cost_category, categoryOptions)}
                  </Badge>
                  {row.project ? (
                    <Badge tone="teal">{row.project.name}</Badge>
                  ) : (
                    <Badge tone="neutral">Company-level</Badge>
                  )}
                </div>

                <p className="truncate text-xs text-ink-muted">
                  Paid to {row.paid_to} · {SUPPLIER_PAYMENT_METHOD_META[row.payment_method]}
                  {row.reference_no ? ` · ${row.reference_no}` : ''}
                </p>
              </Link>
            )}
            emptyState={
              <EmptyState
                icon={ReceiptText}
                title={hasAny ? 'No cost matches these filters' : 'No cost recorded yet'}
                description={
                  hasAny
                    ? 'Try clearing the category, project or date filter.'
                    : 'Anything the company pays for that is not a supplier purchase order belongs here — including the irregular ones.'
                }
                action={
                  hasAny ? (
                    <Button variant="outline" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button onClick={() => setModalOpen(true)}>
                      <Plus className="size-4" /> Record Cost
                    </Button>
                  )
                }
              />
            }
          />
        )}

        <p className="mt-4 flex items-start gap-1.5 text-xs text-ink-muted">
          <Building2 className="mt-0.5 size-3.5 shrink-0" />
          Supplier payments against purchase orders are not listed here — they belong to
          Procurement and are added to this ledger when the project cost is rolled up, so nothing is
          counted twice.
        </p>
      </Card>

      <ExpenseFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => setModalOpen(false)}
      />
    </>
  );
}

/** The finance dashboard links in with ?project=. */
export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <ExpensesPage />
    </Suspense>
  );
}
