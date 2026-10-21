'use client';

import { Suspense, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowDownToLine, ArrowRight, HandCoins, UserPlus } from 'lucide-react';
import { AllocateModal, MoneyInModal, PartnerModal } from '@/components/admin/finance/FundModals';
import { FundLedger } from '@/components/admin/fund/FundLedger';
import { PartnersTable } from '@/components/admin/fund/PartnersTable';
import { ProjectFundTable } from '@/components/admin/fund/ProjectFundTable';
import { partnerColors } from '@/components/admin/fund/ShareBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Partner } from '@/lib/db/types';
import { canEdit } from '@/lib/domain/access';
import { fundLedger, fundOverview, projectRepository, type FundOverview } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

type Tab = 'projects' | 'partners' | 'ledger';

/**
 * Fund & Partners (DIRECT-PURCHASE-PLAN.md B5). Accounts say where the money
 * sits; this says where it came from, whose it is, what each project has
 * received and spent, and how much of each partner's money is still unspent.
 */
function FundPage() {
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'finance_expense');
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = params.get('tab');
  // in the URL, so a tab can be linked to and survives a reload
  const tab: Tab = fromUrl === 'partners' || fromUrl === 'ledger' ? fromUrl : 'projects';
  const setTab = (next: Tab) =>
    router.replace(next === 'projects' ? '/admin/fund' : `/admin/fund?tab=${next}`, { scroll: false });
  const [modal, setModal] = useState<
    { kind: 'partner'; partner?: Partner } | { kind: 'money_in' } | { kind: 'allocate' } | null
  >(null);

  const overview = useLiveQuery(() => fundOverview(), []);
  const projectList = useLiveQuery(() => projectRepository.list(), []);
  const projectNames = new Map((projectList ?? []).map((x) => [x.id, x.name]));
  const ledger = useLiveQuery(() => (tab === 'ledger' ? fundLedger() : Promise.resolve(null)), [tab]);

  if (!overview) return <p className="text-sm text-ink-muted">Loading…</p>;
  const activePartners = overview.partners.filter((p) => p.is_active);
  const colors = partnerColors(overview.partners);

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

      <MoneyFlow overview={overview} />

      <Card className="p-0">
        <div className="flex flex-wrap gap-1 border-b border-hairline px-5 pt-3">
          {(
            [
              ['projects', 'Project fund', overview.projects.length],
              ['partners', 'Partners', activePartners.length],
              ['ledger', 'Ledger', null],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                tab === key ? 'border-admin-500 text-admin-700' : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {label}
              {count !== null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px]',
                    tab === key ? 'bg-admin-50 text-admin-700' : 'bg-slate-100 text-ink-muted',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'projects' && <ProjectFundTable overview={overview} colors={colors} />}
          {tab === 'partners' && (
            <PartnersTable
              overview={overview}
              projectNames={projectNames}
              colors={colors}
              mayEdit={mayEdit}
              onEdit={(partner) => setModal({ kind: 'partner', partner })}
            />
          )}
          {tab === 'ledger' &&
            (ledger ? <FundLedger ledger={ledger} /> : <p className="text-sm text-ink-muted">Loading…</p>)}
        </div>
      </Card>

      {modal?.kind === 'partner' && (
        <PartnerModal partner={modal.partner} shareTotal={overview.share_total} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'money_in' && <MoneyInModal onClose={() => setModal(null)} />}
      {modal?.kind === 'allocate' && <AllocateModal overview={overview} onClose={() => setModal(null)} />}
    </>
  );
}

/**
 * How the money moves, drawn with today's numbers (client, 2026-10-21: "the
 * logic is not clear"). Money comes in from partners and lenders and sits in
 * the company pool or goes straight to a project; the pool gives to
 * projects; buyers pay projects; projects pay their costs.
 */
function MoneyFlow({ overview }: { overview: FundOverview }) {
  const { totals, pool, projects } = overview;
  const moneyIn = totals.capital + totals.loans + totals.other;
  const straightToProjects = projects.reduce((s, r) => s + r.direct_in, 0);
  const received = projects.reduce((s, r) => s + r.received, 0);
  const spent = projects.reduce((s, r) => s + r.spent, 0);
  const left = projects.reduce((s, r) => s + r.remaining, 0);

  return (
    <div className="mb-5 rounded-2xl border border-hairline bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">How the money moves</p>
      <div className="flex flex-col items-stretch lg:flex-row">
        <FlowBox title="1. Money in" amount={moneyIn} tone="teal">
          <FlowLine label="Partners" value={totals.capital} />
          <FlowLine label="Loans" value={totals.loans} />
          {totals.other > 0 && <FlowLine label="Other" value={totals.other} />}
        </FlowBox>
        <FlowArrow label="kept by the company" />
        <FlowBox title="2. Company pool" amount={pool.unallocated} amountLabel="not given out yet">
          <FlowLine label="Came in" value={pool.received} />
          <FlowLine label="Given out" value={pool.allocated} />
        </FlowBox>
        <FlowArrow label="Give to project" />
        <FlowBox title="3. Projects received" amount={received}>
          <FlowLine label="From pool" value={pool.allocated} />
          <FlowLine label="Straight in" value={straightToProjects} />
          <FlowLine label="Buyers paid" value={totals.collections} />
        </FlowBox>
        <FlowArrow label="pay their costs" />
        <FlowBox title="4. Projects paid out" amount={spent} tone="coral">
          <FlowLine label="Cost" value={totals.cost} />
          <FlowLine label="Left" value={left} strong />
        </FlowBox>
      </div>
    </div>
  );
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1 py-1 text-center lg:w-16">
      <ArrowRight className="hidden size-5 text-admin-500 lg:block" />
      <ArrowDown className="size-5 text-admin-500 lg:hidden" />
      <span className="mt-0.5 text-[10px] leading-tight text-ink-muted">{label}</span>
    </div>
  );
}

function FlowBox({
  title,
  amount,
  amountLabel,
  tone,
  children,
}: {
  title: string;
  amount: number;
  amountLabel?: string;
  tone?: 'teal' | 'coral';
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 rounded-xl border p-3',
        tone === 'teal'
          ? 'border-admin-200 bg-admin-50/60'
          : tone === 'coral'
            ? 'border-orange-200 bg-orange-50/50'
            : 'border-hairline bg-slate-50/60',
      )}
    >
      <p className="text-xs font-medium text-ink-muted">{title}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{formatBdt(amount)}</p>
      {amountLabel && <p className="-mt-0.5 text-[11px] text-ink-muted">{amountLabel}</p>}
      <div className="mt-2 space-y-0.5 border-t border-black/5 pt-2">{children}</div>
    </div>
  );
}

function FlowLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <p className="flex justify-between gap-2 text-[11px]">
      <span className={cn('truncate', strong ? 'font-medium text-ink' : 'text-ink-muted')}>{label}</span>
      <span className={cn('whitespace-nowrap tabular-nums', strong ? 'font-semibold text-ink' : 'text-ink')}>{formatBdt(value)}</span>
    </p>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <FundPage />
    </Suspense>
  );
}
