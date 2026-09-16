'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Droplets,
  Flame,
  MapPin,
  Mountain,
  Pencil,
  Plus,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Checkbox, Field, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DocumentsPanel } from '@/components/admin/documents/DocumentsPanel';
import { useMockSession } from '@/lib/auth/mock-session';
import type { Land, SiteVisit } from '@/lib/db/types';
import { siteVisitRepository } from '@/lib/repositories';
import { formatDate, todayLocal } from '@/lib/utils/format';

/**
 * Site visits for one land (BRD SITE-001).
 *
 * A list rather than a single record, because a plot worth buying is visited
 * more than once and what changes between the visits is the point. Photos hang
 * off each visit through the shared document vault, so the first visit's photos
 * stay attached to the first visit.
 */
export function SiteVisitPanel({ land }: { land: Land }) {
  const [editing, setEditing] = useState<SiteVisit | 'new' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const visits = useLiveQuery(() => siteVisitRepository.listForLand(land.id), [land.id]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">
          {visits?.length ?? 0} visit{visits?.length === 1 ? '' : 's'} recorded · newest first
        </p>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Record a visit
        </Button>
      </div>

      {visits && visits.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No site visit recorded yet"
          description="Capture what the team found on the ground — access, utilities, soil and lowland, what neighbours say land is going for — and attach the photos they came back with."
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Record a visit
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {visits?.map((visit) => (
            <li key={visit.id} className="rounded-xl border border-hairline bg-white">
              <div className="flex flex-wrap items-start gap-3 p-4">
                {/*
                  Icon and text are one flex item taking a full row below `sm`.
                  As three siblings they were three flex items, and the badges
                  and buttons do not shrink — so on a laptop the date and the
                  visitor's name were squeezed into a column a few characters
                  wide while the badges sat comfortably beside them.
                */}
                <div className="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:flex-1">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
                    <MapPin className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{formatDate(visit.visit_date)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {visit.visited_by ? `Led by ${visit.visited_by}` : 'Visitor not recorded'}
                      {visit.participants ? ` · with ${visit.participants}` : ''}
                    </p>
                  </div>
                </div>

                {/* the two findings that change a price the most */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {visit.is_lowland && (
                    <Badge tone="amber">
                      Lowland{visit.filling_required_ft ? ` · ${visit.filling_required_ft} ft fill` : ''}
                    </Badge>
                  )}
                  {visit.road_width_ft != null && <Badge>{visit.road_width_ft} ft road</Badge>}
                </div>

                <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(visit)} aria-label="Edit visit">
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(visit.id)} aria-label="Delete visit">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="border-t border-hairline px-4 py-3">
                <UtilityStrip visit={visit} />

                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Detail label="Access on the day" value={visit.access_note} />
                  <Detail label="Drainage" value={visit.drainage} />
                  <Detail label="Soil" value={visit.soil_condition} />
                  <Detail label="Surroundings" value={visit.surroundings} />
                  <Detail label="Price observed nearby" value={visit.price_observation} />
                  <Detail label="Utilities note" value={visit.utilities_note} />
                </dl>

                {visit.remarks && (
                  <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-sm text-ink-muted">
                    {visit.remarks}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setOpenId(openId === visit.id ? null : visit.id)}
                  className="mt-3 text-xs font-medium text-admin-700 hover:underline"
                >
                  {openId === visit.id ? 'Hide photos' : 'Photos & files'}
                </button>

                {openId === visit.id && (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <DocumentsPanel entityType="site_visit" entityId={visit.id} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <VisitDialog
          land={land}
          visit={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete this site visit"
        message="The visit and every photo attached to it are removed. This cannot be undone."
        confirmLabel="Delete visit"
        tone="danger"
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) await siteVisitRepository.removeCascade(deleteId);
          setDeleteId(null);
        }}
      />
    </>
  );
}

/**
 * Four utilities as chips.
 *
 * `null` is rendered as "not checked" rather than as absent — on a plot that is
 * a real and different answer, and the team that did not check is exactly who
 * needs to see that they did not.
 */
function UtilityStrip({ visit }: { visit: SiteVisit }) {
  const items = [
    { key: 'has_electricity', label: 'Electricity', icon: Zap, value: visit.has_electricity },
    { key: 'has_gas', label: 'Gas', icon: Flame, value: visit.has_gas },
    { key: 'has_water', label: 'Water', icon: Droplets, value: visit.has_water },
    { key: 'has_sewerage', label: 'Sewerage', icon: Mountain, value: visit.has_sewerage },
  ] as const;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map(({ key, label, icon: Icon, value }) => (
        <li
          key={key}
          className={
            value === true
              ? 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
              : value === false
                ? 'inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700'
                : 'inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-2 py-1 text-xs text-slate-400'
          }
        >
          <Icon className="size-3.5" />
          {label}
          {value === null || value === undefined ? ' — not checked' : value ? '' : ' — none'}
        </li>
      ))}
    </ul>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-ink">{value}</dd>
    </div>
  );
}

/** `null` means nobody checked — a three-state control, not a checkbox. */
type Tri = 'yes' | 'no' | 'unknown';
const toTri = (v?: boolean | null): Tri => (v === true ? 'yes' : v === false ? 'no' : 'unknown');
const fromTri = (v: Tri): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null);

function VisitDialog({
  land,
  visit,
  onClose,
}: {
  land: Land;
  visit?: SiteVisit;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    visit_date: visit?.visit_date ?? todayLocal(),
    visited_by: visit?.visited_by ?? '',
    participants: visit?.participants ?? '',
    access_note: visit?.access_note ?? '',
    road_width_ft: visit?.road_width_ft != null ? String(visit.road_width_ft) : '',
    electricity: toTri(visit?.has_electricity),
    gas: toTri(visit?.has_gas),
    water: toTri(visit?.has_water),
    sewerage: toTri(visit?.has_sewerage),
    utilities_note: visit?.utilities_note ?? '',
    drainage: visit?.drainage ?? '',
    soil_condition: visit?.soil_condition ?? '',
    is_lowland: visit?.is_lowland ?? false,
    filling_required_ft:
      visit?.filling_required_ft != null ? String(visit.filling_required_ft) : '',
    surroundings: visit?.surroundings ?? '',
    price_observation: visit?.price_observation ?? '',
    remarks: visit?.remarks ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  async function save() {
    if (!form.visit_date) {
      setError('A visit needs a date');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = {
        land_id: land.id,
        visit_date: form.visit_date,
        visited_by: form.visited_by.trim() || null,
        participants: form.participants.trim() || null,
        access_note: form.access_note.trim() || null,
        road_width_ft: num(form.road_width_ft),
        has_electricity: fromTri(form.electricity),
        has_gas: fromTri(form.gas),
        has_water: fromTri(form.water),
        has_sewerage: fromTri(form.sewerage),
        utilities_note: form.utilities_note.trim() || null,
        drainage: form.drainage.trim() || null,
        soil_condition: form.soil_condition.trim() || null,
        is_lowland: form.is_lowland,
        // a fill depth on a plot nobody called lowland is a leftover, not a fact
        filling_required_ft: form.is_lowland ? num(form.filling_required_ft) : null,
        surroundings: form.surroundings.trim() || null,
        price_observation: form.price_observation.trim() || null,
        // the plot's own coordinates, so a visit can be mapped without re-entry
        gps_lat: visit?.gps_lat ?? land.gps_lat ?? null,
        gps_lng: visit?.gps_lng ?? land.gps_lng ?? null,
        remarks: form.remarks.trim() || null,
      };

      if (visit) await siteVisitRepository.update(visit.id, payload);
      else await siteVisitRepository.create(payload, userId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={visit ? 'Edit site visit' : 'Record a site visit'}
      subtitle={`${land.code} · ${land.name}`}
      icon={MapPin}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : visit ? 'Save changes' : 'Save visit'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Who went, and when
          </h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Visit date" required error={error || undefined}>
              <TextInput
                type="date"
                value={form.visit_date}
                onChange={(e) => set('visit_date', e.target.value)}
              />
            </Field>
            <Field label="Led by">
              <TextInput
                value={form.visited_by}
                placeholder="e.g. Kamal Hossain (Land Team)"
                onChange={(e) => set('visited_by', e.target.value)}
              />
            </Field>
            <Field label="Also present" hint="Engineer, lawyer, the owner's son">
              <TextInput
                value={form.participants}
                placeholder="e.g. Eng. Sabbir, Adv. Nusrat"
                onChange={(e) => set('participants', e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Access
          </h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Road width (ft)" hint="Measured on the day">
              <TextInput
                type="number"
                step="0.5"
                min="0"
                value={form.road_width_ft}
                placeholder="e.g. 20"
                onChange={(e) => set('road_width_ft', e.target.value)}
              />
            </Field>
            <Field label="How the team got there" className="sm:col-span-1 lg:col-span-2">
              <TextInput
                value={form.access_note}
                placeholder="e.g. Car to the embankment, then 200 m on foot"
                onChange={(e) => set('access_note', e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Utilities
          </h4>
          <p className="mb-3 text-xs text-ink-muted">
            Leave as &ldquo;Not checked&rdquo; when nobody looked — that is not the same answer as
            &ldquo;none&rdquo;.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TriField label="Electricity" value={form.electricity} onChange={(v) => set('electricity', v)} />
            <TriField label="Gas" value={form.gas} onChange={(v) => set('gas', v)} />
            <TriField label="Water" value={form.water} onChange={(v) => set('water', v)} />
            <TriField label="Sewerage" value={form.sewerage} onChange={(v) => set('sewerage', v)} />
          </div>
          <div className="mt-4">
            <Field label="Utilities note">
              <TextInput
                value={form.utilities_note}
                placeholder="e.g. Gas line 300 m away, WASA connection pending"
                onChange={(e) => set('utilities_note', e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            The ground itself
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Soil condition">
              <TextInput
                value={form.soil_condition}
                placeholder="e.g. Clay, firm; piling likely to 60 ft"
                onChange={(e) => set('soil_condition', e.target.value)}
              />
            </Field>
            <Field label="Drainage">
              <TextInput
                value={form.drainage}
                placeholder="e.g. Waterlogs in monsoon, no covered drain"
                onChange={(e) => set('drainage', e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="pt-1">
              <Checkbox
                label="Lowland — needs filling"
                checked={form.is_lowland}
                onChange={(e) => set('is_lowland', e.target.checked)}
              />
              <p className="mt-1 text-xs text-ink-muted">
                Usually the largest hidden cost on a plot, so it is asked plainly.
              </p>
            </div>
            {/* only when it applies — a depth on a plot nobody called lowland
                is a number with nothing behind it */}
            {form.is_lowland && (
              <Field label="Filling required (ft)">
                <TextInput
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.filling_required_ft}
                  placeholder="e.g. 4"
                  onChange={(e) => set('filling_required_ft', e.target.value)}
                />
              </Field>
            )}
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Around the plot
          </h4>
          <div className="grid gap-4">
            <Field label="Surroundings">
              <TextInput
                value={form.surroundings}
                placeholder="e.g. Two six-storey buildings north, open field south, brickfield 400 m"
                onChange={(e) => set('surroundings', e.target.value)}
              />
            </Field>
            <Field
              label="Price observed nearby"
              hint="What neighbours and local brokers say land is going for — not a valuation"
            >
              <TextInput
                value={form.price_observation}
                placeholder="e.g. Neighbours quote 38–42 lakh per katha"
                onChange={(e) => set('price_observation', e.target.value)}
              />
            </Field>
            <Field label="Remarks">
              <TextArea
                value={form.remarks}
                placeholder="Anything else worth remembering from the day"
                onChange={(e) => set('remarks', e.target.value)}
              />
            </Field>
          </div>
        </section>

        <p className="flex items-start gap-2 rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
          <Users className="mt-0.5 size-4 shrink-0 text-admin-600" />
          Photos and video are attached after the visit is saved — open it in the list and use
          &ldquo;Photos &amp; files&rdquo;.
        </p>
      </div>
    </Modal>
  );
}

function TriField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Tri;
  onChange: (v: Tri) => void;
}) {
  const options: { v: Tri; label: string }[] = [
    { v: 'yes', label: 'Yes' },
    { v: 'no', label: 'No' },
    { v: 'unknown', label: 'Not checked' },
  ];
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div className="flex rounded-xl border border-hairline bg-white p-0.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={
              value === o.v
                ? 'flex-1 rounded-[10px] bg-admin-500 px-2 py-1.5 text-xs font-medium text-white'
                : 'flex-1 rounded-[10px] px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-admin-50'
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
