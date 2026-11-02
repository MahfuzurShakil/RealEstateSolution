'use client';

import { useEffect, useRef, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { ShareDocumentChecklist } from '@/components/admin/share-sale/ShareDocuments';
import {
  Facts,
  FormGroup,
  KycFacts,
  KycFields,
  NextButton,
  PaperFacts,
  ReadyCard,
  ReviewCard,
  SchedulePreview,
  SignConfirmDialog,
  SignatureFields,
  SigningFacts,
  StepSection,
  WizardFooter,
  draftStatus,
  signaturesDone,
  type SignatureValues,
  type WitnessInput,
} from '@/components/admin/signing/SigningParts';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { WizardStepper, type WizardStep } from '@/components/ui/WizardStepper';
import type { Booking, BookingSignDraft, Customer, CustomerUpload } from '@/lib/db/types';
import { bookingScheduleRows } from '@/lib/domain/booking';
import { missingToSign, paperChecklist } from '@/lib/domain/share-documents';
import { KYC_FIELDS, type KycField } from '@/lib/domain/signing';
import { bookingRepository } from '@/lib/repositories';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';
import {
  AgreementFields,
  agreementFromBooking,
  agreementInput,
  validateAgreement,
  type AgreementForm,
  type LateFeeDefaults,
} from './AgreementFields';

const STEP_LABEL = ['Terms', 'Buyer', 'Witnesses & stamp', 'Papers', 'Review'];
const STEP_HINT = [
  'Fill in the signing day, how the buyer pays and the place it was signed.',
  'NID, father’s / spouse’s name and present address are needed.',
  'Enter who signed for the company and both witnesses.',
  'Upload the required papers.',
];

type Witness = WitnessInput;

/** what decides whether there is anything unsaved: the draft without its time stamp */
const draftKey = (d: BookingSignDraft) => JSON.stringify({ ...d, step: 0, saved_at: '' });

/**
 * Signing a flat or plot sale agreement the way a share purchase is signed
 * (BUYER-PORTAL-PLAN.md §2.7), from the same pieces (SigningParts): terms,
 * the buyer as named on the paper, the signatures and witnesses, the papers
 * on file, then review. The schedule is written from the terms when it is
 * signed. Every step is saved on the booking as it is left (§10 F8), so the
 * office can stop at any step — "Save draft & exit" — and pick up later.
 */
export function SignBookingWizard({
  booking,
  customer,
  uploads,
  project,
  onDone,
}: {
  booking: Booking;
  customer: Customer;
  /** for the late fee a new agreement starts from */
  project?: LateFeeDefaults | null;
  uploads: CustomerUpload[];
  onDone: () => void;
}) {
  const today = todayLocal();
  // a saved draft wins over what the booking and the customer hold
  const draft = booking.signing ? null : (booking.sign_draft ?? null);
  const [at, setAt] = useState(Math.min(draft?.step ?? 0, 4));
  const [terms, setTerms] = useState<AgreementForm>(() => (draft?.terms as unknown as AgreementForm) ?? agreementFromBooking(booking, today, project));
  const [kyc, setKyc] = useState<Record<KycField, string>>(
    () =>
      (draft?.kyc as Record<KycField, string>) ??
      (Object.fromEntries(KYC_FIELDS.map((k) => [k, (customer[k] as string | null | undefined) ?? ''])) as Record<KycField, string>),
  );
  const [place, setPlace] = useState(draft?.place ?? booking.signing?.place ?? 'Company office, Gulshan, Dhaka');
  const [signatory, setSignatory] = useState(draft?.company_signatory ?? booking.signing?.company_signatory ?? '');
  const [signatoryTitle, setSignatoryTitle] = useState(draft?.company_signatory_title ?? booking.signing?.company_signatory_title ?? 'Managing Director');
  const [attorney, setAttorney] = useState(draft?.attorney_name ?? booking.signing?.attorney_name ?? '');
  const [witnesses, setWitnesses] = useState<Witness[]>(() => {
    if (draft?.witnesses?.length) return draft.witnesses;
    const w = (booking.signing?.witnesses ?? []).map((x) => ({ name: x.name, id_or_phone: x.id_or_phone ?? '', address: x.address ?? '' }));
    while (w.length < 2) w.push({ name: '', id_or_phone: '', address: '' });
    return w;
  });
  const [stampValue, setStampValue] = useState(draft?.stamp_value ?? String(booking.signing?.stamp_value ?? 300));
  const [stampSerial, setStampSerial] = useState(draft?.stamp_serial ?? booking.signing?.stamp_serial ?? '');
  const [notarizedOn, setNotarizedOn] = useState(draft?.notarized_on ?? booking.signing?.notarized_on ?? '');
  const [notary, setNotary] = useState(draft?.notary_name ?? booking.signing?.notary_name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /* ---------------------------------------------------------------- draft */
  const current: BookingSignDraft = {
    step: at,
    terms: terms as unknown as Record<string, string>,
    kyc,
    place,
    company_signatory: signatory,
    company_signatory_title: signatoryTitle,
    attorney_name: attorney,
    witnesses,
    stamp_value: stampValue,
    stamp_serial: stampSerial,
    notarized_on: notarizedOn,
    notary_name: notary,
    saved_at: '',
  };
  const [savedAt, setSavedAt] = useState(draft?.saved_at ?? '');
  const [savedKey, setSavedKey] = useState(() => draftKey(current));
  const dirty = draftKey(current) !== savedKey;
  const latest = useRef({ current, dirty });
  useEffect(() => {
    latest.current = { current, dirty };
  });

  const save = async (step = at) => {
    if (booking.signing) return;
    const next = { ...latest.current.current, step };
    await bookingRepository.saveSignDraft(booking.id, next);
    setSavedKey(draftKey(next));
    setSavedAt(new Date().toISOString());
  };
  const go = (step: number) => {
    setAt(step);
    void save(step);
  };

  // a step left half-typed is kept when the page is left
  useEffect(
    () => () => {
      if (latest.current.dirty && !booking.signing) void bookingRepository.saveSignDraft(booking.id, latest.current.current).catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const k = (key: KycField) => kyc[key] ?? '';
  const signature: SignatureValues = {
    company_signatory: signatory,
    company_signatory_title: signatoryTitle,
    attorney_name: attorney,
    witnesses,
    stamp_value: stampValue,
    stamp_serial: stampSerial,
    notarized_on: notarizedOn,
    notary_name: notary,
  };
  const setSigning = (p: Partial<SignatureValues>) => {
    if (p.company_signatory !== undefined) setSignatory(p.company_signatory);
    if (p.company_signatory_title !== undefined) setSignatoryTitle(p.company_signatory_title);
    if (p.attorney_name !== undefined) setAttorney(p.attorney_name);
    if (p.witnesses !== undefined) setWitnesses(p.witnesses);
    if (p.stamp_value !== undefined) setStampValue(p.stamp_value);
    if (p.stamp_serial !== undefined) setStampSerial(p.stamp_serial);
    if (p.notarized_on !== undefined) setNotarizedOn(p.notarized_on);
    if (p.notary_name !== undefined) setNotary(p.notary_name);
  };

  const termErrors = validateAgreement(terms);
  const checklist = paperChecklist(uploads, { kind: 'booking', id: booking.id }, { has_nominee: !!k('nominee_name').trim(), by_attorney: !!attorney.trim() });
  const missingDocs = missingToSign(checklist);
  const steps: WizardStep[] = [
    { label: STEP_LABEL[0], done: Object.keys(termErrors).length === 0 && !!place.trim() && terms.agreement_date <= today },
    { label: STEP_LABEL[1], done: !!(k('nid').trim() && k('father_or_spouse_name').trim() && k('address').trim()) },
    { label: STEP_LABEL[2], done: signaturesDone(signature) },
    { label: STEP_LABEL[3], done: missingDocs.length === 0, sub: missingDocs.length ? `${missingDocs.length} required missing` : undefined },
    { label: STEP_LABEL[4], done: false },
  ];
  const allReady = steps.slice(0, 4).every((x) => x.done);

  const input = agreementInput(terms);
  const rows = bookingScheduleRows({ ...booking, ...input });
  const installments = rows.filter((r) => r.kind !== 'booking_money');

  const plan =
    installments.length > 1
      ? `${installments.length} × ${formatBdt(installments[0].amount)} from ${formatDate(installments[0].due_date)}`
      : installments.length === 1
        ? `${formatBdt(installments[0].amount)} by ${formatDate(installments[0].due_date)}`
        : '—';

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
      setConfirming(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The agreement could not be signed.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <WizardStepper steps={steps} active={at} onSelect={go} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {at === 0 && (
            <StepSection n={1} title="Agreement terms" subtitle="How the buyer pays — the schedule on the Payments tab is written from this.">
              <FormGroup title="Payment terms" grid={false}>
                <AgreementFields
                  value={terms}
                  onChange={setTerms}
                  errors={termErrors}
                  finalPrice={booking.final_price}
                  bookingAmount={booking.booking_amount}
                />
              </FormGroup>
              <FormGroup title="Signing">
                <Field label="Signed at" required className="xl:col-span-2">
                  <TextInput value={place} onChange={(e) => setPlace(e.target.value)} />
                </Field>
              </FormGroup>
            </StepSection>
          )}

          {at === 1 && (
            <StepSection n={2} title="Buyer as named on the agreement" subtitle="Saved on the customer when signed, and shown on their Customer Portal profile.">
              <KycFields name={customer.name} values={kyc} onChange={(patch) => setKyc((x) => ({ ...x, ...patch }))} />
            </StepSection>
          )}

          {at === 2 && (
            <StepSection n={3} title="Signatures, witnesses and stamp" subtitle="As written at the foot of the agreement.">
              <SignatureFields values={signature} onChange={setSigning} party="buyer" signedOn={terms.agreement_date} />
            </StepSection>
          )}

          {at === 3 && (
            <StepSection n={4} title="Papers on file" subtitle="Scan the signed agreement and anything handed over at the table. Papers the buyer sent from the portal, or filed for a share purchase, count too.">
              <ShareDocumentChecklist
                uploads={uploads}
                sale={{ id: booking.id, code: booking.code, customer_id: booking.customer_id }}
                owner="booking"
                hasNominee={!!k('nominee_name').trim()}
                byAttorney={!!attorney.trim()}
                mayEdit
              />
            </StepSection>
          )}

          {at === 4 && (
            <StepSection n={5} title="Review" subtitle="Everything that goes on the agreement, step by step. Change anything with Edit, then sign.">
              <ReviewCard n={1} title="Agreement terms" onEdit={() => go(0)}>
                <Facts
                  rows={[
                    ['Signed on', formatDate(terms.agreement_date)],
                    ['Signed at', place],
                    ['Price', formatBdt(booking.final_price)],
                    ['Booking money', formatBdt(booking.booking_amount)],
                    ['Plan', plan],
                    ['Late fee', input.late_fee_pct ? `${input.late_fee_pct}% after ${input.late_fee_grace_days ?? 0} days` : 'None'],
                  ]}
                />
                <SchedulePreview rows={rows.map((r) => ({ label: r.label, due_date: r.due_date, amount: r.amount }))} />
              </ReviewCard>
              <ReviewCard n={2} title="Buyer as named on the agreement" onEdit={() => go(1)}>
                <KycFacts name={customer.name} values={kyc} />
              </ReviewCard>
              <ReviewCard n={3} title="Signatures, witnesses and stamp" onEdit={() => go(2)}>
                <SigningFacts signing={signature} partyName={customer.name} party="buyer" />
              </ReviewCard>
              <ReviewCard n={4} title="Papers on file" onEdit={() => go(3)}>
                <PaperFacts items={checklist.filter((c) => c.required || c.files.length).map((c) => ({ label: c.meta.label, required: c.required, done: c.done, files: c.files.length }))} />
              </ReviewCard>
              {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </StepSection>
          )}

          <WizardFooter
            canBack={at > 0}
            onBack={() => go(at - 1)}
            status={booking.signing ? undefined : draftStatus(dirty, savedAt)}
            onSaveExit={
              booking.signing
                ? undefined
                : async () => {
                    await save();
                    onDone();
                  }
            }
            hint={at < 4 && !steps[at].done ? STEP_HINT[at] : undefined}
          >
            {at < 4 ? (
              <NextButton label={STEP_LABEL[at + 1]} disabled={!steps[at].done} onClick={() => go(at + 1)} />
            ) : (
              <Button disabled={!allReady || busy} onClick={() => setConfirming(true)}>
                <FileSignature className="size-4" /> Sign agreement
              </Button>
            )}
          </WizardFooter>
          <SignConfirmDialog
            open={confirming}
            code={booking.code}
            lines={[`${customer.name} · ${formatBdt(booking.final_price)}`, `Plan: ${plan}`, `Signed ${formatDate(terms.agreement_date)} at ${place}`]}
            after="After signing, the terms are fixed, the payment schedule is written, and the buyer sees the agreement on their Customer Portal."
            busy={busy}
            onConfirm={() => void sign()}
            onCancel={() => setConfirming(false)}
          />
        </div>

        <ReadyCard steps={steps.slice(0, 4)} onSelect={go} missing={missingDocs.map((m) => m.meta.label)} />
      </div>
    </div>
  );
}
