'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Info } from 'lucide-react';
import { ShareBar, partnerColors } from '@/components/admin/fund/ShareBar';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { ExportCsvButton } from '@/components/ui/ExportCsvButton';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { BOOKING_STATUS_META } from '@/lib/domain/booking';
import { PROJECT_STATUS_META } from '@/lib/domain/project';
import {
  partnerRepository,
  projectStatement,
  type StatementCostLine,
  type StatementEntry,
} from '@/lib/repositories';
import type { CsvColumn } from '@/lib/utils/csv';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * One project's full money picture (client, 2026-10-21): the plan, every
 * taka in, every cost, and what each owner stands to gain or lose — reading
 * top to bottom from the answer to the detail behind it.
 */
export default function ProjectStatementPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const statement = useLiveQuery(() => projectStatement(projectId), [projectId]);
  const partners = useLiveQuery(() => partnerRepository.list(), []);

  if (statement === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (statement === null) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-ink-muted">This project no longer exists.</p>
      </div>
    );
  }

  const { project, plan, income, cost, funding, partners: owners } = statement;
  const colors = partnerColors(partners ?? []);
  const sign = (n: number) => (n < 0 ? 'text-red-600' : 'text-ink');

  return (
    <div className="space-y-6">
      <div>
        <BackLink />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">{project.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
              {project.code}
              <Badge tone={PROJECT_STATUS_META[project.status].tone}>{statement.stage_label}</Badge>
            </div>
          </div>
          <Link href={`/admin/projects/${project.id}`} className="text-sm text-admin-700 hover:underline">
            Open project →
          </Link>
        </div>
      </div>

      {/* ---------------- plan vs so far ---------------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="The plan" subtitle="What the project should earn when it is finished" />
          <Big label="Expected sales" value={plan.revenue}>
            {plan.revenue_source === 'estimate'
              ? "From the project's cost estimate"
              : plan.revenue_source === 'units'
                ? 'Sold so far + unsold units at their price'
                : 'No estimate and no unit prices yet'}
          </Big>
          <Big label="Expected total cost" value={Math.max(plan.cost, cost.total)}>
            {plan.cost > 0 && cost.total > plan.cost
              ? `Already spent more than the ${formatBdt(plan.cost)} planned`
              : plan.cost_source === 'estimate'
                ? "From the project's cost estimate"
                : plan.cost_source === 'work_budget'
                  ? 'Work-item budgets + land'
                  : 'No budget set yet'}
          </Big>
          <CompareBar a={plan.revenue} b={Math.max(plan.cost, cost.total)} aLabel="Sales" bLabel="Cost" />
          <div className="mt-4 flex items-baseline justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-ink">{plan.profit < 0 ? 'Expected loss' : 'Expected profit'}</span>
            <span className={cn('text-xl font-semibold tabular-nums', sign(plan.profit))}>
              {formatBdt(plan.profit)}
              {plan.margin_pct !== null && <span className="ml-2 text-sm font-normal text-ink-muted">{plan.margin_pct}%</span>}
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader title="So far" subtitle="What has actually happened until today" />
          <Big label="Received from buyers" value={income.net_received}>
            {income.refunded > 0 ? `${formatBdt(income.collected)} paid in, ${formatBdt(income.refunded)} refunded` : `${income.units_sold} of ${income.units_total} units sold`}
          </Big>
          <Big label="Cost so far" value={cost.total}>
            {cost.unpaid > 0 ? `${formatBdt(cost.unpaid)} of it not paid yet` : 'All paid'}
          </Big>
          <CompareBar a={income.net_received} b={cost.total} aLabel="Received" bLabel="Cost" />
          <div className="mt-4 flex items-baseline justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-ink">Result so far</span>
            <span className={cn('text-xl font-semibold tabular-nums', sign(statement.result_so_far))}>
              {formatBdt(statement.result_so_far)}
            </span>
          </div>
          {statement.result_so_far < 0 && (
            <p className="mt-2 flex gap-1.5 text-xs text-ink-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Negative while the building goes up is normal: it is the money the owners have put in that buyers have
              not paid back yet.
            </p>
          )}
        </Card>
      </div>

      {/* ---------------- owners ---------------- */}
      <Card>
        <CardHeader
          title="Profit or loss for each owner"
          subtitle="Each owner's share of the expected profit, and of the result so far"
        />
        <ShareBar slices={owners} colors={colors} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="py-2.5 pr-3 font-medium">Owner</th>
                <th className="py-2.5 pr-3 text-right font-medium">Share</th>
                <th className="py-2.5 pr-3 text-right font-medium">Their money in it</th>
                <th className="py-2.5 pr-3 text-right font-medium">Expected profit</th>
                <th className="py-2.5 text-right font-medium">Result so far</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => (
                <tr key={o.partner_id} className="border-b border-hairline last:border-0">
                  <td className="py-3 pr-3">
                    <p className="flex items-center gap-2 font-medium text-ink">
                      <span className="size-2.5 rounded-sm" style={{ background: colors.get(o.partner_id) }} />
                      {o.name}
                    </p>
                    <p className="pl-[18px] text-xs text-ink-muted">
                      {o.kind === 'investor' ? 'Investor in this project only' : `Company partner (${o.company_pct}% of the company)`}
                    </p>
                  </td>
                  <td className="py-3 pr-3 text-right font-medium">{o.share_pct}%</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(o.put_in)}</td>
                  <td className={cn('py-3 pr-3 text-right font-semibold tabular-nums', sign(o.expected_profit))}>
                    {formatBdt(o.expected_profit)}
                  </td>
                  <td className={cn('py-3 text-right tabular-nums', sign(o.result_so_far))}>{formatBdt(o.result_so_far)}</td>
                </tr>
              ))}
            </tbody>
            {owners.length > 1 && (
              <tfoot>
                <tr className="font-semibold text-ink">
                  <td className="py-3 pr-3">Total</td>
                  <td className="py-3 pr-3 text-right">{Math.round(owners.reduce((s, o) => s + o.share_pct, 0))}%</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(owners.reduce((s, o) => s + o.put_in, 0))}</td>
                  <td className={cn('py-3 pr-3 text-right tabular-nums', sign(plan.profit))}>{formatBdt(plan.profit)}</td>
                  <td className={cn('py-3 text-right tabular-nums', sign(statement.result_so_far))}>
                    {formatBdt(statement.result_so_far)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          &ldquo;Their money in it&rdquo; is capital they put straight into this project, plus their company share of the
          pool money given to it. Loans ({formatBdt(funding.loans)}) are not owners&apos; money.
        </p>
      </Card>

      {/* ---------------- income + funding ---------------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Income from buyers" />
          <Rows
            rows={[
              ['Sales booked', income.sales_booked],
              ['Paid by buyers', income.collected],
              ['Refunded to buyers', income.refunded],
              ['Still due from buyers', income.due],
              ['Of which overdue', income.overdue, income.overdue > 0 ? 'red' : undefined],
              ['Unsold units at their price', income.unsold_value],
            ]}
          />
          <p className="mt-2 text-xs text-ink-muted">
            {income.units_sold} of {income.units_total} company units sold
          </p>
        </Card>
        <Card>
          <CardHeader title="Where the project's money came from" />
          <Rows
            rows={[
              ['Partner capital put straight in', funding.partner_capital],
              ['Given from the company pool', funding.from_pool],
              ['Loans', funding.loans],
              ...(funding.other > 0 ? ([['Other money in', funding.other]] as const) : []),
              ['Buyers paid', funding.buyers],
            ]}
            total={['Total received', funding.received]}
          />
          <Rows rows={[['Paid out for costs', funding.spent]]} total={['Left in hand', funding.left]} />
        </Card>
      </div>

      {/* ---------------- cost lines ---------------- */}
      <Card>
        <CardHeader title="Every cost, line by line" subtitle="Budget against what was spent, with what is still unpaid" />
        <CostTable lines={cost.lines} total={cost.total} unpaid={cost.unpaid} />
      </Card>

      {/* ---------------- buyers ---------------- */}
      {statement.bookings.length > 0 && (
        <Card>
          <CardHeader title="Buyers" subtitle={`${statement.bookings.length} bookings`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                  <th className="py-2.5 pr-3 font-medium">Buyer</th>
                  <th className="py-2.5 pr-3 font-medium">Unit</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Price</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Paid</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Due</th>
                  <th className="py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {statement.bookings.map((b) => (
                  <tr key={b.id} className="border-b border-hairline last:border-0 hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3">
                      <Link href={`/admin/bookings/${b.id}`} className="font-medium text-ink hover:text-admin-700">
                        {b.customer}
                      </Link>
                      <p className="text-xs text-ink-muted">{b.code}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-ink-muted">{b.unit}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatBdt(b.price)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatBdt(b.paid)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{b.due > 0 ? formatBdt(b.due) : '—'}</td>
                    <td className="py-2.5">
                      <Badge tone={BOOKING_STATUS_META[b.status].tone}>{BOOKING_STATUS_META[b.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---------------- every entry ---------------- */}
      <Card>
        <CardHeader title="Every transaction" subtitle="All money in, money out and costs of this project" />
        <Entries entries={statement.entries} projectCode={project.code} />
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/fund" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-admin-700">
      <ArrowLeft className="size-4" /> Fund & Partners
    </Link>
  );
}

function Big({ label, value, children }: { label: string; value: number; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline py-2.5">
      <div>
        <p className="text-sm text-ink">{label}</p>
        {children && <p className="text-xs text-ink-muted">{children}</p>}
      </div>
      <p className="font-semibold tabular-nums text-ink">{formatBdt(value)}</p>
    </div>
  );
}

/** Two amounts on one scale: which is bigger, and by how much. */
function CompareBar({ a, b, aLabel, bLabel }: { a: number; b: number; aLabel: string; bLabel: string }) {
  const max = Math.max(a, b, 1);
  return (
    <div className="mt-3 space-y-1.5">
      {[
        { label: aLabel, value: a, cls: 'bg-admin-500' },
        { label: bLabel, value: b, cls: 'bg-accent-coral' },
      ].map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-ink-muted">{r.label}</span>
          <div className="h-2 flex-1 rounded-full bg-slate-100">
            <div className={cn('h-full rounded-full', r.cls)} style={{ width: `${(Math.max(0, r.value) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Rows({
  rows,
  total,
}: {
  rows: ReadonlyArray<readonly [string, number] | readonly [string, number, 'red' | undefined]>;
  total?: readonly [string, number];
}) {
  return (
    <div className="mb-2">
      {rows.map(([label, value, tone]) => (
        <p key={label} className="flex justify-between gap-3 py-1 text-sm">
          <span className="text-ink-muted">{label}</span>
          <span className={cn('tabular-nums', tone === 'red' ? 'text-red-600' : 'text-ink')}>{formatBdt(value)}</span>
        </p>
      ))}
      {total && (
        <p className="mt-1 flex justify-between gap-3 border-t border-hairline pt-2 text-sm font-semibold text-ink">
          <span>{total[0]}</span>
          <span className={cn('tabular-nums', total[1] < 0 && 'text-red-600')}>{formatBdt(total[1])}</span>
        </p>
      )}
    </div>
  );
}

function CostTable({ lines, total, unpaid }: { lines: StatementCostLine[]; total: number; unpaid: number }) {
  if (lines.length === 0) return <p className="text-sm text-ink-muted">No cost recorded yet.</p>;
  const groups = [...new Set(lines.map((l) => l.group))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-muted">
            <th className="py-2.5 pr-3 font-medium">Cost</th>
            <th className="py-2.5 pr-3 text-right font-medium">Budget</th>
            <th className="py-2.5 pr-3 text-right font-medium">Spent</th>
            <th className="w-36 py-2.5 pr-3 font-medium">Used</th>
            <th className="py-2.5 text-right font-medium">Unpaid</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const mine = lines.filter((l) => l.group === group);
            const subtotal = mine.reduce((s, l) => s + l.actual, 0);
            return (
              <Fragment key={group}>
                <tr className="bg-slate-50">
                  <td className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{group}</td>
                  <td />
                  <td className="py-2 pr-3 text-right text-xs font-semibold tabular-nums text-ink-muted">{formatBdt(subtotal)}</td>
                  <td colSpan={2} />
                </tr>
                {mine.map((l) => {
                  const used = l.budget ? (l.actual / l.budget) * 100 : null;
                  return (
                    <tr key={l.key} className="border-b border-hairline">
                      <td className="py-2.5 pr-3 pl-3 text-ink">{l.label}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-ink-muted">{l.budget ? formatBdt(l.budget) : '—'}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{formatBdt(l.actual)}</td>
                      <td className="py-2.5 pr-3">
                        {used === null ? (
                          <span className="text-xs text-ink-muted">no budget</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                              <div
                                className={cn('h-full rounded-full', used > 100 ? 'bg-red-500' : used >= 90 ? 'bg-amber-500' : 'bg-admin-500')}
                                style={{ width: `${Math.min(100, used)}%` }}
                              />
                            </div>
                            <span className={cn('w-10 text-right text-xs', used > 100 ? 'text-red-600' : 'text-ink-muted')}>
                              {Math.round(used)}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-ink-muted">{l.unpaid > 0 ? formatBdt(l.unpaid) : '—'}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-ink">
            <td className="py-3 pr-3">Total cost</td>
            <td />
            <td className="py-3 pr-3 text-right tabular-nums">{formatBdt(total)}</td>
            <td />
            <td className="py-3 text-right tabular-nums">{unpaid > 0 ? formatBdt(unpaid) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const GROUP_LABEL: Record<StatementEntry['group'], string> = {
  income: 'Buyer money',
  cost: 'Cost',
  funding: 'Owner / loan money',
};

function Entries({ entries, projectCode }: { entries: StatementEntry[]; projectCode: string }) {
  const [group, setGroup] = useState<'all' | StatementEntry['group']>('all');
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(
      (e) => (group === 'all' || e.group === group) && (!q || `${e.type} ${e.detail}`.toLowerCase().includes(q)),
    );
  }, [entries, group, search]);
  const paging = usePagination(rows, 25);
  const csv: CsvColumn<StatementEntry>[] = [
    { header: 'Date', value: (r) => r.date },
    { header: 'Kind', value: (r) => GROUP_LABEL[r.group] },
    { header: 'Type', value: (r) => r.type },
    { header: 'Detail', value: (r) => r.detail },
    { header: 'Amount', value: (r) => r.amount },
    { header: 'Unpaid', value: (r) => r.unpaid ?? '' },
  ];

  return (
    <>
      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: 'Vendor, buyer, item…' }}
        isFiltered={group !== 'all' || search !== ''}
        onReset={() => {
          setGroup('all');
          setSearch('');
        }}
      >
        <FilterSelect label="Show" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}>
          <option value="all">Everything</option>
          <option value="income">Buyer money</option>
          <option value="cost">Costs</option>
          <option value="funding">Owner / loan money</option>
        </FilterSelect>
        <div className="ml-auto self-end">
          <ExportCsvButton rows={rows} columns={csv} filenamePrefix={`statement-${projectCode}`} label="Export" />
        </div>
      </FilterBar>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-ink-muted">
              <th className="py-2.5 pr-3 font-medium">Date</th>
              <th className="py-2.5 pr-3 font-medium">What</th>
              <th className="py-2.5 pr-3 font-medium">Kind</th>
              <th className="py-2.5 pr-3 text-right font-medium">Amount</th>
              <th className="py-2.5 text-right font-medium">Unpaid</th>
            </tr>
          </thead>
          <tbody>
            {paging.pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-ink-muted">
                  Nothing to show.
                </td>
              </tr>
            )}
            {paging.pageRows.map((e) => (
              <tr key={e.id} className="border-b border-hairline last:border-0 hover:bg-slate-50/70">
                <td className="whitespace-nowrap py-2.5 pr-3 text-ink-muted">{formatDate(e.date)}</td>
                <td className="py-2.5 pr-3">
                  {e.href ? (
                    <Link href={e.href} className="text-ink hover:text-admin-700">
                      {e.detail}
                    </Link>
                  ) : (
                    <span className="text-ink">{e.detail}</span>
                  )}
                  <p className="text-xs text-ink-muted">{e.type}</p>
                </td>
                <td className="py-2.5 pr-3">
                  <Badge tone={e.group === 'cost' ? 'amber' : e.group === 'income' ? 'teal' : 'blue'}>{GROUP_LABEL[e.group]}</Badge>
                </td>
                <td className={cn('py-2.5 pr-3 text-right font-medium tabular-nums', e.amount < 0 ? 'text-ink' : 'text-emerald-700')}>
                  {e.amount < 0 ? '−' : '+'}
                  {formatBdt(Math.abs(e.amount))}
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink-muted">{e.unpaid ? formatBdt(e.unpaid) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={paging.page}
        pageCount={paging.pageCount}
        pageSize={paging.pageSize}
        total={paging.total}
        from={paging.from}
        to={paging.to}
        onPageChange={paging.setPage}
        onPageSizeChange={paging.setPageSize}
        pageSizes={[25, 50, 100]}
        label="entries"
      />
    </>
  );
}
