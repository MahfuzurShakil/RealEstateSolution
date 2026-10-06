'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Calculator, Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, MoneyInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Project } from '@/lib/db/types';
import { canEdit } from '@/lib/domain/access';
import { costingHeadsFor, type ProjectCosting } from '@/lib/domain/costing';
import { projectBudgetRepository, projectCostingRepository } from '@/lib/repositories';
import { PROCUREMENT_BUDGET_HEAD } from '@/lib/db/types';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

/**
 * v29 — what the project will cost and earn, and where it stands
 * (PLATFORM-REPLAN.md §1.5). The owner's page: one estimate, the land
 * pulled in from the land records, and actual spend beside each head.
 *
 * Nothing here blocks anything. Over a head is shown in red so it is seen,
 * and the spend behind it is in the ledger — transparency, not restriction
 * (client direction 2026-10-06).
 */
export function ProjectCostingTab({ project }: { project: Project }) {
  const { role } = useMockSession();
  const [editing, setEditing] = useState(false);
  const costing = useLiveQuery(
    () => projectCostingRepository.forProject(project.id),
    [project.id, project.updated_at],
  );
  const mayEdit = canEdit(role, 'finance_expense');

  if (costing === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!costing) return null;

  const hasEstimate = costing.estimatedTotal > 0;
  const spentPct =
    costing.estimatedTotal > 0
      ? Math.min(100, Math.round((costing.actualTotal / costing.estimatedTotal) * 1000) / 10)
      : 0;
  const soldPct =
    costing.revenue.companyUnits > 0
      ? Math.round((costing.revenue.soldUnits / costing.revenue.companyUnits) * 1000) / 10
      : null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Cost & earnings"
          subtitle="Estimate against what has happened. Land comes from the land records."
          action={
            mayEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit estimate
              </Button>
            )
          }
        />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile label="Estimated total cost" value={formatBdt(costing.estimatedTotal)} hint={
            costing.contingencyPct > 0 ? `incl. ${costing.contingencyPct}% contingency` : 'land + all heads'
          } />
          <Tile
            label="Expected revenue"
            value={costing.revenue.source === 'none' ? '—' : formatBdt(costing.revenue.expected)}
            hint={
              costing.revenue.source === 'units'
                ? `${costing.revenue.companyUnits} units for sale`
                : costing.revenue.source === 'estimate'
                  ? 'quick estimate: area × rate'
                  : 'no units or estimate yet'
            }
          />
          <Tile
            label="Expected margin"
            value={costing.marginPct === null ? '—' : formatBdt(costing.margin)}
            hint={costing.marginPct === null ? 'needs revenue' : `${costing.marginPct}% of revenue`}
            tone={costing.marginPct === null ? undefined : costing.margin >= 0 ? 'good' : 'bad'}
          />
          <Tile
            label="Break-even"
            value={costing.breakEvenPct === null ? '—' : `${costing.breakEvenPct}%`}
            hint="of expected sales covers the cost"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile label="Spent so far" value={formatBdt(costing.actualTotal)} hint={hasEstimate ? `${spentPct}% of estimate` : 'land + ledger + materials'} />
          <Tile label="Collected so far" value={formatBdt(costing.collected)} hint="buyer receipts" />
          <Tile
            label="Sold"
            value={soldPct === null ? '—' : `${soldPct}%`}
            hint={
              soldPct === null
                ? 'no units yet'
                : `${costing.revenue.soldUnits} of ${costing.revenue.companyUnits} · ${formatBdt(costing.revenue.booked)}`
            }
          />
          <Tile
            label="Cost per area"
            value={costing.costPerArea ? formatBdt(costing.costPerArea.value) : '—'}
            hint={costing.costPerArea ? `per ${costing.costPerArea.per}, estimated` : 'needs an area'}
          />
        </div>
        {hasEstimate && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
              <span>Spent against the estimate</span>
              <span className="font-medium text-ink">{spentPct}%</span>
            </div>
            <ProgressBar value={spentPct} size="sm" behind={costing.actualTotal > costing.estimatedTotal} />
          </div>
        )}
        <MarginLine costing={costing} />
      </Card>

      <Card>
        <CardHeader title="By head (khat)" subtitle="Estimate, spend so far, and what is left. Red means over the estimate." />
        <HeadTable costing={costing} />
      </Card>

      {editing && (
        <EstimateModal project={project} costing={costing} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="min-w-0 rounded-xl border border-hairline p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={cn(
          'truncate text-base font-semibold tabular-nums',
          tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-ink',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-ink-muted">{hint}</p>
    </div>
  );
}

function MarginLine({ costing }: { costing: ProjectCosting }) {
  if (costing.marginPct === null) {
    return (
      <p className="mt-4 flex items-start gap-2 border-t border-hairline pt-4 text-xs text-ink-muted">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        No revenue to compare against yet. Generate the units, or enter a saleable area and an
        average rate in the estimate.
      </p>
    );
  }
  const Icon = costing.margin >= 0 ? TrendingUp : TrendingDown;
  return (
    <p className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-4 text-sm">
      <Icon className={cn('size-4', costing.margin >= 0 ? 'text-emerald-600' : 'text-red-500')} />
      <span className="text-ink-muted">If everything sells at today&rsquo;s prices, the project</span>
      <span className={cn('font-semibold', costing.margin >= 0 ? 'text-emerald-700' : 'text-red-600')}>
        {costing.margin >= 0 ? 'earns' : 'loses'} {formatBdt(Math.abs(costing.margin))}
      </span>
      {costing.land.landownerShareValue !== null && (
        <span className="text-xs text-ink-muted">
          · landowner&rsquo;s flats ({formatBdt(costing.land.landownerShareValue)}) are not in
          revenue or cost
        </span>
      )}
    </p>
  );
}

function HeadTable({ costing }: { costing: ProjectCosting }) {
  const rows = [
    {
      key: 'land',
      label: 'Land',
      note:
        costing.land.lands === 0
          ? 'no land linked'
          : `${costing.land.lands} land${costing.land.lands === 1 ? '' : 's'}, from the land cost sheets`,
      estimated: costing.land.estimated,
      actual: costing.land.actual,
    },
    ...costing.lines.map((l) => ({
      key: l.code,
      label: l.label,
      note: l.code === 'other' && costing.otherLedger > 0 ? 'includes other ledger categories' : '',
      estimated: l.estimated,
      actual: l.actual,
    })),
    ...(costing.contingency > 0
      ? [
          {
            key: 'contingency',
            label: `Contingency (${costing.contingencyPct}%)`,
            note: 'on everything except land',
            estimated: costing.contingency,
            actual: 0,
          },
        ]
      : []),
  ];

  const th = 'border-b border-hairline px-3 pb-2 text-xs font-medium uppercase tracking-wide text-ink-muted';
  const td = 'border-b border-hairline px-3 py-2.5 tabular-nums';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th className={cn(th, 'text-left')}>Head</th>
            <th className={cn(th, 'text-right')}>Estimate</th>
            <th className={cn(th, 'text-right')}>Spent</th>
            <th className={cn(th, 'text-right')}>Left</th>
            <th className={cn(th, 'w-32 text-left')}>Used</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const over = r.estimated > 0 && r.actual > r.estimated;
            const unplanned = r.estimated === 0 && r.actual > 0;
            const pct = r.estimated > 0 ? Math.min(100, (r.actual / r.estimated) * 100) : 0;
            return (
              <tr key={r.key}>
                <td className={cn(td, 'text-ink')}>
                  {r.label}
                  {(r.note || unplanned) && (
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {unplanned ? 'spent without an estimate' : r.note}
                    </span>
                  )}
                </td>
                <td className={cn(td, 'text-right text-ink')}>
                  {r.estimated > 0 ? formatBdt(r.estimated) : '—'}
                </td>
                <td className={cn(td, 'text-right', over || unplanned ? 'font-medium text-red-600' : 'text-ink')}>
                  {r.actual > 0 ? formatBdt(r.actual) : '—'}
                </td>
                <td className={cn(td, 'text-right', over ? 'font-medium text-red-600' : 'text-ink-muted')}>
                  {r.estimated > 0
                    ? over
                      ? `+${formatBdt(r.actual - r.estimated)} over`
                      : formatBdt(r.estimated - r.actual)
                    : '—'}
                </td>
                <td className={td}>
                  {r.estimated > 0 && <ProgressBar value={pct} size="sm" behind={over} />}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-3 pt-3 font-semibold text-ink">Total</td>
            <td className="px-3 pt-3 text-right font-semibold tabular-nums text-ink">
              {formatBdt(costing.estimatedTotal)}
            </td>
            <td className="px-3 pt-3 text-right font-semibold tabular-nums text-ink">
              {formatBdt(costing.actualTotal)}
            </td>
            <td className="px-3 pt-3 text-right tabular-nums text-ink-muted">
              {costing.estimatedTotal > costing.actualTotal
                ? formatBdt(costing.estimatedTotal - costing.actualTotal)
                : '—'}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function EstimateModal({
  project,
  costing,
  onClose,
}: {
  project: Project;
  costing: ProjectCosting;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const heads = costingHeadsFor(project.project_type);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      costing.lines.map((l) => [l.code, l.estimated > 0 ? String(l.estimated) : '']),
    ),
  );
  const [contingency, setContingency] = useState(String(project.contingency_pct ?? ''));
  const [area, setArea] = useState(String(project.est_saleable_area ?? ''));
  const [rate, setRate] = useState(String(project.est_avg_rate ?? ''));
  const [quickArea, setQuickArea] = useState('');
  const [quickRate, setQuickRate] = useState('');
  const [saving, setSaving] = useState(false);
  const built = heads.some((h) => h.code === PROCUREMENT_BUDGET_HEAD);
  const landUnit = project.project_type === 'land_share' || project.project_type === 'plot_development';

  function applyQuick() {
    const total = (Number(quickArea) || 0) * (Number(quickRate) || 0);
    if (total <= 0) return;
    const split = projectCostingRepository.splitConstruction(total);
    setValues((v) => ({
      ...v,
      [PROCUREMENT_BUDGET_HEAD]: String(split.materials),
      contractor_payment: String(split.contractor),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      /*
       * Old plans can carry a line under a land category (the land used to be
       * budgeted on the project). Land is costed on the land now, so such a
       * line is cleared rather than left to be counted twice.
       */
      const stale = (await projectBudgetRepository.listForProject(project.id))
        .filter((l) => l.cost_category === 'land_payment' || l.cost_category === 'land_extra_cost')
        .map((l) => ({ cost_category: l.cost_category, budgeted_amount: 0 }));
      await projectCostingRepository.saveEstimate(
        project.id,
        {
          heads: [
            ...heads.map((h) => ({ cost_category: h.code, budgeted_amount: Number(values[h.code]) || 0 })),
            ...stale,
          ],
          contingency_pct: contingency.trim() === '' ? null : Number(contingency),
          est_saleable_area: area.trim() === '' ? null : Number(area),
          est_avg_rate: rate.trim() === '' ? null : Number(rate),
        },
        userId,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title="Project estimate"
      subtitle={`${project.code} · land is taken from the land cost sheets`}
      icon={Calculator}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save estimate'}
          </Button>
        </>
      }
    >
      {built && (
        <div className="mb-4 rounded-xl border border-hairline bg-white p-3">
          <p className="mb-2 text-sm font-medium text-ink">Quick construction estimate</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Built-up area (sqft)">
              <TextInput type="number" value={quickArea} onChange={(e) => setQuickArea(e.target.value)} placeholder="e.g. 42000" />
            </Field>
            <Field label="Cost per sqft">
              <MoneyInput value={quickRate} onChange={(e) => setQuickRate(e.target.value)} placeholder="e.g. 3200" />
            </Field>
            <Button variant="outline" onClick={applyQuick}>
              Fill construction
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Splits about 60% materials and 40% contractor and labour. Adjust below.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {heads.map((h) => (
          <Field key={h.code} label={h.label} hint={h.hint}>
            <MoneyInput
              value={values[h.code] ?? ''}
              placeholder="0"
              onChange={(e) => setValues((v) => ({ ...v, [h.code]: e.target.value }))}
            />
          </Field>
        ))}
        <Field label="Contingency %" hint="Added on top of every head except land">
          <TextInput type="number" value={contingency} onChange={(e) => setContingency(e.target.value)} placeholder="e.g. 5" />
        </Field>
      </div>

      <div className="mt-4 border-t border-hairline pt-4">
        <p className="mb-2 text-sm font-medium text-ink">Revenue before units exist</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={landUnit ? `Saleable land (${project.total_land_area_unit ?? 'katha'})` : 'Saleable area (sqft)'}>
            <TextInput type="number" value={area} onChange={(e) => setArea(e.target.value)} placeholder={landUnit ? 'e.g. 20' : 'e.g. 30000'} />
          </Field>
          <Field label={landUnit ? `Average rate per ${project.total_land_area_unit ?? 'katha'}` : 'Average rate per sqft'}>
            <MoneyInput value={rate} onChange={(e) => setRate(e.target.value)} placeholder={landUnit ? 'e.g. 2500000' : 'e.g. 9500'} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Used only until units are generated. After that, revenue is read from the units and
          bookings. The landowner&rsquo;s units on a JV are never counted.
        </p>
      </div>
    </Modal>
  );
}
