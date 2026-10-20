'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SelectInput, TextInput } from '@/components/ui/Field';
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
  const counted = l.quantity != null && l.rate != null;
  return {
    id: l.id,
    cost_type: l.cost_type,
    description: l.description,
    basis: counted ? 'qty_rate' : 'lump',
    quantity: counted ? String(l.quantity) : '',
    unit: l.unit ?? '',
    rate: counted ? String(l.rate) : '',
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

const GRID = 'lg:grid-cols-[130px_minmax(0,1fr)_118px_minmax(0,230px)_120px_90px_32px]';

/**
 * The budget of a work item, typed by the user (client, 2026-10-21): no
 * figure is filled in. The kind of work offers its usual items as chips — a
 * click adds the line with the unit it is normally counted in — and each line
 * is either quantity × rate in its own unit, or a lump sum.
 */
export function BudgetLinesEditor({
  lines,
  onChange,
  suggestions,
  spent,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  suggestions: BudgetTemplateLine[];
  /** spent per saved line id, when editing an existing budget */
  spent?: Map<string, number>;
}) {
  const set = (i: number, patch: Partial<EditorLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const used = new Set(lines.map((l) => l.description.trim().toLowerCase()));
  const offer = suggestions.filter((s) => !used.has(s.description.toLowerCase()));
  const total = money(lines.reduce((s, l) => s + editorLineAmount(l), 0));

  return (
    <div className="space-y-3">
      {offer.length > 0 && (
        <div className="rounded-xl border border-admin-100 bg-admin-50/50 p-3">
          <p className="mb-2 text-xs text-ink-muted">Usually needed — click to add, then enter your own quantity and rate:</p>
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

      {lines.length > 0 && (
        <div className={cn(GRID, 'hidden px-2 text-xs font-medium text-ink-muted lg:grid lg:gap-2')}>
          <span>Type</span>
          <span>Item</span>
          <span>Counted as</span>
          <span>Quantity · unit · rate</span>
          <span className="text-right">Budget</span>
          <span className="text-right">{spent ? 'Spent' : ''}</span>
          <span />
        </div>
      )}
      {lines.map((l, i) => {
        const amount = editorLineAmount(l);
        const s = l.id ? (spent?.get(l.id) ?? 0) : 0;
        return (
          <div key={l.id ?? `n-${i}`} className={cn(GRID, 'grid grid-cols-2 gap-2 rounded-xl border border-hairline p-2 lg:items-center')}>
            <SelectInput aria-label="Cost type" value={l.cost_type} onChange={(e) => set(i, { cost_type: e.target.value as ConstructionCostType })}>
              {CONSTRUCTION_COST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COST_TYPE_META[t].label}
                </option>
              ))}
            </SelectInput>
            <TextInput aria-label="Item" value={l.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="What is needed" />
            <SelectInput aria-label="Counted as" value={l.basis} onChange={(e) => set(i, { basis: e.target.value as EditorLine['basis'] })}>
              <option value="qty_rate">Qty × rate</option>
              <option value="lump">Lump sum</option>
            </SelectInput>
            {l.basis === 'qty_rate' ? (
              <div className="flex gap-1.5">
                <TextInput aria-label="Quantity" type="number" min={0} step="any" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} placeholder="Qty" />
                <TextInput aria-label="Unit" className="w-20 shrink-0" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} placeholder="unit" />
                <TextInput aria-label="Rate" type="number" min={0} step="any" value={l.rate} onChange={(e) => set(i, { rate: e.target.value })} placeholder="Rate" />
              </div>
            ) : (
              <TextInput aria-label="Lump sum" type="number" min={0} step="any" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} placeholder="Amount (BDT)" />
            )}
            <span className="self-center text-right text-sm font-medium text-ink">{amount > 0 ? formatBdt(amount) : '—'}</span>
            <span className={cn('self-center text-right text-xs', s > amount && amount > 0 ? 'font-medium text-red-600' : 'text-ink-muted')}>
              {spent ? (s > 0 ? formatBdt(s) : '—') : ''}
            </span>
            <Button variant="ghost" aria-label="Remove line" onClick={() => onChange(lines.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => onChange([...lines, blank()])}>
          <Plus className="size-4" /> Other item
        </Button>
        <p className="text-sm text-ink-muted">
          {lines.length} line{lines.length === 1 ? '' : 's'} · Budget <span className="text-base font-semibold text-ink">{formatBdt(total)}</span>
        </p>
      </div>
    </div>
  );
}
