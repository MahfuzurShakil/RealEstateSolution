'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileCog, Pencil, Plus, Trash2 } from 'lucide-react';
import { PlanFormModal } from '@/components/admin/sales-team/PlanFormModal';
import { useCommissionSync } from '@/components/admin/sales-team/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ResultDialog } from '@/components/ui/ResultDialog';
import type { CommissionBasis, CommissionPlan } from '@/lib/db/types';
import { COMMISSION_PLAN_STATUS_META, COMMISSION_TRIGGER_LABEL } from '@/lib/domain/commission';
import { commissionPlanRepository, orgMemberRepository, projectRepository, shareOfferingRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

const rate = (basis: CommissionBasis, value: number) => (basis === 'pct' ? `${value}%` : basis === 'per_share' ? `${formatBdt(value)} / share` : `${formatBdt(value)} / sale`);

/** Sales Team → Commission Plans (REVENUE-SHARE-PLAN.md §7.1). */
export default function PlansPage() {
  const synced = useCommissionSync();
  const plans = useLiveQuery(() => commissionPlanRepository.list(), [synced]);
  const projects = useLiveQuery(() => projectRepository.getAll(), []);
  const offerings = useLiveQuery(() => shareOfferingRepository.getAll(), []);
  const designations = useLiveQuery(() => orgMemberRepository.designations(), []);
  const [editing, setEditing] = useState<(CommissionPlan & { sales: number }) | 'new' | null>(null);
  const [removing, setRemoving] = useState<CommissionPlan | null>(null);
  const [notice, setNotice] = useState('');

  if (!plans) return <p className="text-sm text-ink-muted">Loading…</p>;
  const projectName = (id?: string | null) => (id ? (projects?.find((p) => p.id === id)?.name ?? '—') : 'All projects');
  const offering = (id?: string | null) => offerings?.find((o) => o.id === id);
  const designation = (id: string) => designations?.find((d) => d.id === id)?.value ?? '—';

  return (
    <>
      <PageHeader
        title="Commission Plans"
        subtitle="How much the seller and their uplines earn, and the stages that release it as the buyer pays. The plan in force on the sale date applies."
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New plan
          </Button>
        }
      />
      {plans.length === 0 ? (
        <Card>
          <EmptyState icon={FileCog} title="No plans yet" description="Create a plan for share sales, bookings or both." />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map((p) => {
            const o = offering(p.offering_id);
            return (
              <Card key={p.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      {p.name}
                      <Badge tone={COMMISSION_PLAN_STATUS_META[p.status].tone}>{COMMISSION_PLAN_STATUS_META[p.status].label}</Badge>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {p.code} · {p.applies_to === 'share_sale' ? 'Share sales' : 'Bookings'} · {projectName(p.project_id)}
                      {o ? ` · ${o.code} Round ${o.round_no}` : ''}
                    </p>
                    <p className="text-xs text-ink-muted">
                      From {formatDate(p.effective_from)}
                      {p.effective_to ? ` to ${formatDate(p.effective_to)}` : ''} · used on {p.sales} sale{p.sales === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)} aria-label={`Edit ${p.code}`}>
                      <Pencil className="size-4" />
                    </Button>
                    {p.sales === 0 && (
                      <Button variant="dangerGhost" size="sm" onClick={() => setRemoving(p)} aria-label={`Delete ${p.code}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-xs text-ink-muted">Seller</dt>
                    <dd className="font-medium">{rate(p.seller_basis, p.seller_value)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-xs text-ink-muted">Overrides</dt>
                    <dd className="font-medium">{p.overrides.length ? p.overrides.map((x) => `${designation(x.designation_id)} ${rate(x.basis, x.value)}`).join(' · ') : 'None'}</dd>
                  </div>
                </dl>
                <ol className="mt-3 flex flex-wrap gap-2">
                  {p.stages.map((s, i) => (
                    <li key={s.key} className="rounded-lg border border-hairline bg-slate-50 px-2.5 py-1.5 text-xs">
                      <span className="font-semibold text-ink">
                        {i + 1}. {s.label}
                      </span>
                      <span className="block text-ink-muted">
                        {s.trigger === 'paid_pct' ? `Paid ≥ ${s.threshold_pct}%` : COMMISSION_TRIGGER_LABEL[s.trigger]} ·{' '}
                        {i === p.stages.length - 1 && s.release_type === 'fixed' ? 'the rest' : s.release_type === 'pct' ? `${s.release_value}%` : formatBdt(s.release_value)}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-ink-muted">
                  On cancel: {p.cancel_rule === 'recover' ? 'paid commission is recovered from future commission' : 'paid commission is written off'}.
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {editing && <PlanFormModal plan={editing === 'new' ? undefined : editing} used={editing === 'new' ? 0 : editing.sales} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          open
          title={`Delete ${removing.code}?`}
          message="No sale uses this plan yet, so it can be deleted."
          onConfirm={async () => {
            try {
              await commissionPlanRepository.remove(removing.id);
            } catch (e) {
              setNotice(e instanceof Error ? e.message : 'Could not delete.');
            }
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
      <ResultDialog open={!!notice} tone="warning" title="Cannot delete" message={notice} onClose={() => setNotice('')} />
    </>
  );
}
