'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { UserPlus } from 'lucide-react';
import type { Landowner } from '@/lib/db/types';
import { isValidBdPhone, isValidNid } from '@/lib/utils/format';
import { landownerRepository } from '@/lib/repositories';

/**
 * Create/edit a landowner. Landowners are a reusable master list (Section 2.4),
 * so this is used both from the Landowners page and inline from the Land form.
 *
 * The dialog mounts only while open (and is keyed by the record it edits), so
 * its fields start fresh every time without an effect resetting them. It also
 * renders no <form> of its own — it can appear inside the Land form, and nested
 * forms are invalid HTML.
 */
export function LandownerQuickAddModal({
  open,
  owner,
  prefill,
  onClose,
  onCreated,
}: {
  open: boolean;
  owner?: Landowner;
  /** a new owner's name and phone as already known (W8 — from a website land offer) */
  prefill?: { name: string; phone: string };
  onClose: () => void;
  onCreated: (owner: Landowner) => void;
}) {
  if (!open) return null;
  return (
    <LandownerDialog key={owner?.id ?? 'new'} owner={owner} prefill={prefill} onClose={onClose} onCreated={onCreated} />
  );
}

function LandownerDialog({
  owner,
  prefill,
  onClose,
  onCreated,
}: {
  owner?: Landowner;
  prefill?: { name: string; phone: string };
  onClose: () => void;
  onCreated: (owner: Landowner) => void;
}) {
  const [form, setForm] = useState({
    name: owner?.name ?? prefill?.name ?? '',
    phone: owner?.phone ?? prefill?.phone ?? '',
    nid: owner?.nid ?? '',
    address: owner?.address ?? '',
    notes: owner?.notes ?? '',
  });
  const [errors, setErrors] = useState<{ name?: string; phone?: string; nid?: string }>({});
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function save() {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (form.phone.trim() && !isValidBdPhone(form.phone))
      next.phone = 'Phone must be a Bangladeshi mobile number, e.g. 01711 223344';
    if (form.nid.trim() && !isValidNid(form.nid)) next.nid = 'NID must be 10, 13 or 17 digits';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        nid: form.nid.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      const saved = owner
        ? ((await landownerRepository.update(owner.id, payload)) as Landowner)
        : await landownerRepository.create(payload);
      onCreated(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={owner ? 'Edit Landowner' : 'New Landowner'}
      subtitle="Owners are a shared master list — reuse them across lands."
      icon={UserPlus}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name} className="sm:col-span-2">
          <TextInput
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Md. Rafiqul Islam"
            invalid={Boolean(errors.name)}
            disabled={saving}
            autoFocus
          />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <TextInput
            value={form.phone}
            invalid={Boolean(errors.phone)}
            disabled={saving}
            placeholder="e.g. 01711 223344"
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>
        <Field label="NID" error={errors.nid}>
          <TextInput
            value={form.nid}
            invalid={Boolean(errors.nid)}
            disabled={saving}
            placeholder="e.g. 1990123456789"
            onChange={(e) => set('nid', e.target.value)}
          />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <TextArea
            value={form.address}
            placeholder="House, road, area, district"
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <TextArea
            value={form.notes}
            placeholder="e.g. Prefers phone calls after 6pm"
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
