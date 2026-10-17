'use client';

import { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MoneyInput, TextInput } from '@/components/ui/Field';
import {
  ACQUISITION_COST_HEAD_LABEL,
} from '@/lib/db/types';
import {
  OTHER_COST_SUGGESTIONS,
  costHeadForLabel,
  otherCostRowProblem,
  type OtherCostRow,
} from '@/lib/domain/land';

/**
 * Costs already paid on an owned land, beyond the price and registration
 * (LAND-OWNED-FLOW-PLAN.md): one row per cost, what it was for in the user's
 * own words plus the amount. Each row says which cost-sheet line it lands on,
 * so "namjari" visibly goes to Mutation and "boundary wall" to Other.
 */
export function OtherCostsEditor({
  rows,
  onChange,
  showErrors,
}: {
  rows: OtherCostRow[];
  onChange: (rows: OtherCostRow[]) => void;
  showErrors?: boolean;
}) {
  const listId = useId();
  const update = (i: number, patch: Partial<OtherCostRow>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      <datalist id={listId}>
        {OTHER_COST_SUGGESTIONS.map((s) => (
          <option key={s.label} value={s.label} />
        ))}
      </datalist>
      {rows.map((row, i) => {
        const problem = showErrors ? otherCostRowProblem(row) : null;
        return (
          <div key={i}>
            <div className="grid grid-cols-[1fr_minmax(0,11rem)_auto] items-start gap-2">
              <TextInput
                list={listId}
                value={row.label}
                placeholder="What was it for — e.g. Namjari, boundary wall"
                onChange={(e) => update(i, { label: e.target.value })}
                invalid={Boolean(problem && !row.label.trim())}
              />
              <MoneyInput
                value={row.amount}
                placeholder="Amount"
                onChange={(e) => update(i, { amount: e.target.value })}
                invalid={Boolean(problem && row.label.trim())}
              />
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                title="Remove this cost"
                onClick={() => onChange(rows.filter((_, k) => k !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {problem ? (
              <p className="mt-1 text-xs text-red-600">{problem}</p>
            ) : (
              row.label.trim() && (
                <p className="mt-1 text-xs text-ink-muted">
                  Goes on the cost sheet under {ACQUISITION_COST_HEAD_LABEL[costHeadForLabel(row.label)]}
                </p>
              )
            )}
          </div>
        );
      })}
      <Button variant="outline" size="sm" onClick={() => onChange([...rows, { label: '', amount: '' }])}>
        <Plus className="size-4" /> Add other cost
      </Button>
    </div>
  );
}
