'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import type { Partner } from '@/lib/db/types';
import type { FundOverview, PartnerRow } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';
import { Detail, Line } from './ProjectFundTable';
import { ShareBar } from './ShareBar';

/**
 * One row per partner: their share, what they put in, how much of it the
 * projects have used, what is still theirs. How that is worked out — opening
 * balances, capital against share, the per-project split — opens under the
 * row instead of sitting on every card as a paragraph.
 */
export function PartnersTable({
  overview,
  projectNames,
  colors,
  mayEdit,
  onEdit,
}: {
  overview: FundOverview;
  projectNames: Map<string, string>;
  colors: Map<string, string>;
  mayEdit: boolean;
  onEdit: (partner: Partner) => void;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'company' | 'project'>('all');
  const [status, setStatus] = useState<'active' | 'former' | 'all'>('active');
  const [open, setOpen] = useState<string | null>(null);

  // active first, biggest share first
  const all = [...overview.partners].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active) || b.share_pct - a.share_pct || a.name.localeCompare(b.name),
  );
  const rows = all.filter(
    (p) =>
      (status === 'all' || (status === 'active') === p.is_active) &&
      (kind === 'all' || (kind === 'project') === Boolean(p.project_id)) &&
      (!search.trim() || `${p.name} ${p.code} ${p.phone ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const total = (pick: (r: PartnerRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const scopeOf = (p: PartnerRow) =>
    p.project_id
      ? (overview.projects.find((x) => x.project_id === p.project_id)?.project_name ??
        projectNames.get(p.project_id) ??
        'One project')
      : 'Whole company';

  return (
    <>
      {overview.share_total !== 100 && all.some((p) => p.is_active && !p.project_id) && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The company partners&apos; shares add up to {overview.share_total}%, not 100%. Edit a partner to fix it.
        </p>
      )}
      <OwnershipMap overview={overview} colors={colors} />

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: 'Name, code or phone' }}
        isFiltered={search !== '' || kind !== 'all' || status !== 'active'}
        onReset={() => {
          setSearch('');
          setKind('all');
          setStatus('active');
        }}
        resultLabel={`${rows.length} of ${all.length} partners`}
      >
        <FilterSelect label="Partner in" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">Company and projects</option>
          <option value="company">Whole company</option>
          <option value="project">One project only</option>
        </FilterSelect>
        <FilterSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">Active</option>
          <option value="former">Former</option>
          <option value="all">All</option>
        </FilterSelect>
      </FilterBar>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-ink-muted">
              <th className="py-2.5 pr-3 font-medium">Partner</th>
              <th className="py-2.5 pr-3 font-medium">Share</th>
              <th className="py-2.5 pr-3 text-right font-medium">Put in</th>
              <th className="py-2.5 pr-3 text-right font-medium">Used</th>
              <th className="py-2.5 pr-3 text-right font-medium">Still theirs</th>
              <th className="w-36 py-2.5 pr-3 font-medium">Used so far</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-ink-muted">
                  {all.length === 0
                    ? 'No partners yet. Add the people who put money into the business.'
                    : 'No partner matches these filters.'}
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const isOpen = open === p.id;
              const usedPct = p.contributed > 0 ? Math.min(100, (p.share_of_cost / p.contributed) * 100) : 0;
              const gap = p.capital - p.expected;
              return (
                <Fragment key={p.id}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : p.id)}
                    className={cn(
                      'cursor-pointer border-b border-hairline transition-colors hover:bg-admin-50/50',
                      isOpen && 'bg-admin-50/60',
                    )}
                  >
                    <td className="py-3 pr-3">
                      <p className="flex items-center gap-2 font-medium text-ink">
                        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colors.get(p.id) }} />
                        {p.name} {!p.is_active && <Badge tone="neutral">Former</Badge>}
                      </p>
                      <p className="pl-[18px] text-xs text-ink-muted">{p.code}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-ink">{p.share_pct}%</p>
                      <p className="text-xs text-ink-muted">{scopeOf(p)}</p>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(p.contributed)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(p.share_of_cost)}</td>
                    <td
                      className={cn(
                        'py-3 pr-3 text-right font-semibold tabular-nums',
                        p.balance < 0 ? 'text-red-600' : 'text-ink',
                      )}
                    >
                      {formatBdt(p.balance)}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="h-1.5 rounded-full bg-slate-100">
                        <div
                          className={cn('h-full rounded-full', p.balance < 0 ? 'bg-red-500' : 'bg-admin-500')}
                          style={{ width: `${usedPct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-ink-muted">{Math.round(usedPct)}%</p>
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
                          <Detail
                            title="What they put in"
                            action={
                              mayEdit && (
                                <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
                                  <Pencil className="size-4" /> Edit partner
                                </Button>
                              )
                            }
                          >
                            <Line label="Capital paid in" value={p.capital} />
                            {p.opening_share > 0 && <Line label="Share of opening balances" value={p.opening_share} />}
                            <Line label="Total put in" value={p.contributed} strong />
                            {!p.project_id && (
                              <p className={cn('mt-2 text-[11px]', gap < -1 ? 'text-red-600' : 'text-ink-muted')}>
                                {Math.abs(gap) <= 1
                                  ? 'Capital matches their share.'
                                  : `Capital is ${formatBdt(Math.abs(gap))} ${gap > 0 ? 'above' : 'below'} what a ${p.share_pct}% share would be (${formatBdt(p.expected)}).`}
                              </p>
                            )}
                          </Detail>
                          <Detail title="Used in each project">
                            {p.by_project.length === 0 ? (
                              <p className="text-xs text-ink-muted">No project has used their money yet.</p>
                            ) : (
                              <table className="w-full text-sm">
                                <tbody>
                                  {p.by_project.map((b) => (
                                    <tr key={b.project_id}>
                                      <td className="py-1 pr-2 text-ink-muted">{b.project_name}</td>
                                      <td className="py-1 pr-2 text-right text-xs text-ink-muted">{b.share_pct}%</td>
                                      <td className="py-1 text-right tabular-nums text-ink">{formatBdt(b.cost)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {!p.project_id && p.is_active && (
                              <p className="mt-2 text-[11px] text-ink-muted">
                                Includes their {p.share_pct}% of office costs that belong to no project.
                              </p>
                            )}
                          </Detail>
                          <Detail title="Contact">
                            <div className="space-y-1 text-sm">
                              <p className="flex justify-between gap-2">
                                <span className="text-ink-muted">Phone</span>
                                <span className="text-ink">{p.phone || '—'}</span>
                              </p>
                              <p className="flex justify-between gap-2">
                                <span className="text-ink-muted">Partner in</span>
                                <span className="text-right text-ink">{scopeOf(p)}</span>
                              </p>
                              <p className="flex justify-between gap-2">
                                <span className="text-ink-muted">Status</span>
                                <span className="text-ink">{p.is_active ? 'Active' : 'Former'}</span>
                              </p>
                            </div>
                          </Detail>
                        </div>
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
                <td className="py-3 pr-3" colSpan={2}>
                  Total
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(total((r) => r.contributed))}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(total((r) => r.share_of_cost))}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(total((r) => r.balance))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

/**
 * Every project and who owns it, one bar each: the two rules made visible.
 * Company partners own every project; an investor takes their share of one
 * project first and the company partners share the rest.
 */
function OwnershipMap({ overview, colors }: { overview: FundOverview; colors: Map<string, string> }) {
  const company = overview.partners
    .filter((p) => p.is_active && !p.project_id)
    .sort((a, b) => b.share_pct - a.share_pct);
  if (company.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border border-hairline p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Who owns each project</p>
        <p className="text-xs text-ink-muted">
          Company split: {company.map((p) => `${p.name} ${p.share_pct}%`).join(' · ')}
        </p>
      </div>
      <ul className="space-y-3">
        {overview.projects.map((r) => {
          const investors = r.shares.filter((s) => s.kind === 'investor');
          return (
            <li key={r.project_id} className="grid items-center gap-2 sm:grid-cols-[14rem_1fr]">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{r.project_name}</p>
                <p className="text-[11px] text-ink-muted">
                  {investors.length > 0
                    ? `+ ${investors.map((i) => i.name).join(', ')} (this project only)`
                    : 'Company partners only'}
                </p>
              </div>
              <div>
                <ShareBar slices={r.shares} colors={colors} size="sm" showLegend={false} />
                <p className="mt-1 text-[11px] text-ink-muted">
                  {r.shares.map((s) => `${s.name.split(' ')[0]} ${s.share_pct}%`).join(' · ')}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
