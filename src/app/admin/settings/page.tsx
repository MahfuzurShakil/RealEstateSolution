'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Check, Globe, Phone, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { companySettingsRepository } from '@/lib/repositories';

/**
 * Company profile (Section 1.3 / 9.7) — one row, edited in place.
 *
 * These fields are not decoration: `whatsapp_number` drives the Public
 * Portal's click-to-chat button (P4), `company_name`, `address` and
 * `trade_license_no` are the letterhead on every printed document (Tier 3.6 —
 * booking form, money receipt, supplier voucher), and the Public Portal reads
 * the rest for its contact page.
 */
export default function CompanySettingsPage() {
  const settings = useLiveQuery(() => companySettingsRepository.get(), []);

  if (settings === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Company Settings"
        subtitle="The company profile used on the public website and on every printed document."
      />
      {/* keyed on the row so the form starts from saved values without an
          effect copying them into state after the first render */}
      <SettingsForm key={settings?.id ?? 'new'} settings={settings} />
    </>
  );
}

function SettingsForm({
  settings,
}: {
  settings: Awaited<ReturnType<typeof companySettingsRepository.get>>;
}) {
  const [form, setForm] = useState({
    company_name: settings?.company_name ?? '',
    address: settings?.address ?? '',
    phone: settings?.phone ?? '',
    whatsapp_number: settings?.whatsapp_number ?? '',
    email: settings?.email ?? '',
    website: settings?.website ?? '',
    trade_license_no: settings?.trade_license_no ?? '',
    tax_id: settings?.tax_id ?? '',
    default_currency: settings?.default_currency ?? 'BDT',
    logo_url: settings?.logo_url ?? '',
    notes: settings?.notes ?? '',
  });
  /*
   * The three pipeline gates (BRD SITE-003, DD-004, DEV-004). Kept out of
   * `form` because that state is all strings and these are booleans —
   * threading a checkbox through a `set(key, value: string)` helper is how a
   * `false` ends up stored as the string "false" and reads as true ever after.
   */
  const [gates, setGates] = useState({
    require_feasibility_approval: settings?.require_feasibility_approval ?? false,
    require_dd_completion: settings?.require_dd_completion ?? false,
    require_development_ready: settings?.require_development_ready ?? false,
  });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  async function save() {
    if (!form.company_name.trim()) {
      setError('The company needs a name — it goes on every document.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await companySettingsRepository.save({
        company_name: form.company_name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp_number: form.whatsapp_number.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        trade_license_no: form.trade_license_no.trim() || null,
        tax_id: form.tax_id.trim() || null,
        default_currency: form.default_currency.trim() || 'BDT',
        logo_url: form.logo_url.trim() || null,
        notes: form.notes.trim() || null,
        ...gates,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader title="Company" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" required error={error || undefined} className="sm:col-span-2">
              <TextInput
                value={form.company_name}
                onChange={(e) => set('company_name', e.target.value)}
                placeholder="e.g. Nokshi Properties Ltd."
                invalid={Boolean(error)}
              />
            </Field>

            <Field label="Address" className="sm:col-span-2">
              <TextArea
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="House, road, area, city and postcode"
              />
            </Field>

            <Field label="Trade licence no.">
              <TextInput
                value={form.trade_license_no}
                onChange={(e) => set('trade_license_no', e.target.value)}
                placeholder="e.g. TRAD/DSCC/044821/2024"
              />
            </Field>

            <Field label="BIN / TIN" hint="For invoices and money receipts">
              <TextInput
                value={form.tax_id}
                onChange={(e) => set('tax_id', e.target.value)}
                placeholder="e.g. 004471203-0101"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <TextInput
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+880 2 9876543"
              />
            </Field>

            <Field
              label="WhatsApp number"
              hint="Drives the click-to-chat button on the public website"
            >
              <TextInput
                value={form.whatsapp_number}
                onChange={(e) => set('whatsapp_number', e.target.value)}
                placeholder="+8801711000000"
              />
            </Field>

            <Field label="Email">
              <TextInput
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="info@company.com.bd"
              />
            </Field>

            <Field label="Website">
              <TextInput
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://company.com.bd"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Other" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Default currency"
              hint="Every amount in the platform is stored and shown in this currency"
            >
              <TextInput
                value={form.default_currency}
                onChange={(e) => set('default_currency', e.target.value)}
                placeholder="BDT"
              />
            </Field>

            <Field label="Logo URL" hint="Phase B replaces this with an upload">
              <TextInput
                value={form.logo_url}
                onChange={(e) => set('logo_url', e.target.value)}
                placeholder="https://…"
              />
            </Field>

            <Field label="Notes" className="sm:col-span-2">
              <TextArea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Anything worth recording about the company profile"
              />
            </Field>
          </div>
        </Card>

        {/*
          Pipeline gates (BRD-ALIGNMENT-PLAN.md section 5.3). One switch today;
          the due-diligence and land-development gates join it when their
          batches land. Listed as a card of its own rather than tucked into the
          company profile, because these change what the pipeline *does*.
        */}
        <Card>
          <CardHeader title="Pipeline gates" />
          <p className="mb-3 text-xs text-ink-muted">
            Each gate stops a land moving on until something is actually done. The first two are BRD
            rules and always apply. The development gate is off unless switched on: land recorded
            before this system existed has no development record, and turning it on would strand
            that land short of a project.
          </p>
          <div className="space-y-2">
            {/*
              L7 — G1 and G2 are BRD rules (SITE-003, DD-004), not preferences,
              so they are always on. Land entered after the fact is put in place
              with "Correct status" on the land page, which records why.
            */}
            <AlwaysOnGate
              label="SITE-003 · An approved feasibility study before negotiation"
              detail="No negotiation round can be recorded until a feasibility study recommending Proceed is approved."
            />
            <AlwaysOnGate
              label="DD-004 · Mandatory due diligence before acquisition"
              detail="Registration or JV signing cannot be recorded while a mandatory checklist item is unfinished or failed, unless it carries an authorised waiver."
            />
            <GateToggle
              label="G3 · Require land development to be ready before a project"
              detail="A land cannot be linked to a project while a development activity is still in progress, unless the land is marked as needing no development. A project planned on land that is still being filled has a schedule nobody can meet."
              checked={gates.require_development_ready}
              onChange={(v) => {
                setGates((g) => ({ ...g, require_development_ready: v }));
                setSaved(false);
              }}
            />
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={saving}>
            <Save className="size-4" /> {saving ? 'Saving…' : 'Save settings'}
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
              <Check className="size-4" /> Saved
            </span>
          )}
        </div>
      </div>

      <aside className="min-w-0 space-y-5">
        <Card>
          <CardHeader title="Where this shows up" />
          <ul className="space-y-3 text-sm text-ink-muted">
            <li className="flex gap-2.5">
              <Building2 className="mt-0.5 size-4 shrink-0 text-admin-600" />
              <span>
                <span className="font-medium text-ink">Printed documents</span> — the booking
                form, money receipt and supplier voucher carry the name, address and licence
                numbers from here. A field left blank simply leaves no line on the letterhead.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Globe className="mt-0.5 size-4 shrink-0 text-admin-600" />
              <span>
                <span className="font-medium text-ink">Public website</span> — the contact page and
                footer read straight from this row.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Phone className="mt-0.5 size-4 shrink-0 text-admin-600" />
              <span>
                <span className="font-medium text-ink">Click-to-chat</span> — the WhatsApp button on
                the public site uses the number above, so a wrong one silently sends enquiries
                nowhere.
              </span>
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Only Super Admin" />
          <p className="text-sm text-ink-muted">
            Section 9.6 gives this screen to <span className="font-medium text-ink">super_admin</span>{' '}
            alone. Switching role from the topbar takes it out of the menu and closes the page —
            which is the permission matrix doing its job, not an error.
          </p>
        </Card>
      </aside>
    </div>
  );
}

/** A BRD rule shown beside the switches, so nobody goes looking for its toggle. */
function AlwaysOnGate({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-slate-50/60 p-3">
      <Check className="mt-0.5 size-4 shrink-0 text-admin-600" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label} — always on</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{detail}</span>
      </span>
    </div>
  );
}

/** One pipeline gate. Extracted because there are three of them now. */
function GateToggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/40">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-admin-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{detail}</span>
      </span>
    </label>
  );
}
