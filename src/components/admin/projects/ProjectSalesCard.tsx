'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Lock, ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Checkbox } from '@/components/ui/Field';
import type { Land, Project, ProjectSalesStatus } from '@/lib/db/types';
import {
  PROJECT_SALES_STATUS_META,
  SALES_MOVE_LABEL,
  allowedSalesMoves,
  salesMoveBlockers,
  landReadiness,
  projectSalesStatus,
  projectShape,
  salesOpenChecks,
} from '@/lib/domain/project';
import { companySettingsRepository, projectRepository } from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';

const MOVE_QUESTION: Record<ProjectSalesStatus, string> = {
  open: 'Bookings can be taken on this project from now on.',
  paused: 'No new bookings until sales are opened again. Existing bookings are not affected.',
  sold_out: 'No new bookings. Open sales again if a cancellation puts stock back on the market.',
  not_open: '',
};

/**
 * v29 — whether the project is selling (PLATFORM-REPLAN.md §1.1).
 *
 * Kept beside the build status rather than inside it: in Bangladesh sales
 * open around design and approval and run all through construction, so the
 * two move independently. Opening sales shows what the records say is still
 * missing — land not secured, plan approval not reached — as warnings, or as
 * blocks where Company Settings say so.
 */
export function ProjectSalesCard({ project, lands }: { project: Project; lands: Land[] }) {
  const [target, setTarget] = useState<ProjectSalesStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const settings = useLiveQuery(() => companySettingsRepository.get(), []);
  const readiness = useLiveQuery(() => projectRepository.readiness(project.id), [project.id, project.updated_at]);
  // every unit has a buyer: suggest closing sales rather than waiting for somebody to notice
  const allSpokenFor =
    readiness !== undefined && readiness.unit_count > 0 && readiness.units_spoken_for >= readiness.unit_count;
  const shape = projectShape(project.project_type);
  const isShare = shape.item === 'share';

  const current = projectSalesStatus(project);
  const meta = PROJECT_SALES_STATUS_META[current];
  // 2026-10-17 — what can be done with sales depends on where the project is
  const moves = allowedSalesMoves(current, { status: project.status, shape });
  const checks = salesOpenChecks({
    status: project.status,
    shape: projectShape(project.project_type),
    land_readiness: landReadiness(lands),
    block_without_land: Boolean(settings?.block_sales_without_land),
    block_before_approval: Boolean(settings?.block_sales_before_approval),
    unit_count: readiness?.unit_count,
    units_unpriced: readiness?.units_unpriced,
  });
  // E2E 2026-10-12 #9 — sold out while stock is still unsold is said out loud
  const unsold = readiness ? readiness.unit_count - readiness.units_spoken_for : 0;
  const itemPlural = projectShape(project.project_type).labels.itemPlural.toLowerCase();

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      await projectRepository.setSalesStatus(project.id, target);
      /*
       * A land share's status follows its sales: once the register is sold
       * out, the project is at "Sold Out", with no second click needed.
       */
      if (isShare && target === 'sold_out' && project.status === 'planning') {
        await projectRepository.setStatus(
          project.id,
          'nearly_complete',
          {
            event_date: todayLocal(),
            performed_by: null,
            reference_no: null,
            remarks: 'Every share sold; moved with the sales status.',
          },
          null,
        );
      }
      setTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const opening = target === 'open';
  return (
    <>
      <Card>
        <CardHeader title="Sales" action={<Badge tone={meta.tone}>{meta.label}</Badge>} />
        <p className="mb-3 text-xs text-ink-muted">
          {current === 'open'
            ? 'Taking bookings. The project appears in the booking form.'
            : 'Not taking bookings. The project is left out of the booking form.'}
        </p>
        {/* QA audit P-05 — bookings recorded while sales were never opened */}
        {current === 'not_open' && (readiness?.units_spoken_for ?? 0) > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {readiness?.units_spoken_for}{' '}
              {projectShape(project.project_type).labels.itemPlural.toLowerCase()} already have buyers
              although sales were never opened. Open sales so the record matches what was sold.
            </span>
          </div>
        )}
        {current === 'open' && allSpokenFor && (
          <div className="mb-3 rounded-xl border border-admin-200 bg-admin-50 p-3 text-sm text-admin-800">
            Every {projectShape(project.project_type).labels.item.toLowerCase()} has a buyer.
            <Button size="sm" className="mt-2 w-full" onClick={() => setTarget('sold_out')}>
              Mark sold out
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {moves.length === 0 && (
            <p className="text-xs text-ink-muted">
              {project.status === 'closed'
                ? 'The project is closed, so nothing more is sold.'
                : 'Sold out. If a buyer cancels, move the project back to Register Open to sell the share again.'}
            </p>
          )}
          {moves.map((to) => {
            const reasons = [
              ...(to === 'open' ? checks.blockers : []),
              ...(readiness ? salesMoveBlockers(to, readiness, shape) : []),
            ];
            const blocked = reasons.length > 0;
            return (
              <div key={to}>
                <Button
                  size="sm"
                  className="w-full"
                  variant={to === 'open' ? 'primary' : 'outline'}
                  disabled={blocked || readiness === undefined}
                  onClick={() => setTarget(to)}
                >
                  {blocked ? <Lock className="size-4" /> : <ShoppingBag className="size-4" />}
                  {SALES_MOVE_LABEL[to]}
                </Button>
                {blocked && (
                  <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
                    {reasons.map((b) => (
                      <li key={b}>• {b}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        {/*
          Publishing sits with selling (client walkthrough 2026-10-10): the
          public site shows projects buyers can book, so the switch only works
          once sales have opened.
        */}
        <div className="mt-4 space-y-2 border-t border-hairline pt-4">
          <Checkbox
            label="Show on the public website"
            checked={project.is_public}
            disabled={current === 'not_open' && !project.is_public}
            onChange={(e) =>
              projectRepository.update(project.id, {
                is_public: e.target.checked,
                ...(e.target.checked ? {} : { is_featured: false }),
              })
            }
          />
          <Checkbox
            label="Feature on the home page"
            checked={project.is_featured}
            disabled={!project.is_public}
            onChange={(e) => projectRepository.update(project.id, { is_featured: e.target.checked })}
          />
          {current === 'not_open' && !project.is_public && (
            <p className="text-xs text-ink-muted">Open sales first, then publish.</p>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={target !== null}
        title={target ? SALES_MOVE_LABEL[target] : ''}
        subtitle={`${project.code} · ${project.name}`}
        icon={ShoppingBag}
        tone={
          (opening && checks.warnings.length > 0) || (target === 'sold_out' && unsold > 0)
            ? 'warning'
            : 'default'
        }
        confirmLabel={target ? SALES_MOVE_LABEL[target] : 'Confirm'}
        message={target ? MOVE_QUESTION[target] : undefined}
        busy={busy}
        disabled={opening && checks.blockers.length > 0}
        onCancel={() => {
          setTarget(null);
          setError('');
        }}
        onConfirm={confirm}
      >
        {error && <p className="text-sm text-red-600">{error}</p>}
        {target === 'sold_out' && unsold > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="size-4" /> {unsold} {itemPlural} are still unsold
            </p>
            <p className="mt-1">
              They will drop out of the booking form. Use Pause sales instead if the stock is only held back
              for now.
            </p>
          </div>
        )}
        {opening && checks.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
              <AlertTriangle className="size-4" /> Before you open sales
            </p>
            <ul className="mt-1 space-y-1 text-xs text-amber-700">
              {checks.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-700">
              You can still open sales. Company Settings can turn these into hard stops.
            </p>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
