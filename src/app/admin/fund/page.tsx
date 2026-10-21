'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownToLine, HandCoins, UserPlus } from 'lucide-react';
import {
  AllocateModal,
  MoneyInModal,
  PartnerModal,
  ProjectSharesModal,
} from '@/components/admin/finance/FundModals';
import { FundLedger } from '@/components/admin/fund/FundLedger';
import { PartnersTable } from '@/components/admin/fund/PartnersTable';
import { ProjectFundTable } from '@/components/admin/fund/ProjectFundTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Partner } from '@/lib/db/types';
import { canEdit } from '@/lib/domain/access';
import { fundLedger, fundOverview, projectRepository, type ProjectFundRow } from '@/lib/repositories';
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
  const setTab = (next: Tab) => router.replace(next === 'projects' ? '/admin/fund' : `/admin/fund?tab=${next}`, { scroll: false });
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

      {/* one compact strip instead of five big cards */}
      <div className="mb-5 grid grid-cols-2 divide-hairline overflow-hidden rounded-2xl border border-hairline bg-white sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        <Stat label="Partners' capital" value={formatBdt(totals.capital)} note={`${activePartners.length} active partners`} />
        <Stat label="Loans" value={formatBdt(totals.loans)} />
        <Stat label="Buyers' payments" value={formatBdt(totals.collections)} />
        <Stat label="Paid out" value={formatBdt(totals.spent)} note={`${formatBdt(totals.cost)} cost recorded`} />
        <Stat label="Pool not given out" value={formatBdt(pool.unallocated)} note={`${formatBdt(pool.allocated)} given to projects`} />
      </div>

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
          {tab === 'projects' && (
            <ProjectFundTable
              overview={overview}
              mayEdit={mayEdit}
              onEditShares={(row) => setModal({ kind: 'shares', row })}
            />
          )}
          {tab === 'partners' && (
            <PartnersTable
              overview={overview}
              projectNames={projectNames}
              mayEdit={mayEdit}
              onEdit={(partner) => setModal({ kind: 'partner', partner })}
            />
          )}
          {tab === 'ledger' &&
            (ledger ? <FundLedger ledger={ledger} /> : <p className="text-sm text-ink-muted">Loading…</p>)}
        </div>
      </Card>

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

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-b border-hairline px-4 py-3 lg:border-b-0">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-ink">{value}</p>
      {note && <p className="text-[11px] text-ink-muted">{note}</p>}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
      <FundPage />
    </Suspense>
  );
}
