'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Paperclip, Receipt, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  CONSTRUCTION_COST_TYPES,
  DIRECT_PURCHASE_DOCUMENT_TYPES,
  type ConstructionCostType,
} from '@/lib/db/types';
import { COST_TYPE_META } from '@/lib/domain/construction-cost';
import { money } from '@/lib/domain/procurement';
import {
  directPurchaseRepository,
  lookupRepository,
  towerRepository,
  towerWorkItemRepository,
  workItemBudgetRepository,
} from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';

const DOC_LABEL: Record<(typeof DIRECT_PURCHASE_DOCUMENT_TYPES)[number], string> = {
  bill: 'Bill / invoice',
  challan: 'Challan',
  muster_roll: 'Muster roll',
  photo: 'Photo',
  other: 'Other',
};

/**
 * Record a cost bought straight against a work item (DIRECT-PURCHASE-PLAN.md
 * B3): machinery rent, labour, material, transport… This is the actual cost.
 * It cannot be saved without the paper — a bill, challan, muster roll or a
 * photo of it.
 */
export function DirectPurchaseModal({
  projectId,
  defaults,
  onClose,
}: {
  projectId: string;
  defaults?: { tower_id?: string; work_item_id?: string };
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const [towerId, setTowerId] = useState(defaults?.tower_id ?? '');
  const [workItemId, setWorkItemId] = useState(defaults?.work_item_id ?? '');
  const [lineId, setLineId] = useState('');
  const [costType, setCostType] = useState<ConstructionCostType | ''>('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [lump, setLump] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [rate, setRate] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [isAsset, setIsAsset] = useState(false);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<{ file: File; document_type: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const towers = useLiveQuery(() => towerRepository.listForProject(projectId), [projectId]);
  const towerValue = towerId || (towers?.length === 1 ? towers[0].id : '');
  const items = useLiveQuery(
    () => (towerValue ? towerWorkItemRepository.listForTower(towerValue) : Promise.resolve([])),
    [towerValue],
  );
  const lines = useLiveQuery(
    () => (workItemId ? workItemBudgetRepository.listForWorkItem(workItemId) : Promise.resolve([])),
    [workItemId],
  );
  const units = useLiveQuery(() => lookupRepository.options('material_unit', null), []);

  const line = lines?.find((l) => l.id === lineId);
  const type: ConstructionCostType = costType || line?.cost_type || 'material';
  const total = lump ? Number(amount) || 0 : money((Number(quantity) || 0) * (Number(rate) || 0));

  async function save() {
    setError('');
    if (!workItemId) return setError('Pick the work item this cost is for.');
    if (files.length === 0) return setError('Attach the bill, challan, muster roll or a photo.');
    setBusy(true);
    try {
      await directPurchaseRepository.record(
        {
          work_item_id: workItemId,
          budget_line_id: lineId || null,
          cost_type: type,
          description: description || line?.description || '',
          vendor_name: vendor,
          supplier_id: null,
          quantity: lump ? null : quantity.trim() ? Number(quantity) : null,
          unit: lump ? null : unit || null,
          rate: lump ? null : rate.trim() ? Number(rate) : null,
          amount: lump ? Number(amount) || 0 : null,
          purchase_date: date,
          is_asset: isAsset,
          notes: notes.trim() || null,
        },
        files,
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The cost could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      icon={Receipt}
      title="Add cost"
      subtitle="Bought or paid for this work — it counts as actual cost now; pay it later from Payments."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : `Save cost${total > 0 ? ` · ${formatBdt(total)}` : ''}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tower" required>
          <SelectInput
            value={towerValue}
            onChange={(e) => {
              setTowerId(e.target.value);
              setWorkItemId('');
              setLineId('');
            }}
          >
            <option value="">Select…</option>
            {(towers ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Work item" required>
          <SelectInput
            value={workItemId}
            disabled={!towerValue}
            onChange={(e) => {
              setWorkItemId(e.target.value);
              setLineId('');
            }}
          >
            <option value="">Select…</option>
            {(items ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.sequence_no}. {w.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          label="Budget line"
          hint={lines && lines.length === 0 && workItemId ? 'This work item has no budget yet' : 'Optional — which planned line this spends'}
        >
          <SelectInput
            value={lineId}
            disabled={!workItemId || !lines?.length}
            onChange={(e) => {
              setLineId(e.target.value);
              setCostType('');
            }}
          >
            <option value="">Not against a line</option>
            {(lines ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.description} · {formatBdt(l.budgeted_amount)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Cost type" required>
          <SelectInput value={type} onChange={(e) => setCostType(e.target.value as ConstructionCostType)}>
            {CONSTRUCTION_COST_TYPES.map((t) => (
              <option key={t} value={t}>
                {COST_TYPE_META[t].label}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="What was bought / paid for" required className="sm:col-span-2">
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={line?.description ?? 'e.g. Excavator rent, 3 days'}
          />
        </Field>
        <Field label="From (vendor / contractor)" required>
          <TextInput
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Rahman Earthmovers"
          />
        </Field>
        <Field label="Date" required>
          <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <div className="mb-2 inline-flex rounded-lg border border-hairline p-0.5 text-sm">
            {[
              { v: false, l: 'Quantity × rate' },
              { v: true, l: 'Lump sum' },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                onClick={() => setLump(o.v)}
                className={
                  lump === o.v
                    ? 'rounded-md bg-admin-500 px-3 py-1 font-medium text-white'
                    : 'rounded-md px-3 py-1 text-ink-muted hover:text-ink'
                }
              >
                {o.l}
              </button>
            ))}
          </div>
          {lump ? (
            <Field label="Amount (BDT)" required>
              <TextInput type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Quantity" required>
                <TextInput type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
              <Field label="Unit">
                <TextInput
                  list="dp-units"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="bag, day, cft…"
                />
                <datalist id="dp-units">
                  {['day', 'trip', 'person-day', ...(units ?? []).map((u) => u.value)].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </Field>
              <Field label="Rate (BDT)" required>
                <TextInput type="number" min={0} step="any" value={rate} onChange={(e) => setRate(e.target.value)} />
              </Field>
            </div>
          )}
          <p className="mt-2 text-sm text-ink-muted">
            Cost: <span className="font-semibold text-ink">{formatBdt(total)}</span>
            {line && total > 0 && (
              <span className="ml-2 text-xs">
                (line budget {formatBdt(line.budgeted_amount)})
              </span>
            )}
          </p>
        </div>

        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-ink">
            Attachments <span className="text-red-500">*</span>
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-admin-50">
            <Paperclip className="size-4" /> Attach bill, challan or photo
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []).map((file) => ({
                  file,
                  document_type: file.type.startsWith('image/') ? 'photo' : 'bill',
                }));
                setFiles((f) => [...f, ...picked]);
                e.target.value = '';
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((f, i) => (
                <li key={`${f.file.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate text-ink">{f.file.name}</span>
                  <select
                    aria-label="Attachment type"
                    className="rounded border border-hairline bg-white px-1 py-0.5"
                    value={f.document_type}
                    onChange={(e) =>
                      setFiles((all) => all.map((x, j) => (j === i ? { ...x, document_type: e.target.value } : x)))
                    }
                  >
                    {DIRECT_PURCHASE_DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DOC_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(type === 'machinery_rent' || type === 'material') && (
          <label className="flex items-start gap-2 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-admin-600"
              checked={isAsset}
              onChange={(e) => setIsAsset(e.target.checked)}
            />
            <span className="text-sm text-ink">
              Bought to keep (a machine, tools) — a company asset
              <span className="block text-xs text-ink-muted">
                Listed as an asset as well; still counted against this work item for now.
              </span>
            </span>
          </label>
        )}

        <Field label="Notes" className="sm:col-span-2">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
