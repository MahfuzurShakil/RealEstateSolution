'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Customer, Lead } from '@/lib/db/types';
import {
  customerRepository,
  leadRepository,
  normalizePhone,
  type CustomerWithRelations,
} from '@/lib/repositories';

interface FormState {
  name: string;
  phone: string;
  email: string;
  nid: string;
  address: string;
  profession: string;
  lead_id: string;
}

const EMPTY: FormState = {
  name: '',
  phone: '',
  email: '',
  nid: '',
  address: '',
  profession: '',
  lead_id: '',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Add / Edit form for a customer (Section 5.3).
 *
 * Picking the lead copies name/phone/email across, so converting a booked lead
 * is not a retyping exercise. Phone is unique here as it is on leads, so the
 * form checks it before saving.
 */
export function CustomerForm({ customer }: { customer?: CustomerWithRelations }) {
  const router = useRouter();
  const params = useSearchParams();
  const { userId } = useMockSession();
  const isEdit = Boolean(customer);

  const [form, setForm] = useState<FormState>(customer ? toFormState(customer) : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /** Leads worth converting — booked ones first, but any lead is allowed. */
  const leads = useLiveQuery<Lead[]>(() => leadRepository.list(), []) ?? [];

  // "Create customer" from a lead page hands the lead in through the URL
  useEffect(() => {
    const leadId = params.get('lead');
    if (!leadId) return;
    leadRepository.getById(leadId).then((lead) => {
      if (!lead) return;
      setForm((f) =>
        f.name || f.phone
          ? f
          : {
              ...f,
              lead_id: lead.id,
              name: lead.name,
              phone: lead.phone,
              email: lead.email ?? '',
            },
      );
    });
  }, [params]);

  const duplicate =
    useLiveQuery<Customer | null>(
      () =>
        normalizePhone(form.phone).length < 11
          ? Promise.resolve<Customer | null>(null)
          : customerRepository.findByPhone(form.phone).then((match) => {
              if (!match) return null;
              return match.id === customer?.id ? null : match;
            }),
      [form.phone, customer?.id],
    ) ?? null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Choosing a lead pulls its details over (Section 5.3). */
  function pickLead(leadId: string) {
    const lead = leads.find((l) => l.id === leadId);
    setForm((f) => ({
      ...f,
      lead_id: leadId,
      ...(lead
        ? { name: lead.name, phone: lead.phone, email: lead.email ?? f.email }
        : {}),
    }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.phone.trim()) next.phone = 'Phone is required';
    else if (normalizePhone(form.phone).length < 11) next.phone = 'Enter a full 11-digit number';
    else if (duplicate) next.phone = `${duplicate.code} already uses this number`;
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: normalizePhone(form.phone),
        email: form.email.trim() || null,
        nid: form.nid.trim() || null,
        address: form.address.trim() || null,
        profession: form.profession.trim() || null,
        lead_id: form.lead_id || null,
      };

      if (customer) {
        await customerRepository.update(customer.id, payload);
        router.push(`/admin/customers/${customer.id}`);
        return;
      }
      const saved = await customerRepository.create({ ...payload, code: '' }, userId);
      router.push(`/admin/customers/${saved.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">
      <Card>
        <CardHeader title="Customer" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field
            label="Converted From Lead"
            className="xl:col-span-3"
            hint="Picking a lead copies the name, phone and email across."
          >
            <SelectInput
              value={form.lead_id}
              disabled={isEdit}
              onChange={(e) => pickLead(e.target.value)}
            >
              <option value="">Not from a lead (walk-in buyer)</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name} ({l.status.replace(/_/g, ' ')})
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Name" required error={errors.name}>
            <TextInput
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Kamrul Hasan Chowdhury"
              invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label="Phone" required error={errors.phone}>
            <TextInput
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="e.g. 01711 223344"
              invalid={Boolean(errors.phone)}
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="e.g. kamrul@example.com"
              invalid={Boolean(errors.email)}
            />
          </Field>

          <Field label="NID">
            <TextInput
              value={form.nid}
              onChange={(e) => set('nid', e.target.value)}
              placeholder="e.g. 1990123456789"
            />
          </Field>
          <Field label="Profession">
            <TextInput
              value={form.profession}
              onChange={(e) => set('profession', e.target.value)}
              placeholder="e.g. Businessman, Doctor, Service holder"
            />
          </Field>
          <Field label="Address" className="md:col-span-2 xl:col-span-3">
            <TextArea
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Present address"
            />
          </Field>
        </div>

        {duplicate && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {duplicate.code} — {duplicate.name} already uses this number
            </p>
            <p className="mt-1 text-xs text-amber-700">
              One customer per phone number. Open the existing record and add the new booking
              there instead.
            </p>
            <Link href={`/admin/customers/${duplicate.id}`} className="mt-3 inline-block">
              <Button variant="outline" size="sm">
                Open {duplicate.code}
              </Button>
            </Link>
          </div>
        )}

        <p className="mt-4 flex items-start gap-2 text-xs text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          NID and photo copies are uploaded on the customer&apos;s Documents tab after saving.
        </p>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || Boolean(duplicate)}>
          {saving ? 'Saving…' : customer ? 'Save changes' : 'Create customer'}
        </Button>
      </div>
    </form>
  );
}

function toFormState(customer: CustomerWithRelations): FormState {
  return {
    name: customer.name,
    phone: customer.phone,
    email: str(customer.email),
    nid: str(customer.nid),
    address: str(customer.address),
    profession: str(customer.profession),
    lead_id: str(customer.lead_id),
  };
}
