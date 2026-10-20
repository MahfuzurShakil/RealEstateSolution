'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownToLine, HandCoins, Pencil, PieChart, UserPlus } from 'lucide-react';
import {
  AllocateModal,
  MoneyInModal,
  PartnerModal,
  ProjectSharesModal,
} from '@/components/admin/finance/FundModals';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Partner } from '@/lib/db/types';
import { canEdit } from '@/lib/domain/access';
import { CASH_FLOW_LABEL } from '@/lib/domain/cash';
import { fundLedger, fundOverview, projectRepository, type ProjectFundRow } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

type Tab = 'projects' | 'partners' | 'ledger';

/**
 * Fund & Partners (DIRECT-PURCHASE-PLAN.md B5). Accounts say where the money
 * sits; this says where it came from, whose it is, what each project has
 * received and spent, and how much of each partner's money is still unspent.
 */
export default function FundPage() {
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'finance_expense');
  const [tab, setTab] = useState<Tab>('projects');
  const [modal, setModal] = useState<
    | { kind: 'partner'; partner?: Partner }
    | { kind: 'money_in' }
    | { kind: 'allocate' }
    | { kind: 'shares'; row: ProjectFundRow }
    | null
  >(null);

  const overview = useLiveQuery(() => fundOverview(), []);
  const projectList = useLiveQuery(() => projectRepository.list(), []);
  const projectNames = new Map((projectList ?? []).map((x) => [x.id, x.name]));
  const ledger = useLiveQuery(() => (tab === 'ledger' ? fundLedger() : Promise.resolve(null)), [tab]);

  if (!overview) return <p className="text-sm text-ink-muted">Loading…</p>;
  const { totals, pool } = overview;
  const activePartners = overview.partners.filter((p) => p.is_active);

  return (
    <>
      <PageHeader
        title="Fund & Partners"
        subtitle="Where the money came from, whose it is, and how much is left — per project and per partner."
        action={
          mayEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setModal({ kind: 'partner' })}>
                <UserPlus className="size-4" /> Add partner
              </Button>
              <Button variant="outline" onClick={() => setModal({ kind: 'allocate' })}>
                <HandCoins className="size-4" /> Give to project
              </Button>
              <Button onClick={() => setModal({ kind: 'money_in' })}>
                <ArrowDownToLine className="size-4" /> Money in
              </Button>
            </div>
          )
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Partners' capital" value={formatBdt(totals.capital)} note={`${activePartners.length} partners · ${overview.share_total}% shared`} tone={overview.share_total !== 100 && activePartners.length > 0 ? 'amber' : undefined} />
        <Tile label="Loans" value={formatBdt(totals.loans)} />
        <Tile label="Buyers' payments" value={formatBdt(totals.collections)} />
        <Tile label="Cost recorded" value={formatBdt(totals.cost)} note={`${formatBdt(totals.spent)} paid out`} />
        <Tile label="Company pool, not given out" value={formatBdt(pool.unallocated)} note={`${formatBdt(pool.allocated)} given to projects`} />
      </div>

      <div className="mb-4 flex gap-1 rounded-xl border border-hairline bg-white p-1">
        {(
          [
            ['projects', 'Project fund'],
            ['partners', 'Partners'],
            ['ledger', 'Ledger'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === key ? 'bg-admin-500 text-white' : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'projects' && (
        <Card>
          <CardHeader title="Each project's money" subtitle="Received = put in directly + given from the pool + buyers' payments. Remaining = received − paid out." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Project</th>
                  <th className="py-2 pr-3 text-right font-medium">Put in</th>
                  <th className="py-2 pr-3 text-right font-medium">From pool</th>
                  <th className="py-2 pr-3 text-right font-medium">Buyers paid</th>
                  <th className="py-2 pr-3 text-right font-medium">Paid out</th>
                  <th className="py-2 pr-3 text-right font-medium">Remaining</th>
                  <th className="py-2 pr-3 text-right font-medium">Still owed</th>
                  <th className="py-2 pr-3 font-medium">Partners</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {overview.projects.map((r) => {
                  const short = r.remaining < r.owed;
                  return (
                    <tr key={r.project_id} className="border-t border-hairline">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-ink">{r.project_name}</span>
                        <span className="block text-xs text-ink-muted">{r.project_code}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right">{formatBdt(r.direct_in)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatBdt(r.allocated)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatBdt(r.collections)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatBdt(r.spent)}</td>
                      <td className={cn('py-2.5 pr-3 text-right font-semibold', r.remaining < 0 ? 'text-red-600' : 'text-ink')}>
                        {formatBdt(r.remaining)}
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        {formatBdt(r.owed)}
                        {short && r.owed > 0 && <Badge tone="red" className="ml-1">Low fund</Badge>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-ink-muted">
                        {r.shares.length === 0
                          ? '—'
                          : r.shares
                              .map((s) => `${overview.partners.find((p) => p.id === s.partner_id)?.name.split(' ')[0] ?? '?'} ${s.share_pct}%`)
                              .join(' · ')}
                        {r.own_split && <span className="block text-admin-700">own split</span>}
                      </td>
                      <td className="py-2.5 text-right">
                        {mayEdit && activePartners.length > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'shares', row: r })} aria-label={`Partners in ${r.project_name}`}>
                            <PieChart className="size-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'partners' && (
        <div className="space-y-4">
          {overview.partners.length === 0 && (
            <Card>
              <p className="p-6 text-center text-sm text-ink-muted">No partners yet. Add the people who put money into the business.</p>
            </Card>
          )}
          {overview.partners.map((p) => {
            const usedPct = p.contributed > 0 ? Math.min(100, Math.round((p.share_of_cost / p.contributed) * 100)) : 0;
            const gap = p.capital - p.expected;
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-ink">
                      {p.name} {!p.is_active && <Badge tone="neutral">Former</Badge>}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {p.code} ·{' '}
                      {p.project_id
                        ? `${p.share_pct}% of ${overview.projects.find((x) => x.project_id === p.project_id)?.project_name ?? projectNames.get(p.project_id) ?? 'one project'} only`
                        : `${p.share_pct}% of the company`}
                      {p.phone && ` · ${p.phone}`}
                    </p>
                  </div>
                  {mayEdit && (
                    <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'partner', partner: p })}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <Mini
                    label="Put in"
                    value={formatBdt(p.contributed)}
                    note={
                      p.project_id
                        ? `${formatBdt(p.capital)} capital, into that project`
                        : `${formatBdt(p.capital)} capital${p.opening_share > 0 ? ` + ${formatBdt(p.opening_share)} share of opening balances` : ''} · ${Math.abs(gap) > 1 ? `capital ${gap > 0 ? 'above' : 'below'} share by ${formatBdt(Math.abs(gap))}` : 'capital in line with share'}`
                    }
                    warn={gap < -1}
                  />
                  <Mini label="Used from their money" value={formatBdt(p.share_of_cost)} note="their share of what projects paid out of partners' money" />
                  <Mini label="Unspent of theirs" value={formatBdt(p.balance)} warn={p.balance < 0} />
                  <div>
                    <p className="text-xs text-ink-muted">Used</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn('h-full rounded-full', p.balance < 0 ? 'bg-red-500' : 'bg-admin-500')} style={{ width: `${usedPct}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-ink-muted">{usedPct}% of what they put in</p>
                  </div>
                </div>
                {p.by_project.length > 0 && (
                  <p className="mt-3 text-xs text-ink-muted">
                    {p.by_project.map((b) => `${b.project_name}: ${formatBdt(b.cost)} (${b.share_pct}%)`).join(' · ')}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'ledger' && (
        <Card>
          <CardHeader title="Ledger" subtitle="Every taka in and out of the accounts, oldest first, with the running company balance" />
          {!ledger ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-ink-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Detail</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 text-right font-medium">In</th>
                    <th className="py-2 pr-3 text-right font-medium">Out</th>
                    <th className="py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-hairline">
                    <td className="py-2 pr-3 text-ink-muted" colSpan={6}>
                      Opening balances
                    </td>
                    <td className="py-2 text-right font-medium">{formatBdt(ledger.opening)}</td>
                  </tr>
                  {ledger.rows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className="border-t border-hairline">
                      <td className="py-2 pr-3 whitespace-nowrap text-ink-muted">{formatDate(r.date)}</td>
                      <td className="py-2 pr-3 text-ink-muted">{CASH_FLOW_LABEL[r.kind]}</td>
                      <td className="py-2 pr-3 text-ink">{r.label}</td>
                      <td className="py-2 pr-3 text-ink-muted">{r.account_name}</td>
                      <td className="py-2 pr-3 text-right text-emerald-700">{r.amount > 0 ? formatBdt(r.amount) : ''}</td>
                      <td className="py-2 pr-3 text-right text-ink">{r.amount < 0 ? formatBdt(-r.amount) : ''}</td>
                      <td className={cn('py-2 text-right font-medium', r.running < 0 ? 'text-red-600' : 'text-ink')}>{formatBdt(r.running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {modal?.kind === 'partner' && <PartnerModal partner={modal.partner} shareTotal={overview.share_total} onClose={() => setModal(null)} />}
      {modal?.kind === 'money_in' && <MoneyInModal onClose={() => setModal(null)} />}
      {modal?.kind === 'allocate' && <AllocateModal overview={overview} onClose={() => setModal(null)} />}
      {modal?.kind === 'shares' && (
        <ProjectSharesModal
          row={modal.row}
          // the company's partners and this project's own — not another project's investors
          partners={activePartners.filter((x) => !x.project_id || x.project_id === modal.row.project_id)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'amber' }) {
  return (
    <div className={cn('rounded-2xl border bg-white p-4', tone === 'amber' ? 'border-amber-200' : 'border-hairline')}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
      {note && <p className={cn('mt-0.5 text-[11px]', tone === 'amber' ? 'text-amber-700' : 'text-ink-muted')}>{note}</p>}
    </div>
  );
}

function Mini({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn('mt-0.5 font-semibold', warn ? 'text-red-600' : 'text-ink')}>{value}</p>
      {note && <p className="text-[11px] text-ink-muted">{note}</p>}
    </div>
  );
}
