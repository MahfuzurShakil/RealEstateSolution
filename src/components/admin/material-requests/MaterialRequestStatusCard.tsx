'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
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
import { materialRequestRepository, purchaseOrderRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { StockTransferModal } from '@/components/admin/procurement/StockTransferModal';

const ICONS: Record<Exclude<MaterialRequestStatus, 'pending'>, typeof ThumbsUp> = {
  approved: ThumbsUp,
  rejected: Ban,
  ordered: ShoppingCart,
  received: Warehouse,
  delivered: Truck,
  partially_received: PackageCheck,
  fulfilled: PackageCheck,
  cancelled: Ban,
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

  /*
   * Client feedback 2026-10-17: one request is bought from several suppliers.
   * The first order moves it to Ordered, but whatever no order covers yet is
   * still to buy — so ordering stays open while any line has something left.
   */
  const leftToOrder = useLiveQuery(
    () => purchaseOrderRepository.leftToOrder(request.id),
    [request.id, request.status],
  );
  const linesLeft = request.items.filter((i) => (leftToOrder?.get(i.id) ?? 0) > 0);
  const stillBuying = ['approved', 'ordered', 'partially_received'].includes(request.status);
  const mayOrderMore = stillBuying && mayProcure && linesLeft.length > 0;

  /*
   * Construction review 2026-10-11 — who may take each step: the PM approves
   * or rejects; whoever may raise a request may withdraw it while it waits;
   * the site team or the PM closes it short.
   */
  const mayRaise = canEdit(role, 'material_request');
  const maySite = canEdit(role, 'site_progress');
  const next = manualNextRequestStatuses(request.status).filter((s) =>
    s === 'cancelled' ? mayRaise || mayDecide : s === 'fulfilled' ? mayDecide || maySite : mayDecide,
  );
  const waitingOnOthers = manualNextRequestStatuses(request.status).length > 0 && next.length === 0;
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
    if (action === 'approved') {
      const cut = request.items.some((i) => {
        const v = quantities[i.id]?.trim();
        return v !== undefined && v !== '' && Number(v) < i.quantity_requested;
      });
      // the site needs to know why it is getting less than it asked for
      if (cut && !note.trim()) {
        setError('Some lines are cut: say why in the note, so the site knows');
        return;
      }
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not be saved.');
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

        {waitingOnOthers ? (
          <p className="rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            {request.status === 'pending'
              ? 'Waiting for the Project Manager to approve, cut or reject it.'
              : 'Closing it short is for the site or the Project Manager.'}
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
              Received at site. This request is closed.
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
            Approved. Procurement takes it from here — an order delivered to the site or the main
            store, or material sent from the main store.
          </p>
        )}

        {mayOrderMore && request.status !== 'approved' && (
          <div className="mt-3 space-y-2">
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {linesLeft.length} of {request.items.length} line{request.items.length === 1 ? '' : 's'}{' '}
              not on any order yet:{' '}
              {linesLeft.map((i) => `${i.item_name} (${leftToOrder?.get(i.id)} ${i.unit})`).join(', ')}.
            </p>
            <Link href={`/admin/purchase-orders/new?request=${request.id}`}>
              <Button size="sm" className="w-full">
                <ShoppingCart className="size-4" /> Order the rest
              </Button>
            </Link>
          </div>
        )}

        {request.status === 'approved' && mayProcure && (
          <div className="mt-3 space-y-2">
            <Link href={`/admin/purchase-orders/new?request=${request.id}`}>
              <Button size="sm" className="w-full">
                <ShoppingCart className="size-4" /> Raise Purchase Order
              </Button>
            </Link>
            <p className="text-[11px] text-ink-muted">
              Different suppliers for different items? Raise one order per supplier and remove the
              lines that supplier is not giving — the rest stays here to order.
            </p>
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
              <ArrowLeftRight className="size-4" /> Send from main store
            </Button>
            <p className="rounded-xl border border-hairline p-3 text-xs text-ink-muted">
              The request moves on by itself: Ordered when an order is placed, On the way when
              material is sent from the main store, Partly received and Received as the site counts
              it in.
            </p>
          </div>
        )}

        {request.status === 'ordered' && (
          <p className="mt-3 rounded-xl border border-hairline p-3 text-xs text-ink-muted">
            Being bought now. It moves to Partly received and Received as the site counts the
            deliveries in — nobody marks that by hand.
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
        size={action === 'approved' ? 'lg' : 'sm'}
        busy={busy}
        onCancel={() => setAction(null)}
        onConfirm={confirm}
      >
        {action === 'approved' && (
          <ApproveLines
            items={request.items}
            quantities={quantities}
            onChange={(id, value) => setQuantities((q) => ({ ...q, [id]: value }))}
            onAsked={() =>
              setQuantities(
                Object.fromEntries(request.items.map((i) => [i.id, String(i.quantity_requested)])),
              )
            }
          />
        )}

        {config?.needsNote && (
          <Field label="Reason (required)" error={error || undefined}>
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why?"
              invalid={Boolean(error)}
            />
          </Field>
        )}

        {action && !config?.needsNote && (
          <Field
            label={action === 'approved' ? 'Note (required when a line is cut)' : 'Note'}
            error={error || undefined}
          >
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

/**
 * The approval sheet (client feedback 2026-10-17). A request can carry a dozen
 * lines, so it is a table: what was asked, what is approved, and a flag on
 * every line that is cut or dropped. Only quantities move here — the items
 * themselves are the site's request and are not swapped by the approver; a
 * wrong item is rejected back with a reason. 0 drops a line.
 */
function ApproveLines({
  items,
  quantities,
  onChange,
  onAsked,
}: {
  items: MaterialRequestWithRelations['items'];
  quantities: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onAsked: () => void;
}) {
  const state = (item: MaterialRequestWithRelations['items'][number]) => {
    const raw = quantities[item.id] ?? '';
    const value = Number(raw);
    if (raw.trim() === '') return 'as_asked' as const;
    if (value === 0) return 'dropped' as const;
    if (value < item.quantity_requested) return 'cut' as const;
    if (value > item.quantity_requested) return 'over' as const;
    return 'as_asked' as const;
  };
  const cut = items.filter((i) => state(i) === 'cut').length;
  const dropped = items.filter((i) => state(i) === 'dropped').length;

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {items.length} line{items.length === 1 ? '' : 's'}
          {cut > 0 && <span className="text-amber-700"> · {cut} cut</span>}
          {dropped > 0 && <span className="text-red-600"> · {dropped} dropped</span>}
        </p>
        <Button size="sm" variant="outline" onClick={onAsked}>
          Approve all as asked
        </Button>
      </div>

      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-hairline">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-ink-muted">
            <tr>
              <th className="w-8 px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Asked</th>
              <th className="w-44 px-3 py-2 font-medium">Approve</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const s = state(item);
              const value = Number(quantities[item.id] ?? '');
              return (
                <tr
                  key={item.id}
                  className={cn(
                    'border-t border-hairline',
                    s === 'dropped' && 'bg-red-50/60',
                    s === 'cut' && 'bg-amber-50/60',
                  )}
                >
                  <td className="px-3 py-2 align-middle text-xs text-ink-muted">{index + 1}</td>
                  <td className="px-3 py-2 align-middle">
                    <span className="block font-medium text-ink">{item.item_name}</span>
                    {s === 'dropped' && <span className="text-xs text-red-600">Dropped</span>}
                    {s === 'cut' && (
                      <span className="text-xs text-amber-700">
                        Cut by {Math.round((item.quantity_requested - value) * 1000) / 1000} {item.unit}
                      </span>
                    )}
                    {s === 'over' && <span className="text-xs text-blue-700">More than asked</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-middle text-ink-muted">
                    {item.quantity_requested} {item.unit}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center gap-1.5">
                      <TextInput
                        type="number"
                        min={0}
                        step="any"
                        aria-label={`Approve quantity for ${item.item_name}`}
                        className="py-1.5"
                        value={quantities[item.id] ?? ''}
                        onChange={(e) => onChange(item.id, e.target.value)}
                      />
                      <span className="w-10 shrink-0 text-xs text-ink-muted">{item.unit}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-muted">
        Only quantities change here — swapping an item is the site&apos;s call. Enter 0 to drop a
        line; a wrong item is better rejected with a reason so the site raises it again.
      </p>
    </div>
  );
}
