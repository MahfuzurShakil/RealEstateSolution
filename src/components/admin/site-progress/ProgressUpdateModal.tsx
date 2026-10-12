'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, HardHat, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { MapPicker } from '@/components/ui/map/MapPicker';
import { useMockSession } from '@/lib/auth/mock-session';
import type { TowerWorkItem } from '@/lib/db/types';
import { WORK_ITEM_STATUS_META, clampPct, isSiteActive, statusForProgress } from '@/lib/domain/site-progress';
import {
  documentRepository,
  projectRepository,
  siteProgressUpdateRepository,
  towerRepository,
  towerWorkItemRepository,
} from '@/lib/repositories';
import { formatDate, todayLocal } from '@/lib/utils/format';
import { ProgressBar } from './ProgressBar';

/**
 * Logging a day's reading (Section 6.3). The engineer picks the work item and
 * says where it now stands; everything downstream — the item's status, the
 * tower's cached %, the project roll-up — is derived, never typed.
 *
 * `workItem` pins the modal to one item (opened from the WBS row); without it
 * the project → tower → item pickers are shown, which is how the Site Progress
 * page opens it.
 */
export function ProgressUpdateModal({
  open,
  workItem,
  projectId: fixedProjectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  workItem?: TowerWorkItem;
  projectId?: string;
  onClose: () => void;
  onSaved?: (updateId: string) => void;
}) {
  const { userId } = useMockSession();

  /*
   * Mounted only while open (the callers gate on it), so every field starts
   * from the item being reported on — no effect copies props into state, and
   * yesterday's half-typed entry can never reappear.
   */
  const [projectId, setProjectId] = useState(workItem ? '' : (fixedProjectId ?? ''));
  const [towerId, setTowerId] = useState(workItem?.tower_id ?? '');
  const [workItemId, setWorkItemId] = useState(workItem?.id ?? '');
  const [updateDate, setUpdateDate] = useState(todayLocal());
  const [progress, setProgress] = useState(String(workItem?.actual_progress_pct ?? 0));
  const [remarks, setRemarks] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** photos taken on site, saved with the reading (Construction review 2026-10-11) */
  const [photos, setPhotos] = useState<File[]>([]);
  /** shown after "Save & log another", so the engineer sees it went in */
  const [savedNote, setSavedNote] = useState('');

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const towers = useLiveQuery(
    () => (projectId ? towerRepository.listForProject(projectId) : Promise.resolve([])),
    [projectId],
  );
  const items = useLiveQuery(
    () => (towerId ? towerWorkItemRepository.listForTower(towerId) : Promise.resolve([])),
    [towerId],
  );

  const selected = useMemo(
    () => workItem ?? (items ?? []).find((i) => i.id === workItemId),
    [workItem, items, workItemId],
  );

  /*
   * What the engineer needs to know before saving (Construction review
   * 2026-10-11): when construction started (nothing is reported before it),
   * whether this item already has a reading that day, and whether a
   * back-dated reading will become the current figure or only fill history.
   */
  const context = useLiveQuery(async () => {
    if (!selected) return null;
    const tower = await towerRepository.getById(selected.tower_id);
    const project = tower ? await projectRepository.getById(tower.project_id) : undefined;
    const readings = await siteProgressUpdateRepository.listForWorkItem(selected.id);
    const latest = readings.map((r) => r.update_date).sort().at(-1) ?? null;
    return { start: project?.actual_start_date ?? null, latest, readings };
  }, [selected?.id]);
  const sameDay = context?.readings.find((r) => r.update_date === updateDate);
  const olderThanCurrent = Boolean(context?.latest && updateDate < context.latest);

  const pct = clampPct(Number(progress));
  const previous = Number(selected?.actual_progress_pct ?? 0);
  const nextStatus = statusForProgress(pct);

  async function save(another: boolean) {
    if (!selected) {
      setError('Pick the work item this update is for');
      return;
    }
    if (!updateDate) {
      setError('An update date is required');
      return;
    }
    // E2E 2026-10-12 #11 — 150 is a typo for 15, not "done"
    const typed = Number(progress);
    if (!Number.isFinite(typed) || typed < 0 || typed > 100) {
      setError('Progress must be between 0% and 100%');
      return;
    }
    // QA audit C-07 — going backwards is unusual enough to explain
    if (pct < previous && !remarks.trim()) {
      setError(`Progress goes down from ${previous}% to ${pct}%: say why in the remarks`);
      return;
    }
    // QA audit C-01 — a future date would become the "latest" reading for good
    if (updateDate > todayLocal()) {
      setError('The update date cannot be in the future');
      return;
    }
    if (context?.start && updateDate < context.start) {
      setError(`Construction started on ${formatDate(context.start)}; a reading cannot be earlier`);
      return;
    }
    setBusy(true);
    try {
      const saved = await siteProgressUpdateRepository.log(
        {
          work_item_id: selected.id,
          update_date: updateDate,
          progress_pct: pct,
          remarks: remarks.trim() || null,
          gps_lat: lat.trim() ? Number(lat) : null,
          gps_lng: lng.trim() ? Number(lng) : null,
          updated_by: userId,
        },
        userId,
      );
      for (const file of photos) {
        await documentRepository.create(
          {
            entity_type: 'site_progress_update',
            entity_id: saved.id,
            document_type: 'progress_photo',
            custom_type_name: null,
            file_url: file.name,
            file_data: file,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            is_public: false,
            uploaded_by: userId,
            uploaded_at: new Date().toISOString(),
            notes: null,
          },
          userId,
        );
      }
      onSaved?.(saved.id);
      if (another) {
        /*
         * A day's report covers several items: keep the project, tower and
         * date, clear what belongs to the one item just saved.
         */
        setSavedNote(`${selected.name} saved at ${pct}%. Pick the next item.`);
        if (!workItem) setWorkItemId('');
        setProgress('0');
        setRemarks('');
        setPhotos([]);
        setLat('');
        setLng('');
        setShowMap(false);
        setError('');
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The update could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Log site progress"
      subtitle={selected ? selected.name : 'Daily update from the site'}
      icon={HardHat}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={busy}>
            Cancel
          </Button>
          {!workItem && (
            <Button variant="outline" onClick={() => save(true)} disabled={busy}>
              Save &amp; log another
            </Button>
          )}
          <Button onClick={() => save(false)} disabled={busy}>
            {busy ? 'Saving…' : 'Save update'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!workItem && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Project" required>
              <SelectInput
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setTowerId('');
                  setWorkItemId('');
                }}
                disabled={Boolean(fixedProjectId)}
              >
                <option value="">Select…</option>
                {/* QA audit C-02 — only sites being built report progress */}
                {(projects ?? [])
                  .filter((p) => isSiteActive(p.status))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </SelectInput>
            </Field>

            <Field label="Tower" required>
              <SelectInput
                value={towerId}
                onChange={(e) => {
                  setTowerId(e.target.value);
                  setWorkItemId('');
                }}
                disabled={!projectId}
              >
                <option value="">Select…</option>
                {(towers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="Work item" required>
              <SelectInput
                value={workItemId}
                onChange={(e) => {
                  setWorkItemId(e.target.value);
                  // the reading starts from where the item stands today
                  const picked = (items ?? []).find((i) => i.id === e.target.value);
                  setProgress(String(picked?.actual_progress_pct ?? 0));
                }}
                disabled={!towerId}
              >
                <option value="">Select…</option>
                {(items ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.sequence_no}. {i.name} ({i.actual_progress_pct}%)
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Update date" required>
            <TextInput
              type="date"
              value={updateDate}
              max={todayLocal()}
              onChange={(e) => setUpdateDate(e.target.value)}
            />
          </Field>
          <Field label="Progress %" required hint={`Was ${previous}%`}>
            <TextInput
              type="number"
              min={0}
              max={100}
              step={1}
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-xl border border-hairline p-4">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            onChange={(e) => setProgress(e.target.value)}
            className="w-full accent-admin-500"
            aria-label="Progress percentage"
          />
          <div className="mt-3">
            <ProgressBar value={pct} />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {previous}% → <span className="font-medium text-ink">{pct}%</span> · marks the item{' '}
            {WORK_ITEM_STATUS_META[nextStatus].label}
            {pct < previous && ' · lower than the last reading — the item will move back'}
          </p>
        </div>

        {sameDay && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            This item already has a reading on {formatDate(updateDate)} ({sameDay.progress_pct}%). Saving
            adds another for the same day, and the newer one counts.
          </p>
        )}
        {olderThanCurrent && (
          <p className="rounded-xl border border-hairline bg-slate-50 p-3 text-xs text-ink-muted">
            The item&rsquo;s latest reading is from {formatDate(context?.latest)}. This earlier one
            fills in the history and does not change the current figure.
          </p>
        )}

        <Field label="Remarks">
          <TextArea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="What was done today — casting, rod binding, shuttering, delays…"
          />
        </Field>

        <div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-admin-50">
            <Camera className="size-4" /> Add photos
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setPhotos((p) => [...p, ...picked]);
                e.target.value = '';
              }}
            />
          </label>
          {photos.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {photos.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-ink">
                  {f.name}
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {showMap ? (
          <MapPicker lat={lat} lng={lng} onChange={(a, b) => { setLat(a); setLng(b); }} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowMap(true)}>
            <MapPin className="size-4" /> Add GPS location
          </Button>
        )}

        {savedNote && !error && <p className="text-sm text-emerald-700">{savedNote}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
