'use client';

import { useState } from 'react';
import { Ban, Check, PackageCheck, Send } from 'lucide-react';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, TextArea } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { PurchaseOrderStatus } from '@/lib/db/types';
import {
  PURCHASE_ORDER_PIPELINE,
  PURCHASE_ORDER_STATUS_META,
  allowedNextPoStatuses,
  outstanding,
} from '@/lib/domain/procurement';
import type { PurchaseOrderWithRelations } from '@/lib/repositories';
import { purchaseOrderRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

const STEP_CONFIG: Record<
  'ordered' | 'cancelled',
  { title: string; message: string; confirmLabel: string; tone: 'default' | 'danger'; needsNote: boolean }
> = {
  ordered: {
    title: 'Place this order',
    message:
      'The order is committed to the supplier and can be received against. If it came from a material request, the site is told its request is now on order.',
    confirmLabel: 'Place order',
    tone: 'default',
    needsNote: false,
  },
  cancelled: {
    title: 'Cancel this order',
    message:
      'Only the quantity that has not arrived yet is cancelled. Anything already received stays in stock and on the record — a delivery cannot be un-delivered. A reason is required.',
    confirmLabel: 'Cancel order',
    tone: 'danger',
    needsNote: true,
  },
};

const ICONS = { ordered: Send, cancelled: Ban } as const;

/**
 * The Section 7.4 lifecycle gate.
 *
 * Only `ordered` and `cancelled` are ever chosen by a person —
 * `partially_received` and `received` fall out of the goods receipts
 * (Section 7.6), the same way a work item's status falls out of its reported
 * percentage in Module 5. A dropdown that could mark an order "Received" with
 * nothing actually received would put material in the books that is not in the
 * store.
 */
export function PurchaseOrderStatusCard({ order }: { order: PurchaseOrderWithRelations }) {
  const { userId } = useMockSession();
  const [action, setAction] = useState<'ordered' | 'cancelled' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = allowedNextPoStatuses(order.status).filter(
    (s): s is 'ordered' | 'cancelled' => s === 'ordered' || s === 'cancelled',
  );
  const config = action ? STEP_CONFIG[action] : null;
  const isCancelled = order.status === 'cancelled';
  const currentIndex = PURCHASE_ORDER_PIPELINE.indexOf(order.status);
  const voided = order.items.reduce(
    (sum, item) => sum + outstanding(item) * (Number(item.unit_price) || 0),
    0,
  );

  async function confirm() {
    if (!action || !config) return;
    if (config.needsNote && !note.trim()) {
      setError('A reason is required');
      return;
    }
    setBusy(true);
    try {
      await purchaseOrderRepository.setStatus(order.id, action as PurchaseOrderStatus, {
        note: note.trim() ? `${config.title}: ${note.trim()}` : null,
        actor: userId,
      });
      setAction(null);
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Order Status"
          action={
            <Badge tone={PURCHASE_ORDER_STATUS_META[order.status].tone}>
              {PURCHASE_ORDER_STATUS_META[order.status].label}
            </Badge>
          }
        />

        {isCancelled ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">Order cancelled</p>
            <p className="mt-1 text-xs text-red-600">
              {order.totals.received_value > 0
                ? `${formatBdt(order.totals.received_value)} had already arrived and stays in stock; the remaining ${formatBdt(order.totals.value - order.totals.received_value)} was voided.`
                : 'Nothing had been received, so the whole order was voided.'}
            </p>
          </div>
        ) : (
          <ol className="mb-4 space-y-2">
            {PURCHASE_ORDER_PIPELINE.map((step, i) => {
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
                    {PURCHASE_ORDER_STATUS_META[step].label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mb-4 rounded-xl border border-hairline p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
            <span>Received</span>
            <span className="font-medium text-ink">{order.totals.received_pct}% by value</span>
          </div>
          <ProgressBar value={order.totals.received_pct} size="sm" />
          <p className="mt-2 text-xs text-ink-muted">
            {formatBdt(order.totals.received_value)} of {formatBdt(order.totals.value)} delivered
            {!isCancelled && voided > 0 && ` · ${formatBdt(voided)} still to come`}
          </p>
        </div>

        {next.length > 0 ? (
          <div className="space-y-2">
            {next.map((status) => {
              const Icon = ICONS[status];
              return (
                <Button
                  key={status}
                  size="sm"
                  variant={status === 'cancelled' ? 'danger' : 'primary'}
                  className="w-full"
                  onClick={() => {
                    setAction(status);
                    setNote('');
                    setError('');
                  }}
                >
                  <Icon className="size-4" /> {STEP_CONFIG[status].confirmLabel}
                </Button>
              );
            })}
          </div>
        ) : (
          !isCancelled && (
            <p className="flex items-start gap-2 text-xs text-emerald-700">
              <PackageCheck className="mt-0.5 size-3.5 shrink-0" />
              Fully received — everything ordered has reached the store.
            </p>
          )
        )}

        {order.status === 'draft' && (
          <p className="mt-3 rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            A draft is not committed to anyone: nothing can be received against it, and the material
            request behind it still reads as awaiting purchase.
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={action !== null && config !== null}
        title={config?.title ?? ''}
        subtitle={order.code}
        tone={config?.tone ?? 'default'}
        icon={action ? ICONS[action] : undefined}
        confirmLabel={config?.confirmLabel ?? 'Confirm'}
        message={config?.message}
        busy={busy}
        onCancel={() => setAction(null)}
        onConfirm={confirm}
      >
        {action === 'cancelled' && order.totals.received_value > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            {formatBdt(order.totals.received_value)} has already been received into stock and will
            not be reversed. Only {formatBdt(voided)} of undelivered material is being cancelled.
          </div>
        )}
        {config?.needsNote ? (
          <Field label="Reason (required)" error={error || undefined}>
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is the order being cancelled?"
              invalid={Boolean(error)}
            />
          </Field>
        ) : (
          <Field label="Note">
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — promised delivery date, who confirmed it"
            />
          </Field>
        )}
      </ConfirmDialog>
    </>
  );
}
