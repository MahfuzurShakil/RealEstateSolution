'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import type { DashboardProjectRow, ProjectHealth } from '@/lib/repositories';
import { PROJECT_STATUS_META } from '@/lib/domain/project';
import { formatBdt } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export const HEALTH_META: Record<ProjectHealth, { label: string; dot: string; tone: 'green' | 'amber' | 'red' }> = {
  good: { label: 'Healthy', dot: 'bg-emerald-500', tone: 'green' },
  watch: { label: 'Watch', dot: 'bg-amber-500', tone: 'amber' },
  risk: { label: 'At risk', dot: 'bg-red-500', tone: 'red' },
};

function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/** spent ÷ budget, coloured by how close it is to the line */
function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  const used = pct(spent, budget);
  if (used === null) {
    return <span className="text-xs text-ink-muted">{spent > 0 ? `${formatBdt(spent)} · no budget` : 'No budget yet'}</span>;
  }
  return (
    <div title={`${formatBdt(spent)} of ${formatBdt(budget)}`}>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-ink">{Math.round(used)}%</span>
        <span className="text-ink-muted">of {formatBdt(budget)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100">
        <div
          className={cn(
            'h-full rounded-full',
            used > 100 ? 'bg-red-500' : used >= 90 ? 'bg-amber-500' : 'bg-admin-500',
          )}
          style={{ width: `${Math.min(100, used)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Every project on one screen, worst first: where it is, how far the
 * building has got against plan, how much of its budget is gone, how much is
 * sold and collected, and the one reason it is not green. Each row opens the
 * project.
 */
export function ProjectPortfolio({ rows, seesMoney }: { rows: DashboardProjectRow[]; seesMoney: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">No projects yet.</p>;
  }
  return (
    <>
      {/* desktop: a table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="min-w-56 py-2 pr-4 font-medium">Project</th>
              <th className="w-44 py-2 pr-4 font-medium">Construction</th>
              {seesMoney && <th className="w-44 py-2 pr-4 font-medium">Budget used</th>}
              <th className="w-36 py-2 pr-4 font-medium">Units sold</th>
              {seesMoney && <th className="w-40 py-2 pr-4 font-medium">Collected</th>}
              <th className="py-2 pr-2 font-medium">Health</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const health = HEALTH_META[row.health];
              const sold = pct(row.units_sold, row.units_total);
              const collected = pct(row.collected, row.sales_value);
              return (
                <tr key={row.project.id} className="group border-b border-hairline last:border-0 hover:bg-admin-50/50">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/projects/${row.project.id}`} className="block">
                      <p className="font-medium text-ink group-hover:text-admin-700">{row.project.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="whitespace-nowrap text-xs text-ink-muted">{row.project.code}</span>
                        <Badge tone={PROJECT_STATUS_META[row.project.status].tone} className="whitespace-nowrap px-2 py-0.5 text-[11px]">
                          {PROJECT_STATUS_META[row.project.status].label}
                        </Badge>
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    {row.progress ? (
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-ink">{row.progress.actual_pct.toFixed(0)}%</span>
                          {/* variance, not planned %: the two are on different bases (see ProgressRollup) */}
                          <span className={cn(row.progress.state === 'behind' ? 'text-red-600' : 'text-ink-muted')}>
                            {row.progress.variance === null
                              ? 'no plan'
                              : row.progress.variance >= 0
                                ? `+${row.progress.variance.toFixed(0)} pts vs plan`
                                : `${row.progress.variance.toFixed(0)} pts vs plan`}
                          </span>
                        </div>
                        <ProgressBar
                          value={row.progress.actual_pct}
                          planned={row.progress.planned_pct}
                          behind={row.progress.state === 'behind'}
                          size="sm"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted">Not on site</span>
                    )}
                  </td>
                  {seesMoney && (
                    <td className="py-3 pr-4">
                      <BudgetBar spent={row.spent} budget={row.budget} />
                    </td>
                  )}
                  <td className="py-3 pr-4">
                    {row.units_total > 0 ? (
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-ink">
                            {row.units_sold} / {row.units_total}
                          </span>
                          <span className="text-ink-muted">{Math.round(sold ?? 0)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-accent-blue" style={{ width: `${sold ?? 0}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted">No units yet</span>
                    )}
                  </td>
                  {seesMoney && (
                    <td className="py-3 pr-4">
                      {row.sales_value > 0 ? (
                        <div title={`${formatBdt(row.collected)} of ${formatBdt(row.sales_value)}`}>
                          <p className="text-xs text-ink">{formatBdt(row.collected)}</p>
                          <p className="text-[11px] text-ink-muted">
                            {Math.round(collected ?? 0)}% of {formatBdt(row.sales_value)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-muted">No sales</span>
                      )}
                    </td>
                  )}
                  <td className="py-3 pr-2">
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', health.dot)} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">{health.label}</p>
                        <p className="line-clamp-1 max-w-56 text-[11px] text-ink-muted" title={row.health_note}>
                          {row.health_note}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Link href={`/admin/projects/${row.project.id}`} aria-label={`Open ${row.project.name}`}>
                      <ChevronRight className="size-4 text-ink-muted group-hover:text-admin-700" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* phone and tablet: one card per project */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {rows.map((row) => {
          const health = HEALTH_META[row.health];
          return (
            <li key={row.project.id}>
              <Link
                href={`/admin/projects/${row.project.id}`}
                className="block rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{row.project.name}</p>
                    <p className="text-xs text-ink-muted">
                      {row.project.code} · {PROJECT_STATUS_META[row.project.status].label}
                    </p>
                  </div>
                  <Badge tone={health.tone}>{health.label}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">{row.health_note}</p>
                <div className="mt-3 space-y-2.5">
                  {row.progress && (
                    <div>
                      <p className="mb-1 text-xs text-ink-muted">
                        Construction {row.progress.actual_pct.toFixed(0)}%
                      </p>
                      <ProgressBar
                        value={row.progress.actual_pct}
                        planned={row.progress.planned_pct}
                        behind={row.progress.state === 'behind'}
                        size="sm"
                      />
                    </div>
                  )}
                  {seesMoney && row.budget > 0 && <BudgetBar spent={row.spent} budget={row.budget} />}
                  {row.units_total > 0 && (
                    <p className="text-xs text-ink-muted">
                      {row.units_sold} of {row.units_total} units sold
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
