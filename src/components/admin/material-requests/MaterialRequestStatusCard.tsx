'use client';

import { useState } from 'react';
import { Ban, Check, PackageCheck, ShoppingCart, ThumbsUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { MaterialRequestStatus } from '@/lib/db/types';
import {
  MATERIAL_REQUEST_PIPELINE,
  MATERIAL_REQUEST_STATUS_META,
  MATERIAL_REQUEST_STEP_CONFIG,
  REQUEST_STEP_OWNER,
  allowedNextRequestStatuses,
} from '@/lib/domain/site-progress';
import type { MaterialRequestWithRelations } from '@/lib/repositories';
import { materialRequestRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';

const ICONS: Record<Exclude<MaterialRequestStatus, 'pending'>, typeof ThumbsUp> = {
  approved: ThumbsUp,
  rejected: Ban,
  ordered: ShoppingCart,
  fulfilled: PackageCheck,
};

/**
 * The Section 6.5 lifecycle gate: pending → approved / rejected → ordered →
 * fulfilled. Status is only ever moved one legal step at a time, and the
 * approval step is where the approved quantities are settled — a separate
 * "edit quantities" screen would let a request be approved and then quietly
 * changed.
 */
export function MaterialRequestStatusCard({
  request,
}: {
  request: MaterialRequestWithRelations;
}) {
  const { userId } = useMockSession();
  const [action, setAction] = useState<Exclude<MaterialRequestStatus, 'pending'> | null>(null);
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = allowedNextRequestStatuses(request.status);
  const isRejected = request.status === 'rejected';
  const currentIndex = MATERIAL_REQUEST_PIPELINE.indexOf(request.status);
  const config = action ? MATERIAL_REQUEST_STEP_CONFIG[action] : null;

  function open(status: Exclude<MaterialRequestStatus, 'pending'>) {
    setAction(status);
    setNote('');
    setError('');
    setQuantities(
      Object.fromEntries(
        request.items.map((i) => [i.id, String(i.quantity_approved ?? i.quantity_requested)]),
      ),
    );
  }

  async function confirm() {
    if (!action || !config) return;
    if (config.needsNote && !note.trim()) {
      setError('A reason is required');
      return;
    }
    setBusy(true);
    try {
      await materialRequestRepository.setStatus(request.id, action, {
        decided_by: userId,
        decision_note: note.trim() || null,
        approved_quantities:
          action === 'approved'
            ? Object.fromEntries(
                Object.entries(quantities).map(([id, value]) => [
                  id,
                  value.trim() === '' ? null : Number(value),
                ]),
              )
            : undefined,
      });
      setAction(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Request Status"
          action={
            <Badge tone={MATERIAL_REQUEST_STATUS_META[request.status].tone}>
              {MATERIAL_REQUEST_STATUS_META[request.status].label}
            </Badge>
          }
        />

        {isRejected ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">Request rejected</p>
            {request.decision_note && (
              <p className="mt-1 whitespace-pre-wrap text-xs text-red-600">
                {request.decision_note}
              </p>
            )}
            <p className="mt-2 text-xs text-red-600/80">
              A rejected request is closed for good — raise a fresh one rather than reviving this,
              so the reason it was turned down stays on the record.
            </p>
          </div>
        ) : (
          <ol className="mb-4 space-y-2">
            {MATERIAL_REQUEST_PIPELINE.map((step, i) => {
              const done = i < currentIndex;
              const current = i === currentIndex;
              return (
                <li key={step} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                      done && 'bg-admin-500 text-white',
                      current && 'bg-admin-100 text-admin-700 ring-2 ring-admin-300',
                      !done && !current && 'bg-slate-100 text-slate-400',
                    )}
                  >
                    {done ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      'text-sm',
                      current ? 'font-medium text-ink' : done ? 'text-ink-muted' : 'text-slate-400',
                    )}
                  >
                    {MATERIAL_REQUEST_STATUS_META[step].label}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-400">
                    {REQUEST_STEP_OWNER[step]}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {next.length > 0 ? (
          <div className="space-y-2">
            {next.map((status) => {
              const Icon = ICONS[status as Exclude<MaterialRequestStatus, 'pending'>];
              const isReject = status === 'rejected';
              return (
                <Button
                  key={status}
                  size="sm"
                  variant={isReject ? 'danger' : 'primary'}
                  className="w-full"
                  onClick={() => open(status as Exclude<MaterialRequestStatus, 'pending'>)}
                >
                  <Icon className="size-4" />
                  {MATERIAL_REQUEST_STEP_CONFIG[status as Exclude<MaterialRequestStatus, 'pending'>]
                    .confirmLabel}
                </Button>
              );
            })}
          </div>
        ) : (
          !isRejected && (
            <p className="flex items-start gap-2 text-xs text-emerald-700">
              <PackageCheck className="mt-0.5 size-3.5 shrink-0" />
              Fulfilled — the material reached the site and this request is closed.
            </p>
          )
        )}

        {request.status === 'approved' && (
          <p className="mt-3 rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            Approved requests are what the Procurement module (Module 6) turns into a Purchase
            Order. Until it is built, the remaining steps are marked here by hand.
          </p>
        )}

        {request.decision_note && !isRejected && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            {request.decision_note}
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={action !== null && config !== null}
        title={config?.title ?? ''}
        subtitle={request.code}
        tone={config?.tone ?? 'default'}
        icon={action ? ICONS[action] : undefined}
        confirmLabel={config?.confirmLabel ?? 'Confirm'}
        message={config?.message}
        busy={busy}
        onCancel={() => setAction(null)}
        onConfirm={confirm}
      >
        {action === 'approved' && (
          <div className="space-y-3">
            {request.items.map((item) => (
              <div key={item.id} className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.item_name}</p>
                  <p className="text-xs text-ink-muted">
                    asked for {item.quantity_requested} {item.unit}
                  </p>
                </div>
                <Field label="Approve" className="w-28 shrink-0">
                  <TextInput
                    type="number"
                    min={0}
                    step="any"
                    value={quantities[item.id] ?? ''}
                    onChange={(e) =>
                      setQuantities((q) => ({ ...q, [item.id]: e.target.value }))
                    }
                  />
                </Field>
              </div>
            ))}
          </div>
        )}

        {config?.needsNote && (
          <Field label="Reason (required)" error={error || undefined}>
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is the request being turned down?"
              invalid={Boolean(error)}
            />
          </Field>
        )}

        {action && !config?.needsNote && (
          <Field label="Note">
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — supplier, expected delivery, anything worth recording"
            />
          </Field>
        )}
      </ConfirmDialog>
    </>
  );
}
