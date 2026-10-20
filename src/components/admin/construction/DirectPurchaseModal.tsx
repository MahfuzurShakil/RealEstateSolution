'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Boxes,
  Briefcase,
  Cable,
  Landmark,
  Construction,
  HardHat,
  Paperclip,
  Receipt,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  CONSTRUCTION_COST_TYPES,
  DIRECT_PURCHASE_DOCUMENT_TYPES,
  type ConstructionCostType,
  type ProjectStatus,
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
import { cn } from '@/lib/utils/cn';
import { formatBdt, todayLocal } from '@/lib/utils/format';

const DOC_LABEL: Record<(typeof DIRECT_PURCHASE_DOCUMENT_TYPES)[number], string> = {
  bill: 'Bill / invoice',
  challan: 'Challan',
  muster_roll: 'Muster roll',
  photo: 'Photo',
  other: 'Other',
};

/** How each kind of cost is asked for (client, 2026-10-20). */
const TYPE_UI: Record<
  ConstructionCostType,
  { icon: typeof Boxes; hint: string; paper: string; doc: (typeof DIRECT_PURCHASE_DOCUMENT_TYPES)[number] }
> = {
  material: { icon: Boxes, hint: 'Rod, cement, sand, brick… quantity × rate', paper: 'challan or cash memo', doc: 'challan' },
  labour: { icon: Users, hint: 'Workers × days × daily wage', paper: 'muster roll', doc: 'muster_roll' },
  machinery_rent: { icon: Construction, hint: 'Excavator, mixer, hoist… per day or hour', paper: 'rent bill', doc: 'bill' },
  transport: { icon: Truck, hint: 'Trips × rate per trip', paper: 'trip slip or bill', doc: 'bill' },
  subcontract: { icon: HardHat, hint: 'Piling, waterproofing… measured or a fixed amount', paper: "contractor's bill", doc: 'bill' },
  utility: { icon: Cable, hint: 'Site electricity, water, gas bill', paper: 'utility bill', doc: 'bill' },
  professional_fee: { icon: Briefcase, hint: 'Architect, engineer, soil test, survey, consultant', paper: 'bill or money receipt', doc: 'bill' },
  govt_fee: { icon: Landmark, hint: 'RAJUK, clearance, utility connection fees', paper: 'fee receipt or pay order', doc: 'bill' },
  other: { icon: Wrench, hint: 'Anything else', paper: 'receipt', doc: 'bill' },
};

/** before construction only fees, outside services and sundries apply */
const STAGE_TYPES: ConstructionCostType[] = ['professional_fee', 'govt_fee', 'subcontract', 'other'];
const SERVICES = ['Architectural design', 'Structural design', 'MEP design', 'Soil test', 'Survey', 'Supervision', 'Legal', 'Other'];
const AUTHORITIES = ['RAJUK', 'Land use clearance (DAP)', 'Fire service', 'Department of Environment', 'DESCO / DPDC', 'WASA', 'Titas Gas', 'City Corporation', 'Other'];

const LABOUR_KINDS = ['Mason', 'Helper', 'Rod binder', 'Shuttering carpenter', 'Electrician', 'Plumber', 'Painter', 'Tiles mistri', 'Other'];
const MACHINES = ['Excavator', 'Piling rig', 'Concrete mixer', 'Vibrator', 'Hoist / lift', 'Crane', 'Generator', 'Water pump', 'Other'];
const RENT_BASIS = ['day', 'hour', 'trip', 'month'];
const UTILITIES = ['Electricity', 'Water', 'Gas', 'Other'];

/**
 * Add a cost against a work item (DIRECT-PURCHASE-PLAN.md B3, reshaped by
 * the client on 2026-10-20): first say what kind of cost it is, then answer
 * that kind's questions — labour is counted in workers and days, machinery in
 * days or hours, transport in trips. The answers are kept on the cost
 * (`details`), the amount is worked out from them, and the paper is required.
 */
export function DirectPurchaseModal({
  projectId,
  defaults,
  stage,
  onClose,
}: {
  projectId: string;
  defaults?: { tower_id?: string; work_item_id?: string; cost_type?: ConstructionCostType };
  /**
   * A stage cost (client, 2026-10-21): planning, design or approval cost
   * money before there is a tower or work item to put it against.
   */
  stage?: { value: ProjectStatus; label: string };
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const [type, setType] = useState<ConstructionCostType | null>(defaults?.cost_type ?? null);
  const [towerId, setTowerId] = useState(defaults?.tower_id ?? '');
  const [workItemId, setWorkItemId] = useState(defaults?.work_item_id ?? '');
  const [lineId, setLineId] = useState('');
  const [f, setF] = useState<Record<string, string>>({
    basis: 'day',
    utility: 'Electricity',
    labour_kind: 'Mason',
    machine: 'Excavator',
    service: 'Architectural design',
    authority: 'RAJUK',
  });
  const [lump, setLump] = useState(false);
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
  const fixedItem = Boolean(defaults?.work_item_id);
  const item = items?.find((i) => i.id === workItemId);

  const set = (key: string, value: string) => setF((all) => ({ ...all, [key]: value }));
  const num = (key: string) => Number(f[key]) || 0;
  const typeLines = (lines ?? []).filter((l) => l.cost_type === type);
  const offeredLines = typeLines.length > 0 ? typeLines : (lines ?? []);
  const line = lines?.find((l) => l.id === lineId);

  /** quantity, unit, rate and the amount, as this type counts them */
  function worked(): { quantity: number | null; unit: string | null; rate: number | null; amount: number } {
    switch (type) {
      case 'labour': {
        const q = num('workers') * num('days');
        return { quantity: q, unit: 'person-day', rate: num('wage'), amount: money(q * num('wage')) };
      }
      case 'machinery_rent':
        return { quantity: num('qty'), unit: f.basis, rate: num('rate'), amount: money(num('qty') * num('rate')) };
      case 'transport':
        return { quantity: num('trips'), unit: 'trip', rate: num('rate'), amount: money(num('trips') * num('rate')) };
      case 'material':
        return lump
          ? { quantity: null, unit: null, rate: null, amount: num('amount') }
          : { quantity: num('qty'), unit: f.unit || null, rate: num('rate'), amount: money(num('qty') * num('rate')) };
      case 'subcontract':
        return lump
          ? { quantity: null, unit: null, rate: null, amount: num('amount') }
          : { quantity: num('qty'), unit: f.unit || null, rate: num('rate'), amount: money(num('qty') * num('rate')) };
      default:
        return { quantity: null, unit: null, rate: null, amount: num('amount') };
    }
  }
  const w = worked();

  function describe(): string {
    switch (type) {
      case 'labour':
        return `${f.labour_kind} labour — ${num('workers')} workers × ${num('days')} days`;
      case 'machinery_rent':
        return `${f.machine === 'Other' ? f.machine_other || 'Machine' : f.machine} rent — ${num('qty')} ${f.basis}${num('qty') === 1 ? '' : 's'}`;
      case 'transport':
        return `Transport — ${f.load || 'load'}${f.route ? ` (${f.route})` : ''}`;
      case 'utility':
        return `${f.utility} bill${f.bill_month ? ` — ${f.bill_month}` : ''}`;
      case 'professional_fee':
        return `${f.service === 'Other' ? f.description || 'Professional service' : f.service}${f.description && f.service !== 'Other' ? ` — ${f.description}` : ''}`;
      case 'govt_fee':
        return `${f.fee_for || 'Fee'} — ${f.authority === 'Other' ? f.vendor || 'authority' : f.authority}`;
      default:
        return f.description || line?.description || '';
    }
  }

  function detailsFor(): Record<string, string | number | boolean | null> {
    const pick = (keys: string[]) => Object.fromEntries(keys.filter((k) => f[k]?.trim()).map((k) => [k, f[k].trim()]));
    switch (type) {
      case 'labour':
        return { ...pick(['labour_kind', 'period_from', 'period_to']), workers: num('workers'), days: num('days'), daily_wage: num('wage') };
      case 'machinery_rent':
        return { ...pick(['machine', 'machine_other', 'basis']), operator_fuel_included: f.operator_fuel === '1' };
      case 'transport':
        return pick(['load', 'route', 'vehicle_no']);
      case 'material':
        return pick(['challan_no']);
      case 'subcontract':
        return pick(['bill_no']);
      case 'utility':
        return pick(['utility', 'bill_month', 'meter_no']);
      case 'professional_fee':
        return pick(['service', 'bill_no']);
      case 'govt_fee':
        return pick(['authority', 'fee_for', 'receipt_no']);
      default:
        return {};
    }
  }

  async function save() {
    setError('');
    if (!type) return setError('Pick the kind of cost.');
    if (!stage && !workItemId) return setError('Pick the work item this cost is for.');
    if (!(w.amount > 0)) return setError('The amount works out to 0 — fill in the figures.');
    if (files.length === 0) return setError(`Attach the ${TYPE_UI[type].paper} — a cost needs its paper.`);
    setBusy(true);
    try {
      await directPurchaseRepository.record(
        {
          project_id: projectId,
          stage: stage?.value ?? null,
          work_item_id: stage ? null : workItemId,
          budget_line_id: stage ? null : lineId || null,
          cost_type: type,
          description: describe(),
          vendor_name:
            f.vendor ||
            (type === 'labour' ? 'Site labour' : type === 'govt_fee' && f.authority !== 'Other' ? f.authority : ''),
          supplier_id: null,
          quantity: w.quantity,
          unit: w.unit,
          rate: w.rate,
          amount: w.rate === null ? w.amount : null,
          purchase_date: date,
          is_asset: isAsset,
          details: detailsFor(),
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

  const input = (key: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <TextInput value={f[key] ?? ''} onChange={(e) => set(key, e.target.value)} {...props} />
  );
  const choice = (key: string, options: string[]) => (
    <SelectInput value={f[key] ?? ''} onChange={(e) => set(key, e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </SelectInput>
  );
  const LumpToggle = (
    <div className="inline-flex rounded-lg border border-hairline p-0.5 text-sm">
      {[
        { v: false, l: 'Quantity × rate' },
        { v: true, l: 'Fixed amount' },
      ].map((o) => (
        <button
          key={o.l}
          type="button"
          onClick={() => setLump(o.v)}
          className={lump === o.v ? 'rounded-md bg-admin-500 px-3 py-1 font-medium text-white' : 'rounded-md px-3 py-1 text-ink-muted hover:text-ink'}
        >
          {o.l}
        </button>
      ))}
    </div>
  );

  return (
    <Modal
      open
      size="lg"
      icon={Receipt}
      title={type ? `Add cost · ${COST_TYPE_META[type].label}` : stage ? `Add cost · ${stage.label} stage` : 'Add cost'}
      subtitle={
        stage
          ? `${stage.label} stage of the project — pay it later from Payments`
          : item
            ? `${item.name} — counts as actual cost now; pay it later from Payments`
            : 'Counts as actual cost now; pay it later from Payments'
      }
      onClose={onClose}
      footer={
        type ? (
          <>
            {!defaults?.cost_type && (
              <Button variant="ghost" onClick={() => setType(null)} disabled={busy}>
                Change type
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : `Save cost${w.amount > 0 ? ` · ${formatBdt(w.amount)}` : ''}`}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )
      }
    >
      {!type ? (
        <div>
          <p className="mb-3 text-sm text-ink-muted">What kind of cost is it?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(stage ? STAGE_TYPES : CONSTRUCTION_COST_TYPES).map((t) => {
              const Icon = TYPE_UI[t].icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="flex items-start gap-3 rounded-xl border border-hairline p-3 text-left transition-colors hover:border-admin-300 hover:bg-admin-50/50"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-admin-50 text-admin-600">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{COST_TYPE_META[t].label}</span>
                    <span className="block text-xs text-ink-muted">{TYPE_UI[t].hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {!fixedItem && !stage && (
            <>
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
                  {(items ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.sequence_no}. {i.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </>
          )}

          {!stage && (
          <Field
            label="Budget line"
            className="sm:col-span-2"
            hint={workItemId && (lines?.length ?? 0) === 0 ? 'This work item has no budget yet' : 'Which planned line this spends — optional'}
          >
            <SelectInput value={lineId} disabled={!workItemId || offeredLines.length === 0} onChange={(e) => setLineId(e.target.value)}>
              <option value="">Not against a line</option>
              {offeredLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description} · {formatBdt(l.budgeted_amount)}
                </option>
              ))}
            </SelectInput>
          </Field>
          )}

          {/* ------- the questions of this kind of cost ------- */}
          {type === 'professional_fee' && (
            <>
              <Field label="Service">{choice('service', SERVICES)}</Field>
              <Field label="Paid to" required>{input('vendor', { placeholder: 'e.g. Archeground Architects' })}</Field>
              <Field label={f.service === 'Other' ? 'What service' : 'Details'} required={f.service === 'Other'} className="sm:col-span-2">
                {input('description', { placeholder: 'e.g. Working drawings, 2nd instalment' })}
              </Field>
              <Field label="Bill no.">{input('bill_no')}</Field>
              <Field label="Amount (BDT)" required>{input('amount', { type: 'number', min: 0 })}</Field>
            </>
          )}

          {type === 'govt_fee' && (
            <>
              <Field label="Authority">{choice('authority', AUTHORITIES)}</Field>
              {f.authority === 'Other' ? (
                <Field label="Which authority" required>{input('vendor')}</Field>
              ) : (
                <Field label="Fee for" required>{input('fee_for', { placeholder: 'e.g. Building plan approval fee' })}</Field>
              )}
              {f.authority === 'Other' && (
                <Field label="Fee for" required>{input('fee_for')}</Field>
              )}
              <Field label="Receipt / pay order no.">{input('receipt_no')}</Field>
              <Field label="Amount (BDT)" required>{input('amount', { type: 'number', min: 0 })}</Field>
            </>
          )}
          {type === 'labour' && (
            <>
              <Field label="Labour">{choice('labour_kind', LABOUR_KINDS)}</Field>
              <Field label="Paid to (sardar / contractor)">{input('vendor', { placeholder: 'e.g. Abdul Sardar' })}</Field>
              <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                <Field label="Workers" required>{input('workers', { type: 'number', min: 0 })}</Field>
                <Field label="Days" required>{input('days', { type: 'number', min: 0, step: 'any' })}</Field>
                <Field label="Daily wage (BDT)" required>{input('wage', { type: 'number', min: 0 })}</Field>
              </div>
              <Field label="Period from">{input('period_from', { type: 'date' })}</Field>
              <Field label="Period to">{input('period_to', { type: 'date', min: f.period_from })}</Field>
            </>
          )}

          {type === 'machinery_rent' && (
            <>
              <Field label="Machine">{choice('machine', MACHINES)}</Field>
              {f.machine === 'Other' ? (
                <Field label="Which machine" required>{input('machine_other')}</Field>
              ) : (
                <Field label="Owner / rented from" required>{input('vendor', { placeholder: 'e.g. Rahman Earthmovers' })}</Field>
              )}
              {f.machine === 'Other' && (
                <Field label="Owner / rented from" required className="sm:col-span-2">{input('vendor')}</Field>
              )}
              <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                <Field label="Rent per">{choice('basis', RENT_BASIS)}</Field>
                <Field label={`How many ${f.basis}s`} required>{input('qty', { type: 'number', min: 0, step: 'any' })}</Field>
                <Field label={`Rate per ${f.basis} (BDT)`} required>{input('rate', { type: 'number', min: 0 })}</Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                <input type="checkbox" className="size-4 accent-admin-600" checked={f.operator_fuel === '1'} onChange={(e) => set('operator_fuel', e.target.checked ? '1' : '')} />
                Operator and fuel included in the rate
              </label>
            </>
          )}

          {type === 'transport' && (
            <>
              <Field label="What was carried" required>{input('load', { placeholder: 'e.g. Sand, 3 trucks' })}</Field>
              <Field label="Transporter" required>{input('vendor', { placeholder: 'e.g. Haque Transport' })}</Field>
              <Field label="From → to">{input('route', { placeholder: 'e.g. Gabtoli ghat → site' })}</Field>
              <Field label="Vehicle no.">{input('vehicle_no')}</Field>
              <Field label="Trips" required>{input('trips', { type: 'number', min: 0 })}</Field>
              <Field label="Rate per trip (BDT)" required>{input('rate', { type: 'number', min: 0 })}</Field>
            </>
          )}

          {type === 'material' && (
            <>
              <Field label="Material" required>
                {input('description', { placeholder: line?.description ?? 'e.g. Rod 16mm (BSRM)', list: 'dp-lines' })}
                <datalist id="dp-lines">
                  {offeredLines.map((l) => (
                    <option key={l.id} value={l.description} />
                  ))}
                </datalist>
              </Field>
              <Field label="Shop / supplier" required>{input('vendor', { placeholder: 'e.g. Bismillah Traders' })}</Field>
              <div className="sm:col-span-2">{LumpToggle}</div>
              {lump ? (
                <Field label="Amount (BDT)" required>{input('amount', { type: 'number', min: 0 })}</Field>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                  <Field label="Quantity" required>{input('qty', { type: 'number', min: 0, step: 'any' })}</Field>
                  <Field label="Unit">
                    {input('unit', { list: 'dp-units', placeholder: 'bag, ton, cft…' })}
                    <datalist id="dp-units">
                      {(units ?? []).map((u) => (
                        <option key={u.id} value={u.value} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Rate (BDT)" required>{input('rate', { type: 'number', min: 0, step: 'any' })}</Field>
                </div>
              )}
              <Field label="Challan no.">{input('challan_no')}</Field>
            </>
          )}

          {type === 'subcontract' && (
            <>
              <Field label="Contractor" required>{input('vendor', { placeholder: 'e.g. Karim Piling & Construction' })}</Field>
              <Field label="Bill no.">{input('bill_no')}</Field>
              <Field label="Work done" required className="sm:col-span-2">
                {input('description', { placeholder: line?.description ?? 'e.g. Piling, 48 piles × 60 ft' })}
              </Field>
              <div className="sm:col-span-2">{LumpToggle}</div>
              {lump ? (
                <Field label="Bill amount (BDT)" required>{input('amount', { type: 'number', min: 0 })}</Field>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                  <Field label="Measured quantity" required>{input('qty', { type: 'number', min: 0, step: 'any' })}</Field>
                  <Field label="Unit">{input('unit', { placeholder: 'rft, sft, pile…' })}</Field>
                  <Field label="Rate (BDT)" required>{input('rate', { type: 'number', min: 0, step: 'any' })}</Field>
                </div>
              )}
            </>
          )}

          {type === 'utility' && (
            <>
              <Field label="Utility">{choice('utility', UTILITIES)}</Field>
              <Field label="Provider" required>{input('vendor', { placeholder: 'e.g. DESCO, WASA' })}</Field>
              <Field label="Bill month">{input('bill_month', { type: 'month' })}</Field>
              <Field label="Meter / account no.">{input('meter_no')}</Field>
              <Field label="Bill amount (BDT)" required>{input('amount', { type: 'number', min: 0 })}</Field>
            </>
          )}

          {type === 'other' && (
            <>
              <Field label="What for" required className="sm:col-span-2">{input('description', { placeholder: 'e.g. Site safety nets' })}</Field>
              <Field label="Paid to" required>{input('vendor')}</Field>
              <Field label="Amount (BDT)" required>{input('amount', { type: 'number', min: 0 })}</Field>
            </>
          )}

          <Field label="Date" required>
            <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="self-end rounded-xl border border-hairline bg-slate-50 px-3 py-2 text-sm">
            <span className="text-ink-muted">Cost </span>
            <span className="font-semibold text-ink">{formatBdt(w.amount)}</span>
            {w.quantity !== null && w.rate !== null && w.amount > 0 && (
              <span className="block text-xs text-ink-muted">
                {w.quantity} {w.unit} × {formatBdt(w.rate)}
              </span>
            )}
            {line && <span className="block text-xs text-ink-muted">line budget {formatBdt(line.budgeted_amount)}</span>}
          </div>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium text-ink">
              Attach the {TYPE_UI[type].paper} <span className="text-red-500">*</span>
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-admin-50">
              <Paperclip className="size-4" /> Attach file or photo
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []).map((file) => ({ file, document_type: TYPE_UI[type].doc }));
                  setFiles((all) => [...all, ...picked]);
                  e.target.value = '';
                }}
              />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {files.map((x, i) => (
                  <li key={`${x.file.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate text-ink">{x.file.name}</span>
                    <select
                      aria-label="Attachment type"
                      className="rounded border border-hairline bg-white px-1 py-0.5"
                      value={x.document_type}
                      onChange={(e) => setFiles((all) => all.map((y, j) => (j === i ? { ...y, document_type: e.target.value } : y)))}
                    >
                      {DIRECT_PURCHASE_DOCUMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {DOC_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    <button type="button" aria-label={`Remove ${x.file.name}`} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(type === 'machinery_rent' || type === 'material') && (
            <label className={cn('flex items-start gap-2 sm:col-span-2')}>
              <input type="checkbox" className="mt-0.5 size-4 accent-admin-600" checked={isAsset} onChange={(e) => setIsAsset(e.target.checked)} />
              <span className="text-sm text-ink">
                Bought to keep (a machine, tools) — a company asset
                <span className="block text-xs text-ink-muted">Listed as an asset as well; still counted against this work item for now.</span>
              </span>
            </label>
          )}

          <Field label="Notes" className="sm:col-span-2">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
