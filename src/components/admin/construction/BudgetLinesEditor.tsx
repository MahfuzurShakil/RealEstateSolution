'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
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

/** qty and rate both typed: the amount is their product */
const counted = (l: EditorLine) => l.quantity.trim() !== '' && l.rate.trim() !== '';

export function editorLineAmount(l: EditorLine): number {
  return counted(l) ? money((Number(l.quantity) || 0) * (Number(l.rate) || 0)) : Number(l.amount) || 0;
}

export function toBudgetInput(l: EditorLine): BudgetLineInput {
  // 2026-10-23 — no basis toggle: whatever was typed is kept, the amount follows
  return {
    id: l.id,
    cost_type: l.cost_type,
    description: l.description,
    quantity: l.quantity.trim() ? Number(l.quantity) : null,
    unit: l.unit.trim() || null,
    rate: l.rate.trim() ? Number(l.rate) : null,
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
 * figure is filled in. The kind of work offers its usual items as chips.
 * Since 2026-10-23 the lines are one table: Qty × Rate gives the amount, and
 * a line with no quantity or rate takes a typed amount. Lines counted in sqft
 * can be filled from the tower's floor area in one click.
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

      {lines.length > 0 && (
        // 2026-10-23 — one row per item, like a BOQ sheet (client: the cards were too busy)
        <div className="overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-ink-muted">
              <tr>
                <th className="px-2 py-2 font-medium">Item</th>
                <th className="w-32 px-2 py-2 font-medium">Type</th>
                <th className="w-24 px-2 py-2 font-medium">Qty</th>
                <th className="w-24 px-2 py-2 font-medium">Unit</th>
                <th className="w-28 px-2 py-2 font-medium">Rate</th>
                <th className="w-36 px-2 py-2 text-right font-medium">Amount (BDT)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {lines.map((l, i) => {
                const amount = editorLineAmount(l);
                const s = l.id ? (spent?.get(l.id) ?? 0) : 0;
                const sqft = l.unit.trim().toLowerCase() === 'sqft' && size;
                const cell = 'h-9 w-full rounded-md border border-hairline bg-white px-2 text-sm';
                return (
                  <tr key={l.id ?? `n-${i}`} className="align-top">
                    <td className="px-2 py-1.5">
                      <input
                        aria-label="Item"
                        className={cn(cell, 'font-medium')}
                        value={l.description}
                        onChange={(e) => set(i, { description: e.target.value })}
                        placeholder="e.g. Rod 16mm"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        aria-label="Cost type"
                        value={l.cost_type}
                        onChange={(e) => set(i, { cost_type: e.target.value as ConstructionCostType })}
                        className={cn(cell, 'text-ink-muted')}
                      >
                        {CONSTRUCTION_COST_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {COST_TYPE_META[t].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label="Quantity"
                        type="number"
                        min={0}
                        step="any"
                        className={cell}
                        value={l.quantity}
                        onChange={(e) => set(i, { quantity: e.target.value, basis: 'qty_rate' })}
                        placeholder="—"
                      />
                      {sqft && (
                        <div className="mt-1 flex flex-col text-[11px]">
                          <button
                            type="button"
                            className="text-left text-admin-700 hover:underline"
                            onClick={() => set(i, { quantity: String(size.floor_area), basis: 'qty_rate' })}
                          >
                            1 floor
                          </button>
                          {!size.per_floor && (
                            <button
                              type="button"
                              className="text-left text-admin-700 hover:underline"
                              onClick={() => set(i, { quantity: String(size.built_up), basis: 'qty_rate' })}
                            >
                              building
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label="Unit"
                        list="budget-units"
                        className={cell}
                        value={l.unit}
                        onChange={(e) => set(i, { unit: e.target.value })}
                        placeholder="—"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label="Rate"
                        type="number"
                        min={0}
                        step="any"
                        className={cell}
                        value={l.rate}
                        onChange={(e) => set(i, { rate: e.target.value, basis: 'qty_rate' })}
                        placeholder="—"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {counted(l) ? (
                        <span className="block h-9 pt-2 font-semibold text-ink">
                          {amount > 0 ? formatBdt(amount) : '—'}
                        </span>
                      ) : (
                        <input
                          aria-label="Amount"
                          type="number"
                          min={0}
                          step="any"
                          className={cn(cell, 'text-right font-semibold')}
                          value={l.amount}
                          onChange={(e) => set(i, { amount: e.target.value, basis: 'lump' })}
                          placeholder="Amount"
                        />
                      )}
                      {spent && (
                        <span
                          className={cn(
                            'block text-[11px]',
                            s > amount && amount > 0 ? 'font-medium text-red-600' : 'text-ink-muted',
                          )}
                        >
                          spent {s > 0 ? formatBdt(s) : '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove line"
                        onClick={() => onChange(lines.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-ink-muted">Enter Qty and Rate to calculate the amount, or type a fixed Amount.</p>

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
