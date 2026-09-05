'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, PieChart, Wallet } from 'lucide-react';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { PROCUREMENT_BUDGET_HEAD } from '@/lib/db/types';
import type { BudgetVarianceRow } from '@/lib/domain/budget';
import { canEdit } from '@/lib/domain/access';
import { costCategoryLabel } from '@/lib/domain/finance';
import {
  financeDashboardRepository,
  lookupRepository,
  projectBudgetRepository,
} from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';

/**
 * Budget versus actual for one project (Tier 3.2, Section 8.3).
 *
 * The point of the feature: "estimated profit so far" could only ever say a
 * project part-way through is losing money. With a plan to compare against it
 * can say whether it is 10% over on steel or 60%, which is a number somebody
 * can act on.
 */
export function ProjectBudgetPanel({ projectId }: { projectId: string }) {
  const { role } = useMockSession();
  const [editing, setEditing] = useState(false);

  const summary = useLiveQuery(
    () => projectBudgetRepository.summaryForProject(projectId),
    [projectId],
  );
  const categories = useLiveQuery(() => lookupRepository.costCategories(), []);
  const finance = useLiveQuery(() => financeDashboardRepository.byProject(), []);

  const categoryOptions = useMemo(() => categories ?? [], [categories]);
  const project = (finance ?? []).find((p) => p.project_id === projectId);
  const mayEdit = canEdit(role, 'finance_expense');

  const headLabel = (head: string) =>
    head === PROCUREMENT_BUDGET_HEAD
      ? 'Materials (purchase orders)'
      : costCategoryLabel(head, categoryOptions);

  if (summary === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  const columns: Column<BudgetVarianceRow & { id: string }>[] = [
    {
      key: 'head',
      header: 'Cost head',
      cell: (row) => (
        <span className="font-medium text-ink">
          {headLabel(row.head)}
          {row.unbudgeted && (
            <Badge tone="amber" className="ml-2">
              Not budgeted
            </Badge>
          )}
        </span>
      ),
      sortValue: (row) => headLabel(row.head),
    },
    {
      key: 'budgeted',
      header: 'Budget',
      align: 'right',
      cell: (row) =>
        row.budgeted > 0 ? formatBdt(row.budgeted) : <span className="text-ink-muted">—</span>,
      sortValue: (row) => row.budgeted,
    },
    {
      key: 'actual',
      header: 'Spent',
      align: 'right',
      cell: (row) => formatBdt(row.actual),
      sortValue: (row) => row.actual,
    },
    {
      key: 'variance',
      header: 'Left',
      align: 'right',
      cell: (row) => {
        if (row.unbudgeted) return <span className="text-ink-muted">—</span>;
        const over = row.variance < -0.009;
        return (
          <span className={over ? 'font-medium text-red-600' : 'text-ink'}>
            {over ? `${formatBdt(Math.abs(row.variance))} over` : formatBdt(row.variance)}
          </span>
        );
      },
      sortValue: (row) => row.variance,
    },
    {
      key: 'used_pct',
      header: 'Used',
      cell: (row) =>
        row.used_pct === null ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <div className="min-w-[110px]">
            <ProgressBar
              value={Math.min(100, row.used_pct)}
              size="sm"
              behind={row.used_pct > 100}
            />
            <span
              className={`text-xs ${row.used_pct > 100 ? 'text-red-600' : 'text-ink-muted'}`}
            >
              {row.used_pct}%
            </span>
          </div>
        ),
      sortValue: (row) => row.used_pct ?? -1,
    },
  ];

  const rows = summary.rows.map((r) => ({ ...r, id: r.head }));

  if (!summary.has_budget) {
    return (
      <>
        <Card>
          <CardHeader title="Budget" />
          <EmptyState
            icon={PieChart}
            title="No budget set for this project"
            description={
              summary.actual_total > 0
                ? `${formatBdt(summary.actual_total)} has already been spent against this project. Set a budget and every cost screen can say whether that is on plan or over it.`
                : 'Set what each cost head is expected to come to. Costs recorded against this project are compared with it as they happen.'
            }
            action={
              mayEdit ? <Button onClick={() => setEditing(true)}>Set the budget</Button> : undefined
            }
          />
        </Card>
        {editing && (
          <BudgetEditor
            projectId={projectId}
            rows={summary.rows}
            headLabel={headLabel}
            categoryOptions={categoryOptions}
            onClose={() => setEditing(false)}
          />
        )}
      </>
    );
  }

  /*
   * Profit at completion, which is what a budget makes answerable: the sales
   * value of what has been sold less what the project is *planned* to cost.
   * The card on the overview tab answers the other question — profit so far —
   * and the two disagree on purpose.
   */
  const salesValue = project?.sales_value ?? 0;
  const projectedProfit = salesValue - summary.budgeted_total;

  return (
    <>
      <Card>
        <CardHeader
          title="Budget"
          action={
            mayEdit ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit budget
              </Button>
            ) : undefined
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Figure label="Budgeted" value={formatBdt(summary.budgeted_total)} />
          <Figure
            label="Spent"
            value={formatBdt(summary.actual_total)}
            hint={summary.used_pct !== null ? `${summary.used_pct}% of budget` : undefined}
          />
          <Figure
            label={summary.variance_total < 0 ? 'Over budget' : 'Left to spend'}
            value={formatBdt(Math.abs(summary.variance_total))}
            tone={summary.variance_total < 0 ? 'bad' : 'good'}
          />
          <Figure
            label="Profit at completion"
            value={formatBdt(projectedProfit)}
            hint="sales value less the planned cost"
            tone={projectedProfit >= 0 ? 'good' : 'bad'}
          />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
            <span>Budget consumed</span>
            <span className="font-medium text-ink">{summary.used_pct ?? 0}%</span>
          </div>
          <ProgressBar
            value={Math.min(100, summary.used_pct ?? 0)}
            behind={(summary.used_pct ?? 0) > 100}
          />
        </div>

        {/*
          Spend under a head nobody budgeted. Called out rather than folded in,
          because a budget that absorbs uncategorised spend reads as complete
          while the money leaks.
        */}
        {summary.unbudgeted_count > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {summary.unbudgeted_count} cost head
              {summary.unbudgeted_count === 1 ? ' has' : 's have'} spend but no budget line. They
              are counted in Spent above, so the percentage is honest — but nothing was planned for
              them.
            </span>
          </p>
        )}

        <div className="mt-4">
          <DataTable rows={rows} columns={columns} label="cost heads" />
        </div>

        <p className="mt-4 text-xs text-ink-muted">
          Spent is the expense ledger plus supplier vouchers, the same two sources the Finance card
          totals. Material issued from store to site is not added again — it was already paid for
          by the voucher that bought it.
        </p>
      </Card>

      {editing && (
        <BudgetEditor
          projectId={projectId}
          rows={summary.rows}
          headLabel={headLabel}
          categoryOptions={categoryOptions}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="min-w-0 rounded-xl border border-hairline p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={`truncate text-base font-semibold ${
          tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-700' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}

/**
 * Every head on one screen, with what has already been spent beside each box.
 *
 * Budgeting a head to nothing removes its line rather than storing a zero — a
 * head budgeted at zero and a head nobody budgeted are the same fact, and
 * keeping both would make "not budgeted" mean two different things.
 */
function BudgetEditor({
  projectId,
  rows,
  headLabel,
  categoryOptions,
  onClose,
}: {
  projectId: string;
  rows: BudgetVarianceRow[];
  headLabel: (head: string) => string;
  categoryOptions: { code?: string | null; value: string; is_active?: boolean }[];
  onClose: () => void;
}) {
  const { userId } = useMockSession();

  /*
   * Every live cost category plus procurement, and any head that already
   * carries a budget or spend — so a category retired after it was budgeted
   * still appears and can be corrected rather than silently stranded.
   */
  const heads = useMemo(() => {
    const live = categoryOptions
      .filter((c) => c.is_active !== false)
      .map((c) => c.code ?? c.value);
    return [...new Set([PROCUREMENT_BUDGET_HEAD, ...live, ...rows.map((r) => r.head)])];
  }, [categoryOptions, rows]);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      heads.map((h) => {
        const row = rows.find((r) => r.head === h);
        return [h, row && row.budgeted > 0 ? String(row.budgeted) : ''];
      }),
    ),
  );
  const [saving, setSaving] = useState(false);

  const total = heads.reduce((sum, h) => sum + (Number(values[h]) || 0), 0);

  return (
    <Modal
      open
      onClose={onClose}
      title="Project budget"
      subtitle="What each cost head is expected to come to"
      icon={Wallet}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await projectBudgetRepository.replaceForProject(
                  projectId,
                  heads.map((h) => ({ cost_category: h, budgeted_amount: Number(values[h]) || 0 })),
                  userId,
                );
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save budget'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {heads.map((head) => {
          const row = rows.find((r) => r.head === head);
          const spent = row?.actual ?? 0;
          const budgeted = Number(values[head]) || 0;
          const over = budgeted > 0 && spent > budgeted;
          return (
            <Field
              key={head}
              label={headLabel(head)}
              hint={
                spent > 0
                  ? over
                    ? `${formatBdt(spent)} already spent — more than this budget`
                    : `${formatBdt(spent)} already spent`
                  : 'Nothing spent yet'
              }
            >
              <TextInput
                type="number"
                min={0}
                step="any"
                value={values[head] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [head]: e.target.value }))}
                placeholder="0"
                invalid={over}
              />
            </Field>
          );
        })}
      </div>

      <p className="mt-4 rounded-xl border border-hairline bg-canvas p-3 text-sm">
        <span className="text-ink-muted">Total budget</span>{' '}
        <span className="font-semibold text-ink">{formatBdt(total)}</span>
        <span className="mt-1 block text-xs text-ink-muted">
          A head left blank is not budgeted. Costs still land against it and are reported as
          unbudgeted rather than hidden.
        </span>
      </p>
    </Modal>
  );
}
