'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Download, FileText, Inbox, Landmark, MessageSquareText, ShoppingBag, Ticket, X } from 'lucide-react';
import { Kpi } from '@/components/admin/share-sale/bits';
import { PaymentVerifyPanel } from '@/components/admin/share-sale/PaymentVerifyPanel';
import { RejectUploadModal, RequestNoteModal, ReserveFromRequestModal, UPLOAD_KIND_LABEL, openUpload } from '@/components/admin/share-sale/InboxModals';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import type { CustomerUpload, CustomerUploadStatus, ShareRequestStatus } from '@/lib/db/types';
import { canEdit } from '@/lib/domain/access';
import { FREQUENCY_LABEL } from '@/lib/domain/share-sale';
import { customerPortalInbox, customerUploadRepository, paymentSubmissionRepository, shareSaleOverview, type RequestRow } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

const REQUEST_META: Record<ShareRequestStatus, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'amber' },
  contacted: { label: 'Contacted', tone: 'blue' },
  reserved: { label: 'Reserved', tone: 'green' },
  declined: { label: 'Declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn by customer', tone: 'neutral' },
};

const UPLOAD_META: Record<CustomerUploadStatus, { label: string; tone: BadgeTone }> = {
  under_review: { label: 'To review', tone: 'amber' },
  accepted: { label: 'Accepted', tone: 'green' },
  rejected: { label: 'Sent back', tone: 'red' },
};

type Tab = 'requests' | 'documents' | 'payments';
const isOpenRequest = (r: RequestRow) => r.request.status === 'new' || r.request.status === 'contacted';

/**
 * Customer Requests: what customers sent from the Customer Portal — requests
 * to buy shares in an open offering (plan §4 step 3) and documents uploaded
 * against a purchase. Both wait here for the office.
 */
function RequestsPage() {
  const params = useSearchParams();
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'share_sale');
  const inbox = useLiveQuery(() => customerPortalInbox(), []);
  const overview = useLiveQuery(() => shareSaleOverview(), []);
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'documents' ? 'documents' : params.get('tab') === 'payments' ? 'payments' : 'requests');
  const waitingPayments = useLiveQuery(() => paymentSubmissionRepository.waitingCount(), []) ?? 0;
  const [showAll, setShowAll] = useState(false);
  const [reserve, setReserve] = useState<RequestRow | null>(null);
  const [note, setNote] = useState<{ row: RequestRow; kind: 'contacted' | 'decline' } | null>(null);
  const [reject, setReject] = useState<CustomerUpload | null>(null);

  if (!inbox || !overview) return <p className="text-sm text-ink-muted">Loading…</p>;
  const availableOf = (offeringId: string) => overview.offerings.find((o) => o.offering.id === offeringId)?.availability.available ?? 0;
  const stateOf = (offeringId: string) => overview.offerings.find((o) => o.offering.id === offeringId)?.state;
  const openRequests = inbox.requests.filter(isOpenRequest);
  const toReview = inbox.uploads.filter((u) => u.upload.status === 'under_review');
  const requestRows = (showAll ? inbox.requests : openRequests).map((r) => ({ ...r, id: r.request.id }));
  const uploadRows = (showAll ? inbox.uploads : toReview).map((u) => ({ ...u, id: u.upload.id }));
  const askedValue = openRequests.reduce((t, r) => t + r.request.shares * (r.offering?.price_per_share ?? 0), 0);

  const requestColumns: Column<(typeof requestRows)[number]>[] = [
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => (
        <span className="block">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            {r.customer?.name ?? r.request.prospect_name ?? '—'}
            {r.request.source === 'website' && <Badge tone="blue">Website</Badge>}
          </span>
          <span className="block text-xs whitespace-nowrap text-ink-muted tabular-nums">
            {r.customer ? formatPhone(r.customer.phone) : r.request.prospect_phone ? formatPhone(r.request.prospect_phone) : ''}
            {!r.customer && r.request.prospect_email ? ` · ${r.request.prospect_email}` : ''}
          </span>
          <span className="block text-xs whitespace-nowrap text-ink-muted">
            {r.request.code} · {formatDate(r.request.requested_at)}
          </span>
        </span>
      ),
      sortValue: (r) => r.request.requested_at,
    },
    {
      key: 'offering',
      header: 'Offering',
      cell: (r) => (
        <span className="block">
          <span className="block">{r.project?.name ?? '—'}</span>
          <span className="block text-xs text-ink-muted">
            {r.offering?.code} · Round {r.offering?.round_no} · {availableOf(r.request.offering_id)} left
          </span>
        </span>
      ),
      sortValue: (r) => r.project?.name ?? '',
    },
    {
      key: 'asked',
      header: 'Asked for',
      cell: (r) => (
        <span className="block">
          <span className="block font-medium tabular-nums">
            {r.request.shares} share{r.request.shares === 1 ? '' : 's'} · {formatBdt(r.request.shares * (r.offering?.price_per_share ?? 0))}
          </span>
          <span className="block text-xs text-ink-muted">
            {r.request.installments === 0 ? 'Pay in full' : `${r.request.installments} ${r.offering ? FREQUENCY_LABEL[r.offering.installment_frequency].toLowerCase() : ''} installments`}
          </span>
          {r.request.note && <span className="mt-0.5 block max-w-64 truncate text-xs text-ink-muted italic">“{r.request.note}”</span>}
        </span>
      ),
      sortValue: (r) => r.request.shares,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span className="block">
          <Badge tone={REQUEST_META[r.request.status].tone}>{REQUEST_META[r.request.status].label}</Badge>
          {r.sale && (
            <Link href={`/admin/share-sale/sales/${r.sale.id}?from=requests`} className="mt-1 block text-xs font-medium text-admin-600 hover:underline">
              {r.sale.code}
            </Link>
          )}
          {r.request.office_note && <span className="mt-1 block max-w-56 truncate text-xs text-ink-muted">{r.request.office_note}</span>}
        </span>
      ),
      sortValue: (r) => r.request.status,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) =>
        mayEdit && isOpenRequest(r) ? (
          <span className="flex flex-col items-end gap-1">
            <Button size="sm" disabled={stateOf(r.request.offering_id) !== 'open'} onClick={() => setReserve(r)}>
              <Ticket className="size-4" /> Reserve
            </Button>
            <span className="flex gap-1">
              {r.request.status === 'new' && (
                <Button size="sm" variant="ghost" title="Note a call to the customer" onClick={() => setNote({ row: r, kind: 'contacted' })}>
                  <MessageSquareText className="size-4" /> Called
                </Button>
              )}
              <Button size="sm" variant="dangerGhost" onClick={() => setNote({ row: r, kind: 'decline' })}>
                Decline
              </Button>
            </span>
          </span>
        ) : null,
    },
  ];

  const uploadColumns: Column<(typeof uploadRows)[number]>[] = [
    { key: 'when', header: 'Uploaded', cell: (u) => formatDate(u.upload.uploaded_at), sortValue: (u) => u.upload.uploaded_at },
    {
      key: 'customer',
      header: 'Customer',
      cell: (u) => (
        <span className="block">
          <span className="block font-medium text-ink">{u.customer?.name ?? '—'}</span>
          {u.sale && (
            <Link href={`/admin/share-sale/sales/${u.sale.id}?from=requests`} className="block text-xs text-admin-600 hover:underline">
              {u.sale.code} · {u.project?.name}
            </Link>
          )}
        </span>
      ),
      sortValue: (u) => u.customer?.name ?? '',
    },
    {
      key: 'doc',
      header: 'Document',
      cell: (u) => (
        <button type="button" onClick={() => openUpload(u.upload.id)} className="flex items-start gap-2 text-left hover:text-admin-700">
          <FileText className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <span className="block">
            <span className="block font-medium">{u.upload.title}</span>
            <span className="block text-xs text-ink-muted">
              {UPLOAD_KIND_LABEL[u.upload.kind]} · {u.upload.file_name}
            </span>
            {u.upload.note && <span className="block max-w-64 truncate text-xs text-ink-muted italic">“{u.upload.note}”</span>}
          </span>
        </button>
      ),
      sortValue: (u) => u.upload.title,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (u) => (
        <span className="block">
          <Badge tone={UPLOAD_META[u.upload.status].tone}>{UPLOAD_META[u.upload.status].label}</Badge>
          {u.upload.review_note && <span className="mt-1 block max-w-56 truncate text-xs text-ink-muted">{u.upload.review_note}</span>}
        </span>
      ),
      sortValue: (u) => u.upload.status,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (u) => (
        <span className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => openUpload(u.upload.id)}>
            <Download className="size-4" /> Open
          </Button>
          {mayEdit && u.upload.status === 'under_review' && (
            <>
              <Button size="sm" variant="outline" onClick={() => customerUploadRepository.accept(u.upload.id)}>
                <Check className="size-4" /> Accept
              </Button>
              <Button size="sm" variant="dangerGhost" onClick={() => setReject(u.upload)}>
                <X className="size-4" /> Send back
              </Button>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Customer Requests" subtitle="Requests to buy shares in an open offering — from customers on the Customer Portal and visitors on the website — and documents customers send for their purchases." />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Purchase requests waiting" value={openRequests.length} hint={openRequests.length ? `${formatBdt(askedValue)} asked for` : 'nothing waiting'} icon={ShoppingBag} tone={openRequests.some((r) => r.request.status === 'new') ? 'danger' : 'default'} />
        <Kpi label="Documents to review" value={toReview.length} hint={`${inbox.uploads.length} uploaded in all`} icon={FileText} />
        <Kpi label="Payments to verify" value={waitingPayments} hint="bank payments reported with a slip" icon={Landmark} tone={waitingPayments ? 'danger' : 'default'} />
        <Kpi label="Reserved from requests" value={inbox.requests.filter((r) => r.request.status === 'reserved').length} hint="turned into reservations" icon={Ticket} />
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 pt-3">
          <div className="flex gap-1">
            {(
              [
                ['requests', 'Purchase requests', openRequests.length],
                ['documents', 'Documents', toReview.length],
                ['payments', 'Payments to verify', waitingPayments],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  tab === key ? 'border-admin-500 text-admin-700' : 'border-transparent text-ink-muted hover:text-ink',
                )}
              >
                {label}
                <span className={cn('rounded-full px-1.5 text-[11px]', n ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-ink-muted')}>{n}</span>
              </button>
            ))}
          </div>
          <label className="mb-2 flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-4 accent-admin-600" />
            Show dealt-with too
          </label>
        </div>
        <div className="p-5">
          {tab === 'payments' ? (
            <PaymentVerifyPanel showAll={showAll} mayConfirm={canEdit(role, 'finance_collection')} />
          ) : tab === 'requests' ? (
            <DataTable
              rows={requestRows}
              columns={requestColumns}
              label="requests"
              emptyState={<EmptyState icon={Inbox} title="No purchase requests waiting" description="When a customer taps “Buy shares” on the Customer Portal, or a visitor sends a request from the website’s Invest page, it shows up here." />}
              mobileCard={(r) => (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block font-medium text-ink">
                        {r.customer?.name ?? r.request.prospect_name}
                        {r.request.source === 'website' && <Badge tone="blue" className="ml-1.5">Website</Badge>}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {r.project?.name} · {r.request.shares} shares · {formatBdt(r.request.shares * (r.offering?.price_per_share ?? 0))}
                      </span>
                    </span>
                    <Badge tone={REQUEST_META[r.request.status].tone}>{REQUEST_META[r.request.status].label}</Badge>
                  </div>
                  {mayEdit && isOpenRequest(r) && (
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" disabled={stateOf(r.request.offering_id) !== 'open'} onClick={() => setReserve(r)}>
                        Reserve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setNote({ row: r, kind: 'contacted' })}>
                        Contacted
                      </Button>
                      <Button size="sm" variant="dangerGhost" onClick={() => setNote({ row: r, kind: 'decline' })}>
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              )}
            />
          ) : (
            <DataTable
              rows={uploadRows}
              columns={uploadColumns}
              label="documents"
              emptyState={<EmptyState icon={FileText} title="No documents to review" description="Files customers upload on the Customer Portal show up here and on the purchase." />}
              mobileCard={(u) => (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block font-medium text-ink">{u.upload.title}</span>
                      <span className="block text-xs text-ink-muted">
                        {u.customer?.name} · {u.sale?.code} · {formatDate(u.upload.uploaded_at)}
                      </span>
                    </span>
                    <Badge tone={UPLOAD_META[u.upload.status].tone}>{UPLOAD_META[u.upload.status].label}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => openUpload(u.upload.id)}>
                      Open
                    </Button>
                    {mayEdit && u.upload.status === 'under_review' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => customerUploadRepository.accept(u.upload.id)}>
                          Accept
                        </Button>
                        <Button size="sm" variant="dangerGhost" onClick={() => setReject(u.upload)}>
                          Send back
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </Card>

      {reserve && reserve.offering && (
        <ReserveFromRequestModal
          request={reserve.request}
          offering={reserve.offering}
          available={availableOf(reserve.request.offering_id)}
          customerName={reserve.customer?.name ?? `${reserve.request.prospect_name ?? ''} (new customer)`}
          onClose={() => setReserve(null)}
        />
      )}
      {note && <RequestNoteModal request={note.row.request} kind={note.kind} onClose={() => setNote(null)} />}
      {reject && <RejectUploadModal upload={reject} onClose={() => setReject(null)} />}
    </>
  );
}

export default function CustomerRequestsPage() {
  return (
    <Suspense>
      <RequestsPage />
    </Suspense>
  );
}
