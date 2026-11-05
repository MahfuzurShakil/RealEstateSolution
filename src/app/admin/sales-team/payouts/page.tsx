'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { HandCoins, ReceiptText, Undo2, Wallet } from 'lucide-react';
import { AccountPicker } from '@/components/admin/finance/AccountPicker';
import { Kpi, Row } from '@/components/admin/share-sale/bits';
import { ErrorNote, useAction } from '@/components/admin/share-sale/ShareSaleModals';
import { LineStatusBadge, useCommissionSync } from '@/components/admin/sales-team/parts';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMockSession } from '@/lib/auth/mock-session';
import { payoutMath } from '@/lib/domain/commission';
import { commissionPayoutRepository, type PayoutPreview, type PayoutRow } from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

/** Pays one member all their approved lines; paid commission on cancelled sales comes off first. */
function PayModal({ preview, onClose }: { preview: PayoutPreview; onClose: () => void }) {
  const { userId } = useMockSession();
  const [account, setAccount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [tax, setTax] = useState('10');
  const [ref, setRef] = useState('');
  const { error, busy, run } = useAction();
  const math = payoutMath(preview.lines_total, preview.recover_now, Number(tax) || 0);

  return (
    <Modal
      open
      title={`Pay ${preview.member.name}`}
      subtitle={`${preview.lines.length} approved line${preview.lines.length === 1 ? '' : 's'}`}
      icon={HandCoins}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => run(() => commissionPayoutRepository.pay({ member_id: preview.member.id, account_id: account, paid_on: date, tax_pct: Number(tax) || 0, reference_no: ref }, userId), onClose)}>
            {busy ? 'Paying…' : `Pay ${formatBdt(math.net)}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <AccountPicker value={account} onChange={setAccount} label="Paid from" required />
        <Field label="Paid on" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Tax withheld (%)" hint="AIT on commission; 0 if none.">
          <TextInput type="number" min="0" max="100" step="any" value={tax} onChange={(e) => setTax(e.target.value)} />
        </Field>
        <Field label="Reference">
          <TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Cheque / transfer no." />
        </Field>
      </div>
      <div className="mt-5 rounded-xl border border-hairline bg-white px-4 py-2">
        <Row label="Approved commission">{formatBdt(math.lines_total)}</Row>
        {math.recovered > 0 && <Row label="Recovered (cancelled sales)">− {formatBdt(math.recovered)}</Row>}
        <Row label={`Tax withheld ${Number(tax) || 0}%`}>− {formatBdt(math.tax_withheld)}</Row>
        <Row label="Paid out">
          <span className="text-base font-semibold">{formatBdt(math.net)}</span>
        </Row>
      </div>
      {preview.to_recover > math.recovered && (
        <p className="mt-3 text-xs text-amber-700">{formatBdt(preview.to_recover - math.recovered)} more to recover is carried to the next payout.</p>
      )}
      <ErrorNote error={error} />
    </Modal>
  );
}

function PayoutDetail({ payout, onClose }: { payout: PayoutRow; onClose: () => void }) {
  const detail = useLiveQuery(() => commissionPayoutRepository.detail(payout.id), [payout.id]);
  return (
    <Modal open size="lg" title={`Payout ${payout.code}`} subtitle={`${payout.member?.name ?? '—'} · ${formatDate(payout.paid_on)} · ${formatBdt(payout.net)}`} icon={ReceiptText} onClose={onClose}>
      <div className="rounded-xl border border-hairline bg-white px-4 py-2">
        <Row label="Approved commission">{formatBdt(payout.lines_total)}</Row>
        {payout.recovered > 0 && <Row label="Recovered">− {formatBdt(payout.recovered)}</Row>}
        <Row label={`Tax withheld ${payout.tax_pct}%`}>− {formatBdt(payout.tax_withheld)}</Row>
        <Row label="Paid out">{formatBdt(payout.net)}</Row>
        <Row label="From">{[payout.account_name, payout.reference_no].filter(Boolean).join(' · ') || '—'}</Row>
      </div>
      {detail && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-hairline bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="px-4 py-2 font-medium">Sale</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...detail.paid, ...detail.recovered].map((l) => {
                const back = l.recovered_payout_id === payout.id;
                return (
                  <tr key={l.id} className="border-b border-hairline/60 last:border-0">
                    <td className="px-4 py-2">
                      {l.sale_code}
                      <span className="block text-xs text-ink-muted">{l.customer?.name}</span>
                    </td>
                    <td className="px-4 py-2">{l.stage_label}</td>
                    <td className="px-4 py-2">{back ? <span className="text-xs font-medium text-red-600">Taken back</span> : <LineStatusBadge status={l.status} toRecover={l.to_recover} />}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${back ? 'text-red-600' : ''}`}>{back ? `− ${formatBdt(l.amount)}` : formatBdt(l.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Sales Team → Payouts (plan §7.2 step 4): who has approved commission waiting, and what was paid. */
function PayoutsPage() {
  const params = useSearchParams();
  const synced = useCommissionSync();
  const payable = useLiveQuery(() => commissionPayoutRepository.payable(), [synced]);
  const payouts = useLiveQuery(() => commissionPayoutRepository.list(), []);
  const [paying, setPaying] = useState<PayoutPreview | null>(null);
  const [open, setOpen] = useState<PayoutRow | null>(null);
  // "Pay" on a member's page opens straight on that member, once
  const wanted = params.get('member');
  const [linkUsed, setLinkUsed] = useState(false);

  if (!payable || !payouts) return <p className="text-sm text-ink-muted">Loading…</p>;
  const payingNow = paying ?? (!linkUsed && wanted ? (payable.find((x) => x.member.id === wanted) ?? null) : null);
  const waiting = payable.reduce((t, p) => t + p.lines_total, 0);
  const year = todayLocal().slice(0, 4);
  const thisYear = payouts.filter((p) => p.paid_on.startsWith(year));

  const columns: Column<PayoutRow>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (r) => (
        <span className="block">
          <span className="block whitespace-nowrap">{formatDate(r.paid_on)}</span>
          <span className="block text-xs text-ink-muted">{r.code}</span>
        </span>
      ),
      sortValue: (r) => `${r.paid_on}${r.code}`,
    },
    {
      key: 'member',
      header: 'Member',
      cell: (r) => (
        <span className="block">
          <span className="block font-medium text-ink">{r.member?.name ?? '—'}</span>
          <span className="block text-xs text-ink-muted">
            {r.member?.code} · {r.line_count} line{r.line_count === 1 ? '' : 's'}
          </span>
        </span>
      ),
      sortValue: (r) => r.member?.name ?? '',
    },
    { key: 'account', header: 'From', cell: (r) => <span className="text-sm">{[r.account_name, r.reference_no].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'gross', header: 'Commission', align: 'right', cell: (r) => <span className="tabular-nums">{formatBdt(r.lines_total)}</span>, sortValue: (r) => r.lines_total },
    { key: 'recovered', header: 'Recovered', align: 'right', cell: (r) => <span className={`tabular-nums ${r.recovered ? 'text-red-600' : 'text-ink-muted'}`}>{r.recovered ? `− ${formatBdt(r.recovered)}` : '—'}</span>, sortValue: (r) => r.recovered },
    { key: 'tax', header: 'Tax', align: 'right', cell: (r) => <span className="tabular-nums">{formatBdt(r.tax_withheld)}</span>, sortValue: (r) => r.tax_withheld },
    { key: 'net', header: 'Paid out', align: 'right', cell: (r) => <span className="font-medium tabular-nums">{formatBdt(r.net)}</span>, sortValue: (r) => r.net },
  ];

  return (
    <>
      <PageHeader title="Commission Payouts" subtitle="Pay each member their approved commission at once — monthly is typical. Payouts leave a bank or cash account and show in Cash Position." />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Kpi label="Approved, waiting" value={formatBdt(waiting)} hint={`${payable.length} member${payable.length === 1 ? '' : 's'}`} icon={HandCoins} />
        <Kpi label={`Paid out in ${year}`} value={formatBdt(thisYear.reduce((t, p) => t + p.net, 0))} hint={`${thisYear.length} payout${thisYear.length === 1 ? '' : 's'}`} icon={Wallet} />
        <Kpi label="Tax withheld" value={formatBdt(thisYear.reduce((t, p) => t + p.tax_withheld, 0))} hint={`${formatBdt(thisYear.reduce((t, p) => t + p.recovered, 0))} recovered`} icon={Undo2} />
      </div>

      <Card className="mb-5">
        <CardHeader title="Ready to pay" subtitle="Members with approved commission." />
        {payable.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing approved is waiting. Approve earned lines on{' '}
            <Link href="/admin/sales-team/commissions?status=earned" className="font-medium text-admin-700 hover:underline">
              Commissions
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {payable.map((p) => (
              <li key={p.member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <Link href={`/admin/sales-team/members/${p.member.id}`} className="font-medium text-ink hover:text-admin-700 hover:underline">
                    {p.member.name}
                  </Link>
                  <span className="block text-xs text-ink-muted">
                    {p.member.code} · {p.lines.length} line{p.lines.length === 1 ? '' : 's'}
                    {p.to_recover > 0 && <span className="text-red-600"> · {formatBdt(p.to_recover)} to recover</span>}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatBdt(p.lines_total)}</span>
                  <Button size="sm" onClick={() => setPaying(p)}>
                    <HandCoins className="size-4" /> Pay
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Paid" />
        <DataTable
          rows={payouts}
          columns={columns}
          label="payouts"
          initialSort={{ key: 'date', direction: 'desc' }}
          onRowClick={setOpen}
          emptyState={<EmptyState icon={ReceiptText} title="No payouts yet" />}
          mobileCard={(r) => (
            <div className="flex items-start justify-between gap-2">
              <span>
                <span className="block font-medium text-ink">{r.member?.name}</span>
                <span className="block text-xs text-ink-muted">
                  {r.code} · {formatDate(r.paid_on)}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{formatBdt(r.net)}</span>
            </div>
          )}
        />
      </Card>

      {payingNow && (
        <PayModal
          preview={payingNow}
          onClose={() => {
            setPaying(null);
            setLinkUsed(true);
          }}
        />
      )}
      {open && <PayoutDetail payout={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <PayoutsPage />
    </Suspense>
  );
}
