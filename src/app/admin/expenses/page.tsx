'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Plus, ReceiptText, Search, Wallet } from 'lucide-react';
import { ExpenseFormModal } from '@/components/admin/finance/ExpenseFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { COST_CATEGORIES, type CostCategory } from '@/lib/db/types';
import { COST_CATEGORY_META } from '@/lib/domain/finance';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import type { ExpenseWithRelations } from '@/lib/repositories';
import { expenseRepository, projectRepository } from '@/lib/repositories';
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
function ExpensesPage() {
  const params = useSearchParams();

  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [category, setCategory] = useState<CostCategory | 'all'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const expenses = useLiveQuery(
    () =>
      expenseRepository.list({
        search,
        project_id: projectId || undefined,
        cost_category: category,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }),
    [search, projectId, category, fromDate, toDate],
  );
  const total = useLiveQuery(() => expenseRepository.count(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);

  const rows = useMemo(() => expenses ?? [], [expenses]);
  const sum = useMemo(() => rows.reduce((acc, r) => acc + r.amount, 0), [rows]);
  const byCategory = useMemo(() => {
    const map = new Map<CostCategory, number>();
    for (const row of rows) map.set(row.cost_category, (map.get(row.cost_category) ?? 0) + row.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const loading = expenses === undefined;
  const hasAny = (total ?? 0) > 0;
  const filtersActive = Boolean(search || projectId || fromDate || toDate) || category !== 'all';

  function resetFilters() {
    setSearch('');
    setProjectId('');
    setCategory('all');
    setFromDate('');
    setToDate('');
  }

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
        <Badge tone={COST_CATEGORY_META[row.cost_category].tone}>
          {COST_CATEGORY_META[row.cost_category].label}
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
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="size-4" /> Record Cost
          </Button>
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
              {byCategory.map(([key, value]) => (
                <Badge key={key} tone={COST_CATEGORY_META[key].tone}>
                  {COST_CATEGORY_META[key].label} · {formatBdt(value )}
                </Badge>
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
              {COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COST_CATEGORY_META[c].label}
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

        {filtersActive && (
          <Button variant="outline" size="sm" className="mb-4" onClick={resetFilters}>
            Clear filters
          </Button>
        )}

        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-canvas" />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            initialSort={{ key: 'expense_date', direction: 'desc' }}
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
                  <Badge tone={COST_CATEGORY_META[row.cost_category].tone}>
                    {COST_CATEGORY_META[row.cost_category].label}
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
