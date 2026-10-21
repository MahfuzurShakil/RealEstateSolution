'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calculator, Check, Pause, Pencil, Plus, X } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, MoneyInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { FeasibilityRecommendation, Land, LandFeasibility } from '@/lib/db/types';
import { FEASIBILITY_RECOMMENDATIONS } from '@/lib/db/types';
import { LAND_SIZE_UNIT_LABEL } from '@/lib/domain/land';
import { landFeasibilityRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';
import { TimelineItem, TimelineList } from '@/components/admin/lands/TimelineItem';

const RECOMMENDATION_META: Record<
  FeasibilityRecommendation,
  { label: string; tone: BadgeTone; hint: string; icon: typeof Check }
> = {
  proceed: { label: 'Proceed', tone: 'green', hint: 'Worth buying — opens negotiation', icon: Check },
  hold: { label: 'Hold', tone: 'amber', hint: 'Wait for something to change', icon: Pause },
  reject: { label: 'Reject', tone: 'red', hint: 'Not worth buying at this price', icon: X },
};

/** Total cost is always derived from the three heads, never stored. */
function totalCost(f: Pick<LandFeasibility, 'est_acquisition_cost' | 'est_development_cost' | 'est_other_cost'>) {
  return Number(f.est_acquisition_cost) + Number(f.est_development_cost) + Number(f.est_other_cost);
}

/** Cost per katha / decimal / bigha — the number a land team compares plots on. */
function perUnit(land: Land, cost: number): string | null {
  const size = Number(land.land_size);
  if (!(size > 0) || !(cost > 0)) return null;
  return `${formatBdt(Math.round(cost / size))} per ${LAND_SIZE_UNIT_LABEL[land.land_size_unit] ?? 'unit'}`;
}

/**
 * Feasibility studies for one land (BRD SITE-002, SITE-003).
 *
 * 2026-10-21 — no approval step and no expected revenue. A study is made
 * before anyone knows whether the land becomes flats or a plot sale, so it
 * estimates what the land will cost and records the call: Proceed, Hold or
 * Reject. The current (highest) version's call is what opens negotiation.
 *
 * Still versioned: when the numbers move, a new version keeps the old one
 * readable. The current version can be corrected in place.
 */
export function FeasibilityPanel({ land }: { land: Land }) {
  const [editing, setEditing] = useState<LandFeasibility | 'new' | null>(null);

  const studies = useLiveQuery(() => landFeasibilityRepository.listForLand(land.id), [land.id]);
  const current = studies?.[0];

  return (
    <>
      {studies && studies.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            {studies.length} version{studies.length === 1 ? '' : 's'} · the newest is the one that
            counts
          </p>
          <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New version
          </Button>
        </div>
      )}

      {studies && studies.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No feasibility study yet"
          description="Estimate what this land will cost to buy and get ready, note what could go wrong, and decide: Proceed, Hold or Reject. Proceed opens negotiation with the owner."
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Add a study
            </Button>
          }
        />
      ) : (
        <TimelineList>
          {studies?.map((study) => {
            const cost = totalCost(study);
            const isCurrent = study.id === current?.id;
            const rec = RECOMMENDATION_META[study.recommendation];
            return (
              <TimelineItem
                key={study.id}
                marker={`v${study.version_no}`}
                markerClassName={
                  isCurrent
                    ? study.recommendation === 'proceed'
                      ? 'bg-emerald-500 text-white'
                      : undefined
                    : 'bg-slate-100 text-slate-500'
                }
                muted={!isCurrent}
                defaultOpen={isCurrent}
                date={formatDate(study.created_at)}
                title={
                  <>
                    Feasibility version {study.version_no}
                    <Badge tone={rec.tone}>{rec.label}</Badge>
                    {isCurrent && <Badge tone="teal">Current</Badge>}
                  </>
                }
                meta={study.prepared_by ? `Prepared by ${study.prepared_by}` : undefined}
                aside={
                  <span className="text-sm font-medium tabular-nums text-ink">{formatBdt(cost)}</span>
                }
              >
                <div className="grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
                  <Figure label="Land purchase" value={formatBdt(study.est_acquisition_cost)} />
                  <Figure label="Land development" value={formatBdt(study.est_development_cost)} />
                  <Figure label="Other costs" value={formatBdt(study.est_other_cost)} />
                  <Figure label="Total cost" value={formatBdt(cost)} strong sub={perUnit(land, cost)} />
                </div>

                {(study.assumptions || study.risks || study.remarks || study.decision_note) && (
                  <dl className="mt-3 grid gap-3 border-t border-hairline pt-3 sm:grid-cols-2">
                    {study.assumptions && <Note label="Assumptions" text={study.assumptions} />}
                    {study.risks && <Note label="Risks" text={study.risks} />}
                    {study.remarks && <Note label="Remarks" text={study.remarks} />}
                    {/* decisions recorded before the approval step was retired */}
                    {study.decision_note && <Note label="Decision note" text={study.decision_note} />}
                  </dl>
                )}

                {isCurrent && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
                    <Button size="sm" variant="outline" onClick={() => setEditing(study)}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                  </div>
                )}
              </TimelineItem>
            );
          })}
        </TimelineList>
      )}

      {editing && (
        <StudyDialog
          land={land}
          study={editing === 'new' ? undefined : editing}
          previous={editing === 'new' ? current : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Figure({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string | null;
  strong?: boolean;
}) {
  return (
    <div className={cn('px-4 py-3', strong ? 'bg-admin-50' : 'bg-white')}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn('text-sm tabular-nums text-ink', strong ? 'font-semibold' : 'font-medium')}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-muted tabular-nums">{sub}</p>}
    </div>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-ink">{text}</dd>
    </div>
  );
}

function StudyDialog({
  land,
  study,
  previous,
  onClose,
}: {
  land: Land;
  /** correcting the current version */
  study?: LandFeasibility;
  /** starting a new version from the last one */
  previous?: LandFeasibility;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const [saving, setSaving] = useState(false);

  /*
   * A new version starts from the last one's numbers rather than from blank.
   * A re-study usually changes one line, and retyping the rest is how the rest
   * come to differ from what was decided.
   */
  const base = study ?? previous;
  const [form, setForm] = useState({
    est_acquisition_cost: base ? String(base.est_acquisition_cost) : String(land.asking_price || ''),
    est_development_cost: base ? String(base.est_development_cost) : '',
    est_other_cost: base ? String(base.est_other_cost) : '',
    assumptions: base?.assumptions ?? '',
    risks: base?.risks ?? '',
    recommendation: (base?.recommendation ?? 'proceed') as FeasibilityRecommendation,
    prepared_by: study?.prepared_by ?? previous?.prepared_by ?? '',
    remarks: study?.remarks ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const n = (v: string) => Number(v) || 0;
  const cost = n(form.est_acquisition_cost) + n(form.est_development_cost) + n(form.est_other_cost);
  const unitCost = perUnit(land, cost);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        land_id: land.id,
        est_acquisition_cost: n(form.est_acquisition_cost),
        est_development_cost: n(form.est_development_cost),
        est_other_cost: n(form.est_other_cost),
        assumptions: form.assumptions.trim() || null,
        risks: form.risks.trim() || null,
        recommendation: form.recommendation,
        prepared_by: form.prepared_by.trim() || null,
        remarks: form.remarks.trim() || null,
      };

      if (study) {
        await landFeasibilityRepository.update(study.id, payload);
      } else {
        /*
         * Saved as decided: the recommendation is the decision now. The status
         * column stays for studies recorded under the old approval step.
         * version_no is omitted — the repository assigns the next one.
         */
        const now = new Date().toISOString();
        await landFeasibilityRepository.create(
          { ...payload, status: 'approved', submitted_at: now, decided_by: userId, decided_at: now },
          userId,
        );
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={study ? `Edit version ${study.version_no}` : previous ? 'New feasibility version' : 'New feasibility study'}
      subtitle={`${land.code} · ${land.name}`}
      icon={Calculator}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save study'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {previous && (
          <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
            Started from version {previous.version_no}. Change what has moved and leave the rest —
            version {previous.version_no} stays readable.
          </p>
        )}

        <section>
          <h4 className="mb-3 text-sm font-semibold text-ink">1. What will it cost?</h4>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Land purchase" hint="Price plus registration and legal">
              <MoneyInput
                value={form.est_acquisition_cost}
                placeholder="e.g. 40000000"
                onChange={(e) => set('est_acquisition_cost', e.target.value)}
              />
            </Field>
            <Field label="Land development" hint="Filling, boundary, roads, utilities">
              <MoneyInput
                value={form.est_development_cost}
                placeholder="e.g. 8000000"
                onChange={(e) => set('est_development_cost', e.target.value)}
              />
            </Field>
            <Field label="Other costs" hint="Approvals, broker, admin">
              <MoneyInput
                value={form.est_other_cost}
                placeholder="e.g. 3000000"
                onChange={(e) => set('est_other_cost', e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-admin-100 bg-admin-50 px-4 py-3">
            <span className="text-sm text-ink-muted">
              Total cost <strong className="text-base text-ink tabular-nums">{formatBdt(cost)}</strong>
            </span>
            {unitCost && <span className="text-sm text-ink-muted tabular-nums">{unitCost}</span>}
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-semibold text-ink">2. What could go wrong?</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assumptions" hint="What the numbers depend on">
              <TextArea
                value={form.assumptions}
                placeholder="e.g. 8 floors approvable, fill of 4 ft, owner vacates in 3 months"
                onChange={(e) => set('assumptions', e.target.value)}
              />
            </Field>
            <Field label="Risks" hint="What would make these numbers wrong">
              <TextArea
                value={form.risks}
                placeholder="e.g. Lowland — fill depth unconfirmed; two co-owners abroad"
                onChange={(e) => set('risks', e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-semibold text-ink">3. Your decision</h4>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Recommendation">
            {FEASIBILITY_RECOMMENDATIONS.map((r) => {
              const meta = RECOMMENDATION_META[r];
              const Icon = meta.icon;
              const on = form.recommendation === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('recommendation', r)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    on
                      ? r === 'proceed'
                        ? 'border-emerald-400 bg-emerald-50'
                        : r === 'hold'
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-red-400 bg-red-50'
                      : 'border-hairline bg-white hover:border-admin-300',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full',
                      on
                        ? r === 'proceed'
                          ? 'bg-emerald-500 text-white'
                          : r === 'hold'
                            ? 'bg-amber-500 text-white'
                            : 'bg-red-500 text-white'
                        : 'bg-slate-100 text-slate-400',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{meta.label}</span>
                    <span className="block text-xs text-ink-muted">{meta.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Prepared by">
              <TextInput
                value={form.prepared_by}
                placeholder="e.g. Rifat Ahmed (Land Team)"
                onChange={(e) => set('prepared_by', e.target.value)}
              />
            </Field>
            <Field label="Remarks">
              <TextInput
                value={form.remarks}
                placeholder="Anything else worth noting"
                onChange={(e) => set('remarks', e.target.value)}
              />
            </Field>
          </div>
        </section>
      </div>
    </Modal>
  );
}
