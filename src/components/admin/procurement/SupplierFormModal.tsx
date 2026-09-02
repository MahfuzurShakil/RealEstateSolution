'use client';

import { useState } from 'react';
import { Truck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { SUPPLIER_TYPES, type Supplier, type SupplierType } from '@/lib/db/types';
import { SUPPLIER_TYPE_META } from '@/lib/domain/procurement';
import { supplierRepository } from '@/lib/repositories';

/**
 * Create/edit a supplier (Section 7.3).
 *
 * Suppliers are a reusable master list, so this is opened both from the
 * Suppliers page and inline from the Purchase Order form. Same shape as
 * `LandownerQuickAddModal`: mounted only while open and keyed by the record it
 * edits, so its fields start fresh without an effect resetting them, and it
 * renders no <form> of its own because it can appear inside one.
 */
export function SupplierFormModal({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier?: Supplier;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
}) {
  if (!open) return null;
  return (
    <SupplierDialog
      key={supplier?.id ?? 'new'}
      supplier={supplier}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function SupplierDialog({
  supplier,
  onClose,
  onSaved,
}: {
  supplier?: Supplier;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
}) {
  const { userId } = useMockSession();
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    type: (supplier?.type ?? 'material_supplier') as SupplierType,
    contact_person: supplier?.contact_person ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
  });
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Name is required';
    // Section 7.3 makes phone required — a supplier nobody can call is not one
    if (!form.phone.trim()) next.phone = 'Phone is required';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim(),
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      const saved = supplier
        ? ((await supplierRepository.update(supplier.id, payload)) as Supplier)
        : await supplierRepository.createSupplier(payload, userId);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={supplier ? `Edit ${supplier.name}` : 'New Supplier'}
      subtitle={
        supplier?.code ?? 'Suppliers are a shared master list — reuse them across purchase orders.'
      }
      icon={Truck}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save supplier'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name} className="sm:col-span-2">
          <TextInput
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Bijoy Electric & Hardware"
            invalid={Boolean(errors.name)}
            disabled={saving}
            autoFocus
          />
        </Field>

        <Field label="Type" required hint="Contractors reuse this same list later">
          <SelectInput value={form.type} onChange={(e) => set('type', e.target.value)}>
            {SUPPLIER_TYPES.map((type) => (
              <option key={type} value={type}>
                {SUPPLIER_TYPE_META[type].label}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Phone" required error={errors.phone}>
          <TextInput
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="e.g. 01711 445566"
            invalid={Boolean(errors.phone)}
          />
        </Field>

        <Field label="Contact person" className="sm:col-span-2">
          <TextInput
            value={form.contact_person}
            onChange={(e) => set('contact_person', e.target.value)}
            placeholder="Who to ask for"
          />
        </Field>

        <Field label="Address" className="sm:col-span-2">
          <TextArea
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Shop, road, area, district"
          />
        </Field>

        <Field label="Notes" className="sm:col-span-2">
          <TextArea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Credit terms, delivery lead time, rate agreements…"
          />
        </Field>
      </div>
    </Modal>
  );
}
