'use client';

import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Land, LandStatus } from '@/lib/db/types';
import { LAND_STATUS_META, correctableStatuses } from '@/lib/domain/land';
import { landPipelineRepository } from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';

/**
 * "Correct this status" (LAND-UX-REVIEW.md section 7, question 2).
 *
 * Not a transition. It puts a land wherever it actually is — the plot bought in
 * 2019 that is being entered today, the one moved by a round accepted by
 * mistake — and skips the gates to do it. That is why the reason is required
 * and why the Lifecycle feed labels the row as a correction: an override that
 * does not explain itself is a back door.
 */
export function CorrectStatusDialog({ land, onClose }: { land: Land; onClose: () => void }) {
  const { userId } = useMockSession();
  const options = correctableStatuses(land.status, land.acquisition_type);
  const [to, setTo] = useState<LandStatus>(options[0] ?? land.status);
  const [eventDate, setEventDate] = useState(todayLocal());
  const [by, setBy] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!reason.trim()) {
      setError('Say why the status is wrong — this is the only record of the correction.');
      return;
    }
    setBusy(true);
    try {
      await landPipelineRepository.correctStatus(
        land.id,
        to,
        { event_date: eventDate, reason, performed_by: by.trim() || null },
        userId,
      );
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      title="Correct this status"
      subtitle={`${land.code} · currently ${LAND_STATUS_META[land.status].label}`}
      message="Use this when the status is wrong, not to move a land on. Site visits, feasibility approvals and negotiation rounds move it by themselves; this skips that and the pipeline gates, so it records why."
      tone="warning"
      icon={Wrench}
      confirmLabel="Correct status"
      busy={busy}
      onCancel={onClose}
      onConfirm={confirm}
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Correct status" required>
            <SelectInput value={to} onChange={(e) => setTo(e.target.value as LandStatus)}>
              {options.map((s) => (
                <option key={s} value={s}>
                  {LAND_STATUS_META[s].label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Effective from" required>
            <TextInput type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Corrected by">
          <TextInput
            value={by}
            placeholder="e.g. Land team lead"
            onChange={(e) => setBy(e.target.value)}
          />
        </Field>
        <Field label="Reason" required error={error || undefined}>
          <TextArea
            value={reason}
            placeholder="e.g. Bought in 2019 before this system existed — deed 4521/2019"
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
          />
        </Field>
      </div>
    </ConfirmDialog>
  );
}
