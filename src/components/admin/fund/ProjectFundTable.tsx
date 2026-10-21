'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, PieChart } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import type { FundOverview, ProjectFundRow } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

type FundState = 'ok' | 'low' | 'over';

const STATE_META: Record<FundState, { label: string; tone: BadgeTone }> = {
  ok: { label: 'Enough fund', tone: 'green' },
  low: { label: 'Low fund', tone: 'amber' },
  over: { label: 'Overspent', tone: 'red' },
};

/** Overspent: paid out more than came in. Low: what is left cannot clear the unpaid bills. */
function fundState(r: ProjectFundRow): FundState {
  if (r.remaining < 0) return 'over';
  if (r.owed > 0 && r.remaining < r.owed) return 'low';
  return 'ok';
}

/**
 * One row per project with the four numbers that matter — received, paid
 * out, left, still owed — and a plain verdict. Where the money came from and
 * who carries the project open under the row, for whoever wants them.
 */
export function ProjectFundTable({
  overview,
  mayEdit,
  onEditShares,
}: {
  overview: FundOverview;
  mayEdit: boolean;
  onEditShares: (row: ProjectFundRow) => void;
}) {
  const [search, setSearch] = useState('');
  const [state, setState] = useState<'all' | FundState>('all');
  const [open, setOpen] = useState<string | null>(null);

  const partnerName = new Map(overview.partners.map((p) => [p.id, p.name]));
  const all = overview.projects;
  const rows = all.filter(
    (r) =>
      (state === 'all' || fundState(r) === state) &&
      (!search.trim() ||
        `${r.project_name} ${r.project_code}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const total = (pick: (r: ProjectFundRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const hasPartners = overview.partners.some((p) => p.is_active);

  return (
    <>
      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: 'Project name or code' }}
        isFiltered={search !== '' || state !== 'all'}
        onReset={() => {
          setSearch('');
          setState('all');
        }}
        resultLabel={`${rows.length} of ${all.length} projects`}
      >
        <FilterSelect label="Fund status" value={state} onChange={(e) => setState(e.target.value as typeof state)}>
          <option value="all">All</option>
          <option value="ok">Enough fund</option>
          <option value="low">Low fund</option>
          <option value="over">Overspent</option>
        </FilterSelect>
      </FilterBar>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-ink-muted">
              <th className="py-2.5 pr-3 font-medium">Project</th>
              <th className="py-2.5 pr-3 text-right font-medium">Received</th>
              <th className="py-2.5 pr-3 text-right font-medium">Paid out</th>
              <th className="py-2.5 pr-3 text-right font-medium">Left</th>
              <th className="py-2.5 pr-3 text-right font-medium">Bills unpaid</th>
              <th className="py-2.5 pr-3 font-medium">Status</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-ink-muted">
                  No project matches these filters.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const s = STATE_META[fundState(r)];
              const isOpen = open === r.project_id;
              const usedPct = r.received > 0 ? Math.min(100, (r.spent / r.received) * 100) : r.spent > 0 ? 100 : 0;
              return (
                <Fragment key={r.project_id}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : r.project_id)}
                    className={cn(
                      'cursor-pointer border-b border-hairline transition-colors hover:bg-admin-50/50',
                      isOpen && 'bg-admin-50/60',
                    )}
                  >
                    <td className="py-3 pr-3">
                      <p className="font-medium text-ink">{r.project_name}</p>
                      <p className="text-xs text-ink-muted">{r.project_code}</p>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(r.received)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {formatBdt(r.spent)}
                      <div className="ml-auto mt-1 h-1 w-24 rounded-full bg-slate-100" title={`${Math.round(usedPct)}% of received`}>
                        <div
                          className={cn('h-full rounded-full', usedPct >= 100 ? 'bg-red-500' : 'bg-admin-500')}
                          style={{ width: `${usedPct}%` }}
                        />
                      </div>
                    </td>
                    <td
                      className={cn(
                        'py-3 pr-3 text-right font-semibold tabular-nums',
                        r.remaining < 0 ? 'text-red-600' : 'text-ink',
                      )}
                    >
                      {formatBdt(r.remaining)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{r.owed > 0 ? formatBdt(r.owed) : '—'}</td>
                    <td className="py-3 pr-3">
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </td>
                    <td className="py-3 text-right">
                      <ChevronDown
                        className={cn('ml-auto size-4 text-ink-muted transition-transform', isOpen && 'rotate-180')}
                      />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-hairline bg-slate-50/60">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="grid gap-4 md:grid-cols-3">
                          <Detail title="Where its money came from">
                            <Line label="Put in directly" value={r.direct_in} />
                            <Line label="Given from company pool" value={r.allocated} />
                            <Line label="Buyers paid" value={r.collections} />
                            <Line label="Total received" value={r.received} strong />
                          </Detail>
                          <Detail title="Where it went">
                            <Line label="Paid out" value={r.spent} />
                            <Line label="Cost recorded" value={r.cost} />
                            <Line label="Bills not yet paid" value={r.owed} />
                            <Line label="Left in hand" value={r.remaining} strong warn={r.remaining < 0} />
                          </Detail>
                          <Detail
                            title="Partners in this project"
                            action={
                              mayEdit &&
                              hasPartners && (
                                <Button size="sm" variant="outline" onClick={() => onEditShares(r)}>
                                  <PieChart className="size-4" /> Change split
                                </Button>
                              )
                            }
                          >
                            {r.shares.length === 0 ? (
                              <p className="text-xs text-ink-muted">No partners set.</p>
                            ) : (
                              r.shares.map((sh) => (
                                <div key={sh.partner_id} className="flex justify-between py-1 text-sm">
                                  <span className="text-ink-muted">{partnerName.get(sh.partner_id) ?? '—'}</span>
                                  <span className="font-medium text-ink">{sh.share_pct}%</span>
                                </div>
                              ))
                            )}
                            <p className="mt-1 text-[11px] text-ink-muted">
                              {r.own_split ? 'Own split for this project' : "Company's usual split"} ·{' '}
                              {formatBdt(r.partners_used)} of partners&apos; money used
                            </p>
                          </Detail>
                        </div>
                        <Link
                          href={`/admin/projects/${r.project_id}`}
                          className="mt-3 inline-block text-xs text-admin-700 hover:underline"
                        >
                          Open project →
                        </Link>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="text-sm font-semibold text-ink">
                <td className="py-3 pr-3">Total</td>
                <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(total((r) => r.received))}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(total((r) => r.spent))}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(total((r) => r.remaining))}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(total((r) => r.owed))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

export function Detail({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-white p-3">
      <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Line({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: number;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={cn('flex justify-between gap-3 py-1 text-sm', strong && 'mt-1 border-t border-hairline pt-2')}>
      <span className={strong ? 'font-medium text-ink' : 'text-ink-muted'}>{label}</span>
      <span className={cn('tabular-nums', strong ? 'font-semibold' : 'text-ink', warn && 'text-red-600')}>
        {formatBdt(value)}
      </span>
    </div>
  );
}
