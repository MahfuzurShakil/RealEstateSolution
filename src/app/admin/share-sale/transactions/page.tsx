'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUpRight, CalendarDays, Percent, ReceiptText, Wallet } from 'lucide-react';
import { Kpi, Row } from '@/components/admin/share-sale/bits';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextInput } from '@/components/ui/Field';
import { FilterBar, FilterField, FilterSelect } from '@/components/ui/FilterBar';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { SHARE_PAYMENT_METHODS } from '@/lib/db/types';
import { SHARE_PAYMENT_METHOD_LABEL, formatSharePct } from '@/lib/domain/share-sale';
import { shareTransactions, type ShareTransactionRow } from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone, todayLocal } from '@/lib/utils/format';

const methodText = (r: ShareTransactionRow) => r.payment.method_detail || SHARE_PAYMENT_METHOD_LABEL[r.payment.method];

/**
 * Share Sale → Transactions: every payment investors have made, across all
 * projects — the global history the purchase page shows one customer at a
 * time. Opens filtered when linked with ?customer= or ?project=.
 */
function TransactionsPage() {
  const params = useSearchParams();
  const rows = useLiveQuery(() => shareTransactions(), []);
  const [q, setQ] = useState('');
  const [project, setProject] = useState(params.get('project') ?? 'all');
  const [customer, setCustomer] = useState(params.get('customer') ?? 'all');
  const [method, setMethod] = useState('all');
  const [channel, setChannel] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<ShareTransactionRow | null>(null);

  if (!rows) return <p className="text-sm text-ink-muted">Loading…</p>;

  const projects = [...new Map(rows.filter((r) => r.project).map((r) => [r.project!.id, r.project!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const customers = [...new Map(rows.filter((r) => r.customer).map((r) => [r.customer!.id, r.customer!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  const shown = rows.filter((r) => {
    const p = r.payment;
    if (project !== 'all' && r.sale.project_id !== project) return false;
    if (customer !== 'all' && r.sale.customer_id !== customer) return false;
    if (method !== 'all' && p.method !== method) return false;
    if (channel !== 'all' && (p.channel ?? 'office') !== channel) return false;
    if (from && p.paid_on < from) return false;
    if (to && p.paid_on > to) return false;
    if (!needle) return true;
    const text = [r.customer?.name, r.customer?.code, r.customer?.email, p.code, p.reference, p.method_detail, r.sale.code, r.sale.agreement_no, r.project?.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return text.includes(needle) || (digits.length >= 4 && (r.customer?.phone ?? '').replace(/\D/g, '').includes(digits));
  });
  const filtered = Boolean(q || project !== 'all' || customer !== 'all' || method !== 'all' || channel !== 'all' || from || to);
  const reset = () => {
    setQ('');
    setProject('all');
    setCustomer('all');
    setMethod('all');
    setChannel('all');
    setFrom('');
    setTo('');
  };

  const total = shown.reduce((t, r) => t + r.payment.amount, 0);
  const lateFees = shown.reduce((t, r) => t + r.payment.late_fee, 0);
  const month = todayLocal().slice(0, 7);
  const thisMonth = shown.filter((r) => r.payment.paid_on.startsWith(month));
  const online = shown.filter((r) => r.payment.channel === 'online').length;

  const columns: Column<ShareTransactionRow>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (r) => (
        <span className="block">
          <span className="block whitespace-nowrap">{formatDate(r.payment.paid_on)}</span>
          <span className="block text-xs text-ink-muted">{r.payment.code}</span>
        </span>
      ),
      sortValue: (r) => `${r.payment.paid_on}${r.payment.code}`,
    },
    {
      key: 'customer',
      header: 'Investor',
      cell: (r) => (
        <span className="block">
          <span className="block font-medium text-ink">{r.customer?.name ?? '—'}</span>
          <span className="block text-xs text-ink-muted">{r.customer ? `${r.customer.code} · ${formatPhone(r.customer.phone)}` : ''}</span>
        </span>
      ),
      sortValue: (r) => r.customer?.name ?? '',
    },
    {
      key: 'project',
      header: 'Project',
      cell: (r) => (
        <span className="block">
          <span className="block">{r.project?.name ?? '—'}</span>
          <span className="block text-xs text-ink-muted">
            {r.sale.agreement_no ?? r.sale.code} · Round {r.offering?.round_no}
          </span>
        </span>
      ),
      sortValue: (r) => r.project?.name ?? '',
    },
    {
      key: 'for',
      header: 'Paid for',
      cell: (r) => <span className="text-xs text-ink">{r.lines.map((l) => l.label).join(', ') || '—'}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      cell: (r) => (
        <span className="block">
          <span className="flex items-center gap-1.5">
            {methodText(r)}
            {r.payment.channel === 'online' && <Badge tone="teal">Portal</Badge>}
          </span>
          <span className="block text-xs text-ink-muted">{[r.account?.name, r.payment.reference].filter(Boolean).join(' · ')}</span>
        </span>
      ),
      sortValue: (r) => methodText(r),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (r) => (
        <span className="block tabular-nums">
          <span className="block font-medium text-ink">{formatBdt(r.payment.amount)}</span>
          {r.payment.late_fee > 0 && <span className="block text-xs text-amber-700">incl. {formatBdt(r.payment.late_fee)} late fee</span>}
        </span>
      ),
      sortValue: (r) => r.payment.amount,
    },
  ];

  return (
    <>
      <PageHeader title="Share Transactions" subtitle="Every payment investors have made on their share purchases, across all projects." />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Received" value={formatBdt(total)} hint={`${shown.length} payment${shown.length === 1 ? '' : 's'}${filtered ? ' · filtered' : ''}`} icon={Wallet} />
        <Kpi label="This month" value={formatBdt(thisMonth.reduce((t, r) => t + r.payment.amount, 0))} hint={`${thisMonth.length} payment${thisMonth.length === 1 ? '' : 's'}`} icon={CalendarDays} />
        <Kpi label="Late fees collected" value={formatBdt(lateFees)} hint="part of the amount received" icon={Percent} />
        <Kpi label="Paid online" value={online} hint="through the Customer Portal" icon={ReceiptText} />
      </div>

      <Card>
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: 'Investor, phone, receipt, reference…' }}
          onReset={reset}
          isFiltered={filtered}
          resultLabel={`${shown.length} of ${rows.length} payments`}
        >
          <FilterSelect label="Project" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="all">All projects</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Investor" value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="all">All investors</option>
            {customers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="all">All methods</option>
            {SHARE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {SHARE_PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Recorded by" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">Office & portal</option>
            <option value="office">Office</option>
            <option value="online">Customer Portal</option>
          </FilterSelect>
          <FilterField label="Paid from">
            <TextInput type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          </FilterField>
          <FilterField label="Paid to">
            <TextInput type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-auto" />
          </FilterField>
        </FilterBar>

        <DataTable
          rows={shown}
          columns={columns}
          label="payments"
          initialSort={{ key: 'date', direction: 'desc' }}
          onRowClick={setOpen}
          emptyState={<EmptyState icon={ReceiptText} title={filtered ? 'No payment matches' : 'No payments yet'} description={filtered ? 'Change or reset the filters.' : 'Payments appear here once they are recorded on a purchase.'} />}
          mobileCard={(r) => (
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <span>
                  <span className="block font-medium text-ink">{r.customer?.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {r.project?.name} · {r.payment.code}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatBdt(r.payment.amount)}</span>
              </div>
              <p className="text-xs text-ink-muted">
                {formatDate(r.payment.paid_on)} · {methodText(r)} · {r.lines.map((l) => l.label).join(', ')}
              </p>
            </div>
          )}
        />
      </Card>

      {open && (
        <Modal
          open
          title={`Receipt ${open.payment.code}`}
          subtitle={`${formatDate(open.payment.paid_on)} · ${formatBdt(open.payment.amount)}`}
          icon={ReceiptText}
          onClose={() => setOpen(null)}
          footer={
            <Link href={`/admin/share-sale/sales/${open.sale.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-admin-700 hover:underline">
              Open the purchase <ArrowUpRight className="size-4" />
            </Link>
          }
        >
          <div className="space-y-1">
            <Row label="Investor">
              {open.customer?.name ?? '—'}
              {open.customer && <span className="block text-xs text-ink-muted">{`${open.customer.code} · ${formatPhone(open.customer.phone)}`}</span>}
            </Row>
            <Row label="Project">{open.project?.name ?? '—'}</Row>
            <Row label="Purchase">
              {open.sale.agreement_no ?? open.sale.code}
              <span className="block text-xs text-ink-muted">
                Round {open.offering?.round_no} · {open.sale.shares} shares · {formatSharePct(open.sale.share_pct)}
              </span>
            </Row>
            <Row label="Method">
              {methodText(open)}
              {open.payment.channel === 'online' ? ' · Customer Portal' : ''}
            </Row>
            {open.account && <Row label="Received in">{open.account.name}</Row>}
            {open.payment.reference && <Row label="Reference">{open.payment.reference}</Row>}
            {open.payment.notes && <Row label="Notes">{open.payment.notes}</Row>}
          </div>
          <p className="mb-2 mt-4 text-sm font-semibold text-ink">Applied to</p>
          <ul className="divide-y divide-hairline rounded-xl border border-hairline text-sm">
            {open.lines.map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span>{l.label}</span>
                <span className="tabular-nums">
                  {formatBdt(l.principal)}
                  {l.late_fee > 0 && <span className="text-amber-700"> + {formatBdt(l.late_fee)} late fee</span>}
                </span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 px-3 py-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatBdt(open.payment.amount)}</span>
            </li>
          </ul>
        </Modal>
      )}
    </>
  );
}

export default function ShareTransactionsPage() {
  return (
    <Suspense>
      <TransactionsPage />
    </Suspense>
  );
}
