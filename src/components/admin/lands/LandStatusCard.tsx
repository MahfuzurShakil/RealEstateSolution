'use client';

import { useState } from 'react';
import { Check, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import type { JvShareBasis, Land, LandStatus } from '@/lib/db/types';
import {
  LAND_PIPELINE_STEPS,
  LAND_STATUS_META,
  allowedNextStatuses,
  amountUpdatesFinalAgreed,
  isJvTermsField,
  isTerminalStatus,
  statusStepConfig,
  type StatusStepField,
} from '@/lib/domain/land';
import { landJvRepository, landRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { todayLocal } from '@/lib/utils/format';

/**
 * Pipeline trail + the transitions valid from the current status (Section 2.2).
 * Every move opens a confirmation dialog that also captures the step details,
 * so a stray click cannot advance a land. `linked_to_project` is set by
 * Module 2, not by hand.
 */
export function LandStatusCard({ land }: { land: Land }) {
  const [target, setTarget] = useState<LandStatus | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const nextStatuses = allowedNextStatuses(land.status, land.acquisition_type);
  const currentIndex = LAND_PIPELINE_STEPS.indexOf(land.status);
  const config = target ? statusStepConfig(target, land.acquisition_type) : null;

  async function openDialog(status: LandStatus) {
    setTarget(status);
    setError('');
    /*
     * JV terms already agreed at an earlier step are offered back rather than
     * asked for again — the share is normally settled in negotiation and only
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

    /*
     * The two shares are a split of one thing, so they have to total 100 —
     * the same rule the Edit Land form enforces. Checked only when both are
     * filled, because both are optional at negotiation and decision: the point
     * of those steps is that the split is not settled yet.
     */
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
      await landRepository.setStatus(land.id, target, {
        event_date: values.event_date,
        performed_by: values.performed_by?.trim() || null,
        amount,
        reference_no: values.reference_no?.trim() || null,
        remarks: values.remarks?.trim() || null,
      });
      // the amount agreed at the outcome step is the land's final agreed amount
      if (amount !== null && amountUpdatesFinalAgreed(target)) {
        await landRepository.update(land.id, { final_agreed_amount: amount });
      }

      /*
       * JV terms go to `land_jv_details`, not to the status event: a share is a
       * term of the deal, not something that happened on a date. Written only
       * when both shares are present, so moving to negotiation without them
       * does not overwrite a split already agreed with blanks.
       */
      if (capturesJvTerms && dev && own) {
        const existing = await landJvRepository.getForLand(land.id);
        await landJvRepository.upsertForLand(land.id, {
          developer_share_pct: Number(dev),
          landowner_share_pct: Number(own),
          /*
           * Only signing sets the agreement date. Negotiation and decision
           * record a share that is still being agreed, and stamping today's
           * date on the agreement each time one of them is confirmed would
           * leave the JV claiming to have been signed at the meeting where it
           * was still being argued about.
           */
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

        <ol className="space-y-3">
          {LAND_PIPELINE_STEPS.map((step, i) => {
            const done =
              currentIndex > i || (isTerminalStatus(land.status) && land.status !== 'rejected');
            const active = land.status === step;
            return (
              <li key={step} className="flex items-center gap-3">
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                    done
                      ? 'bg-admin-500 text-white'
                      : active
                        ? 'bg-admin-100 text-admin-700 ring-2 ring-admin-300'
                        : 'bg-slate-100 text-slate-400',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    active ? 'font-medium text-ink' : done ? 'text-ink-muted' : 'text-slate-400',
                  )}
                >
                  {LAND_STATUS_META[step].label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 border-t border-hairline pt-4">
          {nextStatuses.length === 0 ? (
            <p className="text-xs text-ink-muted">
              {land.status === 'linked_to_project'
                ? 'This land is linked to a project.'
                : 'No further status change available from here.'}
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs font-medium text-ink-muted">Move to</p>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === 'rejected' ? 'outline' : 'primary'}
                    onClick={() => openDialog(s)}
                  >
                    {LAND_STATUS_META[s].label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

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
            {/*
              A validation error that belongs to no single field — the two
              shares failing to total 100 is about the pair, not about either
              one. Without this the dialog simply refused to close and said
              nothing, which reads as a broken button.
            */}
            {error && !config.fields.some((f) => f.required && !values[f.key]?.trim()) && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
