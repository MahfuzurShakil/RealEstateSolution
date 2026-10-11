'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Building2 } from 'lucide-react';
import { ProjectCostingTab } from '@/components/admin/projects/ProjectCostingTab';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { costCategoryLabel } from '@/lib/domain/finance';
import { PROJECT_TYPE_LABEL } from '@/lib/domain/project';
import {
  financeDashboardRepository,
  lookupRepository,
  projectRepository,
} from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

interface PaymentRow {
  id: string;
  date: string;
  paid_to: string;
  sector: string;
  source: 'Expense' | 'Supplier payment';
  amount: number;
  href: string;
}

/**
 * One project's money, in Finance (client feedback 2026-10-11): the project
 * page no longer carries a cost tab. Costs recorded from any stage (land,
 * materials received at site, expenses), the owner's estimate beside them,
 * sales and collection, and every payment made against the project.
 */
export default function ProjectFinancePage() {
  const { id } = useParams<{ id: string }>();
  const project = useLiveQuery(() => projectRepository.getById(id), [id]);
  const categories = useLiveQuery(() => lookupRepository.costCategories(), []);

  const payments = useLiveQuery(
    async (): Promise<PaymentRow[]> =>
      (await financeDashboardRepository.paymentsForProject(id)).map((p) => ({
        id: p.id,
        date: p.date,
        paid_to: p.paid_to,
        sector: p.sector,
        source: p.source === 'expense' ? 'Expense' : 'Supplier payment',
        amount: p.amount,
        href: p.source === 'expense' ? `/admin/expenses/${p.link_id}` : `/admin/purchase-orders/${p.link_id}`,
      })),
    [id],
  );

  if (project === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!project) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This project no longer exists.</p>
      </Card>
    );
  }

  const sector = (code: string) =>
    code === '_procurement' ? 'Materials' : costCategoryLabel(code, categories ?? []);
  const total = (payments ?? []).reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <Link
        href="/admin/finance"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Finance overview
      </Link>
      <PageHeader
        title={`${project.name}: finance`}
        subtitle={`${project.code} · ${PROJECT_TYPE_LABEL[project.project_type]}`}
        action={
          <Link href={`/admin/projects/${project.id}`}>
            <Button variant="outline">
              <Building2 className="size-4" /> Open project
            </Button>
          </Link>
        }
      />

      <div className="space-y-5">
        <ProjectCostingTab project={project} />

        <Card>
          <CardHeader
            title="Payments made"
            subtitle="Money paid out against this project: expenses and supplier payments"
            action={<span className="text-xs text-ink-muted">{formatBdt(total)} in total</span>}
          />
          <DataTable
            rows={payments ?? []}
            columns={[
              {
                key: 'date',
                header: 'Date',
                cell: (r) => formatDate(r.date),
                sortValue: (r) => r.date,
              },
              {
                key: 'paid_to',
                header: 'Paid to',
                cell: (r) => (
                  <Link href={r.href} className="font-medium text-ink hover:text-admin-700">
                    {r.paid_to}
                  </Link>
                ),
                sortValue: (r) => r.paid_to,
              },
              {
                key: 'sector',
                header: 'Sector',
                cell: (r) => sector(r.sector),
                sortValue: (r) => sector(r.sector),
              },
              {
                key: 'source',
                header: 'Type',
                cell: (r) => <Badge tone={r.source === 'Expense' ? 'neutral' : 'blue'}>{r.source}</Badge>,
                sortValue: (r) => r.source,
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                cell: (r) => <span className="font-medium text-ink">{formatBdt(r.amount)}</span>,
                sortValue: (r) => r.amount,
              },
            ]}
            initialSort={{ key: 'date', direction: 'desc' }}
            label="payments"
            emptyState={
              <EmptyState
                icon={Building2}
                title="Nothing paid against this project yet"
                description="Expenses and supplier payments filed to the project appear here."
              />
            }
          />
        </Card>
      </div>
    </>
  );
}
