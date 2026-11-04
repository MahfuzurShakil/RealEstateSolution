'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, FileCog, Plus, Trash2 } from 'lucide-react';
import { ErrorNote, useAction } from '@/components/admin/share-sale/ShareSaleModals';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  COMMISSION_BASES,
  COMMISSION_PLAN_STATUSES,
  COMMISSION_TRIGGERS,
  type CommissionAppliesTo,
  type CommissionBasis,
  type CommissionCancelRule,
  type CommissionPlan,
  type CommissionPlanStatus,
  type CommissionTrigger,
} from '@/lib/db/types';
import { COMMISSION_BASIS_LABEL, COMMISSION_PLAN_STATUS_META, COMMISSION_TRIGGER_LABEL } from '@/lib/domain/commission';
import { commissionPlanRepository, orgMemberRepository, projectRepository, shareOfferingRepository } from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';

interface StageRow {
  key: string;
  label: string;
  trigger: CommissionTrigger;
  threshold_pct: string;
  release_type: 'pct' | 'fixed';
  release_value: string;
}

interface OverrideRow {
  designation_id: string;
  basis: CommissionBasis;
  value: string;
}

/** The client's example (plan §7.1): agreement + down payment 20%, half paid 30%, fully paid 50%. */
const DEFAULT_STAGES: StageRow[] = [
  { key: '', label: 'Agreement + down payment', trigger: 'agreement_down_payment', threshold_pct: '', release_type: 'pct', release_value: '20' },
  { key: '', label: '50% paid', trigger: 'paid_pct', threshold_pct: '50', release_type: 'pct', release_value: '30' },
  { key: '', label: 'Fully paid', trigger: 'fully_paid', threshold_pct: '', release_type: 'pct', release_value: '50' },
];

const valueHint = (b: CommissionBasis) => (b === 'pct' ? '%' : b === 'per_share' ? 'Tk / share' : 'Tk / sale');

/** Create or edit a commission plan: who earns what, and the stages that release it. */
export function PlanFormModal({ plan, used, onClose }: { plan?: CommissionPlan; used?: number; onClose: () => void }) {
  const { userId } = useMockSession();
  const projects = useLiveQuery(() => projectRepository.getAll(), []);
  const offerings = useLiveQuery(() => shareOfferingRepository.getAll(), []);
  const designations = useLiveQuery(() => orgMemberRepository.designations(), []);
  const [f, setF] = useState({
    name: plan?.name ?? '',
    applies_to: plan?.applies_to ?? ('share_sale' as CommissionAppliesTo),
    project_id: plan?.project_id ?? '',
    offering_id: plan?.offering_id ?? '',
    seller_basis: plan?.seller_basis ?? ('pct' as CommissionBasis),
    seller_value: plan ? String(plan.seller_value) : '10',
    cancel_rule: plan?.cancel_rule ?? ('recover' as CommissionCancelRule),
    effective_from: plan?.effective_from ?? todayLocal(),
    effective_to: plan?.effective_to ?? '',
    status: plan?.status ?? ('active' as CommissionPlanStatus),
    notes: plan?.notes ?? '',
  });
  const [stages, setStages] = useState<StageRow[]>(
    plan
      ? plan.stages.map((s) => ({ ...s, threshold_pct: s.threshold_pct != null ? String(s.threshold_pct) : '', release_value: String(s.release_value) }))
      : DEFAULT_STAGES,
  );
  const [overrides, setOverrides] = useState<OverrideRow[]>(plan ? plan.overrides.map((o) => ({ ...o, value: String(o.value) })) : []);
  const { error, busy, run } = useAction();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const locked = (used ?? 0) > 0;
  const setStage = (i: number, patch: Partial<StageRow>) => setStages((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const moveStage = (i: number, by: -1 | 1) =>
    setStages((ss) => {
      const next = [...ss];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const pctSum = stages.every((s) => s.release_type === 'pct') ? stages.reduce((t, s) => t + (Number(s.release_value) || 0), 0) : null;
  const shareOfferings = (offerings ?? []).filter((o) => !f.project_id || o.project_id === f.project_id);

  const save = () =>
    run(
      () =>
        commissionPlanRepository.save(
          {
            id: plan?.id,
            ...f,
            seller_value: Number(f.seller_value),
            project_id: f.project_id || null,
            offering_id: f.offering_id || null,
            effective_to: f.effective_to || null,
            stages: stages.map((s) => ({ ...s, threshold_pct: s.threshold_pct === '' ? null : Number(s.threshold_pct), release_value: Number(s.release_value) })),
            overrides: overrides.filter((o) => o.designation_id).map((o) => ({ ...o, value: Number(o.value) })),
          },
          userId,
        ),
      onClose,
    );

  return (
    <Modal
      open
      size="lg"
      title={plan ? `Edit ${plan.code}` : 'New commission plan'}
      subtitle={locked ? `Used on ${used} sale${used === 1 ? '' : 's'} — rates and stages are fixed; name, dates and status can change.` : 'What the seller and their uplines earn, and when it is released.'}
      icon={FileCog}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Name" required className="md:col-span-2">
            <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Share sales — standard" />
          </Field>
          <Field label="Status">
            <SelectInput value={f.status} onChange={(e) => set('status', e.target.value as CommissionPlanStatus)}>
              {COMMISSION_PLAN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMMISSION_PLAN_STATUS_META[s].label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Applies to" required>
            <SelectInput value={f.applies_to} disabled={locked} onChange={(e) => set('applies_to', e.target.value as CommissionAppliesTo)}>
              <option value="share_sale">Share sales</option>
              <option value="booking">Unit / plot bookings</option>
            </SelectInput>
          </Field>
          <Field label="Project" hint="Empty = every project (the default plan).">
            <SelectInput value={f.project_id} disabled={locked} onChange={(e) => setF((x) => ({ ...x, project_id: e.target.value, offering_id: '' }))}>
              <option value="">All projects</option>
              {(projects ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </SelectInput>
          </Field>
          {f.applies_to === 'share_sale' && (
            <Field label="Share offering" hint="Only this round, if set.">
              <SelectInput value={f.offering_id} disabled={locked} onChange={(e) => set('offering_id', e.target.value)}>
                <option value="">Every offering</option>
                {shareOfferings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · Round {o.round_no}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}
          <Field label="Effective from" required>
            <TextInput type="date" value={f.effective_from} onChange={(e) => set('effective_from', e.target.value)} />
          </Field>
          <Field label="Effective to" hint="Empty = open-ended.">
            <TextInput type="date" value={f.effective_to} min={f.effective_from} onChange={(e) => set('effective_to', e.target.value)} />
          </Field>
          <Field label="If the sale is cancelled" hint="Unpaid commission is always void.">
            <SelectInput value={f.cancel_rule} disabled={locked} onChange={(e) => set('cancel_rule', e.target.value as CommissionCancelRule)}>
              <option value="recover">Recover paid commission from future commission</option>
              <option value="write_off">Write off what was already paid</option>
            </SelectInput>
          </Field>
        </div>

        <section className="rounded-xl border border-hairline bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">The seller earns</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Basis">
              <SelectInput value={f.seller_basis} disabled={locked} onChange={(e) => set('seller_basis', e.target.value as CommissionBasis)}>
                {COMMISSION_BASES.filter((b) => f.applies_to === 'share_sale' || b !== 'per_share').map((b) => (
                  <option key={b} value={b}>
                    {COMMISSION_BASIS_LABEL[b]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label={`Amount (${valueHint(f.seller_basis)})`} required>
              <TextInput type="number" min="0" step="any" disabled={locked} value={f.seller_value} onChange={(e) => set('seller_value', e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-hairline bg-white p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Released in stages</h3>
            <p className={`text-xs ${pctSum !== null && Math.abs(pctSum - 100) > 0.001 ? 'text-red-600' : 'text-ink-muted'}`}>
              {pctSum !== null ? `${Math.round(pctSum * 100) / 100}% of 100%` : 'The last stage releases whatever is left.'}
            </p>
          </div>
          <div className="space-y-3">
            {stages.map((s, i) => (
              <div key={i} className="grid gap-3 rounded-lg border border-hairline p-3 sm:grid-cols-[1fr_1fr_6rem_7rem_6rem_auto] sm:items-end">
                <Field label={`Stage ${i + 1}`}>
                  <TextInput value={s.label} onChange={(e) => setStage(i, { label: e.target.value })} />
                </Field>
                <Field label="When">
                  <SelectInput value={s.trigger} disabled={locked} onChange={(e) => setStage(i, { trigger: e.target.value as CommissionTrigger })}>
                    {COMMISSION_TRIGGERS.map((t) => (
                      <option key={t} value={t}>
                        {COMMISSION_TRIGGER_LABEL[t]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Paid %">
                  <TextInput type="number" min="1" max="100" disabled={locked || s.trigger !== 'paid_pct'} value={s.trigger === 'paid_pct' ? s.threshold_pct : ''} onChange={(e) => setStage(i, { threshold_pct: e.target.value })} placeholder={s.trigger === 'paid_pct' ? '50' : '—'} />
                </Field>
                <Field label="Release">
                  <SelectInput value={s.release_type} disabled={locked} onChange={(e) => setStage(i, { release_type: e.target.value as 'pct' | 'fixed' })}>
                    <option value="pct">% of total</option>
                    <option value="fixed">Fixed taka</option>
                  </SelectInput>
                </Field>
                <Field label={s.release_type === 'pct' ? '%' : f.seller_basis === 'per_share' ? 'Tk / share' : 'Tk'}>
                  <TextInput type="number" min="0" step="any" disabled={locked} value={s.release_value} onChange={(e) => setStage(i, { release_value: e.target.value })} />
                </Field>
                {!locked && (
                  <div className="flex gap-1 pb-0.5">
                    <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => moveStage(i, -1)} aria-label="Move stage up">
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" disabled={i === stages.length - 1} onClick={() => moveStage(i, 1)} aria-label="Move stage down">
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button variant="dangerGhost" size="sm" disabled={stages.length === 1} onClick={() => setStages((ss) => ss.filter((_, j) => j !== i))} aria-label="Remove stage">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!locked && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setStages((ss) => [...ss, { key: '', label: '', trigger: 'paid_pct', threshold_pct: '75', release_type: 'pct', release_value: '0' }])}>
              <Plus className="size-4" /> Add stage
            </Button>
          )}
        </section>

        <section className="rounded-xl border border-hairline bg-white p-4">
          <h3 className="text-sm font-semibold text-ink">Uplines also earn (overrides)</h3>
          <p className="mb-3 text-xs text-ink-muted">Anyone above the seller with one of these designations on the sale date, released by the same stages.</p>
          <div className="space-y-3">
            {overrides.map((o, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
                <Field label="Designation">
                  <SelectInput value={o.designation_id} disabled={locked} onChange={(e) => setOverrides((os) => os.map((x, j) => (j === i ? { ...x, designation_id: e.target.value } : x)))}>
                    <option value="">Pick one</option>
                    {(designations ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.value}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Basis">
                  <SelectInput value={o.basis} disabled={locked} onChange={(e) => setOverrides((os) => os.map((x, j) => (j === i ? { ...x, basis: e.target.value as CommissionBasis } : x)))}>
                    {COMMISSION_BASES.filter((b) => f.applies_to === 'share_sale' || b !== 'per_share').map((b) => (
                      <option key={b} value={b}>
                        {COMMISSION_BASIS_LABEL[b]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label={valueHint(o.basis)}>
                  <TextInput type="number" min="0" step="any" disabled={locked} value={o.value} onChange={(e) => setOverrides((os) => os.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                </Field>
                {!locked && (
                  <Button variant="dangerGhost" size="sm" onClick={() => setOverrides((os) => os.filter((_, j) => j !== i))} aria-label="Remove override">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!locked && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setOverrides((os) => [...os, { designation_id: '', basis: 'pct', value: '1' }])}>
              <Plus className="size-4" /> Add override
            </Button>
          )}
        </section>

        <Field label="Notes">
          <TextArea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}
