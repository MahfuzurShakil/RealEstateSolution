'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Paperclip, Undo2, Wallet } from 'lucide-react';
import { PayDirectPurchaseModal } from '@/components/admin/finance/PayDirectPurchaseModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SelectInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import { COST_TYPE_META, PAYMENT_OVERDUE_DAYS } from '@/lib/domain/construction-cost';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import {
  bankAccountRepository,
  directPurchasePaymentRepository,
  projectRepository,
  type PendingPurchaseRow,
  type SitePaymentRow,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate } from '@/lib/utils/format';

/** the alerts bell uses the same figure */
const OVERDUE_DAYS = PAYMENT_OVERDUE_DAYS;

/**
 * Payments (DIRECT-PURCHASE-PLAN.md B4): every site cost recorded against a
 * work item lands here as Pending; Finance pays it, all at once or in parts,
 * from an account that holds the money.
 */
export default function PaymentsPage() {
  const { role } = useMockSession();
  const mayPay = canEdit(role, 'finance_expense');
  const [tab, setTab] = useState<'pending' | 'paid'>('pending');
  const [projectId, setProjectId] = useState('');
  const [paying, setPaying] = useState<PendingPurchaseRow | null>(null);
  const [undoing, setUndoing] = useState<SitePaymentRow | null>(null);

  const filter = { project_id: projectId || undefined };
  const pending = useLiveQuery(() => directPurchasePaymentRepository.pending(filter), [projectId]);
  const paid = useLiveQuery(() => directPurchasePaymentRepository.history(filter), [projectId]);
  const position = useLiveQuery(() => bankAccountRepository.position(), []);
  const projects = useLiveQuery(() => projectRepository.list(), []);

  const owed = (pending ?? []).reduce((s, r) => s + r.due, 0);
  const overdue = (pending ?? []).filter((r) => r.age_days > OVERDUE_DAYS);
  const balance = position?.total_balance ?? 0;
  const paidTotal = (paid ?? []).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Site costs waiting to be paid, and what has been paid. Each payment comes out of an account that has to hold the money."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Tile label="Owed to vendors" value={formatBdt(owed)} note={`${pending?.length ?? 0} costs pending`} />
        <Tile
          label={`Older than ${OVERDUE_DAYS} days`}
          value={formatBdt(overdue.reduce((s, r) => s + r.due, 0))}
          note={`${overdue.length} cost${overdue.length === 1 ? '' : 's'}`}
          tone={overdue.length > 0 ? 'amber' : undefined}
        />
        <Tile
          label="Money in accounts"
          value={formatBdt(balance)}
          note={owed > balance ? `Short by ${formatBdt(owed - balance)} to pay everything` : 'Enough to pay everything owed'}
          tone={owed > balance ? 'red' : undefined}
        />
        <Tile label="Paid" value={formatBdt(paidTotal)} note={`${paid?.length ?? 0} payments`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-hairline bg-white p-1">
          {(['pending', 'paid'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                tab === t ? 'bg-admin-500 text-white' : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
              )}
            >
              {t === 'pending' ? `Pending (${pending?.length ?? 0})` : `Paid (${paid?.length ?? 0})`}
            </button>
          ))}
        </div>
        <SelectInput
          aria-label="Project"
          className="w-64"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectInput>
      </div>

      <Card>
        {tab === 'pending' ? (
          !pending ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">Nothing is owed. Every recorded cost is paid.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="text-left text-xs text-ink-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Bought</th>
                    <th className="py-2 pr-3 font-medium">What</th>
                    <th className="py-2 pr-3 font-medium">Project · work item</th>
                    <th className="py-2 pr-3 font-medium">Vendor</th>
                    <th className="py-2 pr-3 text-right font-medium">Cost</th>
                    <th className="py-2 pr-3 text-right font-medium">Paid</th>
                    <th className="py-2 pr-3 text-right font-medium">Owed</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {pending.map((r) => (
                    <tr key={r.id} className="border-t border-hairline">
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <span className="text-ink">{formatDate(r.purchase_date)}</span>
                        <span
                          className={cn(
                            'block text-xs',
                            r.age_days > OVERDUE_DAYS ? 'font-medium text-amber-700' : 'text-ink-muted',
                          )}
                        >
                          {r.age_days} day{r.age_days === 1 ? '' : 's'} ago
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-ink">{r.description}</span>
                        <span className="flex items-center gap-1 text-xs text-ink-muted">
                          {r.code} · {COST_TYPE_META[r.cost_type].label} ·
                          <Paperclip className="size-3" /> {r.attachment_count}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">
                        {r.project_name}
                        <span className="block text-xs">
                          {r.tower_name} · {r.work_item_name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">{r.vendor_name}</td>
                      <td className="py-2.5 pr-3 text-right">{formatBdt(r.amount)}</td>
                      <td className="py-2.5 pr-3 text-right text-ink-muted">
                        {r.paid_amount > 0 ? formatBdt(r.paid_amount) : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-ink">{formatBdt(r.due)}</td>
                      <td className="py-2.5 text-right">
                        {mayPay && (
                          <Button size="sm" onClick={() => setPaying(r)}>
                            <Wallet className="size-4" /> Pay
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : !paid ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : paid.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-muted">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Paid on</th>
                  <th className="py-2 pr-3 font-medium">For</th>
                  <th className="py-2 pr-3 font-medium">Vendor</th>
                  <th className="py-2 pr-3 font-medium">From account</th>
                  <th className="py-2 pr-3 font-medium">Paid by</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {paid.map((r) => (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <span className="text-ink">{formatDate(r.payment_date)}</span>
                      <span className="block text-xs text-ink-muted">{r.code}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="text-ink">{r.purchase_description}</span>
                      <span className="block text-xs text-ink-muted">
                        {r.purchase_code} · {r.project_name} · {r.work_item_name}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-ink-muted">{r.vendor_name}</td>
                    <td className="py-2.5 pr-3 text-ink-muted">
                      {r.account_name}
                      <span className="block text-xs">
                        {SUPPLIER_PAYMENT_METHOD_META[r.payment_method]}
                        {r.reference_no && ` · ${r.reference_no}`}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-ink-muted">{r.paid_by_name ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-right font-medium text-ink">{formatBdt(r.amount)}</td>
                    <td className="py-2.5 text-right">
                      {mayPay && (
                        <Button size="sm" variant="ghost" onClick={() => setUndoing(r)} aria-label={`Undo ${r.code}`}>
                          <Undo2 className="size-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {paying && <PayDirectPurchaseModal purchase={paying} onClose={() => setPaying(null)} />}

      <ConfirmDialog
        open={undoing !== null}
        title="Undo this payment"
        subtitle={undoing?.code}
        tone="danger"
        confirmLabel="Undo payment"
        message={
          undoing
            ? `${formatBdt(undoing.amount)} goes back to ${undoing.account_name}, and ${undoing.purchase_code} is owed again.`
            : undefined
        }
        onCancel={() => setUndoing(null)}
        onConfirm={async () => {
          if (undoing) await directPurchasePaymentRepository.undo(undoing.id);
          setUndoing(null);
        }}
      />
    </>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'red' | 'amber' }) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-4',
        tone === 'red' ? 'border-red-200' : tone === 'amber' ? 'border-amber-200' : 'border-hairline',
      )}
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : 'text-ink')}>
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-ink-muted">{note}</p>}
    </div>
  );
}
