'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Building2,
  CircleUserRound,
  FileSignature,
  Layers,
  Pencil,
  PieChart,
  Plus,
  Receipt,
  Trash2,
  UserRound,
} from 'lucide-react';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { CustomerShareFile } from '@/components/admin/share-sale/ShareDocuments';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ResultDialog } from '@/components/ui/ResultDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { BOOKING_STATUS_META } from '@/lib/domain/booking';
import { LEAD_STATUS_META } from '@/lib/domain/lead';
import { SALE_HEALTH_META, formatSharePct } from '@/lib/domain/share-sale';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import {
  customerPortfolioRepository,
  customerRepository,
  customerShareFile,
  type CustomerRole,
  type MoneyTotals,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

type Tab = 'overview' | 'homes' | 'shares' | 'payments' | 'documents';

const ROLE_BADGE: Record<CustomerRole, { label: string; tone: 'teal' | 'blue' }> = {
  buyer: { label: 'Buyer', tone: 'teal' },
  investor: { label: 'Investor', tone: 'blue' },
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value ?? '—'}</span>
    </div>
  );
}

function MoneyCard({ title, m }: { title: string; m: MoneyTotals }) {
  const pct = m.value > 0 ? Math.min(100, (m.received / m.value) * 100) : 0;
  return (
    <Card>
      <CardHeader title={title} />
      <Row label="Total value" value={formatBdt(m.value)} />
      <Row label="Paid" value={<span className="text-emerald-700">{formatBdt(m.received)}</span>} />
      <Row label="Balance" value={formatBdt(m.balance)} />
      <Row label="Overdue now" value={m.overdue > 0.5 ? <span className="text-red-600">{formatBdt(m.overdue)}</span> : 'Nothing'} />
      {m.value > 0 && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Card>
  );
}

/**
 * Customer detail — Design Reference A.11, for both kinds of customer
 * (BUYER-PORTAL-PLAN.md §4). Tabs appear for what the customer holds: Flats &
 * Plots for a buyer, Shares for an investor, both for someone who is both,
 * with one Payments ledger and one papers file across them.
 */
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const customer = useLiveQuery(() => customerRepository.getWithRelations(id), [id]);
  const holdings = useLiveQuery(() => customerPortfolioRepository.forCustomer(id), [id]);
  const shareFile = useLiveQuery(() => customerShareFile(id), [id]);
  const { role } = useMockSession();

  if (customer === undefined || holdings === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!customer || !holdings) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">This customer no longer exists.</p>
        <Link href="/admin/customers" className="mt-3 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to customers
          </Button>
        </Link>
      </Card>
    );
  }

  const { portfolio, homes, shares, payments } = holdings;
  const isBuyer = portfolio.roles.includes('buyer') || homes.length > 0;
  const isInvestor = portfolio.roles.includes('investor') || shares.length > 0;

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', show: true },
    // a customer with nothing yet still sees where to book a unit
    { key: 'homes', label: `Flats & Plots (${homes.length})`, show: isBuyer || !isInvestor },
    { key: 'shares', label: `Shares (${shares.length})`, show: isInvestor },
    { key: 'payments', label: `Payments (${payments.length})`, show: payments.length > 0 },
    { key: 'documents', label: 'Documents', show: true },
  ];

  return (
    <>
      <Link
        href="/admin/customers"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-admin-700"
      >
        <ArrowLeft className="size-4" /> Back to customers
      </Link>

      <PageHeader
        title={customer.name}
        subtitle={`${customer.code} · ${formatPhone(customer.phone)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/bookings/new?customer=${customer.id}`}>
              <Button variant="outline">
                <Plus className="size-4" /> Book a unit
              </Button>
            </Link>
            <Link href={`/admin/bookings/new-multi?customer=${customer.id}`}>
              <Button variant="outline">
                <Layers className="size-4" /> Book several units
              </Button>
            </Link>
            <Link href="/admin/share-sale">
              <Button variant="outline">
                <PieChart className="size-4" /> Reserve shares
              </Button>
            </Link>
            <Link href={`/admin/customers/${customer.id}/edit`}>
              <Button variant="outline">
                <Pencil className="size-4" /> Edit
              </Button>
            </Link>
            <Button variant="dangerGhost" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 lg:order-1">
          <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-hairline bg-white p-1">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    tab === t.key ? 'bg-admin-500 text-white' : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
                  )}
                >
                  {t.label}
                </button>
              ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-5">
              {portfolio.total.count > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Tile label="Total value" value={formatBdt(portfolio.total.value)} hint={`${portfolio.total.count} holding${portfolio.total.count === 1 ? '' : 's'}`} />
                  <Tile label="Paid" value={formatBdt(portfolio.total.received)} tone="green" hint="toward the price" />
                  <Tile label="Balance" value={formatBdt(portfolio.total.balance)} hint="still to come" />
                  <Tile
                    label="Overdue"
                    value={portfolio.total.overdue > 0.5 ? formatBdt(portfolio.total.overdue) : 'Nothing'}
                    tone={portfolio.total.overdue > 0.5 ? 'red' : undefined}
                    hint="incl. late fees"
                  />
                </div>
              )}
              <Card>
                <CardHeader title="Customer Information" />
                <Row label="Name" value={customer.name} />
                <Row label="Code" value={customer.code} />
                <Row
                  label="Type"
                  value={
                    portfolio.roles.length ? (
                      <span className="flex flex-wrap justify-end gap-1">
                        {portfolio.roles.map((r) => (
                          <Badge key={r} tone={ROLE_BADGE[r].tone}>
                            {ROLE_BADGE[r].label}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      'Not set'
                    )
                  }
                />
                <Row
                  label="Phone"
                  value={
                    <a href={`tel:${customer.phone}`} className="text-admin-700 hover:underline">
                      {formatPhone(customer.phone)}
                    </a>
                  }
                />
                <Row
                  label="Email"
                  value={
                    customer.email ? (
                      <a href={`mailto:${customer.email}`} className="text-admin-700 hover:underline">
                        {customer.email}
                      </a>
                    ) : (
                      '—'
                    )
                  }
                />
                <Row label="NID" value={customer.nid} />
                <Row label="Father’s / spouse’s name" value={customer.father_or_spouse_name} />
                <Row label="Profession" value={customer.profession} />
                <Row label="Address" value={customer.address} />
                <Row
                  label="Nominee"
                  value={customer.nominee_name ? `${customer.nominee_name}${customer.nominee_relation ? ` (${customer.nominee_relation})` : ''}` : null}
                />
                <Row label="Customer since" value={formatDate(customer.created_at)} />
              </Card>
            </div>
          )}

          {tab === 'homes' && (
            <Card>
              <CardHeader
                title="Flats & Plots"
                action={
                  <div className="flex gap-2">
                    <Link href={`/admin/bookings/new-multi?customer=${customer.id}`}>
                      <Button size="sm" variant="outline">
                        <Layers className="size-4" /> Book several
                      </Button>
                    </Link>
                    <Link href={`/admin/bookings/new?customer=${customer.id}`}>
                      <Button size="sm">
                        <Plus className="size-4" /> Book a unit
                      </Button>
                    </Link>
                  </div>
                }
              />
              {homes.length === 0 ? (
                <EmptyState
                  icon={FileSignature}
                  title="No booking yet"
                  description="This customer has not taken a unit. Book one to get started."
                  action={
                    <Link href={`/admin/bookings/new?customer=${customer.id}`}>
                      <Button>
                        <Plus className="size-4" /> Book a unit
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {homes.map(({ booking, unit, project, ledger }) => {
                    const pct = booking.final_price > 0 ? Math.min(100, (ledger.paid / booking.final_price) * 100) : 0;
                    return (
                      <li key={booking.id}>
                        <Link
                          href={`/admin/bookings/${booking.id}`}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                            <Building2 className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                              {booking.code}
                              {unit && <span className="text-ink-muted">· {unit.code}</span>}
                              {project && <span className="text-ink-muted">· {project.name}</span>}
                              {booking.booking_group && (
                                <Badge tone="blue">
                                  <Layers className="size-3.5" /> {booking.booking_group}
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {formatDate(booking.booking_date)} · {formatBdt(booking.final_price)}
                              {booking.status !== 'cancelled' && (
                                <>
                                  {' · '}
                                  {formatBdt(ledger.paid)} paid
                                  {ledger.due_now > 0.5 && <span className="text-red-600"> · {formatBdt(ledger.due_now)} overdue</span>}
                                  {booking.fully_paid_on && ' · fully paid'}
                                </>
                              )}
                            </p>
                            {booking.status !== 'cancelled' && (
                              <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge tone={BOOKING_STATUS_META[booking.status].tone}>{BOOKING_STATUS_META[booking.status].label}</Badge>
                            {booking.signing && <Badge tone="green">Agreement signed</Badge>}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {tab === 'shares' && (
            <Card>
              <CardHeader
                title="Shares"
                action={
                  <Link href="/admin/share-sale">
                    <Button size="sm">
                      <PieChart className="size-4" /> Reserve shares
                    </Button>
                  </Link>
                }
              />
              {shares.length === 0 ? (
                <EmptyState icon={PieChart} title="No share purchase yet" description="Reserve shares for this customer from an open offering." />
              ) : (
                <ul className="space-y-3">
                  {shares.map(({ view, offering, project }) => {
                    const s = view.sale;
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/admin/share-sale/sales/${s.id}`}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                            <PieChart className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                              {s.code}
                              {project && <span className="text-ink-muted">· {project.name}</span>}
                              {offering && <span className="text-ink-muted">· {offering.code}</span>}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {s.shares} shares ({formatSharePct(s.share_pct)}) · {formatBdt(s.total_price)} · {formatBdt(view.paid)} paid
                              {view.due_now > 0.5 && <span className="text-red-600"> · {formatBdt(view.due_now)} overdue</span>}
                            </p>
                            <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${view.progress_pct}%` }} />
                            </div>
                          </div>
                          <Badge tone={SALE_HEALTH_META[view.health].tone}>{SALE_HEALTH_META[view.health].label}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {tab === 'payments' && (
            <Card>
              <CardHeader title="Payments" subtitle="Every receipt across this customer's bookings and share purchases, newest first." />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">For</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2 pr-3 text-right">Late fee</th>
                      <th className="py-2 pr-3">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-hairline last:border-0">
                        <td className="py-2.5 pr-3 text-ink">{formatDate(p.date)}</td>
                        <td className="py-2.5 pr-3">
                          <Link href={p.href} className="inline-flex items-center gap-1.5 text-admin-700 hover:underline">
                            {p.kind === 'home' ? <Building2 className="size-3.5" /> : <PieChart className="size-3.5" />}
                            {p.against}
                          </Link>
                          {p.online && (
                            <Badge tone="blue" className="ml-1.5">
                              Online
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-medium tabular-nums">{formatBdt(p.amount)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-ink-muted">{p.late_fee ? formatBdt(p.late_fee) : '—'}</td>
                        <td className="py-2.5 pr-3 text-ink-muted">{p.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-sm font-semibold text-ink">
                      <td className="pt-3" colSpan={2}>
                        Total
                      </td>
                      <td className="pt-3 pr-3 text-right">{formatBdt(payments.reduce((t, p) => t + p.amount, 0))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {tab === 'documents' && shareFile && (
            <Card className="mb-5">
              <CardHeader title="Customer file" subtitle="KYC papers and each booking's and share purchase's papers — the customer sees these on their Customer Portal." />
              <CustomerShareFile
                customerId={customer.id}
                uploads={shareFile.uploads}
                sales={shareFile.sales}
                bookings={homes.map((h) => ({ id: h.booking.id, code: `${h.booking.code}${h.unit ? ` · ${h.unit.code}` : ''}` }))}
                mayEdit={canEdit(role, 'share_sale') || canEdit(role, 'booking')}
              />
            </Card>
          )}

          {tab === 'documents' && (
            <Card>
              <CardHeader title="Other documents" />
              <DocumentsPanel entityType="customer" entityId={customer.id} />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:order-2">
          <Card>
            <div className="flex flex-col items-center text-center">
              <span className="mb-3 grid size-16 place-items-center rounded-full bg-admin-50 text-admin-600">
                <UserRound className="size-8" />
              </span>
              <p className="text-base font-semibold text-ink">{customer.name}</p>
              <p className="text-sm text-ink-muted">{customer.profession ?? 'Customer'}</p>
              <span className="mt-2 flex flex-wrap justify-center gap-1">
                {portfolio.roles.map((r) => (
                  <Badge key={r} tone={ROLE_BADGE[r].tone}>
                    {ROLE_BADGE[r].label}
                  </Badge>
                ))}
              </span>
              <a href={`tel:${customer.phone}`} className="mt-3 w-full">
                <Button variant="outline" size="sm" className="w-full">
                  Call {formatPhone(customer.phone)}
                </Button>
              </a>
            </div>
          </Card>

          {isBuyer && <MoneyCard title="Flats & plots" m={portfolio.homes} />}
          {isInvestor && <MoneyCard title="Shares" m={portfolio.shares} />}

          {portfolio.roles.length > 0 && (
            <Card>
              <CardHeader title="Customer Portal" />
              <p className="flex items-start gap-2 text-sm text-ink-muted">
                <CircleUserRound className="mt-0.5 size-4 shrink-0 text-admin-600" />
                Signs in at /customer with {formatPhone(customer.phone)} and a one-time code, and sees
                {isBuyer && isInvestor ? ' their homes and their shares' : isBuyer ? ' their homes' : ' their shares'}, payment schedules,
                receipts and papers.
              </p>
            </Card>
          )}

          {customer.lead && (
            <Card>
              <CardHeader title="Origin" />
              <Link
                href={`/admin/leads/${customer.lead.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-hairline p-3 text-sm transition-colors hover:bg-admin-50/60"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{customer.lead.code}</span>
                  <span className="block text-xs text-ink-muted">Converted from this lead</span>
                </span>
                <Badge tone={LEAD_STATUS_META[customer.lead.status].tone}>{LEAD_STATUS_META[customer.lead.status].label}</Badge>
              </Link>
            </Card>
          )}

          {payments.length > 0 && tab !== 'payments' && (
            <Button variant="outline" className="w-full" onClick={() => setTab('payments')}>
              <Receipt className="size-4" /> All payments
            </Button>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${customer.code}`}
        subtitle={customer.name}
        confirmLabel="Delete customer"
        message="This deletes the customer record and its documents. It cannot be undone."
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const result = await customerRepository.removeCascade(customer.id);
          if (!result.removed) {
            // refused: close the question and say why, in a notice of its own
            setConfirmDelete(false);
            setDeleteError(result.reason ?? 'This customer cannot be deleted.');
            return;
          }
          router.push('/admin/customers');
        }}
      />

      <ResultDialog
        open={Boolean(deleteError)}
        tone="warning"
        title="This customer cannot be deleted"
        message={deleteError}
        actionLabel="OK"
        onClose={() => setDeleteError('')}
      />
    </>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'green' | 'red' }) {
  return (
    <div className="rounded-xl border border-hairline bg-white p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', tone === 'green' ? 'text-emerald-700' : tone === 'red' ? 'text-red-600' : 'text-ink')}>{value}</p>
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  );
}
