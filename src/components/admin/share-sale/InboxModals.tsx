'use client';

import { useState } from 'react';
import { IdCard, MessageSquareText, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Customer, CustomerUpload, ShareOffering, ShareRequest } from '@/lib/db/types';
import { FREQUENCY_LABEL } from '@/lib/domain/share-sale';
import { customerRepository, customerUploadRepository, shareRequestRepository } from '@/lib/repositories';
import { formatBdt, todayLocal } from '@/lib/utils/format';
import { ErrorNote, useAction } from './ShareSaleModals';

export const UPLOAD_KIND_LABEL: Record<CustomerUpload['kind'], string> = {
  id_document: 'NID / passport copy',
  tin: 'TIN certificate',
  payment_proof: 'Payment slip / deposit proof',
  signed_copy: 'Signed agreement copy',
  other: 'Other document',
};

/** Opens a customer's file in a new tab. */
export async function openUpload(id: string) {
  const blob = await customerUploadRepository.file(id);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Reserves what a customer asked for on the Customer Portal. Shares and plan
 * start from the request; the office changes them to what was agreed on the call.
 */
export function ReserveFromRequestModal({ request, offering, available, customerName, onClose }: { request: ShareRequest; offering: ShareOffering; available: number; customerName: string; onClose: () => void }) {
  const { userId } = useMockSession();
  const [shares, setShares] = useState(String(request.shares));
  const [plan, setPlan] = useState(String(Math.min(request.installments, offering.max_installments)));
  const [downPct, setDownPct] = useState(String(request.installments === 0 ? 100 : offering.min_down_payment_pct));
  const { error, busy, run } = useAction();
  const n = Number(shares) || 0;
  const total = n * offering.price_per_share;
  const down = Math.round((total * (Number(downPct) || 0)) / 100);
  const inst = Number(plan) || 0;

  return (
    <Modal
      open
      title="Reserve the requested shares"
      subtitle={`${request.code} · ${customerName} · ${available} shares left in ${offering.code}`}
      icon={Ticket}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => run(() => shareRequestRepository.reserve(request.id, { shares: n, down_payment_pct: Number(downPct), installment_count: inst }, userId), onClose)}>
            Reserve {n} share{n === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {request.note && (
        <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink">
          <span className="text-ink-muted">Customer wrote:</span> “{request.note}”
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Shares" hint={`${offering.min_shares}–${Math.min(offering.max_shares, available)}`}>
          <TextInput inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Down payment %" hint={`at least ${offering.min_down_payment_pct}%`}>
          <TextInput inputMode="decimal" value={downPct} onChange={(e) => setDownPct(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Installments" hint={`up to ${offering.max_installments}, ${FREQUENCY_LABEL[offering.installment_frequency].toLowerCase()}`}>
          <SelectInput value={plan} onChange={(e) => setPlan(e.target.value)}>
            {Array.from({ length: offering.max_installments + 1 }, (_, k) => (
              <option key={k} value={k}>
                {k === 0 ? 'None — pay in full' : k}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
      <p className="mt-4 text-sm text-ink-muted tabular-nums">
        Total <span className="font-semibold text-ink">{formatBdt(total)}</span> · down payment {formatBdt(down)}
        {inst > 0 && ` · ${inst} × ${formatBdt(Math.round((total - down) / inst))}`}
      </p>
      <p className="mt-1 text-xs text-ink-muted">The shares are held for {offering.hold_days} days while the agreement is prepared. The customer sees “Shares reserved for you”.</p>
      <ErrorNote error={error} />
    </Modal>
  );
}

/** Notes a call to the customer, or turns the request down; the text is shown on the portal. */
export function RequestNoteModal({ request, kind, onClose }: { request: ShareRequest; kind: 'contacted' | 'decline'; onClose: () => void }) {
  const [note, setNote] = useState(request.office_note ?? '');
  const { error, busy, run } = useAction();
  const decline = kind === 'decline';
  return (
    <Modal
      open
      title={decline ? 'Decline this request' : 'Mark as contacted'}
      subtitle={`${request.code} · ${request.shares} shares`}
      tone={decline ? 'danger' : undefined}
      icon={decline ? undefined : MessageSquareText}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decline ? 'danger' : 'primary'}
            disabled={busy}
            onClick={() => run(() => (decline ? shareRequestRepository.decline(request.id, note) : shareRequestRepository.markContacted(request.id, note)), onClose)}
          >
            {decline ? 'Decline request' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label={decline ? 'Reason (the customer sees this)' : 'Note for the customer (optional)'} required={decline}>
        <TextArea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={decline ? 'e.g. The round is fully taken; we will tell you when Round 2 opens' : 'e.g. Spoke on the phone — agreement meeting on Sunday 11am'}
        />
      </Field>
      <ErrorNote error={error} />
    </Modal>
  );
}

/** Turns an uploaded file down; the customer is asked to send a new copy. */
export function RejectUploadModal({ upload, onClose }: { upload: CustomerUpload; onClose: () => void }) {
  const [note, setNote] = useState('');
  const { error, busy, run } = useAction();
  return (
    <Modal
      open
      title="Do not accept this file"
      subtitle={`${upload.title} · ${upload.file_name}`}
      tone="danger"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => run(() => customerUploadRepository.reject(upload.id, note), onClose)}>
            Send back
          </Button>
        </>
      }
    >
      <Field label="What is wrong (the customer sees this)" required>
        <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The NID copy is blurred — please upload a clear scan of both sides" />
      </Field>
      <ErrorNote error={error} />
    </Modal>
  );
}

/** The investor details the Customer Portal profile shows: KYC, nominee and payout bank. */
export function InvestorDetailsModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [f, setF] = useState({
    email: customer.email ?? '',
    address: customer.address ?? '',
    nid: customer.nid ?? '',
    tin: customer.tin ?? '',
    date_of_birth: customer.date_of_birth ?? '',
    kyc_verified_on: customer.kyc_verified_on ?? '',
    nominee_name: customer.nominee_name ?? '',
    nominee_relation: customer.nominee_relation ?? '',
    nominee_phone: customer.nominee_phone ?? '',
    bank_name: customer.bank_name ?? '',
    bank_branch: customer.bank_branch ?? '',
    bank_account: customer.bank_account ?? '',
  });
  const { error, busy, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]));
  return (
    <Modal
      open
      title="Investor details"
      subtitle={`${customer.name} · ${customer.code} — shown on their Customer Portal profile`}
      icon={IdCard}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => run(() => customerRepository.update(customer.id, clean), onClose)}>
            Save details
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <TextInput type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Date of birth">
          <TextInput type="date" value={f.date_of_birth} onChange={set('date_of_birth')} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <TextInput value={f.address} onChange={set('address')} />
        </Field>
        <Field label="NID / passport no.">
          <TextInput value={f.nid} onChange={set('nid')} />
        </Field>
        <Field label="TIN">
          <TextInput value={f.tin} onChange={set('tin')} />
        </Field>
        <Field label="KYC checked on" hint="leave empty until the documents are checked">
          <div className="flex gap-2">
            <TextInput type="date" value={f.kyc_verified_on} onChange={set('kyc_verified_on')} />
            {!f.kyc_verified_on && (
              <Button variant="outline" onClick={() => setF((x) => ({ ...x, kyc_verified_on: todayLocal() }))}>
                Today
              </Button>
            )}
          </div>
        </Field>
      </div>
      <p className="mt-6 mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">Nominee</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name">
          <TextInput value={f.nominee_name} onChange={set('nominee_name')} />
        </Field>
        <Field label="Relation">
          <TextInput value={f.nominee_relation} onChange={set('nominee_relation')} placeholder="e.g. Spouse" />
        </Field>
        <Field label="Mobile">
          <TextInput value={f.nominee_phone} onChange={set('nominee_phone')} />
        </Field>
      </div>
      <p className="mt-6 mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">Bank account for payouts</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bank">
          <TextInput value={f.bank_name} onChange={set('bank_name')} />
        </Field>
        <Field label="Branch">
          <TextInput value={f.bank_branch} onChange={set('bank_branch')} />
        </Field>
        <Field label="Account no.">
          <TextInput value={f.bank_account} onChange={set('bank_account')} />
        </Field>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}
