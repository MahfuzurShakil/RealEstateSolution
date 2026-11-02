'use client';

import { AccountPicker } from '@/components/admin/finance/AccountPicker';
import { useEffect, useRef, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { FormGroup, KycFields, NextButton, ReadyCard, SignatureFields, StepSection, WizardFooter, draftStatus, type SignatureValues } from '@/components/admin/signing/SigningParts';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { WizardStepper, type WizardStep } from '@/components/ui/WizardStepper';
import { useMockSession } from '@/lib/auth/mock-session';
import { SHARE_PAYMENT_METHODS, type Customer, type CustomerUpload, type ShareSignDraft, type SharePaymentMethod } from '@/lib/db/types';
import { addMonths } from '@/lib/domain/booking';
import { missingToSign, shareDocChecklist } from '@/lib/domain/share-documents';
import { FREQUENCY_LABEL, SHARE_PAYMENT_METHOD_LABEL, buildSchedule, formatSharePct } from '@/lib/domain/share-sale';
import { shareSaleRepository, type KycField, type SaleRow } from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';
import { ShareDocumentChecklist } from './ShareDocuments';

const KYC: KycField[] = [
  'email', 'nid', 'tin', 'date_of_birth', 'profession', 'address', 'permanent_address', 'father_or_spouse_name',
  'nominee_name', 'nominee_relation', 'nominee_phone', 'nominee_nid', 'bank_name', 'bank_branch', 'bank_account', 'kyc_verified_on',
];
const STEP_LABEL = ['Agreement & plan', 'Customer', 'Witnesses & stamp', 'Papers', 'Review & sign'];
const STEP_HINT = [
  'Fill in the signing day and place, and check the plan.',
  'NID, father’s / spouse’s name and present address are needed.',
  'Enter who signed for the company and both witnesses.',
  'Upload the required papers.',
];

/** The draft a signing starts from: the reservation's plan and what is on the customer already. */
function freshDraft(row: SaleRow, customer: Customer): ShareSignDraft {
  const s = row.sale;
  const today = todayLocal();
  return {
    step: 0,
    agreement_date: today,
    first_due_date: addMonths(today, s.installment_frequency === 'quarterly' ? 3 : 1),
    shares: String(s.shares),
    down_payment_pct: String(s.total_price ? Math.round((s.down_payment / s.total_price) * 10000) / 100 : 100),
    installment_count: String(s.installment_count),
    customer: Object.fromEntries(KYC.map((k) => [k, (customer[k] as string | null | undefined) ?? ''])),
    place: 'Company office, Gulshan, Dhaka',
    company_signatory: '',
    company_signatory_title: 'Managing Director',
    attorney_name: '',
    witnesses: [
      { name: '', id_or_phone: '', address: '' },
      { name: '', id_or_phone: '', address: '' },
    ],
    stamp_value: '300',
    stamp_serial: '',
    notarized_on: '',
    notary_name: '',
    take_down_payment: true,
    down_payment_method: 'bank_transfer',
    down_payment_reference: '',
    saved_at: '',
  };
}

/**
 * Signing a share purchase agreement (PROJECT-SHARE-SALE-PLAN.md §4a), one
 * step at a time like the land acquisition steps. Every step is saved on
 * the purchase as it is left, so the office can stop at any step — "Save
 * draft & exit" — and pick up later where it was. The plan agreed at the table
 * (shares, down payment, installments) can still change from the
 * reservation; it is checked against the offering when signing.
 */
export function SignAgreementWizard({ row, uploads, onExit }: { row: SaleRow; uploads: CustomerUpload[]; onExit: () => void }) {
  const { userId } = useMockSession();
  const s = row.sale;
  const o = row.offering;
  const customer = row.customer!;
  const [d, setD] = useState<ShareSignDraft>(() => s.sign_draft ?? freshDraft(row, customer));
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(s.sign_draft?.saved_at ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(d);
  const unsaved = useRef(false);
  useEffect(() => {
    latest.current = d;
    unsaved.current = dirty;
  }, [d, dirty]);
  const today = todayLocal();

  const set = <K extends keyof ShareSignDraft>(key: K, value: ShareSignDraft[K]) => {
    setD((x) => ({ ...x, [key]: value }));
    setDirty(true);
  };
  const setKyc = (patch: Partial<Record<KycField, string>>) => {
    setD((x) => ({ ...x, customer: { ...x.customer, ...patch } as ShareSignDraft['customer'] }));
    setDirty(true);
  };
  const setSigning = (patch: Partial<SignatureValues>) => {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const k = (key: KycField) => d.customer[key] ?? '';

  const save = async (patch: Partial<ShareSignDraft> = {}) => {
    const next = { ...latest.current, ...patch };
    setD(next);
    await shareSaleRepository.saveSignDraft(s.id, next);
    setSavedAt(new Date().toISOString());
    setDirty(false);
  };
  const go = (step: number) => void save({ step });

  // a step left half-typed is kept when the tab or the page is left
  useEffect(
    () => () => {
      if (unsaved.current) void shareSaleRepository.saveSignDraft(s.id, latest.current).catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // the plan as it now stands
  const shares = Math.floor(Number(d.shares) || 0);
  const pct = Number(d.down_payment_pct) || 0;
  const n = Math.floor(Number(d.installment_count) || 0);
  const total = shares * s.price_per_share;
  const down = Math.round((total * pct) / 100);
  const firstDue = n > 0 ? d.first_due_date : d.agreement_date;
  const rows = n > 0 && firstDue > d.agreement_date ? buildSchedule({ total_price: total, down_payment: down, installment_count: n, installment_frequency: s.installment_frequency, agreement_date: d.agreement_date, first_due_date: firstDue }) : [];
  const planChanged = shares !== s.shares || n !== s.installment_count || down !== s.down_payment;
  const planError =
    !o ? '' :
    shares < o.min_shares || shares > o.max_shares ? `${o.min_shares}–${o.max_shares} shares per customer.` :
    pct < o.min_down_payment_pct || pct > 100 ? `Down payment at least ${o.min_down_payment_pct}%.` :
    n > o.max_installments ? `Up to ${o.max_installments} installments.` :
    n === 0 && pct < 100 ? 'With no installments the down payment is 100%.' :
    n > 0 && pct >= 100 ? 'A 100% down payment leaves nothing for installments.' : '';

  const checklist = shareDocChecklist(uploads, s.id, { has_nominee: !!k('nominee_name').trim(), by_attorney: !!d.attorney_name.trim() });
  const missingDocs = missingToSign(checklist);
  const steps: WizardStep[] = [
    { label: STEP_LABEL[0], done: !!d.agreement_date && !!d.place.trim() && !planError && (n === 0 || firstDue > d.agreement_date) },
    { label: STEP_LABEL[1], done: !!(k('nid').trim() && k('father_or_spouse_name').trim() && k('address').trim()) },
    { label: STEP_LABEL[2], done: !!d.company_signatory.trim() && d.witnesses.every((w) => w.name.trim()) },
    { label: STEP_LABEL[3], done: missingDocs.length === 0, sub: missingDocs.length ? `${missingDocs.length} required missing` : undefined },
    { label: STEP_LABEL[4], done: false },
  ];
  const at = Math.min(d.step, 4);
  const allReady = steps.slice(0, 4).every((x) => x.done);

  const sign = async () => {
    setBusy(true);
    setError('');
    try {
      await shareSaleRepository.signAgreement(
        s.id,
        {
          agreement_date: d.agreement_date,
          first_due_date: firstDue,
          terms: planChanged ? { shares, down_payment_pct: pct, installment_count: n } : null,
          customer: Object.fromEntries(KYC.map((key) => [key, k(key)])),
          signing: {
            place: d.place,
            company_signatory: d.company_signatory,
            company_signatory_title: d.company_signatory_title,
            witnesses: d.witnesses,
            stamp_value: d.stamp_value === '' ? null : Number(d.stamp_value),
            stamp_serial: d.stamp_serial,
            notarized_on: d.notarized_on || null,
            notary_name: d.notary_name,
            attorney_name: d.attorney_name,
          },
          down_payment: d.take_down_payment && down > 0 ? { method: d.down_payment_method, reference: d.down_payment_reference, account_id: d.down_payment_account_id || null } : null,
        },
        userId,
      );
      unsaved.current = false; // signed: nothing left to save on the way out
      onExit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign.');
      setBusy(false);
    }
  };

  const review: [string, string][] = [
    ['Signed on', `${formatDate(d.agreement_date)} at ${d.place}`],
    ['Shares', `${shares} (${formatSharePct(shares * (o?.share_pct ?? 0))}) · ${formatBdt(total)}`],
    ['Plan', rows.length > 1 ? `${formatBdt(down)} down, ${n} × ${formatBdt(rows[1].amount)} from ${formatDate(rows[1].due_date)}` : `${formatBdt(total)} in full at signing`],
    ['Customer', `${customer.name}, son/daughter/wife of ${k('father_or_spouse_name')}`],
    ['NID', k('nid')],
    ['Nominee', k('nominee_name') ? `${k('nominee_name')}${k('nominee_relation') ? ` (${k('nominee_relation')})` : ''}` : '—'],
    ['For the company', [d.company_signatory, d.company_signatory_title].filter(Boolean).join(', ')],
    ['Witnesses', d.witnesses.map((w) => w.name).join(' and ')],
    ['Stamp paper', d.stamp_value ? `${formatBdt(Number(d.stamp_value))}${d.stamp_serial ? ` · no. ${d.stamp_serial}` : ''}` : '—'],
    ['Papers on file', `${checklist.filter((c) => c.done).length} of ${checklist.length}`],
  ];

  return (
    <div className="space-y-5">
      <WizardStepper steps={steps} active={at} onSelect={go} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {at === 0 && (
            <StepSection n={1} title="Agreement and plan" subtitle="The signing day is when the down payment falls due. The plan can still change from the reservation if the customer agreed something else at the table.">
              <FormGroup title="Signing">
                <Field label="Signed on" required>
                  <TextInput type="date" value={d.agreement_date} max={today} onChange={(e) => set('agreement_date', e.target.value)} />
                </Field>
                <Field label="Signed at" required className="xl:col-span-2">
                  <TextInput value={d.place} onChange={(e) => set('place', e.target.value)} />
                </Field>
              </FormGroup>
              <FormGroup title="Payment plan" grid={false}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Shares" required hint={o ? `${o.min_shares}–${o.max_shares} per customer` : undefined}>
                  <TextInput inputMode="numeric" value={d.shares} onChange={(e) => set('shares', e.target.value.replace(/\D/g, ''))} />
                </Field>
                <Field label="Down payment %" required hint={o ? `at least ${o.min_down_payment_pct}%` : undefined}>
                  <TextInput inputMode="decimal" value={d.down_payment_pct} onChange={(e) => set('down_payment_pct', e.target.value.replace(/[^\d.]/g, ''))} />
                </Field>
                <Field label="Installments" required hint={o ? `up to ${o.max_installments}, ${FREQUENCY_LABEL[s.installment_frequency].toLowerCase()}` : undefined}>
                  <SelectInput value={d.installment_count} onChange={(e) => set('installment_count', e.target.value)}>
                    {Array.from({ length: (o?.max_installments ?? n) + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? 'None — pay in full' : i}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                {n > 0 && (
                  <Field label="First installment due" required>
                    <TextInput type="date" value={d.first_due_date} min={d.agreement_date} onChange={(e) => set('first_due_date', e.target.value)} />
                  </Field>
                )}
              </div>
              {planError ? (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{planError}</p>
              ) : (
                <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink-muted">
                  {shares} share{shares === 1 ? '' : 's'} at {formatBdt(s.price_per_share)} = <span className="font-medium text-ink">{formatBdt(total)}</span>. Down payment{' '}
                  <span className="font-medium text-ink">{formatBdt(down)}</span> on {formatDate(d.agreement_date)}
                  {rows.length > 1 && (
                    <>
                      , then {n} {FREQUENCY_LABEL[s.installment_frequency].toLowerCase()} installments of <span className="font-medium text-ink">{formatBdt(rows[1].amount)}</span> from {formatDate(rows[1].due_date)} to{' '}
                      {formatDate(rows[rows.length - 1].due_date)}
                    </>
                  )}
                  .
                  {planChanged && <span className="mt-1 block text-amber-700">Changed from the reservation ({s.shares} shares, {formatBdt(s.down_payment)} down, {s.installment_count} installments).</span>}
                </p>
              )}
              </FormGroup>
            </StepSection>
          )}

          {at === 1 && (
            <StepSection n={2} title="Customer as named on the agreement" subtitle="Saved on the customer when signed, and shown on their Customer Portal profile.">
              <KycFields name={customer.name} values={d.customer} onChange={setKyc} payoutBank />
            </StepSection>
          )}

          {at === 2 && (
            <StepSection n={3} title="Signatures, witnesses and stamp" subtitle="As written at the foot of the agreement.">
              <SignatureFields values={d} onChange={setSigning} party="customer" signedOn={d.agreement_date} />
            </StepSection>
          )}

          {at === 3 && (
            <StepSection n={4} title="Papers on file" subtitle="Scan the signed agreement and anything handed over at the table. Papers the customer sent from the portal count too.">
              <ShareDocumentChecklist uploads={uploads} sale={s} hasNominee={!!k('nominee_name').trim()} byAttorney={!!d.attorney_name.trim()} mayEdit />
            </StepSection>
          )}

          {at === 4 && (
            <StepSection n={5} title="Review and sign" subtitle="Check what goes on the agreement, then mark it signed.">
              <dl className="mb-5 grid gap-x-8 md:grid-cols-2">
                {review.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 text-sm">
                    <dt className="shrink-0 text-ink-muted">{label}</dt>
                    <dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{value}</dd>
                  </div>
                ))}
              </dl>
              {down > 0 && (
                <>
                  <p className="mb-2 text-sm font-semibold text-ink">Down payment</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={d.take_down_payment} onChange={(e) => set('take_down_payment', e.target.checked)} className="size-4 accent-admin-600" />
                    {formatBdt(down)} received on {formatDate(d.agreement_date)}
                  </label>
                  {d.take_down_payment && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Paid by">
                        <SelectInput value={d.down_payment_method} onChange={(e) => set('down_payment_method', e.target.value as SharePaymentMethod)}>
                          {SHARE_PAYMENT_METHODS.filter((m) => m !== 'online').map((m) => (
                            <option key={m} value={m}>
                              {SHARE_PAYMENT_METHOD_LABEL[m]}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label="Reference" hint="cheque, pay order or deposit slip no.">
                        <TextInput value={d.down_payment_reference} onChange={(e) => set('down_payment_reference', e.target.value)} />
                      </Field>
                      <AccountPicker label="Received into" value={d.down_payment_account_id ?? ''} onChange={(id) => set('down_payment_account_id', id)} />
                    </div>
                  )}
                </>
              )}
              {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </StepSection>
          )}

          <WizardFooter
            canBack={at > 0}
            onBack={() => go(at - 1)}
            status={draftStatus(dirty, savedAt)}
            onSaveExit={async () => {
              await save();
              onExit();
            }}
            hint={at < 4 && !steps[at].done ? STEP_HINT[at] : undefined}
          >
            {at < 4 ? (
              <NextButton label={STEP_LABEL[at + 1]} disabled={!steps[at].done} onClick={() => go(at + 1)} />
            ) : (
              <Button disabled={!allReady || busy} onClick={sign}>
                <FileSignature className="size-4" /> {busy ? 'Signing…' : 'Agreement signed'}
              </Button>
            )}
          </WizardFooter>
        </div>

        <ReadyCard steps={steps.slice(0, 4)} onSelect={go} missing={missingDocs.map((m) => m.meta.label)} />
      </div>
    </div>
  );
}
