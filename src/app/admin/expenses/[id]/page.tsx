'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Building2, Map, Pencil, Trash2 } from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { ExpenseFormModal } from '@/components/admin/finance/ExpenseFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { costCategoryLabel, costCategoryTone } from '@/lib/domain/finance';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import { expenseRepository, lookupRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** One cost (Section 8.3) — its detail and the paperwork behind it. */
export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const expense = useLiveQuery(() => expenseRepository.getWithRelations(id), [id]);
  const categories = useLiveQuery(() => lookupRepository.costCategories(), []);

  if (expense === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!expense) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This cost no longer exists.</p>
        <Link href="/admin/expenses" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to expenses
          </Button>
        </Link>
      </Card>
    );
  }

  /*
   * A cost recorded under a category that has since been retired still has to
   * read correctly here — this is the page you open to ask what a payment was.
   * `costCategoryLabel` falls back to the seeded label, then to the code
   * itself, rather than rendering an empty badge.
   */
  const categoryLabel = costCategoryLabel(expense.cost_category, categories ?? []);
  const categoryTone = costCategoryTone(expense.cost_category);

  return (
    <>
      <Link
        href="/admin/expenses"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to expenses
      </Link>

      <PageHeader
        title={expense.code}
        subtitle={`${expense.cost_reason} · ${formatBdt(expense.amount)}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
            <Button variant="dangerGhost" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5 lg:order-1">
          <Card>
            <CardHeader title="Documents" />
            <DocumentsPanel entityType="expense" entityId={expense.id} />
          </Card>

          {expense.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-wrap text-sm text-ink">{expense.notes}</p>
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <Card>
            <CardHeader title="Cost" action={<Badge tone={categoryTone}>{categoryLabel}</Badge>} />
            <Row label="Amount" value={formatBdt(expense.amount)} />
            <Row label="Date" value={formatDate(expense.expense_date)} />
            <Row label="Paid to" value={expense.paid_to} />
            <Row
              label="Method"
              value={SUPPLIER_PAYMENT_METHOD_META[expense.payment_method]}
            />
            <Row label="Reference" value={expense.reference_no} />
            <Row label="Recorded by" value={expense.paid_by_name} />
          </Card>

          <Card>
            <CardHeader title="Charged to" />
            {expense.project ? (
              <Link
                href={`/admin/projects/${expense.project.id}`}
                className="block rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{expense.project.name}</p>
                    <p className="text-xs text-ink-muted">{expense.project.code}</p>
                  </div>
                </div>
              </Link>
            ) : (
              <p className="rounded-xl border border-hairline p-3 text-sm text-ink-muted">
                Company-level — not chargeable to one project, so it sits outside every project
                roll-up and is reported separately on the finance overview.
              </p>
            )}

            {expense.land && (
              <Link
                href={`/admin/lands/${expense.land.id}`}
                className="mt-3 block rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                    <Map className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{expense.land.name}</p>
                    <p className="text-xs text-ink-muted">{expense.land.code}</p>
                  </div>
                </div>
              </Link>
            )}
          </Card>

          <Card>
            <CardHeader title="Record" />
            <Row label="Created" value={formatDate(expense.created_at)} />
            <Row label="Last updated" value={formatDate(expense.updated_at)} />
          </Card>
        </aside>
      </div>

      <ExpenseFormModal
        open={editOpen}
        expense={expense}
        onClose={() => setEditOpen(false)}
        onSaved={() => setEditOpen(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${expense.code}`}
        confirmLabel="Delete cost"
        message="The cost and any receipt attached to it are removed, and it stops counting against the project. Use this for an entry made in error, not for a cost that was reversed."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await expenseRepository.removeCascade(expense.id);
          router.push('/admin/expenses');
        }}
      />
    </>
  );
}
