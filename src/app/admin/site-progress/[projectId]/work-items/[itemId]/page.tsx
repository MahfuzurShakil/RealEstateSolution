'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Calculator, HardHat, Paperclip, Pencil, Receipt, Trash2 } from 'lucide-react';
import { DirectPurchaseModal } from '@/components/admin/construction/DirectPurchaseModal';
import { WorkItemBudgetModal } from '@/components/admin/construction/WorkItemBudgetModal';
import { ProgressUpdateModal } from '@/components/admin/site-progress/ProgressUpdateModal';
import { WorkItemFormModal } from '@/components/admin/site-progress/WorkItemFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import { BUDGET_HEALTH_META, COST_TYPE_META } from '@/lib/domain/construction-cost';
import { WORK_ITEM_STATUS_META } from '@/lib/domain/site-progress';
import {
  directPurchaseRepository,
  siteProgressUpdateRepository,
  workItemDetail,
  type DirectPurchaseWithRelations,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

/** A short line from the answers the cost form asked for that type. */
function detailLine(p: DirectPurchaseWithRelations): string {
  const d = p.details ?? {};
  const parts: string[] = [];
  if (p.cost_type === 'labour' && d.workers) parts.push(`${d.workers} workers × ${d.days} days @ ${formatBdt(Number(d.daily_wage))}`);
  if (p.cost_type === 'labour' && d.period_from) parts.push(`${formatDate(String(d.period_from))} – ${formatDate(String(d.period_to ?? d.period_from))}`);
  if (p.cost_type === 'machinery_rent' && d.operator_fuel_included) parts.push('operator & fuel included');
  if (p.cost_type === 'transport' && d.vehicle_no) parts.push(`vehicle ${d.vehicle_no}`);
  if (d.challan_no) parts.push(`challan ${d.challan_no}`);
  if (d.bill_no) parts.push(`bill ${d.bill_no}`);
  if (d.meter_no) parts.push(`meter ${d.meter_no}`);
  if (parts.length === 0 && p.quantity != null && p.rate != null) parts.push(`${p.quantity} ${p.unit ?? ''} × ${formatBdt(p.rate)}`);
  return parts.join(' · ');
}

/**
 * One work item (client, 2026-10-20): its plan, its budget line by line
 * against what has been spent, every cost recorded against it, and its
 * progress readings — with Add cost, Log progress and Budget right here.
 */
export default function WorkItemPage() {
  const { projectId, itemId } = useParams<{ projectId: string; itemId: string }>();
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'site_progress');
  const detail = useLiveQuery(() => workItemDetail(itemId), [itemId]);
  const readings = useLiveQuery(() => siteProgressUpdateRepository.listForWorkItem(itemId), [itemId]);
  const [modal, setModal] = useState<'cost' | 'budget' | 'log' | 'edit' | null>(null);
  const [error, setError] = useState('');

  const back = `/admin/site-progress/${projectId}?tab=breakdown`;
  if (detail === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (detail === null) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This work item no longer exists.</p>
        <Link href={back} className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to the site
          </Button>
        </Link>
      </Card>
    );
  }

  const { item, tower, project } = detail;
  const status = WORK_ITEM_STATUS_META[item.status];
  const health = BUDGET_HEALTH_META[detail.health];
  const left = detail.budget - detail.actual;

  return (
    <>
      <Link href={back} className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700">
        <ArrowLeft className="size-4" /> {project.name} · Work breakdown
      </Link>

      <PageHeader
        title={item.name}
        subtitle={`${project.code} · ${tower.name} · item ${item.sequence_no}${item.work_type ? ` · ${item.work_type}` : ''}`}
        action={
          mayEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setModal('edit')}>
                <Pencil className="size-4" /> Edit details
              </Button>
              <Button variant="outline" onClick={() => setModal('budget')}>
                <Calculator className="size-4" /> Budget
              </Button>
              <Button variant="outline" onClick={() => setModal('log')}>
                <HardHat className="size-4" /> Log progress
              </Button>
              <Button onClick={() => setModal('cost')}>
                <Receipt className="size-4" /> Add cost
              </Button>
            </div>
          )
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Work done" value={`${item.actual_progress_pct}%`} note={<Badge tone={status.tone}>{status.label}</Badge>} />
        <Tile label="Budget" value={detail.budget > 0 ? formatBdt(detail.budget) : '—'} note={`${detail.lines.length} lines`} />
        <Tile
          label="Spent"
          value={formatBdt(detail.actual)}
          note={<Badge tone={health.tone}>{health.label}{detail.used_pct !== null ? ` · ${detail.used_pct}%` : ''}</Badge>}
        />
        <Tile label="Left in budget" value={formatBdt(left)} warn={left < 0} />
        <Tile label="Still to pay" value={formatBdt(detail.unpaid)} note="recorded, not yet paid" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Budget, line by line" subtitle="What was planned against what each line has cost so far" />
            {detail.lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-hairline p-6 text-center text-sm text-ink-muted">
                No budget yet.{' '}
                {mayEdit && (
                  <button type="button" className="font-medium text-admin-700 hover:underline" onClick={() => setModal('budget')}>
                    Set the budget
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-ink-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Line</th>
                      <th className="py-2 pr-3 text-right font-medium">Budget</th>
                      <th className="py-2 pr-3 text-right font-medium">Spent</th>
                      <th className="py-2 pr-3 text-right font-medium">Left</th>
                      <th className="w-36 py-2 font-medium">Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => {
                      const pct = l.budgeted_amount > 0 ? Math.round((l.spent / l.budgeted_amount) * 100) : l.spent > 0 ? 100 : 0;
                      return (
                        <tr key={l.id} className="border-t border-hairline">
                          <td className="py-2.5 pr-3">
                            <span className="font-medium text-ink">{l.description}</span>
                            <span className="block text-xs text-ink-muted">
                              {COST_TYPE_META[l.cost_type].label}
                              {l.quantity != null && l.rate != null && ` · ${l.quantity} ${l.unit ?? ''} × ${formatBdt(l.rate)}`}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-right">{formatBdt(l.budgeted_amount)}</td>
                          <td className="py-2.5 pr-3 text-right">{l.spent > 0 ? formatBdt(l.spent) : '—'}</td>
                          <td className={cn('py-2.5 pr-3 text-right', l.remaining < 0 ? 'font-medium text-red-600' : 'text-ink-muted')}>
                            {formatBdt(l.remaining)}
                          </td>
                          <td className="py-2.5">
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className={cn('h-full rounded-full', pct > 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-admin-500')} style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                            <span className="text-[11px] text-ink-muted">{pct}%</span>
                          </td>
                        </tr>
                      );
                    })}
                    {detail.unlined > 0 && (
                      <tr className="border-t border-hairline">
                        <td className="py-2.5 pr-3 text-ink-muted">Not against a line</td>
                        <td className="py-2.5 pr-3 text-right">—</td>
                        <td className="py-2.5 pr-3 text-right">{formatBdt(detail.unlined)}</td>
                        <td colSpan={2} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`Costs (${detail.purchases.length})`}
              subtitle="Every cost recorded against this work item, with its paper"
              action={
                mayEdit && (
                  <Button size="sm" onClick={() => setModal('cost')}>
                    <Receipt className="size-4" /> Add cost
                  </Button>
                )
              }
            />
            {detail.purchases.length === 0 ? (
              <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-sm text-ink-muted">No costs recorded yet.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {detail.purchases.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start gap-3 py-3">
                    <Badge tone={COST_TYPE_META[p.cost_type].tone}>{COST_TYPE_META[p.cost_type].label}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{p.description}</p>
                      <p className="text-xs text-ink-muted">
                        {formatDate(p.purchase_date)} · {p.vendor_name} · {p.code}
                        {detailLine(p) && ` · ${detailLine(p)}`}
                      </p>
                      {p.budget_line_description && <p className="text-xs text-ink-muted">Line: {p.budget_line_description}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink">{formatBdt(p.amount)}</p>
                      <Badge tone={p.payment_status === 'paid' ? 'green' : p.payment_status === 'part_paid' ? 'blue' : 'amber'}>
                        {p.payment_status === 'paid' ? 'Paid' : p.payment_status === 'part_paid' ? 'Part paid' : 'Pending'}
                      </Badge>
                    </div>
                    <span className="inline-flex items-center gap-1 self-center text-xs text-ink-muted" title="Attachments">
                      <Paperclip className="size-3.5" /> {p.attachment_count}
                    </span>
                    {mayEdit && p.paid_amount === 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${p.code}`}
                        onClick={async () => {
                          if (!window.confirm(`Delete ${p.code} (${formatBdt(p.amount)})?`)) return;
                          try {
                            await directPurchaseRepository.removeCascade(p.id);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : 'Could not delete.');
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Plan" />
            <dl className="space-y-2 text-sm">
              <Row label="Kind of work" value={item.work_type ?? '—'} />
              <Row label="Planned start" value={formatDate(item.planned_start_date) || '—'} />
              <Row label="Planned end" value={formatDate(item.planned_end_date) || '—'} />
              <Row label="Weight" value={`${item.weight_pct}% of ${tower.name}`} />
              <Row label="Order" value={`Item ${item.sequence_no}`} />
            </dl>
          </Card>
          <Card>
            <CardHeader title="Progress readings" />
            {(readings ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">No readings logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {[...(readings ?? [])]
                  .sort((a, b) => b.update_date.localeCompare(a.update_date))
                  .slice(0, 10)
                  .map((r) => (
                    <li key={r.id} className="text-sm">
                      <span className="font-medium text-ink">{r.progress_pct}%</span>
                      <span className="text-ink-muted"> · {formatDate(r.update_date)}</span>
                      {r.remarks && <p className="text-xs text-ink-muted">{r.remarks}</p>}
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {modal === 'cost' && (
        <DirectPurchaseModal projectId={project.id} defaults={{ tower_id: tower.id, work_item_id: item.id }} onClose={() => setModal(null)} />
      )}
      {modal === 'budget' && <WorkItemBudgetModal workItem={item} onClose={() => setModal(null)} />}
      {modal === 'log' && <ProgressUpdateModal open workItem={item} projectId={project.id} onClose={() => setModal(null)} />}
      {modal === 'edit' && (
        <WorkItemFormModal
          open
          towerId={tower.id}
          item={item}
          nextSequence={item.sequence_no}
          remainingWeight={detail.remaining_weight}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function Tile({ label, value, note, warn }: { label: string; value: string; note?: React.ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', warn ? 'text-red-600' : 'text-ink')}>{value}</p>
      {note && <div className="mt-1 text-[11px] text-ink-muted">{note}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
