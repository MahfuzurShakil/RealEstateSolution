'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowRight, Layers, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Tower } from '@/lib/db/types';
import { towerFloors, towerSize, workTypeDef } from '@/lib/domain/construction-cost';
import { money } from '@/lib/domain/procurement';
import { createWorkItemWithBudget, lookupRepository, towerWorkItemRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';
import { BudgetLinesEditor, editorLineAmount, toBudgetInput, type EditorLine } from './BudgetLinesEditor';

/**
 * Add work (client, 2026-10-20/21) in two steps:
 *   1. the kind of work, in the order a BD building goes up, then its name,
 *      planned window and weight — and, for floor-wise work (Floor Structure,
 *      Brick Work, Plaster…), the floors it covers: one work item per floor;
 *   2. its budget, typed by the user. The kind's usual items are offered as
 *      chips with their units; nothing is filled in.
 */
export function AddWorkItemModal({
  tower,
  remainingWeight,
  onClose,
}: {
  tower: Tower;
  remainingWeight: number;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const types = useLiveQuery(() => lookupRepository.options('work_item_type', null), []);
  const existing = useLiveQuery(() => towerWorkItemRepository.listForTower(tower.id), [tower.id]);

  const [step, setStep] = useState<1 | 2>(1);
  const [workType, setWorkType] = useState('');
  const [name, setName] = useState('');
  const [floors, setFloors] = useState<Set<number>>(new Set());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [weight, setWeight] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const def = workTypeDef(workType);
  const floorWise = Boolean(workType) && def.scope === 'floor';
  const allFloors = towerFloors(tower);
  const size = towerSize(tower);
  // a floor already carrying this kind of work is shown, but not offered twice
  const taken = new Set(
    (existing ?? []).filter((i) => i.work_type === workType && i.floor_no != null).map((i) => i.floor_no as number),
  );
  const chosen = allFloors.filter((f) => floors.has(f.no));
  const perItem = money(lines.reduce((s, l) => s + editorLineAmount(l), 0));
  const count = floorWise ? Math.max(1, chosen.length) : 1;

  function pickType(value: string) {
    if (!name.trim() || name === workType) setName(value);
    if (value !== workType) {
      setLines([]);
      setFloors(new Set());
    }
    setWorkType(value);
  }

  function next() {
    setError('');
    if (!workType) return setError('Pick what kind of work this is.');
    if (floorWise && chosen.length === 0) return setError('Tick the floors this work covers.');
    const w = Number(weight);
    if (weight.trim() === '' || !(w >= 0) || w > remainingWeight + 0.005) {
      return setError(`Enter a weight between 0 and ${Math.round(remainingWeight * 100) / 100}% (what is left of ${tower.name}).`);
    }
    if (start && end && end < start) return setError('The planned end cannot be before the start.');
    setStep(2);
  }

  async function save() {
    setError('');
    if (lines.some((l) => !l.description.trim())) return setError('Every budget line needs an item name.');
    setBusy(true);
    try {
      await createWorkItemWithBudget(
        {
          tower_id: tower.id,
          name: name.trim() || workType,
          work_type: workType,
          weight_pct: Number(weight) || 0,
          planned_start_date: start || null,
          planned_end_date: end || null,
          floors: floorWise ? chosen : undefined,
        },
        lines.map(toBudgetInput),
        userId,
      );
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
      // one width for both steps, so the popup does not jump between them
      size="lg"
      icon={ListChecks}
      title={step === 1 ? `Add work · ${tower.name}` : `Budget · ${name.trim() || workType}`}
      subtitle={
        step === 1
          ? 'Step 1 of 2 — what work, where and when'
          : floorWise
            ? `Step 2 of 2 — budget for one floor; ${count === 1 ? 'the floor gets' : `each of the ${count} floors gets`} these lines`
            : 'Step 2 of 2 — what it should cost'
      }
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
              {busy
                ? 'Saving…'
                : floorWise
                  ? `Add ${count} work item${count === 1 ? '' : 's'} · ${formatBdt(perItem * count)}`
                  : `Add work item${perItem > 0 ? ` · ${formatBdt(perItem)}` : ''}`}
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2 text-xs text-ink-muted">
            {tower.name}: {size ? (
              <>
                {size.basements > 0 && `${size.basements} basement + `}ground + {size.floors - 1} floors ·{' '}
                {size.floor_area.toLocaleString('en-IN')} sqft a floor · built-up {size.built_up.toLocaleString('en-IN')} sqft
              </>
            ) : (
              <>
                {tower.floor_count} floors. Add the floor area and basements on the project&apos;s Towers tab to plan quantities faster.
              </>
            )}
          </p>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">
              Kind of work <span className="text-red-500">*</span>
              <span className="ml-2 text-xs font-normal text-ink-muted">in the order a building goes up</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(types ?? []).map((t) => {
                const d = workTypeDef(t.value);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickType(t.value)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left transition-colors',
                      workType === t.value ? 'border-admin-400 bg-admin-50' : 'border-hairline hover:bg-slate-50',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {t.value}
                      {d.scope === 'floor' && <Layers className="size-3.5 text-admin-600" aria-label="floor by floor" />}
                    </span>
                    {d.covers && <span className="block text-[11px] leading-snug text-ink-muted">{d.covers}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Name" required hint={floorWise ? 'Each floor is added as "Name — floor"' : undefined}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={workType || 'Work item name'} />
          </Field>

          {floorWise && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-medium text-ink">
                  Floors <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs font-normal text-ink-muted">one work item per floor</span>
                </p>
                <div className="flex gap-2 text-xs">
                  <button type="button" className="text-admin-700 hover:underline" onClick={() => setFloors(new Set(allFloors.filter((f) => !taken.has(f.no)).map((f) => f.no)))}>
                    All
                  </button>
                  <button type="button" className="text-admin-700 hover:underline" onClick={() => setFloors(new Set())}>
                    None
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allFloors.map((f) => {
                  const on = floors.has(f.no);
                  const done = taken.has(f.no);
                  return (
                    <button
                      key={f.no}
                      type="button"
                      disabled={done}
                      title={done ? `${workType} is already added for this floor` : undefined}
                      onClick={() =>
                        setFloors((prev) => {
                          const n = new Set(prev);
                          if (n.has(f.no)) n.delete(f.no);
                          else n.add(f.no);
                          return n;
                        })
                      }
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                        done
                          ? 'cursor-not-allowed border-dashed border-hairline text-slate-400 line-through'
                          : on
                            ? 'border-admin-400 bg-admin-500 text-white'
                            : 'border-hairline text-ink hover:bg-slate-50',
                      )}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Planned start" hint={floorWise ? 'of the first floor' : undefined}>
              <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Planned end" hint={floorWise ? 'of the last floor; floors share the window in order' : undefined}>
              <TextInput type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <Field
              label={floorWise ? 'Weight % (all floors together)' : 'Weight %'}
              required
              hint={`${Math.round(remainingWeight * 100) / 100}% of ${tower.name} is still unallocated`}
            >
              <TextInput type="number" min={0} max={100} step="any" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </Field>
          </div>
          <p className="rounded-xl border border-hairline bg-slate-50 p-3 text-xs text-ink-muted">
            Weight is this work&apos;s share of the tower, used to work out the tower&apos;s overall progress. Progress itself is
            logged from the site log.
          </p>
        </div>
      ) : (
        <BudgetLinesEditor
          lines={lines}
          onChange={setLines}
          suggestions={def.suggestions}
          size={size ? { floor_area: size.floor_area, built_up: size.built_up, per_floor: floorWise } : null}
        />
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
