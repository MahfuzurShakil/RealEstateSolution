'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CalendarPlus, Lock, Pencil, PlayCircle, Ticket, Trash2, XCircle } from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { AvailabilityBar, DetailTabs, OfferingBadge, Row, SaleBadge } from '@/components/admin/share-sale/bits';
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

type Dialog = 'open' | 'reserve' | 'extend' | 'close' | 'cancel' | 'delete' | null;
type Tab = 'overview' | 'purchases' | 'ownership' | 'documents';

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
  const [tab, setTab] = useState<Tab>('overview');

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

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 lg:order-1">
          <DetailTabs
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'purchases', label: `Purchases (${sales.length})` },
              { key: 'ownership', label: 'Ownership' },
              { key: 'documents', label: 'Documents' },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'overview' && (
            <div className="space-y-5">
              <Card>
                <CardHeader title="Valuation" subtitle={`Net asset value + premium · valued ${formatDate(o.valuation_date)}`} />
                <Row label="Net asset value">{formatBdt(o.net_asset_value)}</Row>
                <Row label="Premium">
                  {formatBdt(o.premium_value)}
                  <span className="ml-1 text-xs text-ink-muted">({Number(((o.premium_value / o.net_asset_value) * 100).toFixed(1))}% of NAV)</span>
                </Row>
                <Row label="Project valuation (100%)" strong>
                  {formatBdt(o.valuation)}
                </Row>
              </Card>
              <Card>
                <CardHeader title="Offered to the market" subtitle={`${formatSharePct(o.offered_pct)} of the project in ${o.total_shares} shares`} />
                <Row label="Share of the project offered">{formatSharePct(o.offered_pct)}</Row>
                <Row label="Number of shares">{o.total_shares}</Row>
                <Row label="Ownership per share">{formatSharePct(o.share_pct)}</Row>
                <Row label="Price per share" strong>
                  {formatBdt(o.price_per_share)}
                </Row>
                <Row label="Raises if all sell">{formatBdt(o.price_per_share * o.total_shares)}</Row>
              </Card>
              <Card>
                <CardHeader title="Terms for customers" subtitle={o.status === 'draft' ? `Valid ${o.validity_days} days once opened` : `Valid ${o.validity_days} days`} />
                <Row label="Validity">{o.opens_on ? `${formatDate(o.opens_on)} – ${formatDate(o.closes_on)}` : `${o.validity_days} days from opening`}</Row>
                <Row label="Shares per customer">
                  {o.min_shares}–{o.max_shares}
                </Row>
                <Row label="Down payment">at least {o.min_down_payment_pct}%</Row>
                <Row label="Installments">
                  up to {o.max_installments}, {FREQUENCY_LABEL[o.installment_frequency].toLowerCase()}
                </Row>
                <Row label="Late fee">
                  {o.late_fee_pct}% of the installment after {o.grace_days} days
                </Row>
                <Row label="Reservation hold">{o.hold_days} days</Row>
              </Card>
              {o.notes && (
                <Card>
                  <CardHeader title="Notes" />
                  <p className="text-sm whitespace-pre-line text-ink">{o.notes}</p>
                </Card>
              )}
            </div>
          )}

          {tab === 'purchases' && (
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
          )}

          {tab === 'ownership' && (
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
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Documents" subtitle="The papers behind this offering — valuation report, board resolution, offer document." />
              <DocumentsPanel entityType="share_offering" entityId={o.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <Card>
            <CardHeader title="Shares" subtitle="Sold = agreement signed" />
            <AvailabilityBar a={a} total={o.total_shares} />
            <div className="mt-3">
              <Row label="Sold value">{formatBdt(row.sold_value)}</Row>
              <Row label="Collected">{formatBdt(row.collected)}</Row>
              <Row label="Unsold">{formatBdt(a.available * o.price_per_share)}</Row>
            </div>
          </Card>
          <Card>
            <CardHeader title="At a glance" />
            <Row label="Valuation">{formatCrore(o.valuation)}</Row>
            <Row label="Price per share" strong>
              {formatBdt(o.price_per_share)}
            </Row>
            <Row label="Offered">
              {formatSharePct(o.offered_pct)} · {o.total_shares} shares
            </Row>
            <Row label={o.closes_on ? 'Valid until' : 'Validity'}>{o.closes_on ? formatDate(o.closes_on) : `${o.validity_days} days`}</Row>
            <Row label="Customers">{new Set(sales.filter((x) => x.sale.status !== 'released' && x.sale.status !== 'cancelled').map((x) => x.sale.customer_id)).size}</Row>
          </Card>
        </aside>
      </div>

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
