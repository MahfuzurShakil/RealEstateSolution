'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  BUDGET_RANGE_OPTIONS,
  LEAD_SOURCES,
  type Lead,
  type LeadSource,
  type Project,
  type Unit,
  type User,
} from '@/lib/db/types';
import { LEAD_SOURCE_LABEL } from '@/lib/domain/lead';
import { UNIT_STATUS_META } from '@/lib/domain/project';
import {
  leadRepository,
  normalizePhone,
  projectRepository,
  unitRepository,
  userRepository,
  type LeadWithRelations,
} from '@/lib/repositories';

interface FormState {
  name: string;
  phone: string;
  email: string;
  source: LeadSource;
  inquiry_message: string;
  interested_project_id: string;
  interested_unit_id: string;
  budget_range: string;
  assigned_to: string;
}

const EMPTY: FormState = {
  name: '',
  phone: '',
  email: '',
  source: 'walk_in',
  inquiry_message: '',
  interested_project_id: '',
  interested_unit_id: '',
  budget_range: '',
  assigned_to: '',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Add / Edit form for Module 3 (Design Reference A.9).
 *
 * On a new lead the phone is checked against existing leads as it is typed:
 * phone is the dedup key (Section 4.5), so a repeat caller must land on the
 * existing lead as an activity rather than becoming a second row.
 */
export function LeadForm({ lead }: { lead?: LeadWithRelations }) {
  const router = useRouter();
  const { userId } = useMockSession();
  const isEdit = Boolean(lead);

  const [form, setForm] = useState<FormState>(lead ? toFormState(lead) : EMPTY);
  const [projects, setProjects] = useState<Project[]>([]);
  const [salesTeam, setSalesTeam] = useState<User[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    projectRepository.list().then(setProjects);
    userRepository.salesTeam().then(setSalesTeam);
  }, []);

  // units are only meaningful once a project is picked
  const loadedUnits = useLiveQuery<Unit[]>(
    () =>
      form.interested_project_id
        ? unitRepository.listForProject(form.interested_project_id)
        : Promise.resolve<Unit[]>([]),
    [form.interested_project_id],
  );
  const units = useMemo(() => loadedUnits ?? [], [loadedUnits]);

  // live dedup check — only on a new lead; editing keeps its own number
  const duplicate =
    useLiveQuery<Lead | null>(
      () =>
        isEdit || normalizePhone(form.phone).length < 11
          ? Promise.resolve<Lead | null>(null)
          : leadRepository.findByPhone(form.phone).then((match) => match ?? null),
      [form.phone, isEdit],
    ) ?? null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === form.interested_unit_id),
    [units, form.interested_unit_id],
  );

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.phone.trim()) next.phone = 'Phone is required';
    else if (normalizePhone(form.phone).length < 11) next.phone = 'Enter a full 11-digit number';
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
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        source: form.source,
        inquiry_message: form.inquiry_message.trim() || null,
        interested_project_id: form.interested_project_id || null,
        interested_unit_id: form.interested_unit_id || null,
        budget_range: form.budget_range || null,
        assigned_to: form.assigned_to || null,
      };

      if (lead) {
        await leadRepository.update(lead.id, { ...payload, phone: normalizePhone(payload.phone) });
        router.push(`/admin/leads/${lead.id}`);
        return;
      }

      // dedup lives in the repository, so the public form gets the same rule
      const { lead: saved } = await leadRepository.captureInquiry(payload, userId);
      router.push(`/admin/leads/${saved.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">
      <Card>
        <CardHeader title="Buyer" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Name" required error={errors.name}>
            <TextInput
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Tanvir Hasan"
              invalid={Boolean(errors.name)}
            />
          </Field>
          <Field
            label="Phone"
            required
            error={errors.phone}
            hint={isEdit ? undefined : 'Checked against existing leads as you type.'}
          >
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
              placeholder="e.g. tanvir@example.com"
              invalid={Boolean(errors.email)}
            />
          </Field>
        </div>

        {duplicate && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              This number already belongs to {duplicate.code} — {duplicate.name}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Saving will not create a second lead. The inquiry is added to that lead as an
              activity, so the whole conversation stays in one place.
            </p>
            <Link href={`/admin/leads/${duplicate.id}`} className="mt-3 inline-block">
              <Button variant="outline" size="sm">
                Open {duplicate.code}
              </Button>
            </Link>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Inquiry" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Source" required>
            <SelectInput
              value={form.source}
              onChange={(e) => set('source', e.target.value as LeadSource)}
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABEL[s]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Budget Range">
            <SelectInput
              value={form.budget_range}
              onChange={(e) => set('budget_range', e.target.value)}
            >
              <option value="">Not stated</option>
              {BUDGET_RANGE_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Assigned To" hint="Sales Executive who owns the follow-up.">
            <SelectInput
              value={form.assigned_to}
              onChange={(e) => set('assigned_to', e.target.value)}
            >
              <option value="">Unassigned</option>
              {salesTeam.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Interested Project">
            <SelectInput
              value={form.interested_project_id}
              onChange={(e) => {
                set('interested_project_id', e.target.value);
                set('interested_unit_id', '');
              }}
            >
              <option value="">Not decided</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field
            label="Interested Unit"
            hint={
              selectedUnit
                ? `${selectedUnit.size_sqft} sqft · ${UNIT_STATUS_META[selectedUnit.status].label}`
                : undefined
            }
          >
            <SelectInput
              value={form.interested_unit_id}
              disabled={!form.interested_project_id}
              onChange={(e) => set('interested_unit_id', e.target.value)}
            >
              <option value="">Not decided</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.unit_type} · {u.size_sqft} sqft
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Inquiry Message" className="md:col-span-2 xl:col-span-3">
            <TextArea
              value={form.inquiry_message}
              onChange={(e) => set('inquiry_message', e.target.value)}
              placeholder="What the buyer asked for, in their own words"
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving
            ? 'Saving…'
            : isEdit
              ? 'Save changes'
              : duplicate
                ? 'Add to existing lead'
                : 'Create lead'}
        </Button>
      </div>
    </form>
  );
}

function toFormState(lead: LeadWithRelations): FormState {
  return {
    ...EMPTY,
    name: lead.name,
    phone: lead.phone,
    email: str(lead.email),
    source: lead.source,
    inquiry_message: str(lead.inquiry_message),
    interested_project_id: str(lead.interested_project_id),
    interested_unit_id: str(lead.interested_unit_id),
    budget_range: str(lead.budget_range),
    assigned_to: str(lead.assigned_to),
  };
}
