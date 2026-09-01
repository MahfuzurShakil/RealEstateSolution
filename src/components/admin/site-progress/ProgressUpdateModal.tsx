'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { HardHat, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { MapPicker } from '@/components/ui/map/MapPicker';
import { useMockSession } from '@/lib/auth/mock-session';
import type { TowerWorkItem } from '@/lib/db/types';
import { WORK_ITEM_STATUS_META, clampPct, statusForProgress } from '@/lib/domain/site-progress';
import {
  projectRepository,
  siteProgressUpdateRepository,
  towerRepository,
  towerWorkItemRepository,
} from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';
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

    const pct = clampPct(Number(progress));
  const previous = Number(selected?.actual_progress_pct ?? 0);
  const nextStatus = statusForProgress(pct);

  async function save(andOpen: boolean) {
    if (!selected) {
      setError('Pick the work item this update is for');
      return;
    }
    if (!updateDate) {
      setError('An update date is required');
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
      onClose();
      if (andOpen) onSaved?.(saved.id);
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
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => save(true)} disabled={busy}>
            Save &amp; add photos
          </Button>
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
                {(projects ?? []).map((p) => (
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

        <Field label="Remarks">
          <TextArea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="What was done today — casting, rod binding, shuttering, delays…"
          />
        </Field>

        {showMap ? (
          <MapPicker lat={lat} lng={lng} onChange={(a, b) => { setLat(a); setLng(b); }} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowMap(true)}>
            <MapPin className="size-4" /> Add GPS location
          </Button>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
