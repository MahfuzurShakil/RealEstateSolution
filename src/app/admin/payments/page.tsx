'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Paperclip, Undo2, Wallet } from 'lucide-react';
import { PayDirectPurchaseModal } from '@/components/admin/finance/PayDirectPurchaseModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { CONSTRUCTION_COST_TYPES } from '@/lib/db/types';
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

  // client, 2026-10-21: filter by project, dates, vendor, kind of cost and item; 5 a page
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [vendor, setVendor] = useState('');
  const [costType, setCostType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  const filter = { project_id: projectId || undefined };
  const pendingAll = useLiveQuery(() => directPurchasePaymentRepository.pending(filter), [projectId]);
  const paidAll = useLiveQuery(() => directPurchasePaymentRepository.history(filter), [projectId]);

  const q = search.trim().toLowerCase();
  const keep = (date: string, v: string, type: string | null, text: string) =>
    (!from || date >= from) &&
    (!to || date <= to) &&
    (!vendor || v === vendor) &&
    (!costType || type === costType) &&
    (!q || text.toLowerCase().includes(q));
  const pending = pendingAll?.filter((r) =>
    keep(r.purchase_date, r.vendor_name, r.cost_type, `${r.description} ${r.code} ${r.work_item_name} ${r.tower_name} ${r.project_name}`),
  );
  const paid = paidAll?.filter((r) =>
    keep(
      r.payment_date,
      r.vendor_name,
      r.cost_type,
      `${r.purchase_description} ${r.purchase_code} ${r.code} ${r.work_item_name} ${r.project_name} ${r.reference_no ?? ''}`,
    ),
  );
  const vendors = [
    ...new Set([...(pendingAll ?? []), ...(paidAll ?? [])].map((r) => r.vendor_name).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const filtered = Boolean(from || to || vendor || costType || q || projectId);
  const resetPage = () => setPage(1);
  const rows = tab === 'pending' ? (pending ?? []) : (paid ?? []);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const at = Math.min(page, pages);
  const slice = <T,>(list: T[]) => list.slice((at - 1) * perPage, at * perPage);
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
              onClick={() => {
                setTab(t);
                resetPage();
              }}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                tab === t ? 'bg-admin-500 text-white' : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
              )}
            >
              {t === 'pending' ? `Pending (${pending?.length ?? 0})` : `Paid (${paid?.length ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Search</span>
            <TextInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="Item, code, work item…"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Project</span>
            <SelectInput
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                resetPage();
              }}
            >
              <option value="">All projects</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Vendor</span>
            <SelectInput
              value={vendor}
              onChange={(e) => {
                setVendor(e.target.value);
                resetPage();
              }}
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Kind of cost</span>
            <SelectInput
              value={costType}
              onChange={(e) => {
                setCostType(e.target.value);
                resetPage();
              }}
            >
              <option value="">All kinds</option>
              {CONSTRUCTION_COST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COST_TYPE_META[t].label}
                </option>
              ))}
            </SelectInput>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-muted">{tab === 'pending' ? 'Bought from' : 'Paid from'}</span>
              <TextInput
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  resetPage();
                }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-muted">to</span>
              <TextInput
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setTo(e.target.value);
                  resetPage();
                }}
              />
            </label>
          </div>
        </div>
        {filtered && (
          <button
            type="button"
            className="mt-2 text-xs font-medium text-admin-700 hover:underline"
            onClick={() => {
              setProjectId('');
              setVendor('');
              setCostType('');
              setSearch('');
              setFrom('');
              setTo('');
              resetPage();
            }}
          >
            Clear filters
          </button>
        )}
      </Card>

      <Card>
        {tab === 'pending' ? (
          !pending ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">{filtered ? 'Nothing pending matches these filters.' : 'Nothing is owed. Every recorded cost is paid.'}</p>
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
                  {slice(pending).map((r) => (
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
          <p className="p-6 text-center text-sm text-ink-muted">{filtered ? 'No payment matches these filters.' : 'No payments yet.'}</p>
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
                {slice(paid).map((r) => (
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
        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3 text-sm">
            <span className="text-ink-muted">
              Showing {(at - 1) * perPage + 1}–{Math.min(at * perPage, rows.length)} of {rows.length}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted">Per page</span>
              <SelectInput
                aria-label="Per page"
                className="w-20 py-1.5"
                value={String(perPage)}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  resetPage();
                }}
              >
                {[5, 10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </SelectInput>
              <Button size="sm" variant="outline" disabled={at <= 1} onClick={() => setPage(at - 1)}>
                Previous
              </Button>
              <span className="text-xs text-ink-muted">
                Page {at} of {pages}
              </span>
              <Button size="sm" variant="outline" disabled={at >= pages} onClick={() => setPage(at + 1)}>
                Next
              </Button>
            </div>
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
