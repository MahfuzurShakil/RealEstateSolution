'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileSignature, LogOut, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, MoneyInput, SelectInput, TextInput } from '@/components/ui/Field';
import { WizardStepper, type WizardStep } from '@/components/ui/WizardStepper';
import { useMockSession } from '@/lib/auth/mock-session';
import { SHARE_PAYMENT_METHODS, type Customer, type CustomerUpload, type ShareSignDraft, type SharePaymentMethod } from '@/lib/db/types';
import { addMonths } from '@/lib/domain/booking';
import { missingToSign, shareDocChecklist } from '@/lib/domain/share-documents';
import { FREQUENCY_LABEL, SHARE_PAYMENT_METHOD_LABEL, buildSchedule, formatSharePct } from '@/lib/domain/share-sale';
import { shareSaleRepository, type KycField, type SaleRow } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
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

function Section({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-admin-50 text-sm font-semibold text-admin-700">{n}</span>
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : formatDate(iso);
}

/**
 * Signing a share purchase agreement (PROJECT-SHARE-SALE-PLAN.md §4a), one
 * step at a time like the land acquisition steps. Every step is saved on
 * the purchase as it is left, so the office can stop at any step — "Save
 * and exit" — and pick up later where it was. The plan agreed at the table
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
  const setK = (key: KycField) => (e: { target: { value: string } }) => set('customer', { ...d.customer, [key]: e.target.value });
  const setW = (i: number, key: 'name' | 'id_or_phone' | 'address', value: string) => set('witnesses', d.witnesses.map((w, j) => (j === i ? { ...w, [key]: value } : w)));
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
          down_payment: d.take_down_payment && down > 0 ? { method: d.down_payment_method, reference: d.down_payment_reference } : null,
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm">
        <span className="text-ink-muted">
          {dirty ? 'Changes not saved yet' : savedAt ? `Progress saved ${ago(savedAt)} — you can leave at any step and continue later.` : 'Progress is saved at every step — you can leave at any step and continue later.'}
        </span>
        <span className="flex gap-1.5">
          {s.sign_draft && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await shareSaleRepository.discardSignDraft(s.id);
                setD(freshDraft(row, customer));
                setSavedAt('');
                setDirty(false);
              }}
            >
              <RotateCcw className="size-4" /> Start over
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={!dirty} onClick={() => void save()}>
            <Save className="size-4" /> Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await save();
              onExit();
            }}
          >
            <LogOut className="size-4" /> Save and exit
          </Button>
        </span>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {at === 0 && (
            <Section n={1} title="Agreement and plan" subtitle="The signing day is when the down payment falls due. The plan can still change from the reservation if the customer agreed something else at the table.">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Signed on" required>
                  <TextInput type="date" value={d.agreement_date} max={today} onChange={(e) => set('agreement_date', e.target.value)} />
                </Field>
                <Field label="Signed at" required className="md:col-span-2">
                  <TextInput value={d.place} onChange={(e) => set('place', e.target.value)} />
                </Field>
              </div>
              <p className="mt-5 mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">Plan</p>
              <div className="grid gap-4 md:grid-cols-4">
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
            </Section>
          )}

          {at === 1 && (
            <Section n={2} title="Customer as named on the agreement" subtitle="Saved on the customer when signed, and shown on their Customer Portal profile.">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Name">
                  <TextInput value={customer.name} disabled />
                </Field>
                <Field label="Father’s / spouse’s name" required>
                  <TextInput value={k('father_or_spouse_name')} onChange={setK('father_or_spouse_name')} />
                </Field>
                <Field label="NID / passport no." required>
                  <TextInput value={k('nid')} onChange={setK('nid')} />
                </Field>
                <Field label="Date of birth">
                  <TextInput type="date" value={k('date_of_birth')} onChange={setK('date_of_birth')} />
                </Field>
                <Field label="e-TIN">
                  <TextInput value={k('tin')} onChange={setK('tin')} />
                </Field>
                <Field label="Profession">
                  <TextInput value={k('profession')} onChange={setK('profession')} />
                </Field>
                <Field label="Present address" required className="md:col-span-2">
                  <TextInput value={k('address')} onChange={setK('address')} />
                </Field>
                <Field label="Email">
                  <TextInput type="email" value={k('email')} onChange={setK('email')} />
                </Field>
                <Field label="Permanent address" className="md:col-span-2">
                  <TextInput value={k('permanent_address')} onChange={setK('permanent_address')} placeholder="Village, upazila, district" />
                </Field>
                <Field label="KYC checked on" hint="once the papers are seen">
                  <TextInput type="date" value={k('kyc_verified_on')} onChange={setK('kyc_verified_on')} />
                </Field>
              </div>
              <p className="mt-5 mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">Nominee</p>
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Name">
                  <TextInput value={k('nominee_name')} onChange={setK('nominee_name')} />
                </Field>
                <Field label="Relation">
                  <TextInput value={k('nominee_relation')} onChange={setK('nominee_relation')} placeholder="e.g. Spouse" />
                </Field>
                <Field label="Mobile">
                  <TextInput value={k('nominee_phone')} onChange={setK('nominee_phone')} />
                </Field>
                <Field label="NID">
                  <TextInput value={k('nominee_nid')} onChange={setK('nominee_nid')} />
                </Field>
              </div>
              <p className="mt-5 mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">Bank account for payouts</p>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Bank">
                  <TextInput value={k('bank_name')} onChange={setK('bank_name')} />
                </Field>
                <Field label="Branch">
                  <TextInput value={k('bank_branch')} onChange={setK('bank_branch')} />
                </Field>
                <Field label="Account no.">
                  <TextInput value={k('bank_account')} onChange={setK('bank_account')} />
                </Field>
              </div>
            </Section>
          )}

          {at === 2 && (
            <Section n={3} title="Signatures, witnesses and stamp" subtitle="As written at the foot of the agreement.">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Signed for the company by" required>
                  <TextInput value={d.company_signatory} onChange={(e) => set('company_signatory', e.target.value)} placeholder="Full name" />
                </Field>
                <Field label="Designation">
                  <TextInput value={d.company_signatory_title} onChange={(e) => set('company_signatory_title', e.target.value)} />
                </Field>
                <Field label="Signed for the customer by" hint="only under a power of attorney">
                  <TextInput value={d.attorney_name} onChange={(e) => set('attorney_name', e.target.value)} placeholder="Attorney’s name" />
                </Field>
              </div>
              {d.witnesses.map((w, i) => (
                <div key={i} className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label={`Witness ${i + 1}`} required>
                    <TextInput value={w.name} onChange={(e) => setW(i, 'name', e.target.value)} placeholder="Full name" />
                  </Field>
                  <Field label="NID or mobile">
                    <TextInput value={w.id_or_phone} onChange={(e) => setW(i, 'id_or_phone', e.target.value)} />
                  </Field>
                  <Field label="Address">
                    <TextInput value={w.address} onChange={(e) => setW(i, 'address', e.target.value)} />
                  </Field>
                </div>
              ))}
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <Field label="Stamp paper (BDT)" hint="non-judicial">
                  <MoneyInput value={d.stamp_value} onChange={(e) => set('stamp_value', e.target.value)} />
                </Field>
                <Field label="Stamp serial no.">
                  <TextInput value={d.stamp_serial} onChange={(e) => set('stamp_serial', e.target.value)} />
                </Field>
                <Field label="Notarized on">
                  <TextInput type="date" value={d.notarized_on} min={d.agreement_date} onChange={(e) => set('notarized_on', e.target.value)} />
                </Field>
                <Field label="Notary public">
                  <TextInput value={d.notary_name} onChange={(e) => set('notary_name', e.target.value)} />
                </Field>
              </div>
            </Section>
          )}

          {at === 3 && (
            <Section n={4} title="Papers on file" subtitle="Scan the signed agreement and anything handed over at the table. Papers the customer sent from the portal count too.">
              <ShareDocumentChecklist uploads={uploads} sale={s} hasNominee={!!k('nominee_name').trim()} byAttorney={!!d.attorney_name.trim()} mayEdit />
            </Section>
          )}

          {at === 4 && (
            <Section n={5} title="Review and sign" subtitle="Check what goes on the agreement, then mark it signed.">
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
                    </div>
                  )}
                </>
              )}
              {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </Section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" disabled={at === 0} onClick={() => go(at - 1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {at < 4 ? (
              <div className="flex items-center gap-3">
                {!steps[at].done && <span className="text-xs text-ink-muted">{STEP_HINT[at]}</span>}
                <Button disabled={!steps[at].done} onClick={() => go(at + 1)}>
                  Next: {STEP_LABEL[at + 1]} <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : (
              <Button disabled={!allReady || busy} onClick={sign}>
                <FileSignature className="size-4" /> {busy ? 'Signing…' : 'Agreement signed'}
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader title="Ready to sign?" />
          <ul className="space-y-1 text-sm">
            {steps.slice(0, 4).map((st, i) => (
              <li key={st.label}>
                <button
                  type="button"
                  disabled={!steps.slice(0, i).every((x) => x.done)}
                  onClick={() => go(i)}
                  className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 disabled:hover:bg-transparent"
                >
                  {st.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-admin-600" /> : <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" />}
                  <span className={cn(st.done ? 'text-ink' : 'text-ink-muted')}>{st.label}</span>
                </button>
              </li>
            ))}
          </ul>
          {missingDocs.length > 0 && <p className="mt-3 text-xs text-red-600">Papers still needed: {missingDocs.map((m) => m.meta.label).join(', ')}</p>}
          <p className="mt-3 text-xs text-ink-muted">{allReady ? 'All set — review and sign on the last step.' : 'Each step opens once the one before it is complete.'}</p>
        </Card>
      </div>
    </div>
  );
}
