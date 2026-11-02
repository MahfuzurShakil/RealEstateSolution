'use client';

import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileSignature, LogOut, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Checkbox, Field, MoneyInput, TextInput } from '@/components/ui/Field';
import type { WizardStep } from '@/components/ui/WizardStepper';
import type { KycField } from '@/lib/domain/signing';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';

/*
 * The pieces both signing wizards are built from — a share purchase
 * (SignAgreementWizard) and a flat or plot booking (SignBookingWizard) — so
 * the two read and behave the same (SHARE-SALE-FEEDBACK-PLAN.md B1, B2).
 */

/** One wizard step: its number, title and what it is for. */
export function StepSection({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-admin-50 text-sm font-semibold text-admin-700">{n}</span>
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </Card>
  );
}

/**
 * A group of fields inside a step — Identity, Nominee, Witnesses… A bold title
 * over a hairline, so the groups read apart (feedback B2), and the one grid
 * every group shares: two columns on a tablet, three on a desktop.
 */
export function FormGroup({ title, hint, action, children, grid = true }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; grid?: boolean }) {
  return (
    <section className="border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {hint && <p className="text-xs text-ink-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {grid ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div> : children}
    </section>
  );
}

/** a field spanning the whole row of a FormGroup grid */
export const FULL_ROW = 'md:col-span-2 xl:col-span-3';

export function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : formatDate(iso);
}

/* ------------------------------------------------------------- the party */

/**
 * The customer or buyer as named on the agreement: identity, contact and
 * address, nominee, payout bank (shares only) and the KYC check.
 */
export function KycFields({
  name,
  values,
  onChange,
  payoutBank,
}: {
  name: string;
  values: Partial<Record<KycField, string>>;
  onChange: (patch: Partial<Record<KycField, string>>) => void;
  /** a share purchase pays dividends out; a home sale does not */
  payoutBank?: boolean;
}) {
  const k = (key: KycField) => values[key] ?? '';
  const bind = (key: KycField) => ({ value: k(key), onChange: (e: { target: { value: string } }) => onChange({ [key]: e.target.value }) });
  const [samePlace, setSamePlace] = useState(() => !!k('address').trim() && k('permanent_address') === k('address'));

  return (
    <>
      <FormGroup title="Identity">
        <Field label="Name">
          <TextInput value={name} disabled />
        </Field>
        <Field label="Father’s / spouse’s name" required>
          <TextInput {...bind('father_or_spouse_name')} />
        </Field>
        <Field label="NID / passport no." required>
          <TextInput {...bind('nid')} />
        </Field>
        <Field label="Date of birth">
          <TextInput type="date" {...bind('date_of_birth')} />
        </Field>
        <Field label="e-TIN">
          <TextInput {...bind('tin')} />
        </Field>
        <Field label="Profession">
          <TextInput {...bind('profession')} />
        </Field>
      </FormGroup>

      <FormGroup title="Contact & address">
        <Field label="Email">
          <TextInput type="email" {...bind('email')} />
        </Field>
        <Field label="Present address" required className={FULL_ROW}>
          <TextInput
            value={k('address')}
            // a permanent address marked the same follows the present one
            onChange={(e) => onChange(samePlace ? { address: e.target.value, permanent_address: e.target.value } : { address: e.target.value })}
          />
        </Field>
        <Field label="Permanent address" className={FULL_ROW}>
          <TextInput {...bind('permanent_address')} disabled={samePlace} placeholder="Village, upazila, district" />
          <Checkbox
            label="Same as present address"
            className="mt-2"
            checked={samePlace}
            onChange={(e) => {
              setSamePlace(e.target.checked);
              if (e.target.checked) onChange({ permanent_address: k('address') });
            }}
          />
        </Field>
      </FormGroup>

      <FormGroup title="Nominee" hint="Who the holding passes to. Their NID copy becomes a required paper once a nominee is named.">
        <Field label="Name">
          <TextInput {...bind('nominee_name')} />
        </Field>
        <Field label="Relation">
          <TextInput {...bind('nominee_relation')} placeholder="e.g. Spouse" />
        </Field>
        <Field label="Mobile">
          <TextInput {...bind('nominee_phone')} />
        </Field>
        <Field label="NID">
          <TextInput {...bind('nominee_nid')} />
        </Field>
      </FormGroup>

      {payoutBank && (
        <FormGroup title="Bank account for payouts" hint="Where dividends and any refund are paid.">
          <Field label="Bank">
            <TextInput {...bind('bank_name')} />
          </Field>
          <Field label="Branch">
            <TextInput {...bind('bank_branch')} />
          </Field>
          <Field label="Account no.">
            <TextInput {...bind('bank_account')} />
          </Field>
        </FormGroup>
      )}

      <FormGroup title="KYC check">
        <Field label="KYC checked on" hint="Once the original papers are seen">
          <TextInput type="date" {...bind('kyc_verified_on')} />
        </Field>
      </FormGroup>
    </>
  );
}

/* ------------------------------------------------------------ signatures */

export interface WitnessInput {
  name: string;
  id_or_phone: string;
  address: string;
}

export interface SignatureValues {
  company_signatory: string;
  company_signatory_title: string;
  attorney_name: string;
  witnesses: WitnessInput[];
  stamp_value: string;
  stamp_serial: string;
  notarized_on: string;
  notary_name: string;
}

/** The foot of the agreement: who signed for the company, the witnesses, a power of attorney, the stamp and the notary. */
export function SignatureFields({
  values: v,
  onChange,
  party,
  signedOn,
}: {
  values: SignatureValues;
  onChange: (patch: Partial<SignatureValues>) => void;
  /** "customer" or "buyer" */
  party: string;
  signedOn: string;
}) {
  const [byAttorney, setByAttorney] = useState(() => !!v.attorney_name.trim());
  const setW = (i: number, key: keyof WitnessInput, value: string) => onChange({ witnesses: v.witnesses.map((w, j) => (j === i ? { ...w, [key]: value } : w)) });

  return (
    <>
      <FormGroup title="Signed for the company">
        <Field label="Signatory" required>
          <TextInput value={v.company_signatory} onChange={(e) => onChange({ company_signatory: e.target.value })} placeholder="Full name" />
        </Field>
        <Field label="Designation">
          <TextInput value={v.company_signatory_title} onChange={(e) => onChange({ company_signatory_title: e.target.value })} />
        </Field>
      </FormGroup>

      <FormGroup title="Witnesses" hint="Both witnesses sign at the foot of the agreement." grid={false}>
        <div className="grid gap-4 md:grid-cols-2">
          {v.witnesses.map((w, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-hairline bg-slate-50/50 p-4">
              <p className="text-sm font-semibold text-ink">Witness {i + 1}</p>
              <Field label="Name" required>
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
        </div>
      </FormGroup>

      <FormGroup title={`Signed for the ${party}`} grid={false}>
        <Checkbox
          label={`Someone signed for the ${party} under a power of attorney`}
          checked={byAttorney}
          onChange={(e) => {
            setByAttorney(e.target.checked);
            if (!e.target.checked) onChange({ attorney_name: '' });
          }}
        />
        {byAttorney && (
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Attorney’s name" hint="The power of attorney becomes a required paper">
              <TextInput value={v.attorney_name} onChange={(e) => onChange({ attorney_name: e.target.value })} placeholder="Full name" />
            </Field>
          </div>
        )}
      </FormGroup>

      <FormGroup title="Stamp & notary">
        <Field label="Stamp paper (BDT)" hint="Non-judicial">
          <MoneyInput value={v.stamp_value} onChange={(e) => onChange({ stamp_value: e.target.value })} />
        </Field>
        <Field label="Stamp serial no.">
          <TextInput value={v.stamp_serial} onChange={(e) => onChange({ stamp_serial: e.target.value })} />
        </Field>
        <div className="hidden xl:block" />
        <Field label="Notarized on">
          <TextInput type="date" value={v.notarized_on} min={signedOn} onChange={(e) => onChange({ notarized_on: e.target.value })} />
        </Field>
        <Field label="Notary public">
          <TextInput value={v.notary_name} onChange={(e) => onChange({ notary_name: e.target.value })} />
        </Field>
      </FormGroup>
    </>
  );
}

/** The signatures step is done once the company signatory and every witness are named. */
export function signaturesDone(v: Pick<SignatureValues, 'company_signatory' | 'witnesses'>): boolean {
  return !!v.company_signatory.trim() && v.witnesses.every((w) => w.name.trim());
}

/* ------------------------------------------------- review and the record */

/** Label / value pairs in two columns, as every read-only block shows them. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 text-sm">
          <dt className="shrink-0 text-ink-muted">{label}</dt>
          <dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{value === '' || value == null ? '—' : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One step's answers on the Review step, with a way back to change them (feedback B4). */
export function ReviewCard({ n, title, onEdit, children }: { n: number; title: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-admin-50 text-xs font-semibold text-admin-700">{n}</span>
        <h3 className="flex-1 text-sm font-semibold text-ink">{title}</h3>
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** A small bold heading inside a review card. */
export function SubHead({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold tracking-wide text-ink uppercase">{children}</p>;
}

/** The party's details as named on the agreement, grouped the way the step asks for them. */
export function KycFacts({ name, values, payoutBank }: { name: string; values: Partial<Record<KycField, string | null | undefined>>; payoutBank?: boolean }) {
  const k = (key: KycField) => values[key] ?? '';
  return (
    <>
      <div>
        <SubHead>Identity</SubHead>
        <Facts
          rows={[
            ['Name', name],
            ['Father’s / spouse’s name', k('father_or_spouse_name')],
            ['NID / passport no.', k('nid')],
            ['Date of birth', k('date_of_birth') ? formatDate(k('date_of_birth')) : ''],
            ['e-TIN', k('tin')],
            ['Profession', k('profession')],
          ]}
        />
      </div>
      <div>
        <SubHead>Contact & address</SubHead>
        <Facts
          rows={[
            ['Email', k('email')],
            ['Present address', k('address')],
            ['Permanent address', k('permanent_address')],
          ]}
        />
      </div>
      <div>
        <SubHead>Nominee</SubHead>
        <Facts
          rows={[
            ['Name', k('nominee_name')],
            ['Relation', k('nominee_relation')],
            ['Mobile', k('nominee_phone')],
            ['NID', k('nominee_nid')],
          ]}
        />
      </div>
      {payoutBank && (
        <div>
          <SubHead>Bank account for payouts</SubHead>
          <Facts
            rows={[
              ['Bank', k('bank_name')],
              ['Branch', k('bank_branch')],
              ['Account no.', k('bank_account')],
            ]}
          />
        </div>
      )}
      <Facts rows={[['KYC checked on', k('kyc_verified_on') ? formatDate(k('kyc_verified_on')) : 'Not yet']]} />
    </>
  );
}

/** What the signing record holds, typed or saved. */
export interface SigningRecordView {
  place?: string | null;
  company_signatory?: string | null;
  company_signatory_title?: string | null;
  attorney_name?: string | null;
  witnesses: { name: string; id_or_phone?: string | null; address?: string | null }[];
  stamp_value?: number | string | null;
  stamp_serial?: string | null;
  notarized_on?: string | null;
  notary_name?: string | null;
}

/**
 * The signing event itself — who signed, who witnessed, the stamp and the
 * notary. The Review step shows it before signing, the Agreement tab after;
 * nothing else (plan, customer, papers) is repeated here (feedback D2).
 */
export function SigningFacts({ signing: s, partyName, party }: { signing: SigningRecordView; partyName: string; party: string }) {
  const stamp = s.stamp_value === '' || s.stamp_value == null ? null : Number(s.stamp_value);
  return (
    <>
      <div>
        <SubHead>Signatures</SubHead>
        <Facts
          rows={[
            ['For the company', [s.company_signatory, s.company_signatory_title].filter(Boolean).join(', ')],
            [`For the ${party}`, s.attorney_name ? `${s.attorney_name}, under a power of attorney` : partyName],
          ]}
        />
      </div>
      <div>
        <SubHead>Witnesses</SubHead>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {s.witnesses.map((w, i) => (
            <div key={i} className="rounded-xl border border-hairline bg-slate-50/50 px-4 py-3 text-sm">
              <p className="text-xs text-ink-muted">Witness {i + 1}</p>
              <p className="font-medium text-ink">{w.name || '—'}</p>
              {w.id_or_phone && <p className="text-xs text-ink-muted">{w.id_or_phone}</p>}
              {w.address && <p className="text-xs text-ink-muted">{w.address}</p>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <SubHead>Stamp & notary</SubHead>
        <Facts
          rows={[
            ['Stamp paper', stamp != null ? `BDT ${stamp.toLocaleString('en-IN')}${s.stamp_serial ? ` · no. ${s.stamp_serial}` : ''}` : ''],
            ['Notarized', s.notarized_on ? `${formatDate(s.notarized_on)}${s.notary_name ? ` · ${s.notary_name}` : ''}` : 'Not yet'],
          ]}
        />
      </div>
    </>
  );
}

/** The payment schedule the agreement writes, in a short scrolling table. */
export function SchedulePreview({ rows, note }: { rows: { label: string; due_date: string; amount: number }[]; note?: string }) {
  return (
    <div>
      <SubHead>Payment schedule · {rows.length} payment{rows.length === 1 ? '' : 's'}</SubHead>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-hairline">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-canvas text-left text-xs text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Payment</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r) => (
              <tr key={`${r.label}-${r.due_date}`}>
                <td className="px-3 py-1.5">{r.label}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatDate(r.due_date)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">BDT {Math.round(r.amount).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-2 text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

/** The papers on the Review step: each one, required or not, and whether it is on file. */
export function PaperFacts({ items }: { items: { label: string; required: boolean; done: boolean; files: number }[] }) {
  return (
    <ul className="grid gap-x-8 md:grid-cols-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center justify-between gap-3 border-b border-hairline py-2 text-sm">
          <span className="text-ink">
            {i.label}
            {i.required && <span className="ml-0.5 text-red-500">*</span>}
          </span>
          {i.done ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="size-3.5" /> On file
            </span>
          ) : (
            <span className={cn('text-xs font-medium', i.required ? 'text-red-600' : 'text-ink-muted')}>{i.required ? 'Missing' : 'Not added'}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The last check before signing (feedback B5): what is being signed, what
 * happens next, and a tick that the signed paper copy was checked.
 */
export function SignConfirmDialog({
  open,
  code,
  lines,
  after,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  code: string;
  /** what is being signed, a line each */
  lines: string[];
  /** what signing sets off */
  after: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      title={`Sign agreement ${code}?`}
      tone="default"
      icon={FileSignature}
      confirmLabel={busy ? 'Signing…' : 'Sign agreement'}
      busy={busy}
      disabled={!checked}
      onConfirm={onConfirm}
      onCancel={() => {
        setChecked(false);
        onCancel();
      }}
    >
      <div className="space-y-3 text-sm">
        <ul className="space-y-1 rounded-xl bg-slate-50 px-4 py-3">
          {lines.map((l) => (
            <li key={l} className="text-ink">
              {l}
            </li>
          ))}
        </ul>
        <p className="text-ink-muted">{after}</p>
        <Checkbox label="The signed paper copy has been checked" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
      </div>
    </ConfirmDialog>
  );
}

/* ----------------------------------------------------------- the footer */

/**
 * Under every step (feedback B1): Back on the left; "Save draft & exit" and
 * the step's main button on the right. Moving between steps saves, and so
 * does leaving the page, so there is no separate Save.
 */
export function WizardFooter({
  canBack,
  onBack,
  status,
  onSaveExit,
  hint,
  children,
}: {
  canBack: boolean;
  onBack: () => void;
  /** "Draft saved 2 min ago" */
  status?: string;
  /** missing once the agreement is signed: nothing is left to save */
  onSaveExit?: () => void;
  /** what the step still needs before Next */
  hint?: string;
  /** the step's main button */
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={!canBack} onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <span className="mr-auto text-xs text-ink-muted">{status}</span>
        {onSaveExit && (
          <Button variant="outline" onClick={onSaveExit}>
            <LogOut className="size-4" /> Save draft &amp; exit
          </Button>
        )}
        {children}
      </div>
      {hint && <p className="text-right text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function NextButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button disabled={disabled} onClick={onClick}>
      Next: {label} <ArrowRight className="size-4" />
    </Button>
  );
}

/** "Draft saved 2 min ago" / "Changes not saved yet" */
export function draftStatus(dirty: boolean, savedAt: string): string {
  if (dirty) return 'Changes not saved yet — they are saved when you move to another step.';
  return savedAt ? `Draft saved ${ago(savedAt)}` : 'The draft is saved at every step.';
}

/** The side card: which steps are complete, and which papers are still missing. */
export function ReadyCard({ steps, onSelect, missing }: { steps: WizardStep[]; onSelect: (i: number) => void; missing: string[] }) {
  const allReady = steps.every((x) => x.done);
  return (
    <Card>
      <CardHeader title="Ready to sign?" />
      <ul className="space-y-1 text-sm">
        {steps.map((st, i) => (
          <li key={st.label}>
            <button
              type="button"
              disabled={!steps.slice(0, i).every((x) => x.done)}
              onClick={() => onSelect(i)}
              className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 disabled:hover:bg-transparent"
            >
              {st.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-admin-600" /> : <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" />}
              <span className={cn(st.done ? 'text-ink' : 'text-ink-muted')}>{st.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {missing.length > 0 && <p className="mt-3 text-xs text-red-600">Papers still needed: {missing.join(', ')}</p>}
      <p className="mt-3 text-xs text-ink-muted">{allReady ? 'All set — review and sign on the last step.' : 'Each step opens once the one before it is complete.'}</p>
    </Card>
  );
}
