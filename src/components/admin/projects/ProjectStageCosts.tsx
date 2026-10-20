'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HardHat, Paperclip, Receipt, Trash2 } from 'lucide-react';
import { DirectPurchaseModal } from '@/components/admin/construction/DirectPurchaseModal';
import { DeleteCostDialog, type DeletableCost } from '@/components/admin/construction/DeleteCostDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { SelectInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Project, ProjectStatus } from '@/lib/db/types';
import { canEdit } from '@/lib/domain/access';
import { COST_TYPE_META } from '@/lib/domain/construction-cost';
import { PROJECT_STATUS_META } from '@/lib/domain/project';
import { directPurchaseRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/** the stages that cost money before there is a building to put it against */
const STAGES: ProjectStatus[] = ['planning', 'design', 'approval'];

/**
 * The project's Costs tab (client, 2026-10-21). Planning, design and approval
 * cost money — architect and engineer fees, soil test, survey, RAJUK and other
 * authority fees — before any tower or work item exists. They are recorded
 * here against the stage, go to Payments like every other cost, and count in
 * the project fund. Construction costs live on the work items.
 */
export function ProjectStageCosts({ project }: { project: Project }) {
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'site_progress') || canEdit(role, 'finance_expense');
  const all = useLiveQuery(() => directPurchaseRepository.list({ project_id: project.id }), [project.id]);
  const defaultStage: ProjectStatus = STAGES.includes(project.status) ? project.status : 'approval';
  const [stage, setStage] = useState<ProjectStatus>(defaultStage);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<DeletableCost | null>(null);

  if (!all) return <p className="text-sm text-ink-muted">Loading…</p>;
  const stageCosts = all.filter((p) => !p.work_item_id);
  const construction = all.filter((p) => p.work_item_id);
  const sum = (rows: typeof all) => rows.reduce((s, r) => s + r.amount, 0);
  const owed = stageCosts.reduce((s, r) => s + (r.amount - r.paid_amount), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {STAGES.map((s) => (
          <div key={s} className="rounded-2xl border border-hairline bg-white p-4">
            <p className="text-xs text-ink-muted">{PROJECT_STATUS_META[s].label}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{formatBdt(sum(stageCosts.filter((r) => r.stage === s)))}</p>
            <p className="text-[11px] text-ink-muted">{stageCosts.filter((r) => r.stage === s).length} costs</p>
          </div>
        ))}
        <div className="rounded-2xl border border-hairline bg-white p-4">
          <p className="text-xs text-ink-muted">Construction</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatBdt(sum(construction))}</p>
          {construction.length > 0 || project.status === 'under_construction' ? (
            <Link href={`/admin/site-progress/${project.id}?tab=cost`} className="text-[11px] text-admin-700 hover:underline">
              On the work items →
            </Link>
          ) : (
            <p className="text-[11px] text-ink-muted">starts with construction</p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Stage costs"
          subtitle={`Before construction — fees, studies and approvals. ${formatBdt(owed)} still to pay.`}
          action={
            mayEdit && (
              <div className="flex gap-2">
                <SelectInput aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value as ProjectStatus)}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STATUS_META[s].label} stage
                    </option>
                  ))}
                </SelectInput>
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Receipt className="size-4" /> Add cost
                </Button>
              </div>
            )
          }
        />
        {stageCosts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-sm text-ink-muted">
            No stage costs yet — architect and engineer fees, soil test, survey, RAJUK fees and the like go here.
          </p>
        ) : (
          STAGES.filter((s) => stageCosts.some((r) => r.stage === s)).map((s) => (
            <div key={s} className="mb-4 last:mb-0">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{PROJECT_STATUS_META[s].label} stage</p>
              <ul className="divide-y divide-hairline rounded-xl border border-hairline">
                {stageCosts
                  .filter((r) => r.stage === s)
                  .map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <Badge tone={COST_TYPE_META[p.cost_type].tone}>{COST_TYPE_META[p.cost_type].label}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{p.description}</p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(p.purchase_date)} · {p.vendor_name} · {p.code}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                        <Paperclip className="size-3.5" /> {p.attachment_count}
                      </span>
                      <Badge tone={p.payment_status === 'paid' ? 'green' : p.payment_status === 'part_paid' ? 'blue' : 'amber'}>
                        {p.payment_status === 'paid' ? 'Paid' : p.payment_status === 'part_paid' ? 'Part paid' : 'Pending'}
                      </Badge>
                      <span className="w-28 text-right text-sm font-semibold text-ink">{formatBdt(p.amount)}</span>
                      {mayEdit && p.paid_amount === 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${p.code}`}
                          onClick={() => setDeleting(p)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))
        )}
        {project.status === 'under_construction' && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
            <HardHat className="size-3.5" /> Construction costs are recorded on each work item, from the Construction menu.
          </p>
        )}
      </Card>

      <DeleteCostDialog cost={deleting} onClose={() => setDeleting(null)} />
      {adding && (
        <DirectPurchaseModal
          projectId={project.id}
          stage={{ value: stage, label: PROJECT_STATUS_META[stage].label }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
