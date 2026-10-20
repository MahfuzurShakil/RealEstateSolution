'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { CONSTRUCTION_COST_TYPES, type ConstructionCostType } from '@/lib/db/types';
import { COST_TYPE_META, type BudgetTemplateLine } from '@/lib/domain/construction-cost';
import { money } from '@/lib/domain/procurement';
import type { BudgetLineInput } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

export interface EditorLine {
  id?: string;
  cost_type: ConstructionCostType;
  description: string;
  /** client, 2026-10-21: every item is counted its own way — or not counted at all */
  basis: 'qty_rate' | 'lump';
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
}

export function editorLineAmount(l: EditorLine): number {
  return l.basis === 'qty_rate'
    ? money((Number(l.quantity) || 0) * (Number(l.rate) || 0))
    : Number(l.amount) || 0;
}

export function toBudgetInput(l: EditorLine): BudgetLineInput {
  const counted = l.basis === 'qty_rate';
  return {
    id: l.id,
    cost_type: l.cost_type,
    description: l.description,
    quantity: counted && l.quantity.trim() ? Number(l.quantity) : null,
    unit: counted ? l.unit || null : null,
    rate: counted && l.rate.trim() ? Number(l.rate) : null,
    budgeted_amount: editorLineAmount(l),
  };
}

export function fromSaved(l: {
  id: string;
  cost_type: ConstructionCostType;
  description: string;
  quantity?: number | null;
  unit?: string | null;
  rate?: number | null;
  budgeted_amount: number;
}): EditorLine {
  // a line saved with its unit but no figures yet is still a counted line
  const counted = l.quantity != null || l.rate != null || Boolean(l.unit);
  return {
    id: l.id,
    cost_type: l.cost_type,
    description: l.description,
    basis: counted ? 'qty_rate' : 'lump',
    quantity: l.quantity != null ? String(l.quantity) : '',
    unit: l.unit ?? '',
    rate: l.rate != null ? String(l.rate) : '',
    amount: counted ? '' : String(l.budgeted_amount),
  };
}

const blank = (s?: BudgetTemplateLine): EditorLine => ({
  cost_type: s?.cost_type ?? 'material',
  description: s?.description ?? '',
  basis: s?.unit ? 'qty_rate' : 'lump',
  quantity: '',
  unit: s?.unit ?? '',
  rate: '',
  amount: '',
});

/** the units a BD site counts in — free text is still allowed */
const UNITS = ['bag', 'ton', 'kg', 'cft', 'cum', 'sqft', 'rft', 'piece', 'person-day', 'day', 'hour', 'trip', 'set', 'coil', 'litre', 'lot'];

/** what the building is, to fill quantities counted in sqft */
export interface BuildingSize {
  floor_area: number;
  built_up: number;
  /** this budget is for a single floor (a floor-wise work item) */
  per_floor: boolean;
}

/**
 * The budget of a work item, typed by the user (client, 2026-10-21): no
 * figure is filled in. The kind of work offers its usual items as chips; a
 * line reads like a sentence — "60 person-day × 900 per person-day =
 * BDT 54,000" — or is just a lump sum. Lines counted in sqft can be filled
 * from the tower's floor area in one click.
 */
export function BudgetLinesEditor({
  lines,
  onChange,
  suggestions,
  spent,
  size,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  suggestions: BudgetTemplateLine[];
  /** spent per saved line id, when editing an existing budget */
  spent?: Map<string, number>;
  size?: BuildingSize | null;
}) {
  const set = (i: number, patch: Partial<EditorLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const used = new Set(lines.map((l) => l.description.trim().toLowerCase()));
  const offer = suggestions.filter((s) => !used.has(s.description.toLowerCase()));
  const total = money(lines.reduce((s, l) => s + editorLineAmount(l), 0));

  return (
    <div className="space-y-3">
      {size && (
        <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2 text-xs text-ink-muted">
          Floor area <span className="font-medium text-ink">{size.floor_area.toLocaleString('en-IN')} sqft</span>
          {!size.per_floor && (
            <>
              {' '}· built-up <span className="font-medium text-ink">{size.built_up.toLocaleString('en-IN')} sqft</span>
            </>
          )}
          {size.per_floor && ' · this budget is for one floor'}
        </p>
      )}

      {offer.length > 0 && (
        <div className="rounded-xl border border-admin-100 bg-admin-50/50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">Usually needed — click to add, then enter your own figures:</p>
            {offer.length > 1 && (
              <button
                type="button"
                className="text-xs font-medium text-admin-700 hover:underline"
                onClick={() => onChange([...lines, ...offer.map((s) => blank(s))])}
              >
                Add all {offer.length}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {offer.map((s) => (
              <button
                key={s.description}
                type="button"
                onClick={() => onChange([...lines, blank(s)])}
                className="inline-flex items-center gap-1 rounded-full border border-admin-200 bg-white px-2.5 py-1 text-xs text-admin-800 hover:bg-admin-50"
              >
                <Plus className="size-3" /> {s.description}
                {s.unit && <span className="text-ink-muted">· {s.unit}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {lines.length === 0 && (
        <p className="rounded-xl border border-dashed border-hairline p-5 text-center text-sm text-ink-muted">
          No lines yet. Add from the suggestions above, or an item of your own.
        </p>
      )}

      {lines.map((l, i) => {
        const amount = editorLineAmount(l);
        const s = l.id ? (spent?.get(l.id) ?? 0) : 0;
        const unit = l.unit.trim() || 'unit';
        const sqft = l.unit.trim().toLowerCase() === 'sqft' && size;
        return (
          <div key={l.id ?? `n-${i}`} className="rounded-xl border border-hairline bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                aria-label="Item"
                className="min-w-0 flex-1 font-medium"
                value={l.description}
                onChange={(e) => set(i, { description: e.target.value })}
                placeholder="What is needed — e.g. Rod 16mm"
              />
              <select
                aria-label="Cost type"
                value={l.cost_type}
                onChange={(e) => set(i, { cost_type: e.target.value as ConstructionCostType })}
                className="rounded-lg border border-hairline bg-white px-2 py-2 text-xs text-ink-muted"
              >
                {CONSTRUCTION_COST_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COST_TYPE_META[t].label}
                  </option>
                ))}
              </select>
              <Button variant="ghost" aria-label="Remove line" onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-hairline p-0.5 text-xs" role="radiogroup" aria-label="Counted as">
                {(
                  [
                    ['qty_rate', 'Quantity × rate'],
                    ['lump', 'Lump sum'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={l.basis === v}
                    onClick={() => set(i, { basis: v })}
                    className={cn(
                      'rounded-md px-2.5 py-1',
                      l.basis === v ? 'bg-admin-500 font-medium text-white' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {l.basis === 'qty_rate' ? (
                <div className="flex flex-1 flex-wrap items-center gap-1.5 text-sm">
                  <TextInput
                    aria-label="Quantity"
                    type="number"
                    min={0}
                    step="any"
                    className="w-24"
                    value={l.quantity}
                    onChange={(e) => set(i, { quantity: e.target.value })}
                    placeholder="Qty"
                  />
                  <TextInput
                    aria-label="Unit"
                    list="budget-units"
                    className="w-28"
                    value={l.unit}
                    onChange={(e) => set(i, { unit: e.target.value })}
                    placeholder="unit"
                  />
                  <span className="text-ink-muted">×</span>
                  <TextInput
                    aria-label="Rate"
                    type="number"
                    min={0}
                    step="any"
                    className="w-28"
                    value={l.rate}
                    onChange={(e) => set(i, { rate: e.target.value })}
                    placeholder="Rate"
                  />
                  <span className="text-xs text-ink-muted">BDT per {unit}</span>
                </div>
              ) : (
                <div className="flex flex-1 items-center gap-1.5">
                  <TextInput
                    aria-label="Lump sum"
                    type="number"
                    min={0}
                    step="any"
                    className="w-40"
                    value={l.amount}
                    onChange={(e) => set(i, { amount: e.target.value })}
                    placeholder="Amount"
                  />
                  <span className="text-xs text-ink-muted">BDT</span>
                </div>
              )}

              <span className="ml-auto text-right">
                <span className="block text-sm font-semibold text-ink">{amount > 0 ? formatBdt(amount) : '—'}</span>
                {spent && (
                  <span className={cn('block text-[11px]', s > amount && amount > 0 ? 'font-medium text-red-600' : 'text-ink-muted')}>
                    spent {s > 0 ? formatBdt(s) : '—'}
                  </span>
                )}
              </span>
            </div>

            {sqft && l.basis === 'qty_rate' && (
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                <span className="text-ink-muted">Fill quantity:</span>
                <button type="button" className="text-admin-700 hover:underline" onClick={() => set(i, { quantity: String(size.floor_area) })}>
                  one floor · {size.floor_area.toLocaleString('en-IN')}
                </button>
                {!size.per_floor && (
                  <button type="button" className="text-admin-700 hover:underline" onClick={() => set(i, { quantity: String(size.built_up) })}>
                    whole building · {size.built_up.toLocaleString('en-IN')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <datalist id="budget-units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => onChange([...lines, blank()])}>
          <Plus className="size-4" /> Add your own item
        </Button>
        <p className="text-sm text-ink-muted">
          {lines.length} line{lines.length === 1 ? '' : 's'} · Budget{' '}
          <span className="text-base font-semibold text-ink">{formatBdt(total)}</span>
        </p>
      </div>
    </div>
  );
}
