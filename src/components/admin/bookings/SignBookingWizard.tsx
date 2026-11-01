'use client';

import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileSignature } from 'lucide-react';
import { ShareDocumentChecklist } from '@/components/admin/share-sale/ShareDocuments';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, MoneyInput, TextInput } from '@/components/ui/Field';
import { WizardStepper, type WizardStep } from '@/components/ui/WizardStepper';
import type { Booking, Customer, CustomerUpload } from '@/lib/db/types';
import { bookingScheduleRows } from '@/lib/domain/booking';
import { missingToSign, paperChecklist } from '@/lib/domain/share-documents';
import { KYC_FIELDS, type KycField } from '@/lib/domain/signing';
import { bookingRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';
import {
  AgreementFields,
  agreementFromBooking,
  agreementInput,
  validateAgreement,
  type AgreementForm,
} from './AgreementFields';

const STEP_LABEL = ['Terms', 'Buyer', 'Witnesses & stamp', 'Papers', 'Review & sign'];
const STEP_HINT = [
  'Fill in the signing day, how the buyer pays and the place it was signed.',
  'NID, father’s / spouse’s name and present address are needed.',
  'Enter who signed for the company and both witnesses.',
  'Upload the required papers.',
];

interface Witness {
  name: string;
  id_or_phone: string;
  address: string;
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

/**
 * Signing a flat or plot sale agreement the way a share purchase is signed
 * (BUYER-PORTAL-PLAN.md §2.7): terms, the buyer as named on the paper, the
 * signatures and witnesses, the papers on file, then review. The schedule is
 * written from the terms when it is signed. Unlike a share signing it keeps
 * no draft — it is one sitting at the table.
 */
export function SignBookingWizard({
  booking,
  customer,
  uploads,
  onDone,
}: {
  booking: Booking;
  customer: Customer;
  uploads: CustomerUpload[];
  onDone: () => void;
}) {
  const today = todayLocal();
  const [at, setAt] = useState(0);
  const [terms, setTerms] = useState<AgreementForm>(() => agreementFromBooking(booking, today));
  const [kyc, setKyc] = useState<Record<KycField, string>>(
    () => Object.fromEntries(KYC_FIELDS.map((k) => [k, (customer[k] as string | null | undefined) ?? ''])) as Record<KycField, string>,
  );
  const [place, setPlace] = useState(booking.signing?.place ?? 'Company office, Gulshan, Dhaka');
  const [signatory, setSignatory] = useState(booking.signing?.company_signatory ?? '');
  const [signatoryTitle, setSignatoryTitle] = useState(booking.signing?.company_signatory_title ?? 'Managing Director');
  const [attorney, setAttorney] = useState(booking.signing?.attorney_name ?? '');
  const [witnesses, setWitnesses] = useState<Witness[]>(() => {
    const w = (booking.signing?.witnesses ?? []).map((x) => ({ name: x.name, id_or_phone: x.id_or_phone ?? '', address: x.address ?? '' }));
    while (w.length < 2) w.push({ name: '', id_or_phone: '', address: '' });
    return w;
  });
  const [stampValue, setStampValue] = useState(String(booking.signing?.stamp_value ?? 300));
  const [stampSerial, setStampSerial] = useState(booking.signing?.stamp_serial ?? '');
  const [notarizedOn, setNotarizedOn] = useState(booking.signing?.notarized_on ?? '');
  const [notary, setNotary] = useState(booking.signing?.notary_name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const k = (key: KycField) => kyc[key] ?? '';
  const setK = (key: KycField) => (e: { target: { value: string } }) => setKyc((x) => ({ ...x, [key]: e.target.value }));
  const setW = (i: number, key: keyof Witness, value: string) => setWitnesses((ws) => ws.map((w, j) => (j === i ? { ...w, [key]: value } : w)));

  const termErrors = validateAgreement(terms);
  const checklist = paperChecklist(uploads, { kind: 'booking', id: booking.id }, { has_nominee: !!k('nominee_name').trim(), by_attorney: !!attorney.trim() });
  const missingDocs = missingToSign(checklist);
  const steps: WizardStep[] = [
    { label: STEP_LABEL[0], done: Object.keys(termErrors).length === 0 && !!place.trim() && terms.agreement_date <= today },
    { label: STEP_LABEL[1], done: !!(k('nid').trim() && k('father_or_spouse_name').trim() && k('address').trim()) },
    { label: STEP_LABEL[2], done: !!signatory.trim() && witnesses.every((w) => w.name.trim()) },
    { label: STEP_LABEL[3], done: missingDocs.length === 0, sub: missingDocs.length ? `${missingDocs.length} required missing` : undefined },
    { label: STEP_LABEL[4], done: false },
  ];
  const allReady = steps.slice(0, 4).every((x) => x.done);

  const input = agreementInput(terms);
  const rows = bookingScheduleRows({ ...booking, ...input });
  const installments = rows.filter((r) => r.kind !== 'booking_money');

  const review: [string, string][] = [
    ['Signed on', `${formatDate(terms.agreement_date)} at ${place}`],
    ['Price', `${formatBdt(booking.final_price)} · booking money ${formatBdt(booking.booking_amount)}`],
    [
      'Plan',
      installments.length > 1
        ? `${installments.length} × ${formatBdt(installments[0].amount)} from ${formatDate(installments[0].due_date)}`
        : installments.length === 1
          ? `${formatBdt(installments[0].amount)} by ${formatDate(installments[0].due_date)}`
          : '—',
    ],
    ['Late fee', input.late_fee_pct ? `${input.late_fee_pct}% after ${input.late_fee_grace_days ?? 0} days` : 'None'],
    ['Buyer', `${customer.name}, son/daughter/wife of ${k('father_or_spouse_name')}`],
    ['NID', k('nid')],
    ['Nominee', k('nominee_name') ? `${k('nominee_name')}${k('nominee_relation') ? ` (${k('nominee_relation')})` : ''}` : '—'],
    ['For the company', [signatory, signatoryTitle].filter(Boolean).join(', ')],
    ['Witnesses', witnesses.map((w) => w.name).join(' and ')],
    ['Stamp paper', stampValue ? `${formatBdt(Number(stampValue))}${stampSerial ? ` · no. ${stampSerial}` : ''}` : '—'],
    ['Papers on file', `${checklist.filter((c) => c.done).length} of ${checklist.length}`],
  ];

  async function sign() {
    setBusy(true);
    setError('');
    try {
      await bookingRepository.signAgreement(booking.id, {
        agreement: input,
        customer: kyc,
        signing: {
          place,
          company_signatory: signatory,
          company_signatory_title: signatoryTitle,
          attorney_name: attorney,
          witnesses,
          stamp_value: stampValue ? Number(stampValue) : null,
          stamp_serial: stampSerial,
          notarized_on: notarizedOn || null,
          notary_name: notary,
        },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The agreement could not be signed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <WizardStepper steps={steps} active={at} onSelect={setAt} />

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          {at === 0 && (
            <Section n={1} title="Agreement terms" subtitle="How the buyer pays — the schedule on the Payments tab is written from this.">
              <AgreementFields
                value={terms}
                onChange={setTerms}
                errors={termErrors}
                finalPrice={booking.final_price}
                bookingAmount={booking.booking_amount}
              />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Signed at" required>
                  <TextInput value={place} onChange={(e) => setPlace(e.target.value)} />
                </Field>
              </div>
            </Section>
          )}

          {at === 1 && (
            <Section n={2} title="Buyer as named on the agreement" subtitle="Saved on the customer when signed, and shown on their Customer Portal profile.">
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
            </Section>
          )}

          {at === 2 && (
            <Section n={3} title="Signatures, witnesses and stamp" subtitle="As written at the foot of the agreement.">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Signed for the company by" required>
                  <TextInput value={signatory} onChange={(e) => setSignatory(e.target.value)} placeholder="Full name" />
                </Field>
                <Field label="Designation">
                  <TextInput value={signatoryTitle} onChange={(e) => setSignatoryTitle(e.target.value)} />
                </Field>
                <Field label="Signed for the buyer by" hint="only under a power of attorney">
                  <TextInput value={attorney} onChange={(e) => setAttorney(e.target.value)} placeholder="Attorney’s name" />
                </Field>
              </div>
              {witnesses.map((w, i) => (
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
                  <MoneyInput value={stampValue} onChange={(e) => setStampValue(e.target.value)} />
                </Field>
                <Field label="Stamp serial no.">
                  <TextInput value={stampSerial} onChange={(e) => setStampSerial(e.target.value)} />
                </Field>
                <Field label="Notarized on">
                  <TextInput type="date" value={notarizedOn} min={terms.agreement_date} onChange={(e) => setNotarizedOn(e.target.value)} />
                </Field>
                <Field label="Notary public">
                  <TextInput value={notary} onChange={(e) => setNotary(e.target.value)} />
                </Field>
              </div>
            </Section>
          )}

          {at === 3 && (
            <Section n={4} title="Papers on file" subtitle="Scan the signed agreement and anything handed over at the table. Papers the buyer sent from the portal, or filed for a share purchase, count too.">
              <ShareDocumentChecklist
                uploads={uploads}
                sale={{ id: booking.id, code: booking.code, customer_id: booking.customer_id }}
                owner="booking"
                hasNominee={!!k('nominee_name').trim()}
                byAttorney={!!attorney.trim()}
                mayEdit
              />
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
              {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </Section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" disabled={at === 0} onClick={() => setAt(at - 1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {at < 4 ? (
              <div className="flex items-center gap-3">
                {!steps[at].done && <span className="text-xs text-ink-muted">{STEP_HINT[at]}</span>}
                <Button disabled={!steps[at].done} onClick={() => setAt(at + 1)}>
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
                  onClick={() => setAt(i)}
                  className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 disabled:hover:bg-transparent"
                >
                  {st.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-admin-600" /> : <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" />}
                  <span className={cn(st.done ? 'text-ink' : 'text-ink-muted')}>{st.label}</span>
                </button>
              </li>
            ))}
          </ul>
          {missingDocs.length > 0 && (
            <p className="mt-3 text-xs text-red-600">Papers still needed: {missingDocs.map((m) => m.meta.label).join(', ')}</p>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            {allReady ? 'All set — review and sign on the last step.' : 'Each step opens once the one before it is complete.'}
          </p>
        </Card>
      </div>
    </div>
  );
}
