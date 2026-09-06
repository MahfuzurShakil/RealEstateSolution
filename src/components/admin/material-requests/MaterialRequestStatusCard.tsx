'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight,
  Ban,
  Check,
  PackageCheck,
  ShoppingCart,
  ThumbsUp,
  Truck,
  Warehouse,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { MaterialRequestStatus } from '@/lib/db/types';
import { canApprove, canEdit } from '@/lib/domain/access';
import {
  MATERIAL_REQUEST_PIPELINE,
  MATERIAL_REQUEST_STATUS_META,
  MATERIAL_REQUEST_STEP_CONFIG,
  REQUEST_STEP_OWNER,
  manualNextRequestStatuses,
} from '@/lib/domain/site-progress';
import type { MaterialRequestWithRelations } from '@/lib/repositories';
import { materialRequestRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { StockTransferModal } from '@/components/admin/procurement/StockTransferModal';

const ICONS: Record<Exclude<MaterialRequestStatus, 'pending'>, typeof ThumbsUp> = {
  approved: ThumbsUp,
  rejected: Ban,
  ordered: ShoppingCart,
  received: Warehouse,
  delivered: Truck,
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
  const { role, userId } = useMockSession();
  /*
   * Section 9.6 gives Material Request "Create (assigned)" to a Site Manager
   * and "Approve" to Procurement and the Project Manager. Without this check
   * the decision buttons rendered for everybody who could open the page, so
   * the engineer who raised the request could approve it himself — the one
   * separation the workflow exists to keep.
   *
   * Phase A stops at the role. Which *projects* an approver may act on is the
   * "(assigned)" half of 9.6, and enforcing that in the browser would be a
   * control the user can undo from devtools (OPEN-ITEMS 1.9).
   */
  const mayDecide = canApprove(role, 'material_request');
  /*
   * Deciding and buying are different jobs. A Project Manager approves a
   * request for his own site (9.6) but only *views* Procurement, and a Site
   * Manager has no procurement access at all — yet both were shown "Raise
   * Purchase Order", a link to a page that would refuse to open.
   */
  const mayProcure = canEdit(role, 'procurement');
  const [action, setAction] = useState<Exclude<MaterialRequestStatus, 'pending'> | null>(null);
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const next = manualNextRequestStatuses(request.status);
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

        {next.length > 0 && !mayDecide ? (
          <p className="rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            Waiting on a decision from Procurement or the project manager. Raising the request is
            where this role&rsquo;s part ends (Section 9.6).
          </p>
        ) : next.length > 0 ? (
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
          request.status === 'fulfilled' && (
            <p className="flex items-start gap-2 text-xs text-emerald-700">
              <PackageCheck className="mt-0.5 size-3.5 shrink-0" />
              The site confirmed it arrived. This request is closed.
            </p>
          )
        )}

        {/*
          Module 6 drives the rest of the lifecycle: raising a Purchase Order
          marks the request `ordered`, and a Goods Receipt that completes that
          order closes it as `fulfilled` (Section 7.2). So the approved state
          offers the action that actually moves it, not a button that only
          renames the status.
        */}
        {request.status === 'approved' && !mayProcure && (
          <p className="mt-3 rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            Approved. Procurement takes it from here — either a purchase order, or a transfer from
            a store that already holds the material.
          </p>
        )}

        {request.status === 'approved' && mayProcure && (
          <div className="mt-3 space-y-2">
            <Link href={`/admin/purchase-orders/new?request=${request.id}`}>
              <Button size="sm" className="w-full">
                <ShoppingCart className="size-4" /> Raise Purchase Order
              </Button>
            </Link>
            {/*
              Section 7.8a gives Procurement a second way out of an approved
              request: if the material is already in the central store, move it
              across instead of buying more. Only the purchase route existed, so
              anyone taking this one left the request sitting on Approved with
              the material already on site.
            */}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowLeftRight className="size-4" /> Meet from central stock
            </Button>
            <p className="rounded-xl border border-hairline p-3 text-xs text-ink-muted">
              The request moves to Ordered on its own when a purchase order is placed, and to In
              Store once that order has been fully received. Transferring the material from a store
              that already holds it reaches In Store straight away — nothing is bought. The site
              closes it from there.
            </p>
          </div>
        )}

        {request.status === 'ordered' && (
          <p className="mt-3 rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            Being bought now. It reaches In Store by itself once the purchase order behind it is
            fully received — nobody marks that by hand. Closing it is the site&rsquo;s own step.
          </p>
        )}

        {request.decision_note && !isRejected && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            {request.decision_note}
          </p>
        )}
      </Card>

      <StockTransferModal
        open={transferOpen}
        defaults={{
          to_project_id: request.project_id,
          item_id: request.items[0]?.item_id ?? null,
          request_id: request.id,
          request_code: request.code,
        }}
        onClose={() => setTransferOpen(false)}
      />

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
