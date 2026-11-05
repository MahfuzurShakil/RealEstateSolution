'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, Landmark, Percent, Wallet } from 'lucide-react';
import { RepayModal } from '@/components/admin/revenue/RevenueModals';
import { Kpi } from '@/components/admin/share-sale/bits';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import { LENDER_TYPE_LABEL } from '@/lib/domain/revenue-share';
import { loanRepository, type LoanRow } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * Every loan across projects (REVENUE-SHARE-PLAN.md §3): who lent, at what
 * interest, what is repaid and still owed. A loan is taken from the
 * project's Income & Profit tab or while covering a loss period.
 */
export default function LoansPage() {
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'finance_expense');
  const rows = useLiveQuery(() => loanRepository.rows(), []);
  const [repay, setRepay] = useState<LoanRow | null>(null);
  if (!rows) return <p className="text-sm text-ink-muted">Loading…</p>;
  const total = (f: (r: LoanRow) => number) => rows.reduce((s, r) => s + f(r), 0);

  const columns: Column<LoanRow & { id: string }>[] = [
    {
      key: 'lender',
      header: 'Lender',
      cell: (r) => (
        <div>
          <p className="font-medium text-ink">{r.loan.lender_name}</p>
          <p className="text-xs text-ink-muted">
            {r.loan.code} · {LENDER_TYPE_LABEL[r.loan.lender_type]}
            {r.loan.loan_account_no ? ` · ${r.loan.loan_account_no}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      cell: (r) => (
        <Link href={`/admin/projects/${r.loan.project_id}`} className="text-admin-700 hover:underline">
          {r.project_name}
        </Link>
      ),
    },
    { key: 'taken', header: 'Taken', sortValue: (r) => r.loan.taken_on, cell: (r) => formatDate(r.loan.taken_on) },
    { key: 'rate', header: 'Interest', align: 'right', cell: (r) => `${r.loan.interest_pct}%` },
    { key: 'principal', header: 'Borrowed', align: 'right', cell: (r) => formatBdt(r.loan.principal) },
    { key: 'repaid', header: 'Repaid', align: 'right', cell: (r) => formatBdt(r.repaid) },
    { key: 'owed', header: 'Owed', align: 'right', sortValue: (r) => r.outstanding, cell: (r) => <span className="font-medium">{formatBdt(r.outstanding)}</span> },
    { key: 'last', header: 'Last paid', cell: (r) => formatDate(r.last_paid_on) },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (r) =>
        r.loan.status === 'active' ? (
          mayEdit && (
            <Button size="sm" variant="outline" onClick={() => setRepay(r)}>
              Repay
            </Button>
          )
        ) : (
          <Badge tone="green">Repaid</Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Loans" subtitle="Money borrowed for projects — from people, banks and partners — and what is still owed." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Borrowed" value={formatBdt(total((r) => r.loan.principal))} icon={Landmark} />
        <Kpi label="Repaid" value={formatBdt(total((r) => r.repaid))} icon={Banknote} />
        <Kpi label="Still owed" value={formatBdt(total((r) => r.outstanding))} icon={Wallet} />
        <Kpi label="Interest paid" value={formatBdt(total((r) => r.interest_paid))} icon={Percent} />
      </div>
      <Card className="p-0">
        <DataTable
          rows={rows.map((r) => ({ ...r, id: r.loan.id }))}
          columns={columns}
          initialSort={{ key: 'taken', direction: 'desc' }}
          label="loans"
          emptyState={
            <div className="p-6">
              <EmptyState icon={Landmark} title="No loans" description="Loans are taken from a project's Income & Profit tab." />
            </div>
          }
          mobileCard={(r) => (
            <div className="space-y-1 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{r.loan.lender_name}</p>
                <span className="text-sm font-medium tabular-nums">{formatBdt(r.outstanding)}</span>
              </div>
              <p className="text-xs text-ink-muted">
                {r.project_name} · {r.loan.interest_pct}% · borrowed {formatBdt(r.loan.principal)}
              </p>
              {mayEdit && r.loan.status === 'active' && (
                <Button size="sm" variant="outline" onClick={() => setRepay(r)}>
                  Repay
                </Button>
              )}
            </div>
          )}
        />
      </Card>
      {repay && <RepayModal row={repay} onClose={() => setRepay(null)} />}
    </>
  );
}
