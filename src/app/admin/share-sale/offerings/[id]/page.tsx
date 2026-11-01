'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CalendarPlus, Lock, Pencil, PlayCircle, Ticket, Trash2, XCircle } from 'lucide-react';
import { AvailabilityBar, OfferingBadge, SaleBadge } from '@/components/admin/share-sale/bits';
import { ExtendOfferingModal, OpenOfferingModal, ReserveModal } from '@/components/admin/share-sale/ShareSaleModals';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import { FREQUENCY_LABEL, formatCrore, formatSharePct } from '@/lib/domain/share-sale';
import { projectOwnership, shareOfferingRepository, shareSaleOverview, type SaleRow } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

function Line({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={strong ? 'text-right font-semibold text-ink tabular-nums' : 'text-right font-medium tabular-nums'}>{children}</dd>
    </div>
  );
}

type Dialog = 'open' | 'reserve' | 'extend' | 'close' | 'cancel' | 'delete' | null;

export default function OfferingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'share_sale');
  const data = useLiveQuery(() => shareSaleOverview(), []);
  const row = data?.offerings.find((r) => r.offering.id === id);
  const ownership = useLiveQuery(() => (row ? projectOwnership(row.offering.project_id) : Promise.resolve(null)), [row?.offering.project_id, data]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState('');

  if (!data) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!row) return <EmptyState icon={XCircle} title="Offering not found" action={<Link href="/admin/share-sale">Back to offerings</Link>} />;

  const o = row.offering;
  const a = row.availability;
  const sales = data.sales.filter((s) => s.sale.offering_id === o.id).map((s) => ({ ...s, id: s.sale.id }));
  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setDialog(null);
    }
  };

  const saleColumns: Column<SaleRow & { id: string }>[] = [
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => (
        <span className="block">
          <span className="block font-medium text-ink">{r.customer?.name ?? '—'}</span>
          <span className="block text-xs text-ink-muted">
            {r.sale.code}
            {r.sale.agreement_no ? ` · ${r.sale.agreement_no}` : ''}
          </span>
        </span>
      ),
      sortValue: (r) => r.customer?.name ?? '',
    },
    { key: 'shares', header: 'Shares', align: 'right', cell: (r) => <span className="tabular-nums">{r.sale.shares} · {formatSharePct(r.sale.share_pct)}</span>, sortValue: (r) => r.sale.shares },
    { key: 'price', header: 'Price', align: 'right', cell: (r) => <span className="tabular-nums">{formatBdt(r.sale.total_price)}</span>, sortValue: (r) => r.sale.total_price },
    {
      key: 'paid',
      header: 'Paid',
      cell: (r) =>
        r.schedule.length ? (
          <span className="block min-w-28">
            <span className="block text-xs tabular-nums">
              {formatBdt(r.paid)} · {r.progress_pct}%
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
              <span className={`block h-full ${r.health === 'overdue' ? 'bg-red-500' : 'bg-admin-500'}`} style={{ width: `${r.progress_pct}%` }} />
            </span>
          </span>
        ) : (
          <span className="text-xs text-ink-muted">Hold until {formatDate(r.sale.hold_until)}</span>
        ),
      sortValue: (r) => r.progress_pct,
    },
    {
      key: 'due',
      header: 'Overdue',
      align: 'right',
      cell: (r) => (r.due_now ? <span className="font-medium text-red-600 tabular-nums">{formatBdt(r.due_now)}</span> : <span className="text-ink-muted">—</span>),
      sortValue: (r) => r.due_now,
    },
    { key: 'status', header: 'Status', cell: (r) => <SaleBadge health={r.health} />, sortValue: (r) => r.health },
  ];

  return (
    <>
      <Link href="/admin/share-sale" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-admin-700">
        <ArrowLeft className="size-4" /> Share Offerings
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">
              {row.project?.name} · Round {o.round_no}
            </h1>
            <OfferingBadge state={row.state} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {o.code} · valued {formatDate(o.valuation_date)}
            {o.opens_on && ` · open ${formatDate(o.opens_on)} – ${formatDate(o.closes_on)}`}
          </p>
        </div>
        {mayEdit && (
          <div className="flex flex-wrap gap-2">
            {row.state === 'draft' && (
              <>
                <Button variant="dangerGhost" onClick={() => setDialog('delete')}>
                  <Trash2 className="size-4" /> Delete
                </Button>
                <Link href={`/admin/share-sale/offerings/${o.id}/edit`}>
                  <Button variant="outline">
                    <Pencil className="size-4" /> Edit
                  </Button>
                </Link>
                <Button onClick={() => setDialog('open')}>
                  <PlayCircle className="size-4" /> Open for sale
                </Button>
              </>
            )}
            {(row.state === 'open' || row.state === 'expired') && (
              <>
                {a.sold + a.reserved === 0 && (
                  <Button variant="dangerGhost" onClick={() => setDialog('cancel')}>
                    Cancel offering
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDialog('close')}>
                  <Lock className="size-4" /> Close
                </Button>
                <Button variant="outline" onClick={() => setDialog('extend')}>
                  <CalendarPlus className="size-4" /> Extend
                </Button>
                {row.state === 'open' && (
                  <Button onClick={() => setDialog('reserve')} disabled={a.available === 0}>
                    <Ticket className="size-4" /> Reserve shares
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {row.state === 'expired' && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The validity ended on {formatDate(o.closes_on)} with {a.available} share{a.available === 1 ? '' : 's'} unsold. Extend it to keep selling, or close it — the owner keeps the unsold part.
        </p>
      )}

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Valuation" subtitle="Net asset value + premium" />
          <dl className="divide-y divide-hairline">
            <Line label="Net asset value">{formatBdt(o.net_asset_value)}</Line>
            <Line label="Premium">
              {formatBdt(o.premium_value)}
              <span className="ml-1 text-xs text-ink-muted">({Number(((o.premium_value / o.net_asset_value) * 100).toFixed(1))}%)</span>
            </Line>
            <Line label="Valuation (100%)" strong>
              {formatBdt(o.valuation)}
            </Line>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Offered to the market" subtitle={`${formatSharePct(o.offered_pct)} of the project in ${o.total_shares} shares`} />
          <dl className="divide-y divide-hairline">
            <Line label="Ownership per share">{formatSharePct(o.share_pct)}</Line>
            <Line label="Price per share" strong>
              {formatBdt(o.price_per_share)}
            </Line>
            <Line label="Raises if all sell">{formatBdt(o.price_per_share * o.total_shares)}</Line>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Terms" subtitle={o.status === 'draft' ? `Valid ${o.validity_days} days once opened` : `Valid ${o.validity_days} days`} />
          <dl className="divide-y divide-hairline">
            <Line label="Per customer">
              {o.min_shares}–{o.max_shares} shares
            </Line>
            <Line label="Plan">
              {o.min_down_payment_pct}%+ down, up to {o.max_installments} {FREQUENCY_LABEL[o.installment_frequency].toLowerCase()}
            </Line>
            <Line label="Late fee">
              {o.late_fee_pct}% after {o.grace_days} days
            </Line>
            <Line label="Reservation hold">{o.hold_days} days</Line>
          </dl>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader title="Shares" subtitle="Sold = agreement signed. Reserved shares are held while the agreement is prepared." />
          <AvailabilityBar a={a} total={o.total_shares} />
          <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline text-sm">
            {[
              ['Sold value', formatBdt(row.sold_value)],
              ['Collected', formatBdt(row.collected)],
              ['Unsold', formatBdt(a.available * o.price_per_share)],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-3 py-2.5">
                <p className="text-xs text-ink-muted">{k}</p>
                <p className="mt-0.5 font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-0">
          <div className="px-5 pt-5">
            <CardHeader title="Ownership of the project" subtitle="Every opened offering; customers keep the price and terms of the round they bought in." />
          </div>
          {ownership && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-y border-hairline bg-canvas/60 text-left text-xs text-ink-muted">
                    <th className="px-5 py-2 font-medium">Round</th>
                    <th className="px-3 py-2 text-right font-medium">Valuation</th>
                    <th className="px-3 py-2 text-right font-medium">Price / share</th>
                    <th className="px-3 py-2 text-right font-medium">Sold</th>
                    <th className="px-5 py-2 text-right font-medium">Raised</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {ownership.rows.map((r) => (
                    <tr key={r.offering.id} className={r.offering.id === o.id ? 'bg-admin-50/40' : ''}>
                      <td className="px-5 py-2">
                        Round {r.offering.round_no} <span className="text-xs text-ink-muted">· {r.offering.code}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCrore(r.offering.valuation)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatBdt(r.offering.price_per_share)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatSharePct(r.sold_pct)}
                        {r.reserved_pct > 0 && <span className="block text-xs text-amber-700">+{formatSharePct(r.reserved_pct)} reserved</span>}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">{formatBdt(r.raised)}</td>
                    </tr>
                  ))}
                  {!ownership.rows.length && (
                    <tr>
                      <td colSpan={5} className="px-5 py-4 text-center text-ink-muted">
                        Nothing is opened yet — the owner holds 100%.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-hairline font-semibold">
                    <td className="px-5 py-2.5" colSpan={3}>
                      Customers {formatSharePct(ownership.customers_pct)} · Owner keeps {formatSharePct(ownership.owner_pct)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums" colSpan={2}>
                      {formatBdt(ownership.rows.reduce((t, r) => t + r.raised, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Customer purchases" subtitle={`${sales.length} in this offering`} />
        <DataTable
          rows={sales}
          columns={saleColumns}
          label="purchases"
          onRowClick={(r) => router.push(`/admin/share-sale/sales/${r.sale.id}`)}
          emptyState={
            <EmptyState
              icon={Ticket}
              title="No purchases yet"
              description={row.state === 'open' ? 'Reserve shares for a customer once the number and plan are agreed.' : 'Open the offering to start selling.'}
            />
          }
        />
      </Card>

      {dialog === 'open' && <OpenOfferingModal offering={o} onClose={() => setDialog(null)} />}
      {dialog === 'reserve' && <ReserveModal offering={o} available={a.available} onClose={() => setDialog(null)} />}
      {dialog === 'extend' && <ExtendOfferingModal offering={o} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'close'}
        title="Close this offering?"
        message={`No more shares can be reserved. ${a.available} unsold share${a.available === 1 ? '' : 's'} stay with the owner and can go into a later offering.${a.reserved ? ` ${a.reserved} reserved share${a.reserved === 1 ? '' : 's'} can still be signed.` : ''}`}
        tone="warning"
        confirmLabel="Close offering"
        onConfirm={() => act(() => shareOfferingRepository.close(o.id))}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        title="Cancel this offering?"
        message="Nobody has bought into it. It is withdrawn and its % of the project is free to offer again."
        confirmLabel="Cancel offering"
        onConfirm={() => act(() => shareOfferingRepository.cancel(o.id))}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete this draft?"
        message="The draft and its numbers are removed."
        onConfirm={() => act(async () => {
          await shareOfferingRepository.removeDraft(o.id);
          router.push('/admin/share-sale');
        })}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
