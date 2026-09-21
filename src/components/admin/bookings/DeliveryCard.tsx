'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, KeyRound, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { DeliveryStep } from '@/lib/db/types';
import { DELIVERY_STEP_HINT, DELIVERY_STEP_LABEL } from '@/lib/domain/project';
import { DeliveryBlockedError, deliveryRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatDate, todayLocal } from '@/lib/utils/format';

/**
 * Phase 3 — delivering the item to its buyer (PROJECT-MODULE-PLAN.md §4).
 *
 * The steps come from the project shape: keys, deed and mutation for a flat;
 * possession, deed and mutation for a plot; certificate and deed for a share.
 * The card shows all of them, ticks what is done with its date and reference,
 * and offers only the next one — with the reason when it is blocked, because
 * "not yet" on its own sends people hunting for what is missing.
 */
export function DeliveryCard({ bookingId }: { bookingId: string }) {
  const { userId } = useMockSession();
  const state = useLiveQuery(() => deliveryRepository.stateForBooking(bookingId), [bookingId]);
  const [open, setOpen] = useState<DeliveryStep | null>(null);
  const [form, setForm] = useState({ event_date: todayLocal(), reference_no: '', performed_by: '', remarks: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!state) return null;
  const { shape, steps, recorded, next, blockedBy } = state;
  const delivered = next === null;

  async function save() {
    if (!open) return;
    if (!form.event_date) return setError('Enter the date it happened.');
    setBusy(true);
    setError('');
    try {
      await deliveryRepository.record(
        bookingId,
        open,
        {
          event_date: form.event_date,
          reference_no: form.reference_no.trim() || null,
          performed_by: form.performed_by.trim() || null,
          remarks: form.remarks.trim() || null,
        },
        userId,
      );
      setOpen(null);
    } catch (e) {
      setError(e instanceof DeliveryBlockedError ? e.message : 'Could not record this step.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={`Delivery — ${shape.labels.item.toLowerCase()}`} />
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const row = recorded.find((r) => r.step === step);
          const isNext = step === next;
          return (
            <li key={step} className="flex gap-3">
              <span
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                  row && 'bg-admin-500 text-white',
                  isNext && 'bg-admin-100 text-admin-700 ring-2 ring-admin-300',
                  !row && !isNext && 'bg-slate-100 text-slate-400',
                )}
              >
                {row ? <Check className="size-3" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className={cn('text-sm', row || isNext ? 'font-medium text-ink' : 'text-slate-400')}>
                  {DELIVERY_STEP_LABEL[step]}
                </p>
                <p className="text-xs text-ink-muted">
                  {row
                    ? [formatDate(row.event_date), row.reference_no, row.performed_by].filter(Boolean).join(' · ')
                    : DELIVERY_STEP_HINT[step]}
                </p>
                {row?.remarks && <p className="mt-0.5 text-xs text-ink-muted">{row.remarks}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {delivered ? (
        <p className="mt-4 rounded-lg bg-admin-50 p-2.5 text-xs font-medium text-admin-800">
          Delivered — the {shape.labels.item.toLowerCase()} is marked handed over.
        </p>
      ) : (
        <div className="mt-4">
          <Button
            size="sm"
            className="w-full"
            disabled={Boolean(blockedBy)}
            onClick={() => {
              setForm({ event_date: todayLocal(), reference_no: '', performed_by: '', remarks: '' });
              setError('');
              setOpen(next);
            }}
          >
            {blockedBy ? <Lock className="size-4" /> : <KeyRound className="size-4" />}
            Record: {DELIVERY_STEP_LABEL[next]}
          </Button>
          {blockedBy && <p className="mt-1.5 text-xs text-amber-700">• {blockedBy}</p>}
        </div>
      )}

      {open && (
        <Modal
          open
          title={DELIVERY_STEP_LABEL[open]}
          subtitle={DELIVERY_STEP_HINT[open]}
          icon={KeyRound}
          size="md"
          onClose={() => setOpen(null)}
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(null)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Record step'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" required>
              <TextInput
                type="date"
                value={form.event_date}
                onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
              />
            </Field>
            <Field
              label="Reference"
              hint={open === 'mutation_done' ? 'Mutation case no.' : open === 'share_certificate' ? 'Certificate no.' : 'Deed no.'}
            >
              <TextInput
                value={form.reference_no}
                onChange={(e) => setForm((f) => ({ ...f, reference_no: e.target.value }))}
              />
            </Field>
            <Field label="Done by" className="sm:col-span-2">
              <TextInput
                value={form.performed_by}
                onChange={(e) => setForm((f) => ({ ...f, performed_by: e.target.value }))}
                placeholder="e.g. Sub-Registry Office, Rupganj"
              />
            </Field>
            <Field label="Remarks" className="sm:col-span-2">
              <TextArea
                rows={2}
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </Modal>
      )}
    </Card>
  );
}
