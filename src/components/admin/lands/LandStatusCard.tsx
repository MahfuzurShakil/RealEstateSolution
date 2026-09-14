'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Bot, GitBranch, Info, Lock, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { StepAttachments } from '@/components/admin/documents/StepAttachments';
import { CorrectStatusDialog } from '@/components/admin/lands/CorrectStatusDialog';
import { useMockSession } from '@/lib/auth/mock-session';
import type { JvShareBasis, Land, LandStatus } from '@/lib/db/types';
import {
  LAND_PIPELINE_STEPS,
  LAND_STATUS_META,
  allowedNextStatuses,
  amountUpdatesFinalAgreed,
  correctableStatuses,
  ddGateBlockReason,
  isJvTermsField,
  landReadout,
  statusStepAttachment,
  statusStepConfig,
  transitionNeedsDueDiligence,
  type LandWorkArea,
  type StatusStepField,
} from '@/lib/domain/land';
import {
  companySettingsRepository,
  documentRepository,
  landDdRepository,
  landDevelopmentRepository,
  landFeasibilityRepository,
  landJvRepository,
  landNegotiationRepository,
  landProjectMappingRepository,
  landRepository,
  landStatusEventRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate, todayLocal } from '@/lib/utils/format';

/**
 * The Pipeline card — a read-out, not a set of buttons (L7, review section 4).
 *
 * It answers one question: why is this land here, and what unblocks it? The
 * four middle steps follow the work recorded on the page (see
 * `landPipelineRepository`), so the card's job is to say which piece of work
 * the land is waiting on and take the user to it. The real-world events —
 * Acquired, JV Signed, Rejected, Disposed, Reopen — are still buttons, under
 * the read-out, because nothing else in the system can know a deed was signed.
 */
export function LandStatusCard({
  land,
  onOpen,
}: {
  land: Land;
  /** takes the user to the place on the page where that work is recorded */
  onOpen: (area: LandWorkArea) => void;
}) {
  const { userId } = useMockSession();
  const [target, setTarget] = useState<LandStatus | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  const nextStatuses = allowedNextStatuses(land.status, land.acquisition_type);
  const config = target ? statusStepConfig(target, land.acquisition_type) : null;

  const ddProgress = useLiveQuery(() => landDdRepository.progressForLand(land.id), [land.id]);
  const settings = useLiveQuery(() => companySettingsRepository.get(), []);
  const ddGateOn = settings?.require_dd_completion ?? false;

  /*
   * Everything the read-out reasons about, in one live query, so the sentence
   * changes the moment the work does — approving a study further down the page
   * updates this card without a reload.
   */
  const facts = useLiveQuery(async () => {
    const [studies, rounds, development, projects, events] = await Promise.all([
      landFeasibilityRepository.listForLand(land.id),
      landNegotiationRepository.listForLand(land.id),
      landDevelopmentRepository.readinessForLand(land.id),
      landProjectMappingRepository.projectsForLand(land.id),
      landStatusEventRepository.listForLand(land.id),
    ]);
    return {
      feasibility: {
        current: studies[0],
        latestApproved: studies.find((r) => r.status === 'approved'),
      },
      openRound: rounds.find((r) => r.status === 'open'),
      roundCount: rounds.length,
      development,
      projectNames: projects.map((p) => p.name),
      lastEvent: events.at(-1),
    };
  }, [land.id, land.status]);

  const readout = facts
    ? landReadout({
        status: land.status,
        acquisitionType: land.acquisition_type,
        feasibility: facts.feasibility,
        openRound: facts.openRound,
        roundCount: facts.roundCount,
        dd: ddProgress,
        ddGateOn,
        development: facts.development,
        noDevelopmentRequired: Boolean(land.no_development_required),
        developmentGateOn: settings?.require_development_ready ?? false,
        projectNames: facts.projectNames,
      })
    : null;

  /** The reason a manual event is blocked, or null when it is allowed. */
  function blockedReason(to: LandStatus): string | null {
    if (ddGateOn && transitionNeedsDueDiligence(land.status, to)) {
      return ddGateBlockReason(ddProgress);
    }
    return null;
  }

  async function openDialog(status: LandStatus) {
    setTarget(status);
    setError('');
    setFileError('');
    setFiles([]);
    /*
     * JV terms already on record are offered back rather than asked for
     * again — the split is usually settled across the negotiation and only
     * confirmed at signing, and re-typing it is how the two come to disagree.
     */
    const jv =
      land.acquisition_type === 'joint_venture'
        ? await landJvRepository.getForLand(land.id)
        : undefined;
    setValues({
      event_date: todayLocal(),
      developer_share_pct: jv?.developer_share_pct != null ? String(jv.developer_share_pct) : '',
      landowner_share_pct: jv?.landowner_share_pct != null ? String(jv.landowner_share_pct) : '',
      jv_share_basis: jv?.jv_share_basis ?? 'flat_count',
    });
  }

  async function confirm() {
    if (!target || !config) return;
    const missing = config.fields.find((f) => f.required && !values[f.key]?.trim());
    if (missing) {
      setError(`${missing.label.replace(' (required)', '')} is required`);
      return;
    }

    // the two shares are a split of one thing — the same rule the Edit Land form enforces
    const dev = values.developer_share_pct?.trim();
    const own = values.landowner_share_pct?.trim();
    const capturesJvTerms = config.fields.some((f) => isJvTermsField(f.key));
    if (capturesJvTerms && dev && own && Math.abs(Number(dev) + Number(own) - 100) > 0.001) {
      setError(`Developer + landowner share must total 100% (currently ${Number(dev) + Number(own)}%)`);
      return;
    }

    setBusy(true);
    try {
      const amount = values.amount?.trim() ? Number(values.amount) : null;
      const moved = await landRepository.setStatus(
        land.id,
        target,
        {
          event_date: values.event_date,
          performed_by: values.performed_by?.trim() || null,
          amount,
          reference_no: values.reference_no?.trim() || null,
          remarks: values.remarks?.trim() || null,
          source: 'manual',
        },
        userId,
      );

      /*
       * Evidence collected at this step. It is filed against the *land*, not
       * against the event, so the Documents tab lists it like any other land
       * document. `status_event_id` only records where it arrived, which is
       * what lets the Lifecycle feed show it beside the step it belongs to.
       *
       * Uploaded after the status has moved rather than before: a file filed
       * against a step that never happened is worse than a file not filed.
       */
      if (moved && files.length) {
        const attachment = statusStepAttachment(target);
        const uploadedAt = new Date().toISOString();
        for (const file of files) {
          await documentRepository.create({
            entity_type: 'land',
            entity_id: land.id,
            document_type: attachment.documentType,
            custom_type_name: attachment.customName ?? null,
            file_url: file.name,
            file_data: file,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            is_public: false,
            uploaded_by: userId,
            uploaded_at: uploadedAt,
            notes: `Attached at "${LAND_STATUS_META[target].label}"`,
            status_event_id: moved.event.id,
          });
        }
      }
      // the amount agreed at the outcome step is the land's final agreed amount
      if (amount !== null && amountUpdatesFinalAgreed(target)) {
        await landRepository.update(land.id, { final_agreed_amount: amount });
      }

      // JV terms go to `land_jv_details`: a share is a term of the deal, not an event
      if (capturesJvTerms && dev && own) {
        const existing = await landJvRepository.getForLand(land.id);
        await landJvRepository.upsertForLand(land.id, {
          developer_share_pct: Number(dev),
          landowner_share_pct: Number(own),
          agreement_date:
            target === 'jv_signed' ? values.event_date : (existing?.agreement_date ?? values.event_date),
          // untouched here — they belong to the Edit Land form
          power_of_attorney: existing?.power_of_attorney ?? false,
          poa_reference: existing?.poa_reference ?? null,
          jv_share_basis: (values.jv_share_basis as JvShareBasis) || 'flat_count',
        });
      }
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }

  function renderField(field: StatusStepField) {
    const value = values[field.key] ?? '';
    const onChange = (v: string) => setValues((prev) => ({ ...prev, [field.key]: v }));

    return (
      <Field
        key={field.key}
        label={field.label}
        required={field.required}
        error={error && field.required && !value.trim() ? error : undefined}
      >
        {field.type === 'select' ? (
          <SelectInput value={value} onChange={(e) => onChange(e.target.value)}>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
        ) : field.type === 'textarea' ? (
          <TextArea
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <TextInput
            type={field.type}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
    );
  }

  const stepIndex = LAND_PIPELINE_STEPS.indexOf(land.status);
  // past the five steps (acquired, linked…) every segment is filled; rejected fills none
  const filled =
    stepIndex >= 0
      ? stepIndex + 1
      : land.status === 'rejected'
        ? 0
        : LAND_PIPELINE_STEPS.length;
  /*
   * Only when it explains the status shown. Module 2 links a land to a project
   * without writing a history row, so a linked land's last row is the signing
   * — "Moved to JV Signed" under a "Linked to Project" badge is two answers.
   */
  const last = facts?.lastEvent?.to_status === land.status ? facts.lastEvent : undefined;
  const blocked = nextStatuses.map((s) => blockedReason(s)).find(Boolean);

  return (
    <>
      <Card>
        <CardHeader
          title="Pipeline"
          action={
            <Badge tone={LAND_STATUS_META[land.status].tone}>
              {LAND_STATUS_META[land.status].label}
            </Badge>
          }
        />

        {/* where it is — five segments; the badge and the read-out say the rest */}
        <div className="flex gap-1" aria-hidden>
          {LAND_PIPELINE_STEPS.map((step, i) => (
            <span
              key={step}
              title={LAND_STATUS_META[step].label}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                i < filled ? 'bg-admin-500' : 'bg-slate-200',
              )}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          {stepIndex >= 0
            ? `Step ${stepIndex + 1} of ${LAND_PIPELINE_STEPS.length}`
            : land.status === 'rejected'
              ? 'Dropped from the pipeline'
              : 'Past the pipeline'}
        </p>

        {/* why it is here, and what unblocks it */}
        {readout && (
          <div className="mt-4 rounded-xl border border-admin-100 bg-admin-50/50 p-3.5">
            {readout.waitingOn ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-admin-700">
                  Waiting on
                </p>
                <p className="mt-1 text-sm text-ink">{readout.waitingOn}</p>
              </>
            ) : (
              <p className="text-sm text-ink">{readout.settled}</p>
            )}
            {readout.action && (
              <button
                type="button"
                onClick={() => onOpen(readout.action!.area)}
                className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-admin-700 hover:underline"
              >
                {readout.action.label} <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {readout && readout.notes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {readout.notes.map((note) => (
              <li
                key={note.text}
                className={cn(
                  'flex items-start gap-2 text-xs',
                  note.tone === 'warn' ? 'text-amber-800' : 'text-ink-muted',
                )}
              >
                {note.tone === 'warn' ? (
                  <Lock className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                )}
                <span>
                  {note.text}
                  {note.action && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={() => onOpen(note.action!.area)}
                        className="font-medium text-admin-700 hover:underline"
                      >
                        {note.action.label}
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* what moved it last — so an automatic change is never a silent one */}
        {last && (
          <p className="mt-4 flex items-start gap-2 border-t border-hairline pt-3 text-xs text-ink-muted">
            {last.source === 'automatic' ? (
              <Bot className="mt-0.5 size-3.5 shrink-0" />
            ) : last.source === 'correction' ? (
              <Wrench className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <GitBranch className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span>
              {last.source === 'correction' ? 'Corrected to' : 'Moved to'}{' '}
              <span className="font-medium text-ink">{LAND_STATUS_META[last.to_status].label}</span>{' '}
              on {formatDate(last.event_date)}
              {last.source === 'automatic' && last.remarks ? ` — ${last.remarks}` : '.'}
            </span>
          </p>
        )}

        {nextStatuses.length > 0 && (
          <div className="mt-4 border-t border-hairline pt-4">
            <p className="mb-2 text-xs font-medium text-ink-muted">Record an event</p>
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map((s) => {
                const reason = blockedReason(s);
                return (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === 'rejected' ? 'outline' : 'primary'}
                    disabled={Boolean(reason)}
                    title={reason ?? undefined}
                    onClick={() => openDialog(s)}
                  >
                    {statusStepConfig(s, land.acquisition_type)?.confirmLabel ??
                      LAND_STATUS_META[s].label}
                  </Button>
                );
              })}
            </div>
            {/* gate G2: a disabled button alone reads as a bug — the reason makes it a rule */}
            {blocked && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                <span>{blocked}</span>
              </p>
            )}
          </div>
        )}

        {correctableStatuses(land.status, land.acquisition_type).length > 0 && (
          <button
            type="button"
            onClick={() => setCorrecting(true)}
            className="mt-4 text-xs font-medium text-ink-muted underline-offset-2 hover:text-admin-700 hover:underline"
          >
            Correct this status
          </button>
        )}
      </Card>

      {correcting && <CorrectStatusDialog land={land} onClose={() => setCorrecting(false)} />}

      {config && target && (
        <ConfirmDialog
          open
          title={config.title}
          subtitle={`${land.code} · ${LAND_STATUS_META[land.status].label} → ${LAND_STATUS_META[target].label}`}
          message={config.question}
          tone={config.tone}
          icon={GitBranch}
          confirmLabel={config.confirmLabel}
          busy={busy}
          onCancel={() => setTarget(null)}
          onConfirm={confirm}
        >
          <div className="grid gap-4">
            {config.fields.map(renderField)}

            <StepAttachments
              files={files}
              onChange={setFiles}
              prompt={statusStepAttachment(target).prompt}
              error={fileError}
              onError={setFileError}
            />

            {/* an error about the pair of shares, which belongs to no single field */}
            {error && !config.fields.some((f) => f.required && !values[f.key]?.trim()) && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
