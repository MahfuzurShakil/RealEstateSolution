'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Building2,
  HardHat,
  ListChecks,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import type { TowerWorkItem } from '@/lib/db/types';
import {
  SCHEDULE_STATE_META,
  WORK_ITEM_STATUS_META,
  plannedPctOn,
  rollupAcrossTowers,
  rollupProgress,
  scheduleState,
  totalWeight,
  varianceOn,
  weightsBalanced,
} from '@/lib/domain/site-progress';
import {
  siteProgressUpdateRepository,
  towerRepository,
  towerWorkItemRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate, todayLocal } from '@/lib/utils/format';
import { ProgressBar } from './ProgressBar';
import { ProgressUpdateModal } from './ProgressUpdateModal';
import { WorkItemFormModal } from './WorkItemFormModal';

/** Signed variance, e.g. "+4.2%" / "−11.0%". */
function varianceLabel(variance: number | null): string {
  if (variance === null) return '—';
  const sign = variance > 0 ? '+' : variance < 0 ? '−' : '';
  return `${sign}${Math.abs(variance).toFixed(1)}%`;
}

/**
 * The Progress tab of a project (Module 5, Sections 6.2 / 6.3).
 *
 * Same shape as the Towers tab it sits next to: towers down the side, the
 * selected tower's detail on the right — so the two read as one screen rather
 * than two unrelated tools.
 */
export function TowerProgressPanel({
  projectId,
  /** the project progress page shows the roll-up in its own header already */
  showRollup = true,
}: {
  projectId: string;
  showRollup?: boolean;
}) {
  const today = todayLocal();
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<TowerWorkItem | null>(null);
  const [itemModal, setItemModal] = useState<{ open: boolean; item?: TowerWorkItem }>({
    open: false,
  });
  const [deleteItem, setDeleteItem] = useState<TowerWorkItem | null>(null);
  const [resetTowerId, setResetTowerId] = useState<string | null>(null);

  const towers = useLiveQuery(() => towerRepository.listForProject(projectId), [projectId]);
  const allItems = useLiveQuery(
    () => towerWorkItemRepository.listForProject(projectId),
    [projectId],
  );
  const updateCount = useLiveQuery(
    () => siteProgressUpdateRepository.countForProject(projectId),
    [projectId],
  );

  const towerList = towers ?? [];
  const activeTowerId = selectedTowerId ?? towerList[0]?.id ?? null;
  const activeTower = towerList.find((t) => t.id === activeTowerId);

  const itemsByTower = useMemo(() => {
    const map = new Map<string, TowerWorkItem[]>();
    for (const item of allItems ?? []) {
      const list = map.get(item.tower_id) ?? [];
      list.push(item);
      map.set(item.tower_id, list);
    }
    return map;
  }, [allItems]);

  const items = activeTowerId ? (itemsByTower.get(activeTowerId) ?? []) : [];
  // averaged across the project's towers, not summed (Section 6.3)
  const projectRollup = rollupAcrossTowers(allItems ?? [], today);
  const towerRollup = rollupProgress(items, today);
  const weightSum = totalWeight(items);
  const balanced = weightsBalanced(items);

  if (towers === undefined || allItems === undefined) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  if (towerList.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No tower to report on yet"
        description="Site progress is tracked per tower. Add a tower on the Towers tab and its default work breakdown — Foundation through External Works — is created with it."
      />
    );
  }

  return (
    <div className="space-y-5">
      {showRollup && (
      <Card>
        <CardHeader
          title="Project Progress"
          action={
            <Badge tone={SCHEDULE_STATE_META[projectRollup.state].tone}>
              {SCHEDULE_STATE_META[projectRollup.state].label}
            </Badge>
          }
        />
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-semibold text-ink">
            {projectRollup.actual_pct.toFixed(1)}%
          </span>
          <span className="text-sm text-ink-muted">
            {projectRollup.planned_pct === null
              ? 'no planned dates set'
              : `planned ${projectRollup.planned_pct.toFixed(1)}% by today · ${varianceLabel(
                  projectRollup.variance,
                )}`}
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar
            value={projectRollup.actual_pct}
            planned={projectRollup.planned_pct}
            behind={projectRollup.state === 'behind'}
          />
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Weighted across {towerList.length} tower{towerList.length === 1 ? '' : 's'} ·{' '}
          {updateCount ?? 0} site update{updateCount === 1 ? '' : 's'} logged ·{' '}
          <Link href={`/admin/site-progress/${projectId}`} className="text-admin-700 hover:underline">
            view the site log
          </Link>
        </p>
      </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="min-w-0 space-y-3">
          {towerList.map((tower) => {
            const towerItems = itemsByTower.get(tower.id) ?? [];
            const rollup = rollupProgress(towerItems, today);
            const active = tower.id === activeTowerId;
            return (
              <button
                key={tower.id}
                type="button"
                onClick={() => setSelectedTowerId(tower.id)}
                className={cn(
                  'w-full rounded-2xl border p-4 text-left transition-colors',
                  active
                    ? 'border-admin-300 bg-admin-50/70'
                    : 'border-hairline bg-white hover:bg-admin-50/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{tower.name}</span>
                  <span className="text-sm font-semibold text-ink">
                    {rollup.actual_pct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar
                    value={rollup.actual_pct}
                    planned={rollup.planned_pct}
                    behind={rollup.state === 'behind'}
                    size="sm"
                  />
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  {towerItems.length} work item{towerItems.length === 1 ? '' : 's'} ·{' '}
                  {SCHEDULE_STATE_META[rollup.state].label}
                </p>
              </button>
            );
          })}
        </aside>

        <section className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title={activeTower ? `${activeTower.name} — Work Breakdown` : 'Work Breakdown'}
              action={
                <div className="flex flex-wrap gap-2">
                  {items.length === 0 && activeTowerId && (
                    <Button size="sm" variant="outline" onClick={() => setResetTowerId(activeTowerId)}>
                      <RotateCcw className="size-4" /> Load default WBS
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setItemModal({ open: true })}>
                    <Plus className="size-4" /> Work item
                  </Button>
                </div>
              }
            />

            {!balanced && items.length > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  The weights add up to <span className="font-semibold">{weightSum}%</span>, not
                  100%. Until they do, the tower percentage is not a fair reading of how far the
                  building has got.
                </p>
              </div>
            )}

            {items.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="No work breakdown for this tower"
                description="Load the default template — Foundation, Ground Floor, Superstructure, Roof, Electrical, Plumbing, Finishing, External Works — and adjust the weights and dates to suit the build."
                action={
                  activeTowerId ? (
                    <Button onClick={() => setResetTowerId(activeTowerId)}>
                      <RotateCcw className="size-4" /> Load default WBS
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                {/* the WBS is a table on a desktop and a stack of cards on a
                    phone; a 7-column table on 375px is unreadable either way */}
                <ul className="space-y-3">
                  {items.map((item) => {
                    const planned = plannedPctOn(item, today);
                    const variance = varianceOn(item, today);
                    const state = scheduleState(variance);
                    const meta = WORK_ITEM_STATUS_META[item.status];

                    return (
                      <li
                        key={item.id}
                        className="rounded-xl border border-hairline p-4 transition-colors hover:bg-admin-50/30"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-medium text-ink">
                              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-admin-50 text-[11px] font-semibold text-admin-700">
                                {item.sequence_no}
                              </span>
                              <span className="truncate">{item.name}</span>
                            </p>
                            <p className="mt-1 text-xs text-ink-muted">
                              Weight {item.weight_pct}% ·{' '}
                              {item.planned_start_date
                                ? `${formatDate(item.planned_start_date)} → ${formatDate(
                                    item.planned_end_date,
                                  )}`
                                : 'no planned dates'}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            {/* a finished item cannot be behind: "Completed"
                                already says everything, and a "0.0%" badge
                                next to it is noise */}
                            {state !== 'no_plan' && item.status !== 'completed' && (
                              <Badge tone={SCHEDULE_STATE_META[state].tone}>
                                {varianceLabel(variance)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                          <ProgressBar
                            value={item.actual_progress_pct}
                            planned={planned}
                            className="flex-1"
                          />
                          <span className="w-12 shrink-0 text-right text-sm font-semibold text-ink">
                            {item.actual_progress_pct}%
                          </span>
                        </div>
                        {planned != null && (
                          <p className="mt-1.5 text-[11px] text-ink-muted">
                            Planned {planned.toFixed(0)}% by today
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
                          <Button size="sm" onClick={() => setLogFor(item)}>
                            <HardHat className="size-4" /> Log progress
                          </Button>
                          <Link
                            href={`/admin/material-requests/new?project=${projectId}&tower=${item.tower_id}&item=${item.id}`}
                          >
                            <Button size="sm" variant="outline">
                              <Package className="size-4" /> Request material
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setItemModal({ open: true, item })}
                          >
                            <Pencil className="size-4" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteItem(item)}>
                            <Trash2 className="size-4" /> Delete
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-muted">
                  Tower progress {towerRollup.actual_pct.toFixed(2)}% ={' '}
                  <span className="font-mono">Σ (progress × weight ÷ 100)</span> across{' '}
                  {items.length} item{items.length === 1 ? '' : 's'}.
                </p>
              </>
            )}
          </Card>
        </section>
      </div>

      {/* mounted only while open, so each dialog starts from fresh state */}
      {logFor && (
        <ProgressUpdateModal
          open
          workItem={logFor}
          projectId={projectId}
          onClose={() => setLogFor(null)}
        />
      )}

      {itemModal.open && activeTowerId && (
        <WorkItemFormModal
          open
          towerId={activeTowerId}
          item={itemModal.item}
          nextSequence={items.length + 1}
          remainingWeight={Math.max(0, 100 - weightSum + (itemModal.item?.weight_pct ?? 0))}
          onClose={() => setItemModal({ open: false })}
        />
      )}

      <ConfirmDialog
        open={deleteItem !== null}
        title={`Delete ${deleteItem?.name ?? 'work item'}`}
        subtitle={activeTower?.name}
        confirmLabel="Delete work item"
        message="Every site update logged against this item — and the photos attached to them — is deleted with it, and the tower percentage is recalculated."
        onCancel={() => setDeleteItem(null)}
        onConfirm={async () => {
          if (deleteItem) await towerWorkItemRepository.removeCascade(deleteItem.id);
          setDeleteItem(null);
        }}
      />

      <ConfirmDialog
        open={resetTowerId !== null}
        title="Load the default work breakdown"
        tone="default"
        icon={RotateCcw}
        confirmLabel="Load default WBS"
        message="Creates the eight standard items at equal weight, spread across the project's planned build window. Nothing is overwritten — this only runs when the tower has no work items."
        onCancel={() => setResetTowerId(null)}
        onConfirm={async () => {
          if (resetTowerId) await towerWorkItemRepository.seedDefaultsForTower(resetTowerId);
          setResetTowerId(null);
        }}
      />
    </div>
  );
}
