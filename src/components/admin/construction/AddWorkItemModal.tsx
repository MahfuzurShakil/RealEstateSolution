'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowRight, ListChecks, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { CONSTRUCTION_COST_TYPES, type ConstructionCostType } from '@/lib/db/types';
import { COST_TYPE_META, templateFor } from '@/lib/domain/construction-cost';
import { money } from '@/lib/domain/procurement';
import { createWorkItemWithBudget, lookupRepository, workItemBudgetRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

interface Line {
  include: boolean;
  /** from the type's usual list, or added by the user under "Other item" */
  own: boolean;
  cost_type: ConstructionCostType;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
}

function lineAmount(l: Line): number {
  if (l.quantity.trim() && l.rate.trim()) return money((Number(l.quantity) || 0) * (Number(l.rate) || 0));
  return Number(l.amount) || 0;
}

const GRID = 'lg:grid-cols-[28px_140px_minmax(0,1fr)_100px_70px_100px_130px_32px]';

/**
 * Add a work item (client, 2026-10-20) in two steps:
 *   1. what kind of work, its name, planned dates and weight;
 *   2. its budget — the lines that kind of work normally needs arrive
 *      pre-filled (priced per sqft of the tower), the user unticks what does
 *      not apply, changes figures and adds anything else as an "Other item".
 * Saved together, so the breakdown never shows an item with no plan.
 */
export function AddWorkItemModal({
  towerId,
  towerName,
  remainingWeight,
  onClose,
  onCreated,
}: {
  towerId: string;
  towerName: string;
  remainingWeight: number;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { userId } = useMockSession();
  const types = useLiveQuery(() => lookupRepository.options('work_item_type', null), []);
  const saleable = useLiveQuery(() => workItemBudgetRepository.towerSaleableArea(towerId), [towerId]);

  const [step, setStep] = useState<1 | 2>(1);
  const [workType, setWorkType] = useState('');
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [weight, setWeight] = useState(String(Math.round(Math.min(remainingWeight, 10) * 100) / 100));
  const [area, setArea] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const areaValue = area ?? (saleable ? String(saleable) : '');
  const total = money(lines.filter((l) => l.include).reduce((s, l) => s + lineAmount(l), 0));

  function linesFor(type: string, sqft: number): Line[] {
    return templateFor(type)
      .filter((t) => t.rate_per_sqft > 0 || type === 'Other')
      .map((t) => ({
        include: true,
        own: false,
        cost_type: t.cost_type,
        description: t.description,
        quantity: sqft > 0 && t.rate_per_sqft > 0 ? String(sqft) : '',
        unit: sqft > 0 && t.rate_per_sqft > 0 ? 'sqft' : '',
        rate: sqft > 0 && t.rate_per_sqft > 0 ? String(t.rate_per_sqft) : '',
        amount: '',
      }));
  }

  function next() {
    setError('');
    if (!workType) return setError('Pick what kind of work this is.');
    if (!(name || workType).trim()) return setError('Give it a name.');
    const w = Number(weight);
    if (!(w >= 0) || w > remainingWeight + 0.005) {
      return setError(`Weight must be between 0 and ${Math.round(remainingWeight * 100) / 100}% (what is left of the tower).`);
    }
    if (start && end && end < start) return setError('The planned end cannot be before the start.');
    if (lines.length === 0) setLines(linesFor(workType, Number(areaValue) || 0));
    setStep(2);
  }

  function set(i: number, patch: Partial<Line>) {
    setLines((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    setError('');
    const bad = lines.find((l) => l.include && !l.description.trim());
    if (bad) return setError('Every ticked line needs a description.');
    setBusy(true);
    try {
      const item = await createWorkItemWithBudget(
        {
          tower_id: towerId,
          name: name.trim() || workType,
          work_type: workType,
          weight_pct: Number(weight) || 0,
          planned_start_date: start || null,
          planned_end_date: end || null,
        },
        lines
          .filter((l) => l.include)
          .map((l) => ({
            cost_type: l.cost_type,
            description: l.description,
            quantity: l.quantity.trim() ? Number(l.quantity) : null,
            unit: l.unit || null,
            rate: l.rate.trim() ? Number(l.rate) : null,
            budgeted_amount: lineAmount(l),
          })),
        userId,
      );
      onCreated?.(item.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the work item.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size={step === 1 ? 'md' : 'xl'}
      icon={ListChecks}
      title={step === 1 ? `Add work item · ${towerName}` : `Budget · ${name.trim() || workType}`}
      subtitle={step === 1 ? 'Step 1 of 2 — what work, and when' : 'Step 2 of 2 — what it should cost'}
      onClose={onClose}
      footer={
        step === 1 ? (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={next}>
              Next: budget <ArrowRight className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : `Add work item · ${formatBdt(total)}`}
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">
              Kind of work <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(types ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (!name.trim() || name === workType) setName(t.value);
                    if (t.value !== workType) setLines([]);
                    setWorkType(t.value);
                  }}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                    workType === t.value
                      ? 'border-admin-400 bg-admin-50 font-medium text-admin-800'
                      : 'border-hairline text-ink hover:bg-slate-50',
                  )}
                >
                  {t.value}
                </button>
              ))}
            </div>
          </div>
          <Field label="Name" required hint="e.g. Foundation, 6th floor slab, Lift lobby finishing">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={workType || 'Work item name'} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Planned start">
              <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Planned end">
              <TextInput type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <Field label="Weight %" hint={`${Math.round(remainingWeight * 100) / 100}% of the tower left`}>
              <TextInput type="number" min={0} max={100} step="any" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </Field>
          </div>
          <p className="rounded-xl border border-hairline bg-slate-50 p-3 text-xs text-ink-muted">
            Weight is this item&apos;s share of the tower&apos;s work, used for the tower&apos;s overall progress. Progress
            itself is logged from the site log.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block w-56">
              <span className="mb-1 block text-xs font-medium text-ink">Built-up area of {towerName} (sqft)</span>
              <TextInput
                type="number"
                min={0}
                value={areaValue}
                onChange={(e) => {
                  setArea(e.target.value);
                  const sqft = Number(e.target.value) || 0;
                  // re-price the usual lines that are still per sqft
                  setLines((all) =>
                    all.map((l) => (l.unit === 'sqft' && !l.own ? { ...l, quantity: sqft > 0 ? String(sqft) : '' } : l)),
                  );
                }}
              />
            </label>
            <p className="max-w-md text-xs text-ink-muted">
              The usual lines for <span className="font-medium text-ink">{workType}</span>, at typical Dhaka rates per sqft.
              Untick what does not apply, change any figure, add what is missing.
            </p>
          </div>

          <div className={cn(GRID, 'hidden px-2 text-xs font-medium text-ink-muted lg:grid lg:gap-2')}>
            <span />
            <span>Type</span>
            <span>Item</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Rate</span>
            <span className="text-right">Budget</span>
            <span />
          </div>
          {lines.map((l, i) => {
            const computed = l.quantity.trim() !== '' && l.rate.trim() !== '';
            return (
              <div
                key={i}
                className={cn(
                  GRID,
                  'grid grid-cols-2 gap-2 rounded-xl border p-2 lg:items-center',
                  l.include ? 'border-hairline' : 'border-dashed border-hairline opacity-50',
                )}
              >
                <input
                  type="checkbox"
                  aria-label={`Include ${l.description || 'line'}`}
                  className="size-4 accent-admin-600"
                  checked={l.include}
                  onChange={(e) => set(i, { include: e.target.checked })}
                />
                <SelectInput aria-label="Cost type" value={l.cost_type} onChange={(e) => set(i, { cost_type: e.target.value as ConstructionCostType })}>
                  {CONSTRUCTION_COST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {COST_TYPE_META[t].label}
                    </option>
                  ))}
                </SelectInput>
                <TextInput aria-label="Item" value={l.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="What is needed" />
                <TextInput aria-label="Quantity" type="number" min={0} step="any" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} placeholder="Qty" />
                <TextInput aria-label="Unit" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} placeholder="unit" />
                <TextInput aria-label="Rate" type="number" min={0} step="any" value={l.rate} onChange={(e) => set(i, { rate: e.target.value })} placeholder="Rate" />
                <TextInput
                  aria-label="Budget"
                  type="number"
                  min={0}
                  step="any"
                  className="text-right"
                  value={computed ? String(lineAmount(l)) : l.amount}
                  readOnly={computed}
                  onChange={(e) => set(i, { amount: e.target.value })}
                  placeholder="Lump sum"
                />
                {l.own ? (
                  <Button variant="ghost" aria-label="Remove line" onClick={() => setLines((all) => all.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setLines((all) => [
                  ...all,
                  { include: true, own: true, cost_type: 'other', description: '', quantity: '', unit: '', rate: '', amount: '' },
                ])
              }
            >
              <Plus className="size-4" /> Other item
            </Button>
            <p className="text-sm text-ink-muted">
              {lines.filter((l) => l.include).length} lines · Budget{' '}
              <span className="text-base font-semibold text-ink">{formatBdt(total)}</span>
            </p>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
