'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Award, FileSignature, HandCoins, IdCard, Undo2, XCircle } from 'lucide-react';
import { DetailTabs, SaleBadge } from '@/components/admin/share-sale/bits';
import { InvestorDetailsModal } from '@/components/admin/share-sale/InboxModals';
import { ShareDocumentChecklist } from '@/components/admin/share-sale/ShareDocuments';
import { SignAgreementWizard } from '@/components/admin/share-sale/SignAgreementWizard';
import { ReasonModal, RecordPaymentModal } from '@/components/admin/share-sale/ShareSaleModals';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMockSession } from '@/lib/auth/mock-session';
import { canEdit } from '@/lib/domain/access';
import { missingToSign, shareDocChecklist } from '@/lib/domain/share-documents';
import { FREQUENCY_LABEL, SHARE_INSTALLMENT_STATUS_META, SHARE_PAYMENT_METHOD_LABEL, formatSharePct, installmentLabel, lateFeeText } from '@/lib/domain/share-sale';
import { customerUploadRepository, shareSaleOverview, shareSaleRepository } from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

type Tab = 'overview' | 'sign' | 'payments' | 'documents';
type Dialog = 'pay' | 'release' | 'cancel' | 'undo' | 'certificate' | 'investor' | null;

/** One customer's share purchase: the terms, the schedule, every payment and what to do next. */
function ShareSaleDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { role } = useMockSession();
  const mayEdit = canEdit(role, 'share_sale');
  const data = useLiveQuery(() => shareSaleOverview(), []);
  const customerId = data?.sales.find((r) => r.sale.id === id)?.sale.customer_id;
  const uploads = useLiveQuery(() => (customerId ? customerUploadRepository.forCustomer(customerId) : Promise.resolve([])), [customerId]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'sign' ? 'sign' : 'overview');

  if (!data) return <p className="text-sm text-ink-muted">Loading…</p>;
  const v = data.sales.find((r) => r.sale.id === id);
  if (!v) return <EmptyState icon={XCircle} title="Purchase not found" action={<Link href="/admin/share-sale/investors">Back to investors</Link>} />;
  const s = v.sale;
  const o = v.offering;
  const each = v.schedule.find((i) => i.seq === 1)?.amount;
  const missing = uploads && v.customer ? missingToSign(shareDocChecklist(uploads, s.id, { has_nominee: !!v.customer.nominee_name, by_attorney: !!s.signing?.attorney_name })).length : 0;
  const docsLabel = s.status === 'reserved' && missing ? `Documents (${missing} needed)` : 'Documents';
  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
    setDialog(null);
  };

  return (
    <>
      <Link href="/admin/share-sale/investors" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-admin-700">
        <ArrowLeft className="size-4" /> Investors & Dues
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">
              {v.customer?.name} · {s.shares} share{s.shares === 1 ? '' : 's'}
            </h1>
            <SaleBadge health={v.health} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {s.code} · {v.project?.name}
            {o && (
              <>
                {' · '}
                <Link href={`/admin/share-sale/offerings/${o.id}`} className="text-admin-700 hover:underline">
                  {o.code} (Round {o.round_no})
                </Link>
              </>
            )}
          </p>
        </div>
        {mayEdit && (
          <div className="flex flex-wrap gap-2">
            {s.status === 'reserved' && (
              <>
                <Button variant="outline" onClick={() => setDialog('release')}>
                  Release shares
                </Button>
                {tab !== 'sign' && (
                  <Button onClick={() => setTab('sign')}>
                    <FileSignature className="size-4" /> {s.sign_draft ? 'Continue signing' : 'Sign agreement'}
                  </Button>
                )}
              </>
            )}
            {s.status === 'agreement_signed' && (
              <>
                <Button variant="dangerGhost" onClick={() => setDialog('cancel')}>
                  Cancel purchase
                </Button>
                {v.payments.length > 0 && (
                  <Button variant="outline" onClick={() => setDialog('undo')}>
                    <Undo2 className="size-4" /> Undo last payment
                  </Button>
                )}
                <Button onClick={() => setDialog('pay')}>
                  <HandCoins className="size-4" /> Record payment
                </Button>
              </>
            )}
            {s.status === 'fully_paid' && !s.certificate_no && (
              <>
                <Button variant="outline" onClick={() => setDialog('undo')}>
                  <Undo2 className="size-4" /> Undo last payment
                </Button>
                <Button onClick={() => setDialog('certificate')}>
                  <Award className="size-4" /> Issue share certificate
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {v.health === 'hold_expired' && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The hold ended on {formatDate(s.hold_until)}. Sign the agreement now, or release the shares back to the offering.
        </p>
      )}
      {s.status_note && (s.status === 'released' || s.status === 'cancelled') && (
        <p className="mb-4 rounded-xl border border-hairline bg-white px-4 py-3 text-sm text-ink-muted">
          {s.status === 'released' ? 'Released' : 'Cancelled'}: {s.status_note}
        </p>
      )}

      <div className={tab === 'sign' ? 'grid gap-5' : 'grid gap-5 lg:grid-cols-[1fr_320px]'}>
        <div className="min-w-0 lg:order-1">
          <DetailTabs
            tabs={[
              { key: 'overview', label: 'Overview' },
              ...(s.status === 'reserved' && mayEdit
                ? [{ key: 'sign' as Tab, label: s.sign_draft ? `Sign agreement · step ${Math.min(s.sign_draft.step, 4) + 1} of 5` : 'Sign agreement' }]
                : []),
              { key: 'payments', label: v.schedule.length ? `Payments (${v.paid_count}/${v.schedule.length})` : 'Payments' },
              { key: 'documents', label: docsLabel },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'sign' && s.status === 'reserved' && mayEdit && uploads && v.customer && <SignAgreementWizard row={v} uploads={uploads} onExit={() => setTab('overview')} />}

          {tab === 'overview' && (
            <div className="space-y-5">
              <Card>
                <CardHeader title="Purchase" subtitle={s.agreement_no ? `Agreement ${s.agreement_no} · signed ${formatDate(s.agreement_date)}` : `Reserved ${formatDate(s.reserved_on)}, held until ${formatDate(s.hold_until)}`} />
                <dl className="divide-y divide-hairline">
                  <Line label="Shares">
                    {s.shares} · {formatSharePct(s.share_pct)} of the project
                  </Line>
                  <Line label="Price per share">{formatBdt(s.price_per_share)}</Line>
                  <Line label="Total price">{formatBdt(s.total_price)}</Line>
                  <Line label="Down payment">{formatBdt(s.down_payment)}</Line>
                  <Line label="Installments">
                    {s.installment_count ? `${s.installment_count} × ${FREQUENCY_LABEL[s.installment_frequency].toLowerCase()}${each ? ` of ${formatBdt(each)}` : ''}` : 'None — paid in full'}
                  </Line>
                  {s.certificate_no && <Line label="Share certificate">{`${s.certificate_no} · ${formatDate(s.certificate_date)}`}</Line>}
                </dl>
              </Card>
              <Card>
                <CardHeader title="Customer" subtitle={v.customer?.code} />
                {v.customer && (
                  <dl className="divide-y divide-hairline">
                    <Line label="Name">{v.customer.name}</Line>
                    <Line label="Customer type">{v.customer.customer_type === 'investor' ? <Badge tone="teal">Investor</Badge> : 'Buyer'}</Line>
                    <Line label="Phone">{formatPhone(v.customer.phone)}</Line>
                    <Line label="Email">{v.customer.email || '—'}</Line>
                    <Line label="Father’s / spouse’s name">{v.customer.father_or_spouse_name || '—'}</Line>
                    <Line label="NID">{v.customer.nid || '—'}</Line>
                    <Line label="e-TIN">{v.customer.tin || '—'}</Line>
                    <Line label="Address">{v.customer.address || '—'}</Line>
                    <Line label="KYC">{v.customer.kyc_verified_on ? `Checked ${formatDate(v.customer.kyc_verified_on)}` : <span className="text-amber-700">Not checked yet</span>}</Line>
                    <Line label="Nominee">{v.customer.nominee_name ? `${v.customer.nominee_name}${v.customer.nominee_relation ? ` (${v.customer.nominee_relation})` : ''}` : '—'}</Line>
                    <Line label="Payout bank">{v.customer.bank_name ? `${v.customer.bank_name}${v.customer.bank_account ? ` · ${v.customer.bank_account}` : ''}` : '—'}</Line>
                  </dl>
                )}
                {v.customer && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
                    {mayEdit && (
                      <button type="button" onClick={() => setDialog('investor')} className="inline-flex items-center gap-1 text-admin-700 hover:underline">
                        <IdCard className="size-4" /> Investor details
                      </button>
                    )}
                    <Link href={`/admin/customers/${v.customer.id}`} className="text-admin-700 hover:underline">
                      Open customer
                    </Link>
                  </div>
                )}
              </Card>
            {s.signing && (
              <Card>
                <CardHeader title="Signing record" subtitle={`Agreement ${s.agreement_no} · signed ${formatDate(s.agreement_date)} at ${s.signing.place}`} />
                <dl className="grid gap-x-8 divide-y divide-hairline md:grid-cols-2 md:divide-y-0">
                  <Line label="For the company">{[s.signing.company_signatory, s.signing.company_signatory_title].filter(Boolean).join(', ')}</Line>
                  <Line label="For the customer">{s.signing.attorney_name ? `${s.signing.attorney_name} (power of attorney)` : v.customer?.name}</Line>
                  {s.signing.witnesses.map((w, i) => (
                    <Line key={i} label={`Witness ${i + 1}`}>
                      {[w.name, w.id_or_phone, w.address].filter(Boolean).join(' · ')}
                    </Line>
                  ))}
                  <Line label="Stamp paper">{s.signing.stamp_value != null ? `${formatBdt(s.signing.stamp_value)}${s.signing.stamp_serial ? ` · no. ${s.signing.stamp_serial}` : ''}` : '—'}</Line>
                  <Line label="Notarized">{s.signing.notarized_on ? `${formatDate(s.signing.notarized_on)}${s.signing.notary_name ? ` · ${s.signing.notary_name}` : ''}` : '—'}</Line>
                </dl>
              </Card>
            )}

            </div>
          )}

          {tab === 'payments' &&
            (v.schedule.length ? (
              <div className="space-y-5">
                <Card className="p-0">
                  <div className="px-5 pt-5">
                    <CardHeader title="Payment schedule" subtitle={o ? `Late fee: ${lateFeeText(o)}. None on the down payment.` : undefined} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-sm">
                      <thead>
                        <tr className="border-y border-hairline bg-canvas/60 text-left text-xs text-ink-muted">
                          <th className="px-5 py-2 font-medium">Payment</th>
                          <th className="px-3 py-2 font-medium">Due</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                          <th className="px-3 py-2 text-right font-medium">Paid</th>
                          <th className="px-3 py-2 text-right font-medium">Late fee</th>
                          <th className="px-5 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {v.schedule.map((i) => (
                          <tr key={i.id} className={i.status === 'overdue' ? 'bg-red-50/40' : ''}>
                            <td className="px-5 py-2">{i.label}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatDate(i.due_date)}
                              {i.days_late > 0 && <span className="block text-xs text-red-600">{i.days_late} days late</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatBdt(i.amount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {i.paid_amount ? formatBdt(i.paid_amount) : '—'}
                              {i.paid_on && <span className="block text-xs text-ink-muted">{formatDate(i.paid_on)}</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {i.late_fee_due ? <span className="text-red-600">{formatBdt(i.late_fee_due)}</span> : i.late_fee_paid ? <span className="text-ink-muted">{formatBdt(i.late_fee_paid)} paid</span> : '—'}
                            </td>
                            <td className="px-5 py-2">
                              <Badge tone={SHARE_INSTALLMENT_STATUS_META[i.status].tone}>
                                {i.paid_amount > 0 && i.remaining > 0 ? 'Part paid' : SHARE_INSTALLMENT_STATUS_META[i.status].label}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="p-0">
                  <div className="px-5 pt-5">
                    <CardHeader title="Payments received" subtitle={`${v.payments.length} receipt${v.payments.length === 1 ? '' : 's'}`} />
                  </div>
                  {v.payments.length ? (
                    <ul className="divide-y divide-hairline border-t border-hairline">
                      {v.payments.map((p) => (
                        <li key={p.id} className="px-5 py-3 text-sm">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="flex items-center gap-2 font-medium text-ink">
                              {p.code}
                              {p.channel === 'online' && <Badge tone="teal">Customer Portal</Badge>}
                            </span>
                            <span className="font-semibold tabular-nums">{formatBdt(p.amount)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {formatDate(p.paid_on)} · {p.method_detail || SHARE_PAYMENT_METHOD_LABEL[p.method]}
                            {p.reference ? ` · ${p.reference}` : ''}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {p.allocations
                              .map((a) => {
                                const i = v.schedule.find((x) => x.id === a.installment_id);
                                const label = i ? installmentLabel(i.seq) : '—';
                                return a.principal === 0 ? `${label} late fee` : `${label}${i && a.principal < i.amount ? ' (part)' : ''}${a.late_fee ? ' + late fee' : ''}`;
                              })
                              .join(', ')}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="border-t border-hairline px-5 py-6 text-center text-sm text-ink-muted">No payment recorded yet.</p>
                  )}
                </Card>
              </div>
            ) : (
              <Card>
                <EmptyState icon={FileSignature} title="No schedule yet" description="The payment schedule is written when the agreement is signed." />
              </Card>
            ))}

          {tab === 'documents' && uploads && v.customer && (
            <Card>
              <CardHeader
                title="Papers on file"
                subtitle={`Filed by the office or sent by the customer from the portal. ${s.status === 'reserved' ? 'Required ones are needed to sign.' : 'The customer sees these on their portal.'}`}
              />
              <ShareDocumentChecklist
                uploads={uploads}
                sale={s}
                hasNominee={!!v.customer.nominee_name}
                byAttorney={!!s.signing?.attorney_name}
                mayEdit={mayEdit}
                sales={data.sales.filter((r) => r.sale.customer_id === s.customer_id).map((r) => r.sale)}
              />
            </Card>
          )}
        </div>

        <aside className={tab === 'sign' ? 'hidden' : 'min-w-0 space-y-5 lg:order-2'}>
          <Card>
            <CardHeader title="Money" subtitle={v.schedule.length ? `${v.paid_count} of ${v.schedule.length} payments made` : 'The schedule is written when the agreement is signed'} />
            <dl className="divide-y divide-hairline">
              <Line label="Paid">
                {formatBdt(v.paid)} · {v.progress_pct}%
              </Line>
              <Line label="Still to pay">{formatBdt(v.outstanding)}</Line>
              <Line label="Overdue">{v.overdue_amount ? <span className="text-red-600">{formatBdt(v.overdue_amount)}</span> : '—'}</Line>
              <Line label="Late fee owing">{v.late_fees ? <span className="text-red-600">{formatBdt(v.late_fees)}</span> : '—'}</Line>
              <Line label="Next due">{v.next ? `${formatBdt(v.next.remaining)} · ${formatDate(v.next.due_date)}` : '—'}</Line>
            </dl>
            {v.schedule.length > 0 && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${v.health === 'overdue' ? 'bg-red-500' : 'bg-admin-500'}`} style={{ width: `${v.progress_pct}%` }} />
              </div>
            )}
          </Card>
        </aside>
      </div>

      {dialog === 'investor' && v.customer && <InvestorDetailsModal customer={v.customer} onClose={() => setDialog(null)} />}
      {dialog === 'pay' && <RecordPaymentModal view={v} onClose={() => setDialog(null)} />}
      {(dialog === 'release' || dialog === 'cancel') && <ReasonModal sale={s} kind={dialog} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'undo'}
        title="Undo the last payment?"
        message={v.payments[0] ? `${v.payments[0].code} — ${formatBdt(v.payments[0].amount)} on ${formatDate(v.payments[0].paid_on)} — is removed and the schedule goes back to how it was.` : ''}
        confirmLabel="Undo payment"
        onConfirm={() => act(() => shareSaleRepository.undoLatestPayment(s.id))}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'certificate'}
        title="Issue the share certificate?"
        message={`Every payment is in. A certificate number (CRT-…) is assigned and ${v.customer?.name ?? 'the customer'}'s ownership of ${formatSharePct(s.share_pct)} is confirmed.`}
        tone="default"
        icon={Award}
        confirmLabel="Issue certificate"
        onConfirm={() => act(() => shareSaleRepository.issueCertificate(s.id))}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}

export default function ShareSaleDetailPage() {
  return (
    <Suspense>
      <ShareSaleDetail />
    </Suspense>
  );
}
