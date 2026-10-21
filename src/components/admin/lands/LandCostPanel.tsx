'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calculator,
  Check,
  HandCoins,
  Handshake,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { StepAttachments } from '@/components/admin/documents/StepAttachments';
import { DocumentViewer } from '@/components/admin/documents/DocumentsPanel';
import { useMockSession } from '@/lib/auth/mock-session';
import type { AcquisitionCostHead, DocumentRecord, SupplierPaymentMethod } from '@/lib/db/types';
import {
  ACQUISITION_COST_HEADS,
  ACQUISITION_COST_HEAD_LABEL,
  SUPPLIER_PAYMENT_METHODS,
} from '@/lib/db/types';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import {
  bankAccountRepository,
  documentRepository,
  landAcquisitionCostRepository,
  landCostRepository,
  landDevelopmentRepository,
  type AcquisitionCostLine,
  type LandCostPayment,
  type LandWithRelations,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';


/**
 * The Land Cost tab (2026-10-21) — the whole money story of one land.
 *
 * Three moments, one sheet:
 *  1. **Budget** — set per cost head before the deal, and revised through the
 *     site visit, feasibility, legal checks and negotiation.
 *  2. **Deal** — once the agreement is made, what each head actually came to.
 *  3. **Paid** — every payment, recorded here against a head, with the
 *     account it left and the receipts.
 * Pending is the deal (or the budget, before there is one) less what is paid.
 *
 * Replaces the instalment plan: a small developer pays as the deal goes, and
 * a schedule that had to be kept in step with reality was work nobody did.
 */
export function LandCostPanel({ land }: { land: LandWithRelations }) {
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState<PayTarget | 'any' | null>(null);
  const [extraHeads, setExtraHeads] = useState<AcquisitionCostHead[]>([]);

  const sheet = useLiveQuery(() => landAcquisitionCostRepository.sheetForLand(land.id), [land.id]);
  const payments = useLiveQuery(() => landCostRepository.paymentsForLand(land.id), [land.id]);

  if (!sheet || !payments) return <p className="text-sm text-ink-muted">Loading…</p>;

  /* Only the heads this land uses, so a fresh land is not ten rows of dashes. */
  const used = sheet.lines.filter(
    (l) => l.estimated > 0 || l.agreed != null || l.actual > 0 || extraHeads.includes(l.cost_head),
  );
  const rows = used.length ? used : sheet.lines.filter((l) => l.cost_head === 'land_price');
  const unused = sheet.lines.filter((l) => !rows.includes(l));

  const hasDeal = sheet.agreedTotal != null;
  /* the whole land: acquisition plus development, which is paid from here too */
  const dev = sheet.development;
  const hasDevelopment = dev.lines.length > 0;
  const total = {
    budget: sheet.estimatedTotal + dev.estimated,
    deal:
      hasDeal || dev.agreed != null
        ? (sheet.agreedTotal ?? sheet.estimatedTotal) + (dev.agreed ?? dev.estimated)
        : null,
    paid: sheet.actualTotal + dev.actual,
    pending: sheet.pendingTotal + dev.pending,
  };
  const target = total.deal ?? total.budget;
  const paidPct = target > 0 ? Math.min(100, Math.round((total.paid / target) * 100)) : 0;
  const stage = total.paid > 0 ? 3 : hasDeal ? 2 : 1;

  return (
    <div className="space-y-5">
      {/* the four numbers the owner asks for */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Calculator} label="Budget" value={formatBdt(total.budget)} hint="What you planned" />
        <Kpi
          icon={Handshake}
          label="Deal amount"
          value={total.deal != null ? formatBdt(total.deal) : 'Not agreed yet'}
          hint={
            total.deal != null && total.deal !== total.budget
              ? `${total.deal > total.budget ? '+' : '−'}${formatBdt(Math.abs(total.deal - total.budget))} vs budget`
              : 'What was agreed'
          }
          tone={total.deal != null && total.deal > total.budget ? 'warn' : undefined}
        />
        <Kpi icon={Wallet} label="Paid" value={formatBdt(total.paid)} hint={`${payments.length} payment${payments.length === 1 ? '' : 's'}`} tone="good" />
        <Kpi
          icon={HandCoins}
          label="Pending"
          value={formatBdt(total.pending)}
          hint={total.deal != null ? 'Still to pay on the deal' : 'Against the budget'}
          tone={total.pending > 0 ? 'warn' : 'good'}
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink">
              Cost by head
              <span className="ml-2 text-xs font-normal text-ink-muted">amounts in BDT</span>
            </h3>
            <StageGuide stage={stage} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> {hasDeal ? 'Edit budget & deal' : 'Edit budget'}
            </Button>
            <Button size="sm" onClick={() => setPaying('any')}>
              <Plus className="size-4" /> Record payment
            </Button>
          </div>
        </div>

        {/*
          2026-10-21 — calmer: the currency is said once, every amount is in one
          colour, and only what is still owed is coloured. Each section's
          subtotal sits on its own header band, so the rows are not broken up
          by total lines; a thin bar under each head shows how much is paid.
        */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                <th className="w-[34%] px-3 pb-2 text-left">Cost head</th>
                <th className="px-3 pb-2 text-right">Budget</th>
                <th className="px-3 pb-2 text-right">Deal</th>
                <th className="px-3 pb-2 text-right">Paid</th>
                <th className="px-3 pb-2 text-right">Pending</th>
                <th className="w-20 px-3 pb-2" />
              </tr>
            </thead>
            <tbody>
              {hasDevelopment && (
                <GroupRow
                  label="Land acquisition"
                  budget={sheet.estimatedTotal}
                  deal={sheet.agreedTotal}
                  paid={sheet.actualTotal}
                  pending={sheet.pendingTotal}
                />
              )}
              {rows.map((line) => (
                <CostRow
                  key={line.cost_head}
                  label={ACQUISITION_COST_HEAD_LABEL[line.cost_head]}
                  note={
                    line.historic > 0
                      ? `incl. ${amount(line.historic)} paid before this system`
                      : (line.remarks ?? undefined)
                  }
                  budget={line.estimated}
                  deal={line.agreed}
                  dealFallback={hasDeal}
                  paid={line.actual}
                  pending={line.pending}
                  onPay={() => setPaying({ kind: 'head', head: line.cost_head })}
                />
              ))}
              {hasDevelopment && (
                <>
                  <GroupRow
                    label="Land development"
                    budget={dev.estimated}
                    deal={dev.agreed}
                    paid={dev.actual}
                    pending={dev.pending}
                  />
                  {dev.lines.map((line) => (
                    <CostRow
                      key={line.activity_id}
                      label={line.label}
                      note={line.status === 'cancelled' ? 'cancelled' : undefined}
                      muted={line.status === 'cancelled'}
                      budget={line.estimated}
                      deal={line.agreed}
                      paid={line.actual}
                      pending={line.pending}
                      onPay={
                        line.status === 'cancelled'
                          ? undefined
                          : () => setPaying({ kind: 'activity', id: line.activity_id })
                      }
                    />
                  ))}
                </>
              )}
            </tbody>
            <tfoot>
              <tr className="text-ink">
                <td className="border-t-2 border-ink/10 px-3 pt-3.5 font-semibold">
                  {hasDevelopment ? 'Total land cost' : 'Total'}
                </td>
                <td className="border-t-2 border-ink/10 px-3 pt-3.5 text-right font-semibold tabular-nums text-ink-muted">
                  {amount(total.budget)}
                </td>
                <td className="border-t-2 border-ink/10 px-3 pt-3.5 text-right font-semibold tabular-nums">
                  {amount(total.deal)}
                </td>
                <td className="border-t-2 border-ink/10 px-3 pt-3.5 text-right font-semibold tabular-nums">
                  {amount(total.paid)}
                </td>
                <td className="border-t-2 border-ink/10 px-3 pt-3.5 text-right">
                  <PendingCell pending={total.pending} paid={total.paid} strong />
                </td>
                <td className="border-t-2 border-ink/10" />
              </tr>
            </tfoot>
          </table>
        </div>

        {hasDeal && rows.some((l) => l.agreed == null && l.estimated > 0) && (
          <p className="mt-2 text-xs text-ink-muted">
            A head with no deal amount yet is counted at its budget (shown in grey italics).
          </p>
        )}

        {/* paid against the target, at a glance */}
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-ink-muted">
            <span>
              {formatBdt(total.paid)} paid of {formatBdt(target)} {total.deal != null ? 'agreed' : 'budgeted'}
            </span>
            <span className="tabular-nums">{paidPct === 0 && total.paid > 0 ? '<1' : paidPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} />
          </div>
        </div>

        {unused.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-3">
            <span className="mr-1 text-xs text-ink-muted">Add a head:</span>
            {unused.map((l) => (
              <button
                key={l.cost_head}
                type="button"
                onClick={() => setExtraHeads([...extraHeads, l.cost_head])}
                className="rounded-full border border-hairline bg-white px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-admin-300 hover:text-admin-700"
              >
                + {ACQUISITION_COST_HEAD_LABEL[l.cost_head]}
              </button>
            ))}
          </div>
        )}

        {sheet.unclassifiedActual > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
            <Receipt className="mt-0.5 size-4 shrink-0 text-admin-600" />
            <span>
              <strong className="text-ink">{formatBdt(sheet.unclassifiedActual)}</strong> was paid
              against this land without a cost head, so it is in the paid total but on no line.{' '}
              <Link href={`/admin/expenses?land=${land.id}`} className="text-admin-700 underline">
                Set the head in the cost ledger
              </Link>
            </span>
          </p>
        )}

        {/* a JV is mostly paid in flats — shown beside the cash, never added to it */}
        {land.acquisition_type === 'joint_venture' && (
          <p className="mt-4 rounded-xl border border-admin-100 bg-admin-50/60 px-3 py-2.5 text-xs text-admin-800">
            <strong>Landowner&rsquo;s share (non-cash):</strong>{' '}
            {sheet.landownerShare
              ? `${sheet.landownerShare.units} unit${sheet.landownerShare.units === 1 ? '' : 's'} worth ${formatBdt(sheet.landownerShare.value)} at list price.`
              : 'valued once a project on this land allocates units to the landowner.'}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Payments"
          action={
            payments.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setPaying('any')}>
                <Plus className="size-4" /> Record payment
              </Button>
            ) : undefined
          }
        />
        {payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payments yet"
            description="Each time you pay — the owner, the registry, the lawyer, the broker — record it here against its cost head, with the account it left and the receipt."
            action={
              <Button onClick={() => setPaying('any')}>
                <Plus className="size-4" /> Record payment
              </Button>
            }
          />
        ) : (
          <PaymentsList payments={payments} />
        )}
      </Card>

      {editing && <AmountsDialog land={land} lines={sheet.lines} onClose={() => setEditing(false)} />}
      {paying && (
        <PaymentDialog
          land={land}
          target={paying === 'any' ? { kind: 'head', head: rows[0]?.cost_head ?? 'land_price' } : paying}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}

/** What a payment is for: a cost head, or a land development activity. */
export type PayTarget = { kind: 'head'; head: AcquisitionCostHead } | { kind: 'activity'; id: string };

/** An amount without the currency — the table says "amounts in BDT" once. */
const NUMBER = new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 });
function amount(n: number | null | undefined): string {
  return n ? NUMBER.format(n) : '—';
}

/** Pending is the one figure with colour: amber while owed, a green tick when cleared. */
function PendingCell({ pending, paid, strong }: { pending: number; paid: number; strong?: boolean }) {
  if (pending > 0) {
    return (
      <span className={cn('tabular-nums text-amber-700', strong ? 'font-semibold' : 'font-medium')}>
        {amount(pending)}
      </span>
    );
  }
  if (paid > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <Check className="size-3.5" /> Paid
      </span>
    );
  }
  return <span className="text-slate-300">—</span>;
}

/** A section's name with its subtotals — the band that heads each group. */
function GroupRow({
  label,
  budget,
  deal,
  paid,
  pending,
}: {
  label: string;
  budget: number;
  deal: number | null;
  paid: number;
  pending: number;
}) {
  const cell = 'bg-slate-50 px-3 py-2 text-right text-xs font-semibold tabular-nums';
  return (
    <tr className="border-t border-hairline">
      <td className="bg-slate-50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink">{label}</span>
      </td>
      <td className={cn(cell, 'text-ink-muted')}>{amount(budget)}</td>
      <td className={cn(cell, 'text-ink')}>{amount(deal)}</td>
      <td className={cn(cell, 'text-ink')}>{amount(paid)}</td>
      <td className={cell}>
        <PendingCell pending={pending} paid={paid} />
      </td>
      <td className="bg-slate-50" />
    </tr>
  );
}

/** One cost head or development activity, with a thin paid-so-far bar. */
function CostRow({
  label,
  note,
  muted,
  budget,
  deal,
  dealFallback,
  paid,
  pending,
  onPay,
}: {
  label: string;
  note?: string;
  muted?: boolean;
  budget: number;
  deal: number | null;
  /** the land has a deal — a head without one is counted at its budget */
  dealFallback?: boolean;
  paid: number;
  pending: number;
  onPay?: () => void;
}) {
  const target = deal ?? budget;
  const pct = target > 0 ? Math.min(100, Math.round((paid / target) * 100)) : 0;
  return (
    <tr className={cn('group border-t border-hairline', muted && 'opacity-60')}>
      <td className="px-3 py-3">
        <p className="text-ink">{label}</p>
        {note && <p className="text-xs text-ink-muted">{note}</p>}
        {target > 0 && (
          <div className="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-slate-100" title={`${pct}% paid`}>
            <div
              className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-admin-400')}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-ink-muted">{amount(budget)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-ink">
        {deal != null ? (
          amount(deal)
        ) : dealFallback && budget > 0 ? (
          <span className="italic text-slate-400" title="No deal amount yet — counted at its budget">
            {amount(budget)}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-ink">
        {paid > 0 ? amount(paid) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-3 text-right">
        <PendingCell pending={pending} paid={paid} />
      </td>
      <td className="px-3 py-3 text-right">
        {onPay && pending > 0 && (
          <Button size="sm" variant="outline" onClick={onPay} className="h-8 gap-1 px-2.5 text-xs">
            <Wallet className="size-3.5" /> Pay
          </Button>
        )}
      </td>
    </tr>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
        <Icon className="size-4 text-admin-600" />
        {label}
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-ink">{value}</p>
      <p
        className={cn(
          'mt-0.5 text-xs',
          tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-ink-muted',
        )}
      >
        {hint}
      </p>
    </div>
  );
}

/** Where the land is in budget → deal → payments, so the next move is obvious. */
function StageGuide({ stage }: { stage: 1 | 2 | 3 }) {
  const steps = ['Budget before the deal', 'Deal amount at agreement', 'Payments as you pay'];
  return (
    <ol className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {steps.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-slate-300">→</span>}
            <span
              className={cn(
                'grid size-4 place-items-center rounded-full text-[10px] font-semibold',
                n < stage
                  ? 'bg-emerald-500 text-white'
                  : n === stage
                    ? 'bg-admin-500 text-white'
                    : 'bg-slate-100 text-slate-500',
              )}
            >
              {n < stage ? <Check className="size-2.5" /> : n}
            </span>
            <span className={n === stage ? 'font-medium text-ink' : 'text-ink-muted'}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Every payment against the land as a table, newest first, ten to a page
 * (2026-10-21) — a land paid in thirty instalments was a long list of cards.
 */
function PaymentsList({ payments }: { payments: LandCostPayment[] }) {
  const [viewing, setViewing] = useState<{ doc: DocumentRecord; docs: DocumentRecord[] } | null>(null);
  const [removing, setRemoving] = useState<LandCostPayment | null>(null);
  const paging = usePagination(payments, 10);
  const total = payments.reduce((sum, p) => sum + (Number(p.expense.amount) || 0), 0);

  async function openFiles(p: LandCostPayment) {
    const docs = await documentRepository.listForEntity('expense', p.expense.id);
    if (docs[0]) setViewing({ doc: docs[0], docs });
  }

  const th = 'px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted';
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(th, 'text-left')}>Date</th>
              <th className={cn(th, 'text-left')}>Paid for</th>
              <th className={cn(th, 'text-left')}>Paid to</th>
              <th className={cn(th, 'text-left')}>From account</th>
              <th className={cn(th, 'text-right')}>Amount</th>
              <th className={cn(th, 'text-center')}>Receipt</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {paging.pageRows.map((p) => (
              <tr key={p.expense.id} className="border-t border-hairline hover:bg-slate-50/60">
                <td className="whitespace-nowrap px-3 py-3 text-ink">
                  {formatDate(p.expense.expense_date)}
                  <span className="block text-[11px] text-ink-muted">{p.expense.code}</span>
                </td>
                <td className="px-3 py-3 text-ink">
                  {p.headLabel}
                  {p.expense.notes && (
                    <span className="block max-w-[220px] truncate text-xs text-ink-muted" title={p.expense.notes}>
                      {p.expense.notes}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-ink">{p.ownerName ?? p.expense.paid_to}</td>
                <td className="px-3 py-3">
                  {p.accountName ? (
                    <span className="text-ink">{p.accountName}</span>
                  ) : (
                    <span className="text-amber-700">Not recorded</span>
                  )}
                  <span className="block text-xs text-ink-muted">
                    {SUPPLIER_PAYMENT_METHOD_META[p.expense.payment_method]}
                    {p.expense.reference_no ? ` · ${p.expense.reference_no}` : ''}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-ink">
                  {formatBdt(p.expense.amount)}
                </td>
                <td className="px-3 py-3 text-center">
                  {p.fileCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => void openFiles(p)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-admin-700 hover:bg-admin-50"
                    >
                      <Paperclip className="size-3.5" /> {p.fileCount}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">none</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <Button size="sm" variant="ghost" aria-label="Delete payment" onClick={() => setRemoving(p)}>
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/10">
              <td colSpan={4} className="px-3 pt-3 text-sm font-semibold text-ink">
                {payments.length} payment{payments.length === 1 ? '' : 's'}
              </td>
              <td className="whitespace-nowrap px-3 pt-3 text-right font-semibold tabular-nums text-ink">
                {formatBdt(total)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <Pagination
        page={paging.page}
        pageCount={paging.pageCount}
        pageSize={paging.pageSize}
        total={paging.total}
        from={paging.from}
        to={paging.to}
        onPageChange={paging.setPage}
        onPageSizeChange={paging.setPageSize}
        pageSizes={[10, 25, 50]}
        label="payments"
      />

      {viewing && (
        <DocumentViewer
          doc={viewing.doc}
          documents={viewing.docs}
          onSelect={(doc) => setViewing({ ...viewing, doc })}
          onClose={() => setViewing(null)}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Delete payment"
        message={
          removing
            ? `${formatBdt(removing.expense.amount)} to ${removing.expense.paid_to} (${removing.headLabel}) and its receipts will be removed. It also leaves the cost ledger and the account.`
            : ''
        }
        confirmLabel="Delete payment"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await landCostRepository.removePayment(removing.expense.id);
          setRemoving(null);
        }}
      />
    </>
  );
}

/** Budget and deal for every head, on one form. */
function AmountsDialog({
  land,
  lines,
  onClose,
}: {
  land: LandWithRelations;
  lines: AcquisitionCostLine[];
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.cost_head,
        {
          estimated: l.estimated > 0 ? String(l.estimated) : '',
          agreed: l.agreed != null ? String(l.agreed) : '',
        },
      ]),
    ) as Record<AcquisitionCostHead, { estimated: string; agreed: string }>,
  );

  const n = (v: string) => Number(v) || 0;
  const budget = ACQUISITION_COST_HEADS.reduce((s, h) => s + n(values[h].estimated), 0);
  const deal = ACQUISITION_COST_HEADS.reduce((s, h) => s + n(values[h].agreed), 0);
  const set = (head: AcquisitionCostHead, key: 'estimated' | 'agreed', v: string) =>
    setValues((all) => ({ ...all, [head]: { ...all[head], [key]: v } }));

  async function save() {
    setSaving(true);
    try {
      await landAcquisitionCostRepository.setAmounts(
        land.id,
        ACQUISITION_COST_HEADS.map((head) => ({
          head,
          estimated: n(values[head].estimated),
          // notes are left as they are — the sheet's own hints are not notes
          agreed: values[head].agreed.trim() === '' ? null : n(values[head].agreed),
        })),
        userId,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Budget & deal"
      subtitle={`${land.code} · ${land.name}`}
      icon={Calculator}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
        Set the <strong className="text-ink">budget</strong> while you study the land, and change it
        as you learn more. Fill the <strong className="text-ink">deal</strong> column once the
        agreement is made — leave it blank until then.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="pb-2 text-left">Cost head</th>
              <th className="pb-2 pl-3 text-left">Budget</th>
              <th className="pb-2 pl-3 text-left">Deal amount</th>
            </tr>
          </thead>
          <tbody>
            {ACQUISITION_COST_HEADS.map((head) => (
              <tr key={head} className="align-top">
                <td className="py-1.5 pt-3.5 text-ink">{ACQUISITION_COST_HEAD_LABEL[head]}</td>
                <td className="py-1.5 pl-3">
                  <MoneyInput
                    value={values[head].estimated}
                    placeholder="0"
                    onChange={(e) => set(head, 'estimated', e.target.value)}
                  />
                </td>
                <td className="py-1.5 pl-3">
                  <MoneyInput
                    value={values[head].agreed}
                    placeholder="after agreement"
                    onChange={(e) => set(head, 'agreed', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-ink">
              <td className="border-t border-hairline pt-3">Total</td>
              <td className="border-t border-hairline pl-3 pt-3 tabular-nums">{formatBdt(budget)}</td>
              <td className="border-t border-hairline pl-3 pt-3 tabular-nums">{deal ? formatBdt(deal) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}

/** `head:land_price` / `act:<id>` — one select covers both kinds of target. */
const encodeTarget = (t: PayTarget) => (t.kind === 'head' ? `head:${t.head}` : `act:${t.id}`);
function decodeTarget(v: string): PayTarget {
  return v.startsWith('act:')
    ? { kind: 'activity', id: v.slice(4) }
    : { kind: 'head', head: v.slice(5) as AcquisitionCostHead };
}

/**
 * Records one payment against a cost head or a development activity, with
 * the account it left and its receipts. Exported so the Development stage
 * pays from the same form (2026-10-21).
 */
export function PaymentDialog({
  land,
  target: initialTarget,
  onClose,
}: {
  land: LandWithRelations;
  target: PayTarget;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const accounts = useLiveQuery(() => bankAccountRepository.options(), []);
  const sheet = useLiveQuery(() => landAcquisitionCostRepository.sheetForLand(land.id), [land.id]);
  const activities = useLiveQuery(() => landDevelopmentRepository.listForLand(land.id), [land.id]);

  const ownerLabel = (id: string) => land.owners.find((o) => o.id === id)?.owner?.name ?? '';
  const soleOwner = land.owners.length === 1 ? land.owners[0] : undefined;

  const pendingFor = (t: PayTarget) =>
    t.kind === 'head'
      ? (sheet?.lines.find((l) => l.cost_head === t.head)?.pending ?? 0)
      : (activities?.find((a) => a.id === t.id)?.pending ?? 0);
  const payeeFor = (t: PayTarget, ownerMappingId: string) =>
    t.kind === 'head'
      ? t.head === 'land_price'
        ? ownerMappingId
          ? ownerLabel(ownerMappingId)
          : (soleOwner?.owner?.name ?? '')
        : ''
      : (activities?.find((a) => a.id === t.id)?.contractor?.name ?? '');

  const [target, setTarget] = useState<PayTarget>(initialTarget);
  const [form, setForm] = useState({
    amount: '',
    date: todayLocal(),
    accountId: '',
    ownerMappingId: soleOwner?.id ?? '',
    paidTo: '',
    method: 'bank' as SupplierPaymentMethod,
    reference: '',
    notes: '',
  });
  const [prefilled, setPrefilled] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // amount and payee are suggested once the sheet and activities have loaded
  if (!prefilled && sheet && activities) {
    setPrefilled(true);
    const p = pendingFor(initialTarget);
    setForm((f) => ({
      ...f,
      amount: p > 0 ? String(p) : '',
      paidTo: payeeFor(initialTarget, f.ownerMappingId),
    }));
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  function pickTarget(next: PayTarget) {
    setTarget(next);
    setForm((f) => ({
      ...f,
      amount: pendingFor(next) > 0 ? String(pendingFor(next)) : '',
      paidTo: payeeFor(next, f.ownerMappingId),
    }));
  }

  const isPrice = target.kind === 'head' && target.head === 'land_price';
  const liveActivities = (activities ?? []).filter((a) => a.status !== 'cancelled');

  async function save() {
    const next: Record<string, string> = {};
    if (!(Number(form.amount) > 0)) next.amount = 'Enter the amount paid';
    if (!form.accountId) next.accountId = 'Which account did the money leave?';
    if (!form.paidTo.trim()) next.paidTo = 'Who was paid?';
    if (!form.date) next.date = 'When was it paid?';
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSaving(true);
    try {
      await landCostRepository.recordPayment(
        {
          landId: land.id,
          head: target.kind === 'head' ? target.head : 'other',
          activityId: target.kind === 'activity' ? target.id : null,
          amount: Number(form.amount),
          date: form.date,
          accountId: form.accountId,
          paidTo: form.paidTo.trim(),
          method: form.method,
          reference: form.reference.trim() || null,
          notes: form.notes.trim() || null,
          ownerMappingId: isPrice ? form.ownerMappingId || null : null,
          files,
        },
        userId,
      );
      onClose();
    } catch (e) {
      setErrors({ amount: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  }

  const pending = pendingFor(target);
  const amount = Number(form.amount) || 0;
  const targetLabel =
    target.kind === 'head'
      ? ACQUISITION_COST_HEAD_LABEL[target.head]
      : (activities?.find((a) => a.id === target.id)?.activity_type ?? 'this activity');

  return (
    <Modal
      open
      title="Record payment"
      subtitle={`${land.code} · ${land.name}`}
      icon={Wallet}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save payment'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paying for" required>
            <SelectInput
              value={encodeTarget(target)}
              onChange={(e) => pickTarget(decodeTarget(e.target.value))}
            >
              <optgroup label="Land acquisition">
                {ACQUISITION_COST_HEADS.map((h) => (
                  <option key={h} value={`head:${h}`}>
                    {ACQUISITION_COST_HEAD_LABEL[h]}
                  </option>
                ))}
              </optgroup>
              {liveActivities.length > 0 && (
                <optgroup label="Land development">
                  {liveActivities.map((a) => (
                    <option key={a.id} value={`act:${a.id}`}>
                      {a.activity_type}
                    </option>
                  ))}
                </optgroup>
              )}
            </SelectInput>
          </Field>
          <Field
            label="Amount"
            required
            error={errors.amount || undefined}
            hint={pending > 0 ? `${formatBdt(pending)} pending on ${targetLabel}` : undefined}
          >
            <MoneyInput
              value={form.amount}
              placeholder="e.g. 500000"
              invalid={Boolean(errors.amount)}
              onChange={(e) => set('amount', e.target.value)}
            />
          </Field>
        </div>

        {pending > 0 && amount > pending && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This is {formatBdt(amount - pending)} more than is pending on{' '}
            {targetLabel}. It will still be saved.
          </p>
        )}

        {isPrice && land.owners.length > 1 && (
          <Field label="Paid to which owner" hint="Leave as the whole land if it was not split">
            <SelectInput
              value={form.ownerMappingId}
              onChange={(e) => {
                const id = e.target.value;
                setForm((f) => ({ ...f, ownerMappingId: id, paidTo: id ? ownerLabel(id) : f.paidTo }));
              }}
            >
              <option value="">The land as a whole</option>
              {land.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.owner?.name ?? 'Owner'}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paid to" required error={errors.paidTo || undefined}>
            <TextInput
              value={form.paidTo}
              placeholder={isPrice ? 'Owner name' : target.kind === 'activity' ? 'Contractor' : 'e.g. Sub-registry office, Adv. Karim'}
              invalid={Boolean(errors.paidTo)}
              onChange={(e) => set('paidTo', e.target.value)}
            />
          </Field>
          <Field label="Date" required error={errors.date || undefined}>
            <TextInput type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Paid from account" required error={errors.accountId || undefined}>
            <SelectInput
              value={form.accountId}
              invalid={Boolean(errors.accountId)}
              onChange={(e) => set('accountId', e.target.value)}
            >
              <option value="">Select account…</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Method">
            <SelectInput
              value={form.method}
              onChange={(e) => set('method', e.target.value as SupplierPaymentMethod)}
            >
              {SUPPLIER_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {SUPPLIER_PAYMENT_METHOD_META[m]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Reference">
            <TextInput
              value={form.reference}
              placeholder="Cheque no. / TrxID"
              onChange={(e) => set('reference', e.target.value)}
            />
          </Field>
        </div>
        {accounts && accounts.length === 0 && (
          <p className="text-xs text-amber-700">
            No account is set up yet.{' '}
            <Link href="/admin/cash" className="font-medium underline">
              Add one under Cash Position
            </Link>{' '}
            first.
          </p>
        )}

        <StepAttachments
          files={files}
          onChange={setFiles}
          prompt="Money receipt, cheque copy, registry challan"
          error={fileError}
          onError={setFileError}
        />

        <Field label="Note">
          <TextArea
            value={form.notes}
            placeholder="e.g. Second instalment on signing the bayna"
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
