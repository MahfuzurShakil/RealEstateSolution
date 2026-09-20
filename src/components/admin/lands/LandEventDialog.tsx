'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { GitBranch, Lock } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { StepAttachments } from '@/components/admin/documents/StepAttachments';
import { useMockSession } from '@/lib/auth/mock-session';
import type { JvShareBasis, Land, LandStatus } from '@/lib/db/types';
import {
  LAND_STATUS_META,
  statusStepAttachment,
  statusStepConfig,
  type StatusStepField,
} from '@/lib/domain/land';
import {
  PipelineBlockedError,
  documentRepository,
  landJvRepository,
  landPipelineRepository,
} from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';

/**
 * Records one real-world land event (L7): registration (Acquired), JV signing,
 * or a decision — Rejected, Divested, Reopen.
 *
 * The fields come from `statusStepConfig`; the write goes through
 * `landPipelineRepository`, which applies the BRD rules (DD-004, ACQ-003) and
 * refuses with a sentence when one fails. Evidence attached here is filed as a
 * land document against the history row, so it shows beside the event.
 */
export function LandEventDialog({
  land,
  target,
  onClose,
}: {
  land: Land;
  target: LandStatus;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const config = statusStepConfig(target, land.acquisition_type);
  const [values, setValues] = useState<Record<string, string>>({ event_date: todayLocal() });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isJv = land.acquisition_type === 'joint_venture';
  // one closing status; a JV reaches it by signing, a purchase by registering
  const closing = target === 'acquired';
  // live, so finishing the DD checklist in another tab unlocks this without a reload
  const blocked = useLiveQuery(
    async () => (closing ? landPipelineRepository.closingBlockReason(land.id) : null),
    [land.id, land.status, closing],
  );

  /*
   * Offer back what is already known: the agreed amount at registration, and
   * the JV split recorded earlier. Re-typing either is how two answers appear.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const jv = closing && isJv ? await landJvRepository.getForLand(land.id) : undefined;
      if (cancelled) return;
      setValues((v) => ({
        ...v,
        amount: closing && land.final_agreed_amount != null ? String(land.final_agreed_amount) : '',
        developer_share_pct: jv?.developer_share_pct != null ? String(jv.developer_share_pct) : '',
        landowner_share_pct: jv?.landowner_share_pct != null ? String(jv.landowner_share_pct) : '',
        jv_share_basis: jv?.jv_share_basis ?? 'flat_count',
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [land.id, land.final_agreed_amount, target, closing, isJv]);

  if (!config) return null;

  const text = (k: string) => values[k]?.trim() || null;
  const num = (k: string) => (values[k]?.trim() ? Number(values[k]) : null);

  async function confirm() {
    if (!config) return;
    const missing = config.fields.find((f) => f.required && !values[f.key]?.trim());
    if (missing) {
      setError(`${missing.label.replace(' (required)', '')} is required`);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const base = {
        event_date: values.event_date,
        reference_no: text('reference_no'),
        remarks: text('remarks'),
      };
      const event = !closing
        ? await landPipelineRepository.recordDecision(
            land.id,
            target,
            { ...base, amount: num('amount'), performed_by: text('performed_by') },
            userId,
          )
        : isJv
          ? await landPipelineRepository.recordJvSigning(
              land.id,
              {
                ...base,
                developer_share_pct: num('developer_share_pct') ?? 0,
                landowner_share_pct: num('landowner_share_pct') ?? 0,
                jv_share_basis: (values.jv_share_basis as JvShareBasis) || 'flat_count',
                cash_payable: num('amount'),
              },
              userId,
            )
          : await landPipelineRepository.recordRegistration(
              land.id,
              { ...base, amount: num('amount') ?? 0, performed_by: text('performed_by') },
              userId,
            );

      if (files.length) {
        const attachment = statusStepAttachment(target, land.acquisition_type);
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
            status_event_id: event.id,
          });
        }
      }
      onClose();
    } catch (e) {
      if (e instanceof PipelineBlockedError) setError(e.message);
      else throw e;
    } finally {
      setBusy(false);
    }
  }

  function renderField(field: StatusStepField) {
    const value = values[field.key] ?? '';
    const onChange = (v: string) => setValues((prev) => ({ ...prev, [field.key]: v }));
    return (
      <Field key={field.key} label={field.label} required={field.required}>
        {field.type === 'select' ? (
          <SelectInput value={value} onChange={(e) => onChange(e.target.value)}>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
        ) : field.type === 'textarea' ? (
          <TextArea value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
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
    <ConfirmDialog
      open
      title={config.title}
      subtitle={`${land.code} · ${LAND_STATUS_META[land.status].label} → ${LAND_STATUS_META[target].label}`}
      message={config.question}
      tone={config.tone}
      icon={GitBranch}
      confirmLabel={config.confirmLabel}
      busy={busy}
      disabled={Boolean(blocked)}
      onCancel={onClose}
      onConfirm={confirm}
    >
      <div className="grid gap-4">
        {blocked && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>{blocked}</span>
          </p>
        )}
        {config.fields.map(renderField)}
        <StepAttachments
          files={files}
          onChange={setFiles}
          prompt={statusStepAttachment(target, land.acquisition_type).prompt}
          error={fileError}
          onError={setFileError}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </ConfirmDialog>
  );
}
