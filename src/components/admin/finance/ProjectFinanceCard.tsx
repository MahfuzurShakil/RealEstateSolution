'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { financeDashboardRepository } from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

/**
 * Section 8.3's roll-up, for one project.
 *
 * Sales and collection count company-owned units only, cost counts everything
 * — so on a JV project the profit line is deliberately thinner than the sales
 * figure suggests, because the developer pays to build the landowner's flats
 * as well as its own.
 */
export function ProjectFinanceCard({ projectId }: { projectId: string }) {
  const today = todayLocal();
  const summary = useLiveQuery(
    () => financeDashboardRepository.forProject(projectId, today),
    [projectId, today],
  );

  if (summary === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!summary) return null;

  const nothingYet =
    summary.sales_value === 0 && summary.total_cost === 0 && summary.collected === 0;
  if (nothingYet) return null;

  const collectedPct =
    summary.sales_value > 0
      ? Math.min(100, Math.round((summary.collected / summary.sales_value) * 10000) / 100)
      : 0;

  const figures = [
    { label: 'Sales value', value: summary.sales_value, hint: 'company-owned units' },
    { label: 'Collected', value: summary.collected, hint: `${collectedPct}% of sales` },
    { label: 'Due', value: summary.due, hint: 'not yet received' },
    { label: 'Total cost', value: summary.total_cost, hint: 'ledger + procurement' },
  ];

  return (
    <Card>
      <CardHeader
        title="Finance"
        action={
          <Link href="/admin/finance">
            <Button size="sm" variant="ghost">
              Company overview
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className="min-w-0 rounded-xl border border-hairline p-3">
            <p className="text-xs text-ink-muted">{figure.label}</p>
            <p className="truncate text-base font-semibold text-ink">
              {formatBdt(figure.value )}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">{figure.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
          <span>Collected against sales</span>
          <span className="font-medium text-ink">{collectedPct}%</span>
        </div>
        <ProgressBar value={collectedPct} size="sm" behind={summary.overdue_count > 0} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        <p className="flex items-center gap-1.5 text-sm">
          <TrendingUp
            className={`size-4 ${summary.estimated_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
          />
          <span className="text-ink-muted">Estimated profit so far</span>
          <span
            className={`font-semibold ${
              summary.estimated_profit >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {formatBdt(summary.estimated_profit)}
          </span>
        </p>

        {summary.overdue_count > 0 && (
          <Link href={`/admin/collections?status=overdue&project=${projectId}`}>
            <span className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline">
              <AlertTriangle className="size-4" />
              {formatBdt(summary.overdue_amount)} overdue across {summary.overdue_count} instalment
              {summary.overdue_count === 1 ? '' : 's'}
            </span>
          </Link>
        )}
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        Cost so far, not cost to complete — a project part-way through construction is expected to
        show a loss here.
      </p>
    </Card>
  );
}
