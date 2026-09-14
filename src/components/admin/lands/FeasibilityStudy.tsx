'use client';

import { useState } from 'react';
import { Calculator, Check, Send, ShieldCheck, X } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type {
  FeasibilityRecommendation,
  FeasibilityStatus,
  Land,
  LandFeasibility,
} from '@/lib/db/types';
import { FEASIBILITY_RECOMMENDATIONS } from '@/lib/db/types';
import { landFeasibilityRepository, landPipelineRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

const STATUS_META: Record<FeasibilityStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
};

const RECOMMENDATION_META: Record<FeasibilityRecommendation, { label: string; tone: BadgeTone }> = {
  proceed: { label: 'Proceed', tone: 'green' },
  hold: { label: 'Hold', tone: 'amber' },
  reject: { label: 'Reject', tone: 'red' },
};

/** Total cost and margin are always derived, never stored — see the note below. */
function totals(f: LandFeasibility) {
  const cost =
    Number(f.est_acquisition_cost) + Number(f.est_development_cost) + Number(f.est_other_cost);
  const margin = Number(f.expected_revenue) - cost;
  const pct = f.expected_revenue > 0 ? (margin / Number(f.expected_revenue)) * 100 : null;
  return { cost, margin, pct };
}

/**
 * One feasibility study version, as it opens on the Lifecycle feed
 * (BRD SITE-002, SITE-003).
 *
 * Versioned rather than edited in place: the numbers move when the site visit
 * turns up two feet of fill, and the version the board approved has to stay
 * readable afterwards. Only a draft is editable; anything submitted or decided
 * is superseded by a new version instead. Since L7 each version is an entry in
 * the land's feed, and this is what the entry shows when opened.
 *
 * Total cost and margin are computed on read and never stored. A stored total
 * is a second answer to a question the three cost fields already answer, and
 * the two drift the first time someone edits one without the other.
 */
export function FeasibilityStudyDetails({
  land,
  study,
  isCurrent,
}: {
  land: Land;
  study: LandFeasibility;
  /** only the highest version can be edited or decided */
  isCurrent: boolean;
}) {
  const { userId } = useMockSession();
  const [editing, setEditing] = useState(false);
  const [deciding, setDeciding] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const t = totals(study);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_META[study.status].tone}>{STATUS_META[study.status].label}</Badge>
        <Badge tone={RECOMMENDATION_META[study.recommendation].tone}>
          Recommends {RECOMMENDATION_META[study.recommendation].label.toLowerCase()}
        </Badge>
        {isCurrent ? <Badge tone="teal">Current</Badge> : <Badge>Superseded</Badge>}
        <span className="ml-auto text-xs text-ink-muted">
          {study.prepared_by ? `Prepared by ${study.prepared_by} · ` : ''}
          started {formatDate(study.created_at)}
          {study.submitted_at ? ` · submitted ${formatDate(study.submitted_at)}` : ''}
        </span>
      </div>

      <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Acquisition" value={study.est_acquisition_cost} />
        <Figure label="Development" value={study.est_development_cost} />
        <Figure label="Other costs" value={study.est_other_cost} />
        <Figure label="Expected revenue" value={study.expected_revenue} />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-sm text-ink-muted">
          Total cost <strong className="text-ink tabular-nums">{formatBdt(t.cost)}</strong>
        </span>
        <span
          className={
            t.margin >= 0
              ? 'text-sm font-medium text-emerald-700 tabular-nums'
              : 'text-sm font-medium text-red-700 tabular-nums'
          }
        >
          Margin {formatBdt(t.margin)}
          {t.pct != null && ` · ${t.pct.toFixed(1)}%`}
        </span>
      </div>

      {(study.assumptions || study.risks || study.decision_note) && (
        <dl className="mt-3 grid gap-3 border-t border-hairline pt-3 sm:grid-cols-2">
          {study.assumptions && (
            <div>
              <dt className="text-xs text-ink-muted">Assumptions</dt>
              <dd className="whitespace-pre-wrap text-sm text-ink">{study.assumptions}</dd>
            </div>
          )}
          {study.risks && (
            <div>
              <dt className="text-xs text-ink-muted">Risks</dt>
              <dd className="whitespace-pre-wrap text-sm text-ink">{study.risks}</dd>
            </div>
          )}
          {study.decision_note && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-muted">
                Decision {study.decided_at ? `· ${formatDate(study.decided_at)}` : ''}
              </dt>
              <dd className="whitespace-pre-wrap text-sm text-ink">{study.decision_note}</dd>
            </div>
          )}
        </dl>
      )}

      {/*
        Actions only on the current version. Deciding a superseded study would
        approve numbers nobody is working from.
      */}
      {isCurrent && (study.status === 'draft' || study.status === 'submitted') && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
          {study.status === 'draft' && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit draft
              </Button>
              <Button size="sm" onClick={() => setSubmitting(true)}>
                <Send className="size-4" /> Submit for approval
              </Button>
            </>
          )}
          {study.status === 'submitted' && (
            <>
              <Button size="sm" onClick={() => setDeciding(true)}>
                <Check className="size-4" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDeciding(false)}>
                <X className="size-4" /> Reject
              </Button>
            </>
          )}
        </div>
      )}

      {editing && <StudyDialog land={land} study={study} onClose={() => setEditing(false)} />}

      <ConfirmDialog
        open={submitting}
        title="Submit for approval"
        message="The study is locked from editing once submitted. A change after this means a new version."
        confirmLabel="Submit"
        icon={Send}
        onCancel={() => setSubmitting(false)}
        onConfirm={async () => {
          await landFeasibilityRepository.update(study.id, {
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          });
          setSubmitting(false);
        }}
      />

      {deciding !== null && (
        <DecisionDialog
          study={study}
          approve={deciding}
          userId={userId}
          onClose={() => setDeciding(null)}
        />
      )}
    </>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-sm font-medium text-ink tabular-nums">{formatBdt(value)}</p>
    </div>
  );
}

function DecisionDialog({
  study,
  approve,
  userId,
  onClose,
}: {
  study: LandFeasibility;
  approve: boolean;
  userId: string | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const t = totals(study);

  return (
    <ConfirmDialog
      open
      title={approve ? 'Approve this feasibility study' : 'Reject this feasibility study'}
      subtitle={`Version ${study.version_no} · recommends ${study.recommendation}`}
      message={
        approve
          ? study.recommendation === 'proceed'
            ? 'Approving records the board’s decision on these numbers. A land still under review moves to Due Diligence the moment this is approved.'
            : `Approving records the board’s decision on these numbers. It recommends ${study.recommendation}, so the land stays where it is.`
          : 'Rejecting closes this version. A changed decision means a new version, so the rejected numbers stay readable.'
      }
      tone={approve ? 'success' : 'danger'}
      icon={ShieldCheck}
      confirmLabel={approve ? 'Approve study' : 'Reject study'}
      busy={busy}
      onCancel={onClose}
      onConfirm={async () => {
        if (!note.trim()) {
          setError('Say why — this is the decision record.');
          return;
        }
        setBusy(true);
        try {
          // an approval recommending Proceed sends the land to due diligence (L7)
          await landPipelineRepository.decideFeasibility(
            study.id,
            { approve, note: note.trim() },
            userId,
          );
          onClose();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4">
        <div className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-sm">
          <p className="text-ink-muted">
            Total cost <strong className="text-ink tabular-nums">{formatBdt(t.cost)}</strong> ·
            revenue{' '}
            <strong className="text-ink tabular-nums">{formatBdt(study.expected_revenue)}</strong> ·
            margin{' '}
            <strong className={t.margin >= 0 ? 'text-emerald-700' : 'text-red-700'}>
              {formatBdt(t.margin)}
              {t.pct != null && ` (${t.pct.toFixed(1)}%)`}
            </strong>
          </p>
        </div>

        {/*
          An approved study that recommends hold or reject does not open gate
          G1 — approving the paperwork is not approving the deal. Said here
          rather than discovered at the pipeline button.
        */}
        {approve && study.recommendation !== 'proceed' && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            This study recommends <strong>{study.recommendation}</strong>, not proceeding. Approving
            it records the decision but will <strong>not</strong> let the land move on to due
            diligence — that needs a version recommending Proceed.
          </p>
        )}

        <Field label="Decision note" required error={error || undefined}>
          <TextArea
            value={note}
            placeholder={
              approve
                ? 'e.g. Board approved 12 Sep. Proceed subject to the fill estimate holding.'
                : 'e.g. Margin below the 18% threshold at this land price.'
            }
            onChange={(e) => {
              setNote(e.target.value);
              setError('');
            }}
          />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

export function StudyDialog({
  land,
  study,
  previous,
  onClose,
}: {
  land: Land;
  /** editing an existing draft */
  study?: LandFeasibility;
  /** starting a new version from the last one */
  previous?: LandFeasibility;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /*
   * A new version starts from the last one's numbers rather than from blank.
   * A re-study usually changes one line — the fill cost, the achievable
   * price — and retyping the other five is how the other five come to differ
   * from the version that was approved.
   */
  const base = study ?? previous;
  const [form, setForm] = useState({
    est_acquisition_cost: base ? String(base.est_acquisition_cost) : String(land.asking_price || ''),
    est_development_cost: base ? String(base.est_development_cost) : '',
    est_other_cost: base ? String(base.est_other_cost) : '',
    expected_revenue: base ? String(base.expected_revenue) : '',
    assumptions: base?.assumptions ?? '',
    risks: base?.risks ?? '',
    recommendation: (base?.recommendation ?? 'proceed') as FeasibilityRecommendation,
    prepared_by: study?.prepared_by ?? '',
    remarks: study?.remarks ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const n = (v: string) => Number(v) || 0;
  const cost = n(form.est_acquisition_cost) + n(form.est_development_cost) + n(form.est_other_cost);
  const margin = n(form.expected_revenue) - cost;
  const pct = n(form.expected_revenue) > 0 ? (margin / n(form.expected_revenue)) * 100 : null;

  async function save() {
    if (!form.expected_revenue.trim()) {
      setError('Expected revenue is what the margin is measured against');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = {
        land_id: land.id,
        est_acquisition_cost: n(form.est_acquisition_cost),
        est_development_cost: n(form.est_development_cost),
        est_other_cost: n(form.est_other_cost),
        expected_revenue: n(form.expected_revenue),
        assumptions: form.assumptions.trim() || null,
        risks: form.risks.trim() || null,
        recommendation: form.recommendation,
        prepared_by: form.prepared_by.trim() || null,
        remarks: form.remarks.trim() || null,
      };

      if (study) await landFeasibilityRepository.update(study.id, payload);
      // version_no is omitted on purpose — the repository assigns the next one
      else await landFeasibilityRepository.create({ ...payload, status: 'draft' }, userId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={study ? `Edit version ${study.version_no}` : 'New feasibility study'}
      subtitle={`${land.code} · ${land.name}`}
      icon={Calculator}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : study ? 'Save draft' : 'Save as draft'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {previous && (
          <p className="rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
            Started from version {previous.version_no}. Change what has moved and leave the rest —
            the approved version stays readable either way.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estimated acquisition cost" hint="Land price plus registration and legal">
            <MoneyInput
              value={form.est_acquisition_cost}
              placeholder="e.g. 40000000"
              onChange={(e) => set('est_acquisition_cost', e.target.value)}
            />
          </Field>
          <Field label="Estimated development cost" hint="Filling, boundary, roads, utilities">
            <MoneyInput
              value={form.est_development_cost}
              placeholder="e.g. 8000000"
              onChange={(e) => set('est_development_cost', e.target.value)}
            />
          </Field>
          <Field label="Other costs" hint="Design, approvals, marketing, admin">
            <MoneyInput
              value={form.est_other_cost}
              placeholder="e.g. 3000000"
              onChange={(e) => set('est_other_cost', e.target.value)}
            />
          </Field>
          <Field label="Expected revenue" required error={error || undefined}>
            <MoneyInput
              value={form.expected_revenue}
              placeholder="e.g. 72000000"
              onChange={(e) => set('expected_revenue', e.target.value)}
            />
          </Field>
        </div>

        {/* computed live, so the recommendation is made against a visible number */}
        <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-hairline bg-slate-50 px-4 py-3">
          <span className="text-sm text-ink-muted">
            Total cost <strong className="text-ink tabular-nums">{formatBdt(cost)}</strong>
          </span>
          <span
            className={
              margin >= 0
                ? 'text-sm font-medium text-emerald-700 tabular-nums'
                : 'text-sm font-medium text-red-700 tabular-nums'
            }
          >
            Margin {formatBdt(margin)}
            {pct != null && ` · ${pct.toFixed(1)}%`}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recommendation" required>
            <SelectInput
              value={form.recommendation}
              onChange={(e) => set('recommendation', e.target.value as FeasibilityRecommendation)}
            >
              {FEASIBILITY_RECOMMENDATIONS.map((r) => (
                <option key={r} value={r}>
                  {RECOMMENDATION_META[r].label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Prepared by">
            <TextInput
              value={form.prepared_by}
              placeholder="e.g. Rifat Ahmed (Land Team)"
              onChange={(e) => set('prepared_by', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4">
          <Field label="Assumptions" hint="What the numbers depend on being true">
            <TextArea
              value={form.assumptions}
              placeholder="e.g. 55:45 JV split, 8 floors approved, BDT 9,500/sqft achievable, 30 months to handover"
              onChange={(e) => set('assumptions', e.target.value)}
            />
          </Field>
          <Field label="Risks" hint="What would make these numbers wrong">
            <TextArea
              value={form.risks}
              placeholder="e.g. Lowland — fill depth unconfirmed; two co-owners abroad; RAJUK height limit under review"
              onChange={(e) => set('risks', e.target.value)}
            />
          </Field>
          <Field label="Remarks">
            <TextArea
              value={form.remarks}
              placeholder="Anything else the board should read"
              onChange={(e) => set('remarks', e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
