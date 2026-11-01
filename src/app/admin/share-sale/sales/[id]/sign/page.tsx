'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CheckCircle2, Circle, FileSignature, XCircle } from 'lucide-react';
import { ShareDocumentChecklist } from '@/components/admin/share-sale/ShareDocuments';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, MoneyInput, SelectInput, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import { SHARE_PAYMENT_METHODS, type Customer, type SharePaymentMethod } from '@/lib/db/types';
import { addMonths } from '@/lib/domain/booking';
import { missingToSign, shareDocChecklist } from '@/lib/domain/share-documents';
import { FREQUENCY_LABEL, SHARE_PAYMENT_METHOD_LABEL, buildSchedule, formatSharePct } from '@/lib/domain/share-sale';
import { customerUploadRepository, shareSaleOverview, shareSaleRepository, type KycField } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

type Kyc = Record<KycField, string>;
const blankWitness = { name: '', id_or_phone: '', address: '' };

function kycOf(c: Customer): Kyc {
  const v = (x: string | null | undefined) => x ?? '';
  return {
    email: v(c.email),
    nid: v(c.nid),
    tin: v(c.tin),
    date_of_birth: v(c.date_of_birth),
    profession: v(c.profession),
    address: v(c.address),
    permanent_address: v(c.permanent_address),
    father_or_spouse_name: v(c.father_or_spouse_name),
    nominee_name: v(c.nominee_name),
    nominee_relation: v(c.nominee_relation),
    nominee_phone: v(c.nominee_phone),
    nominee_nid: v(c.nominee_nid),
    bank_name: v(c.bank_name),
    bank_branch: v(c.bank_branch),
    bank_account: v(c.bank_account),
    kyc_verified_on: v(c.kyc_verified_on),
  };
}

function Step({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: ReactNode }) {
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
 * Signing a share purchase agreement (PROJECT-SHARE-SALE-PLAN.md §4a): the
 * dates that write the schedule, the customer's details as the agreement
 * states them, who signed and witnessed it on which stamp paper, and the
 * papers that must be on file — then, optionally, the down payment handed
 * over at the table.
 */
function SignForm({ id }: { id: string }) {
  const router = useRouter();
  const { userId } = useMockSession();
  const data = useLiveQuery(() => shareSaleOverview(), []);
  const row = data?.sales.find((r) => r.sale.id === id);
  const uploads = useLiveQuery(() => (row ? customerUploadRepository.forCustomer(row.sale.customer_id) : Promise.resolve([])), [row?.sale.customer_id]);
  const today = todayLocal();
  const step = row?.sale.installment_frequency === 'quarterly' ? 3 : 1;

  const [date, setDate] = useState(today);
  const [first, setFirst] = useState<string | null>(null);
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [place, setPlace] = useState('Company office, Gulshan, Dhaka');
  const [signatory, setSignatory] = useState('');
  const [signatoryTitle, setSignatoryTitle] = useState('Managing Director');
  const [witnesses, setWitnesses] = useState([{ ...blankWitness }, { ...blankWitness }]);
  const [stampValue, setStampValue] = useState('300');
  const [stampSerial, setStampSerial] = useState('');
  const [notarizedOn, setNotarizedOn] = useState('');
  const [notary, setNotary] = useState('');
  const [attorney, setAttorney] = useState('');
  const [takeDown, setTakeDown] = useState(true);
  const [method, setMethod] = useState<SharePaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!data || !uploads) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!row || !row.customer) return <EmptyState icon={XCircle} title="Purchase not found" action={<Link href="/admin/share-sale/investors">Back to investors</Link>} />;
  const s = row.sale;
  if (s.status !== 'reserved') {
    return <EmptyState icon={FileSignature} title="This agreement is already signed" action={<Link href={`/admin/share-sale/sales/${s.id}`}>Open the purchase</Link>} />;
  }
  const k = kyc ?? kycOf(row.customer);
  const setK = (key: KycField) => (e: { target: { value: string } }) => setKyc({ ...k, [key]: e.target.value });
  const firstDue = first ?? addMonths(date, step);
  const rows = s.installment_count > 0 && firstDue > date ? buildSchedule({ ...s, agreement_date: date, first_due_date: firstDue }) : [];
  const customerSales = data.sales.filter((r) => r.sale.customer_id === s.customer_id).map((r) => r.sale);
  const checklist = shareDocChecklist(uploads, s.id, { has_nominee: !!k.nominee_name.trim(), by_attorney: !!attorney.trim() });
  const missingDocs = missingToSign(checklist);
  const setW = (i: number, key: keyof typeof blankWitness, value: string) => setWitnesses(witnesses.map((w, j) => (j === i ? { ...w, [key]: value } : w)));

  const ready: [string, boolean][] = [
    ['Signing day and schedule', !!date && (s.installment_count === 0 || firstDue > date)],
    ['NID, father’s / spouse’s name, address', !!(k.nid.trim() && k.father_or_spouse_name.trim() && k.address.trim())],
    ['Place and company signatory', !!(place.trim() && signatory.trim())],
    ['Two witnesses', witnesses.every((w) => w.name.trim())],
    ['Required papers on file', missingDocs.length === 0],
  ];
  const allReady = ready.every(([, ok]) => ok);

  const sign = async () => {
    setBusy(true);
    setError('');
    try {
      await shareSaleRepository.signAgreement(
        s.id,
        {
          agreement_date: date,
          first_due_date: firstDue,
          customer: k,
          signing: {
            place,
            company_signatory: signatory,
            company_signatory_title: signatoryTitle,
            witnesses,
            stamp_value: stampValue === '' ? null : Number(stampValue),
            stamp_serial: stampSerial,
            notarized_on: notarizedOn || null,
            notary_name: notary,
            attorney_name: attorney,
          },
          down_payment: takeDown ? { method, reference } : null,
        },
        userId,
      );
      router.push(`/admin/share-sale/sales/${s.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign.');
      setBusy(false);
    }
  };

  return (
    <>
      <Link href={`/admin/share-sale/sales/${s.id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-admin-700">
        <ArrowLeft className="size-4" /> {s.code}
      </Link>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Sign the share purchase agreement</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {row.customer.name} · {s.shares} share{s.shares === 1 ? '' : 's'} ({formatSharePct(s.share_pct)}) of {row.project?.name} · {formatBdt(s.total_price)}
        </p>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Step n={1} title="Agreement and schedule" subtitle="The signing day is when the down payment falls due; installments follow from the first due date.">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Signed on" required>
                <TextInput type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              </Field>
              {s.installment_count > 0 && (
                <Field label="First installment due" required>
                  <TextInput type="date" value={firstDue} min={date} onChange={(e) => setFirst(e.target.value)} />
                </Field>
              )}
              <Field label="Signed at" required>
                <TextInput value={place} onChange={(e) => setPlace(e.target.value)} />
              </Field>
            </div>
            <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink-muted">
              Down payment <span className="font-medium text-ink">{formatBdt(s.down_payment)}</span> on {formatDate(date)}
              {rows.length > 1 && (
                <>
                  , then {s.installment_count} {FREQUENCY_LABEL[s.installment_frequency].toLowerCase()} installments of <span className="font-medium text-ink">{formatBdt(rows[1].amount)}</span> from {formatDate(rows[1].due_date)} to{' '}
                  {formatDate(rows[rows.length - 1].due_date)}
                </>
              )}
              . An agreement number (AGR-…) is assigned when you sign.
            </p>
          </Step>

          <Step n={2} title="Customer as named on the agreement" subtitle="Saved on the customer, shown on their Customer Portal profile.">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Name">
                <TextInput value={row.customer.name} disabled />
              </Field>
              <Field label="Father’s / spouse’s name" required>
                <TextInput value={k.father_or_spouse_name} onChange={setK('father_or_spouse_name')} />
              </Field>
              <Field label="NID / passport no." required>
                <TextInput value={k.nid} onChange={setK('nid')} />
              </Field>
              <Field label="Date of birth">
                <TextInput type="date" value={k.date_of_birth} onChange={setK('date_of_birth')} />
              </Field>
              <Field label="e-TIN">
                <TextInput value={k.tin} onChange={setK('tin')} />
              </Field>
              <Field label="Profession">
                <TextInput value={k.profession} onChange={setK('profession')} />
              </Field>
              <Field label="Present address" required className="md:col-span-2">
                <TextInput value={k.address} onChange={setK('address')} />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={k.email} onChange={setK('email')} />
              </Field>
              <Field label="Permanent address" className="md:col-span-2">
                <TextInput value={k.permanent_address} onChange={setK('permanent_address')} placeholder="Village, upazila, district" />
              </Field>
              <Field label="KYC checked on" hint="once the papers are seen">
                <TextInput type="date" value={k.kyc_verified_on} onChange={setK('kyc_verified_on')} />
              </Field>
            </div>
            <p className="mt-5 mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">Nominee</p>
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Name">
                <TextInput value={k.nominee_name} onChange={setK('nominee_name')} />
              </Field>
              <Field label="Relation">
                <TextInput value={k.nominee_relation} onChange={setK('nominee_relation')} placeholder="e.g. Spouse" />
              </Field>
              <Field label="Mobile">
                <TextInput value={k.nominee_phone} onChange={setK('nominee_phone')} />
              </Field>
              <Field label="NID">
                <TextInput value={k.nominee_nid} onChange={setK('nominee_nid')} />
              </Field>
            </div>
            <p className="mt-5 mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">Bank account for payouts</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Bank">
                <TextInput value={k.bank_name} onChange={setK('bank_name')} />
              </Field>
              <Field label="Branch">
                <TextInput value={k.bank_branch} onChange={setK('bank_branch')} />
              </Field>
              <Field label="Account no.">
                <TextInput value={k.bank_account} onChange={setK('bank_account')} />
              </Field>
            </div>
          </Step>

          <Step n={3} title="Signatures, witnesses and stamp" subtitle="As written at the foot of the agreement.">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Signed for the company by" required>
                <TextInput value={signatory} onChange={(e) => setSignatory(e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Designation">
                <TextInput value={signatoryTitle} onChange={(e) => setSignatoryTitle(e.target.value)} />
              </Field>
              <Field label="Signed for the customer by" hint="only under a power of attorney">
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
                <TextInput type="date" value={notarizedOn} min={date} onChange={(e) => setNotarizedOn(e.target.value)} />
              </Field>
              <Field label="Notary public">
                <TextInput value={notary} onChange={(e) => setNotary(e.target.value)} />
              </Field>
            </div>
          </Step>

          <Step n={4} title="Papers on file" subtitle="Scan the signed agreement and anything handed over at the table. Papers the customer sent from the portal count too.">
            <ShareDocumentChecklist uploads={uploads} sale={s} hasNominee={!!k.nominee_name.trim()} byAttorney={!!attorney.trim()} mayEdit sales={customerSales} />
          </Step>

          {s.down_payment > 0 && (
            <Step n={5} title="Down payment" subtitle="Record it now if it was handed over at the signing.">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={takeDown} onChange={(e) => setTakeDown(e.target.checked)} className="size-4 accent-admin-600" />
                {formatBdt(s.down_payment)} received on {formatDate(date)}
              </label>
              {takeDown && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Paid by">
                    <SelectInput value={method} onChange={(e) => setMethod(e.target.value as SharePaymentMethod)}>
                      {SHARE_PAYMENT_METHODS.filter((m) => m !== 'online').map((m) => (
                        <option key={m} value={m}>
                          {SHARE_PAYMENT_METHOD_LABEL[m]}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Reference" hint="cheque, pay order or deposit slip no.">
                    <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
                  </Field>
                </div>
              )}
            </Step>
          )}
        </div>

        <aside className="xl:sticky xl:top-20">
          <Card>
            <CardHeader title="Ready to sign?" />
            <ul className="space-y-2 text-sm">
              {ready.map(([label, ok]) => (
                <li key={label} className="flex items-start gap-2">
                  {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-admin-600" /> : <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" />}
                  <span className={cn(ok ? 'text-ink' : 'text-ink-muted')}>{label}</span>
                </li>
              ))}
            </ul>
            {missingDocs.length > 0 && <p className="mt-3 text-xs text-red-600">Still needed: {missingDocs.map((m) => m.meta.label).join(', ')}</p>}
            {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button className="mt-4 w-full" disabled={!allReady || busy} onClick={sign}>
              <FileSignature className="size-4" /> {busy ? 'Signing…' : 'Agreement signed'}
            </Button>
            <p className="mt-2 text-xs text-ink-muted">The shares count as sold from now on, and the customer sees the agreement on their portal.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}

export default function SignAgreementPage() {
  const { id } = useParams<{ id: string }>();
  return <SignForm id={id} />;
}
