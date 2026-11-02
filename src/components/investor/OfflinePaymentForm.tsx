'use client';

import { useRef, type ReactNode } from 'react';
import { Building2, FileText, Landmark, UploadCloud, X } from 'lucide-react';
import { OFFLINE_METHOD_LABEL, formatTaka, type DepositAccount, type OfflinePaymentMethod } from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';

/*
 * SHARE-SALE-FEEDBACK-PLAN.md C1 — paying at the bank instead of online. The
 * customer says how and where they paid, the date and number on the slip, and
 * attaches the slip. The office checks it against the bank before anything
 * counts as paid.
 */

export interface SlipForm {
  method: OfflinePaymentMethod;
  paid_into_account_id: string;
  paid_on: string;
  reference: string;
  note: string;
}

export const emptySlip = (today: string, accounts: DepositAccount[]): SlipForm => ({
  method: 'bank_deposit',
  paid_into_account_id: accounts[0]?.id ?? '',
  paid_on: today,
  reference: '',
  note: '',
});

export const slipReady = (s: SlipForm, file: File | null) => !!(s.paid_into_account_id && s.paid_on && s.reference.trim() && file);

const input =
  'h-12 w-full rounded-xl border-2 border-site-line bg-white px-4 text-[15px] transition-colors focus:border-site-primary focus:outline-none';

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="mb-1.5 block text-sm font-semibold">
      {children}
      {required && <span className="ml-0.5 text-site-danger">*</span>}
    </span>
  );
}

/** Online through the gateway, or already paid at the bank. */
export function PayHowChoice({ value, onChange }: { value: 'online' | 'offline'; onChange: (v: 'online' | 'offline') => void }) {
  const options = [
    { id: 'online' as const, title: 'Pay online now', hint: 'Card, mobile banking or net banking on the secure gateway. The receipt comes at once.', icon: Landmark },
    { id: 'offline' as const, title: 'I paid at the bank', hint: 'Deposit, transfer, cheque or pay order. Send us the slip; we confirm it within one working day.', icon: Building2 },
  ];
  return (
    <div className="grid gap-3 xl:grid-cols-2" role="radiogroup" aria-label="How are you paying?">
      {options.map((o) => {
        const on = value === o.id;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn('flex gap-3 rounded-2xl border-2 p-4 text-left transition-colors', on ? 'border-site-primary bg-site-primary-soft/40' : 'border-site-line bg-white hover:border-site-primary/50')}
          >
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', on ? 'bg-site-primary text-white' : 'bg-site-soft text-site-muted')}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold">{o.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-site-muted">{o.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function OfflinePaymentForm({
  value: v,
  onChange,
  accounts,
  file,
  onFile,
  amount,
  today,
}: {
  value: SlipForm;
  onChange: (patch: Partial<SlipForm>) => void;
  accounts: DepositAccount[];
  file: File | null;
  onFile: (f: File | null) => void;
  amount: number;
  today: string;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const account = accounts.find((a) => a.id === v.paid_into_account_id);
  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-site-ivory px-4 py-3 text-[13px] text-site-muted">
        You are reporting <span className="font-semibold text-site-ink">{formatTaka(amount)}</span>. It shows as <span className="font-semibold text-site-ink">under verification</span> until our accounts team finds it in the bank —
        then it is applied from the date on your slip, and your receipt is issued.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <Label required>How did you pay?</Label>
          <select className={input} value={v.method} onChange={(e) => onChange({ method: e.target.value as OfflinePaymentMethod })}>
            {(Object.keys(OFFLINE_METHOD_LABEL) as OfflinePaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {OFFLINE_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label required>Date on the slip</Label>
          <input type="date" className={input} max={today} value={v.paid_on} onChange={(e) => onChange({ paid_on: e.target.value })} />
        </label>
        <label className="block sm:col-span-2">
          <Label required>Paid into</Label>
          <select className={input} value={v.paid_into_account_id} onChange={(e) => onChange({ paid_into_account_id: e.target.value })}>
            {accounts.length === 0 && <option value="">No account listed — please call our office</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bank_name || a.name}
                {a.branch ? `, ${a.branch}` : ''}
                {a.account_number ? ` · ${a.account_number}` : ''}
              </option>
            ))}
          </select>
          {account && <span className="mt-1 block text-xs text-site-muted">Account name: {account.name}</span>}
        </label>
        <label className="block sm:col-span-2">
          <Label required>Transaction, slip or cheque number</Label>
          <input className={input} value={v.reference} onChange={(e) => onChange({ reference: e.target.value })} placeholder="As printed on the slip" />
        </label>
      </div>

      <div>
        <Label required>Slip or receipt</Label>
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border-2 border-site-line bg-white px-4 py-3">
            <FileText className="size-5 shrink-0 text-site-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
            <button type="button" aria-label="Remove the file" onClick={() => onFile(null)} className="rounded-lg p-1 text-site-muted hover:text-site-danger">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => pick.current?.click()}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-site-line bg-white px-4 py-6 text-center transition-colors hover:border-site-primary"
          >
            <UploadCloud className="size-6 text-site-primary" aria-hidden />
            <span className="text-sm font-semibold">Attach a photo or PDF of the slip</span>
            <span className="text-xs text-site-muted">PDF, JPG, PNG or WEBP</span>
          </button>
        )}
        <input
          ref={pick}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </div>

      <label className="block">
        <Label>Note for our office</Label>
        <input className={input} value={v.note} onChange={(e) => onChange({ note: e.target.value })} placeholder="Optional — e.g. deposited at the Uttara branch" />
      </label>
    </div>
  );
}
