'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Calculator, Paperclip, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { SelectInput } from '@/components/ui/Field';
import type { TowerWorkItem } from '@/lib/db/types';
import { BUDGET_HEALTH_META, COST_TYPE_META } from '@/lib/domain/construction-cost';
import { directPurchaseRepository, projectCostSheet } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';
import { DirectPurchaseModal } from './DirectPurchaseModal';
import { WorkItemBudgetModal } from './WorkItemBudgetModal';

/**
 * Budget & Cost for one project under construction (DIRECT-PURCHASE-PLAN.md
 * B2/B3): every work item's budget against what has actually been spent and
 * how far the work has got, then the costs themselves.
 */
export function ConstructionCostTab({ projectId, mayEdit }: { projectId: string; mayEdit: boolean }) {
  const sheet = useLiveQuery(() => projectCostSheet(projectId), [projectId]);
  const purchases = useLiveQuery(() => directPurchaseRepository.list({ project_id: projectId }), [projectId]);
  const [budgetFor, setBudgetFor] = useState<TowerWorkItem | null>(null);
  const [costFor, setCostFor] = useState<{ tower_id?: string; work_item_id?: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  if (!sheet) return <p className="text-sm text-ink-muted">Loading…</p>;

  const shown = (purchases ?? []).filter((p) => !filter || p.work_item_id === filter);
  const allItems = sheet.towers.flatMap((t) => t.items.map((i) => ({ tower: t.tower, ...i })));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Budget" value={formatBdt(sheet.budget)} />
        <Tile
          label="Spent so far"
          value={formatBdt(sheet.actual)}
          note={sheet.budget > 0 ? `${Math.round((sheet.actual / sheet.budget) * 100)}% of budget` : undefined}
        />
        <Tile label="Still to pay" value={formatBdt(sheet.unpaid)} note="Recorded, not yet paid" />
        <Tile
          label="Needs attention"
          value={String(sheet.over_count + sheet.warn_count)}
          note={`${sheet.over_count} over budget · ${sheet.warn_count} warning`}
          tone={sheet.over_count > 0 ? 'red' : sheet.warn_count > 0 ? 'amber' : undefined}
        />
      </div>

      {sheet.towers.map((t) => (
        <Card key={t.tower.id}>
          <CardHeader
            title={t.tower.name}
            subtitle={`Budget ${formatBdt(t.budget)} · spent ${formatBdt(t.actual)}`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Work item</th>
                  <th className="py-2 pr-3 font-medium">Work done</th>
                  <th className="py-2 pr-3 text-right font-medium">Budget</th>
                  <th className="py-2 pr-3 text-right font-medium">Spent</th>
                  <th className="w-40 py-2 pr-3 font-medium">Budget used</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {t.items.map((row) => {
                  const pct = row.used_pct ?? 0;
                  return (
                    <tr key={row.work_item.id} className="border-t border-hairline">
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/admin/site-progress/${projectId}/work-items/${row.work_item.id}`}
                          className="font-medium text-ink hover:text-admin-700 hover:underline"
                        >
                          {row.work_item.sequence_no}. {row.work_item.name}
                        </Link>
                        <span className="block text-xs text-ink-muted">
                          {row.line_count} budget line{row.line_count === 1 ? '' : 's'} · {row.purchase_count} cost
                          {row.purchase_count === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">{row.work_item.actual_progress_pct}%</td>
                      <td className="py-2.5 pr-3 text-right">{row.budget > 0 ? formatBdt(row.budget) : '—'}</td>
                      <td className="py-2.5 pr-3 text-right">{row.actual > 0 ? formatBdt(row.actual) : '—'}</td>
                      <td className="py-2.5 pr-3">
                        {row.used_pct !== null ? (
                          <div>
                            <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  row.health === 'over'
                                    ? 'bg-red-500'
                                    : row.health === 'ok'
                                      ? 'bg-admin-500'
                                      : 'bg-amber-500',
                                )}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                              {/* where spending should be, given the work done */}
                              <div
                                className="absolute top-0 h-full w-0.5 bg-ink/50"
                                style={{ left: `${Math.min(100, row.work_item.actual_progress_pct)}%` }}
                                title={`Work done: ${row.work_item.actual_progress_pct}%`}
                              />
                            </div>
                            <span className="text-[11px] text-ink-muted">{pct}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={BUDGET_HEALTH_META[row.health].tone}>
                          {row.health === 'over' && <AlertTriangle className="mr-1 inline size-3" />}
                          {BUDGET_HEALTH_META[row.health].label}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setBudgetFor(row.work_item)}>
                          <Calculator className="size-4" /> {row.line_count > 0 ? 'Budget' : 'Set budget'}
                        </Button>
                        {mayEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCostFor({ tower_id: t.tower.id, work_item_id: row.work_item.id })}
                          >
                            <Plus className="size-4" /> Cost
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
      ))}

      <Card>
        <CardHeader
          title="Costs recorded"
          subtitle="Direct purchases — each with its bill or photo"
          action={
            <div className="flex gap-2">
              <SelectInput aria-label="Filter by work item" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All work items</option>
                {allItems.map((i) => (
                  <option key={i.work_item.id} value={i.work_item.id}>
                    {i.tower.name} · {i.work_item.name}
                  </option>
                ))}
              </SelectInput>
              {mayEdit && (
                <Button size="sm" onClick={() => setCostFor({})}>
                  <Plus className="size-4" /> Add cost
                </Button>
              )}
            </div>
          }
        />
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-sm text-ink-muted">
            No costs recorded{filter ? ' for this work item' : ''} yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">What</th>
                  <th className="py-2 pr-3 font-medium">Work item</th>
                  <th className="py-2 pr-3 font-medium">From</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Payment</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-t border-hairline">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-ink-muted">{formatDate(p.purchase_date)}</td>
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-ink">{p.description}</span>
                      <span className="block text-xs text-ink-muted">
                        {p.code} · {COST_TYPE_META[p.cost_type].label}
                        {p.quantity != null && p.rate != null && ` · ${p.quantity} ${p.unit ?? ''} × ${formatBdt(p.rate)}`}
                        {p.is_asset && ' · asset'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-ink-muted">
                      {p.tower_name} · {p.work_item_name}
                      {p.budget_line_description && (
                        <span className="block text-xs">{p.budget_line_description}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-ink-muted">{p.vendor_name}</td>
                    <td className="py-2.5 pr-3 text-right font-medium text-ink">{formatBdt(p.amount)}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={p.payment_status === 'paid' ? 'green' : p.payment_status === 'part_paid' ? 'blue' : 'amber'}>
                        {p.payment_status === 'paid' ? 'Paid' : p.payment_status === 'part_paid' ? 'Part paid' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <span className="mr-2 inline-flex items-center gap-1 text-xs text-ink-muted" title="Attachments">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {budgetFor && <WorkItemBudgetModal workItem={budgetFor} onClose={() => setBudgetFor(null)} />}
      {costFor && <DirectPurchaseModal projectId={projectId} defaults={costFor} onClose={() => setCostFor(null)} />}
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'red' | 'amber';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-4',
        tone === 'red' ? 'border-red-200' : tone === 'amber' ? 'border-amber-200' : 'border-hairline',
      )}
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold',
          tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : 'text-ink',
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-ink-muted">{note}</p>}
    </div>
  );
}
