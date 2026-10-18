'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calculator, Plus, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import { CONSTRUCTION_COST_TYPES, type ConstructionCostType, type TowerWorkItem } from '@/lib/db/types';
import { COST_TYPE_META, templateFor } from '@/lib/domain/construction-cost';
import { money } from '@/lib/domain/procurement';
import { actualByBudgetLine, workItemBudgetRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

interface Row {
  id?: string;
  cost_type: ConstructionCostType;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
}

/** quantity × rate when both are there; otherwise whatever was typed as the amount */
function rowAmount(r: Row): number {
  const q = Number(r.quantity);
  const p = Number(r.rate);
  if (r.quantity.trim() && r.rate.trim() && q >= 0 && p >= 0) return money(q * p);
  return Number(r.amount) || 0;
}

const GRID = 'lg:grid-cols-[140px_minmax(0,1fr)_90px_80px_110px_130px_110px_36px]';

/**
 * The budget of one work item (DIRECT-PURCHASE-PLAN.md B2).
 *
 * Opened empty, it offers the usual lines for that kind of work, priced per
 * sqft of the tower's built-up area. The user ticks the ones that apply, then
 * edits, adds and removes lines freely. Saved whole.
 */
export function WorkItemBudgetModal({
  workItem,
  onClose,
}: {
  workItem: TowerWorkItem;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const existing = useLiveQuery(() => workItemBudgetRepository.listForWorkItem(workItem.id), [workItem.id]);
  const actuals = useLiveQuery(() => actualByBudgetLine(workItem.id), [workItem.id]);
  const saleable = useLiveQuery(
    () => workItemBudgetRepository.towerSaleableArea(workItem.tower_id),
    [workItem.tower_id],
  );

  // null = not touched yet: show what is saved (or the template offer)
  const [rows, setRows] = useState<Row[] | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const template = templateFor(workItem.name);
  const areaValue = area ?? (saleable ? String(saleable) : '');
  const areaNum = Number(areaValue) || 0;
  const pickedSet = picked ?? new Set(template.map((_, i) => i));

  const shown: Row[] =
    rows ??
    (existing ?? []).map((l) => ({
      id: l.id,
      cost_type: l.cost_type,
      description: l.description,
      quantity: l.quantity != null ? String(l.quantity) : '',
      unit: l.unit ?? '',
      rate: l.rate != null ? String(l.rate) : '',
      amount: String(l.budgeted_amount),
    }));
  const offerTemplate = existing !== undefined && existing.length === 0 && rows === null;
  const total = money(shown.reduce((s, r) => s + rowAmount(r), 0));

  function set(index: number, patch: Partial<Row>) {
    setRows(shown.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function applyTemplate() {
    setRows(
      template
        .filter((_, i) => pickedSet.has(i))
        .map((t) => ({
          cost_type: t.cost_type,
          description: t.description,
          quantity: areaNum > 0 && t.rate_per_sqft > 0 ? String(areaNum) : '',
          unit: areaNum > 0 && t.rate_per_sqft > 0 ? 'sqft' : '',
          rate: areaNum > 0 && t.rate_per_sqft > 0 ? String(t.rate_per_sqft) : '',
          amount: '',
        })),
    );
  }

  async function save() {
    setError('');
    setBusy(true);
    try {
      await workItemBudgetRepository.saveForWorkItem(
        workItem.id,
        shown.map((r) => ({
          id: r.id,
          cost_type: r.cost_type,
          description: r.description,
          quantity: r.quantity.trim() ? Number(r.quantity) : null,
          unit: r.unit || null,
          rate: r.rate.trim() ? Number(r.rate) : null,
          budgeted_amount: rowAmount(r),
        })),
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The budget could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="xl"
      icon={Calculator}
      title={`Budget · ${workItem.name}`}
      subtitle="What this work should cost. Costs recorded against it are compared with these lines."
      onClose={onClose}
      footer={
        offerTemplate ? (
          <>
            <Button variant="outline" onClick={() => setRows([])}>
              Start blank
            </Button>
            <Button onClick={applyTemplate} disabled={pickedSet.size === 0}>
              <Wand2 className="size-4" /> Use {pickedSet.size} line{pickedSet.size === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save budget'}
            </Button>
          </>
        )
      }
    >
      {existing === undefined ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : offerTemplate ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-admin-200 bg-admin-50/60 p-3 text-sm text-ink">
            <p className="font-medium">Usual lines for {workItem.name}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Typical Dhaka rates per sqft of built-up area. Tick what applies — every figure can be
              changed on the next step.
            </p>
          </div>
          <label className="block max-w-xs">
            <span className="mb-1 block text-sm font-medium text-ink">Built-up area (sqft)</span>
            <TextInput
              type="number"
              min={0}
              value={areaValue}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. 18000"
            />
            <span className="mt-1 block text-xs text-ink-muted">
              {saleable
                ? `Prefilled from the tower's units (${saleable.toLocaleString('en-IN')} sqft saleable). Add stairs, lobby and walls.`
                : 'No unit sizes yet — type the total floor area of the tower.'}
            </span>
          </label>
          <ul className="divide-y divide-hairline rounded-xl border border-hairline">
            {template.map((t, i) => (
              <li key={t.description}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="size-4 accent-admin-600"
                    checked={pickedSet.has(i)}
                    onChange={(e) => {
                      const next = new Set(pickedSet);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setPicked(next);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{t.description}</span>
                    <span className="text-xs text-ink-muted">
                      {COST_TYPE_META[t.cost_type].label}
                      {t.rate_per_sqft > 0 && ` · ${formatBdt(t.rate_per_sqft)} / sqft`}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {t.rate_per_sqft > 0 && areaNum > 0 ? formatBdt(money(t.rate_per_sqft * areaNum)) : '—'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-right text-sm text-ink-muted">
            Ticked total:{' '}
            <span className="font-semibold text-ink">
              {formatBdt(
                money(
                  template.reduce((s, t, i) => s + (pickedSet.has(i) ? t.rate_per_sqft * areaNum : 0), 0),
                ),
              )}
            </span>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className={cn(GRID, 'hidden px-2 text-xs font-medium text-ink-muted lg:grid lg:gap-2')}>
            <span>Type</span>
            <span>Description</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Rate</span>
            <span className="text-right">Budget</span>
            <span className="text-right">Spent</span>
            <span />
          </div>
          {shown.map((r, i) => {
            const spent = r.id ? (actuals?.get(r.id) ?? 0) : 0;
            const amount = rowAmount(r);
            const computed = r.quantity.trim() !== '' && r.rate.trim() !== '';
            return (
              <div
                key={r.id ?? `new-${i}`}
                className={cn(GRID, 'grid grid-cols-2 gap-2 rounded-xl border border-hairline p-2 lg:items-center')}
              >
                <SelectInput
                  aria-label="Cost type"
                  value={r.cost_type}
                  onChange={(e) => set(i, { cost_type: e.target.value as ConstructionCostType })}
                >
                  {CONSTRUCTION_COST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {COST_TYPE_META[t].label}
                    </option>
                  ))}
                </SelectInput>
                <TextInput
                  aria-label="Description"
                  value={r.description}
                  onChange={(e) => set(i, { description: e.target.value })}
                  placeholder="e.g. Rod 16mm"
                />
                <TextInput
                  aria-label="Quantity"
                  type="number"
                  min={0}
                  step="any"
                  value={r.quantity}
                  onChange={(e) => set(i, { quantity: e.target.value })}
                  placeholder="Qty"
                />
                <TextInput
                  aria-label="Unit"
                  value={r.unit}
                  onChange={(e) => set(i, { unit: e.target.value })}
                  placeholder="ton, bag…"
                />
                <TextInput
                  aria-label="Rate"
                  type="number"
                  min={0}
                  step="any"
                  value={r.rate}
                  onChange={(e) => set(i, { rate: e.target.value })}
                  placeholder="Rate"
                />
                <TextInput
                  aria-label="Budget amount"
                  type="number"
                  min={0}
                  step="any"
                  className="text-right"
                  value={computed ? String(amount) : r.amount}
                  readOnly={computed}
                  title={computed ? 'Quantity × rate — clear one of them to type a lump sum' : undefined}
                  onChange={(e) => set(i, { amount: e.target.value })}
                  placeholder="Lump sum"
                />
                <span
                  className={cn(
                    'text-right text-sm',
                    spent > amount && amount > 0 ? 'font-medium text-red-600' : 'text-ink-muted',
                  )}
                >
                  {spent > 0 ? formatBdt(spent) : '—'}
                </span>
                <Button
                  variant="ghost"
                  aria-label="Remove line"
                  onClick={() => setRows(shown.filter((_, j) => j !== i))}
                  className="justify-self-end"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          {shown.length === 0 && (
            <p className="rounded-xl border border-dashed border-hairline p-4 text-center text-sm text-ink-muted">
              No lines yet. Add the first one.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setRows([
                  ...shown,
                  { cost_type: 'material', description: '', quantity: '', unit: '', rate: '', amount: '' },
                ])
              }
            >
              <Plus className="size-4" /> Add line
            </Button>
            <p className="text-sm text-ink-muted">
              Budget for {workItem.name}: <span className="text-base font-semibold text-ink">{formatBdt(total)}</span>
              {(actuals?.get('') ?? 0) > 0 && (
                <span className="ml-2 text-xs">
                  ({formatBdt(actuals?.get('') ?? 0)} spent without a line)
                </span>
              )}
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
