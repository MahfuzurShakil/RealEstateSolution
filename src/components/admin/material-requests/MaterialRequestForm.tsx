'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { MaterialItemPicker } from '@/components/admin/procurement/MaterialItemPicker';
import { useMockSession } from '@/lib/auth/mock-session';
import type { MaterialRequestWithRelations } from '@/lib/repositories';
import {
  lookupRepository,
  materialRequestRepository,
  projectRepository,
  towerRepository,
  towerWorkItemRepository,
  userRepository,
} from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';

interface LineRow {
  /** existing row id, so an approved quantity survives an edit */
  id?: string;
  item_id: string | null;
  item_name: string;
  unit: string;
  quantity_requested: string;
}

/**
 * A blank line carries no unit: the option list is loaded asynchronously, and
 * the default is applied at render and at save instead — which keeps the form
 * free of an effect that copies loaded data into state.
 */
const EMPTY_LINE = (): LineRow => ({ item_id: null, item_name: '', unit: '', quantity_requested: '' });

/**
 * Raise or edit a material request (Sections 6.5 / 6.6).
 *
 * Project is required, tower and work item are not — a request can be for the
 * site as a whole (site office cement, safety gear) rather than one WBS line,
 * which is why Section 6.5 makes both nullable.
 */
export function MaterialRequestForm({
  request,
  defaults,
}: {
  /** omit to create */
  request?: MaterialRequestWithRelations;
  /** prefilled from the Progress tab's "Request material" link */
  defaults?: { project_id?: string; tower_id?: string; work_item_id?: string };
}) {
  const router = useRouter();
  const { userId } = useMockSession();

  const units = useLiveQuery(() => lookupRepository.options('material_unit', null), []);
  const defaultUnit = units?.[0]?.value ?? 'bag';

  const [projectId, setProjectId] = useState(request?.project_id ?? defaults?.project_id ?? '');
  const [towerId, setTowerId] = useState(request?.tower_id ?? defaults?.tower_id ?? '');
  const [workItemId, setWorkItemId] = useState(
    request?.work_item_id ?? defaults?.work_item_id ?? '',
  );
  /** null = untouched, so the acting site engineer can be the default */
  const [requestedBy, setRequestedBy] = useState<string | null>(request?.requested_by ?? null);
  const [requestDate, setRequestDate] = useState(request?.request_date ?? todayLocal());
  const [notes, setNotes] = useState(request?.notes ?? '');
  const [lines, setLines] = useState<LineRow[]>(
    request
      ? request.items.map((i) => ({
          id: i.id,
          item_id: i.item_id ?? null,
          item_name: i.item_name,
          unit: i.unit,
          quantity_requested: String(i.quantity_requested),
        }))
      : // one blank line to type into — an empty table with an "Add" button is
        // a dead end on first open
        [EMPTY_LINE()],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const towers = useLiveQuery(
    () => (projectId ? towerRepository.listForProject(projectId) : Promise.resolve([])),
    [projectId],
  );
  const workItems = useLiveQuery(
    () => (towerId ? towerWorkItemRepository.listForTower(towerId) : Promise.resolve([])),
    [towerId],
  );
  const siteTeam = useLiveQuery(
    () => userRepository.listByRole(['site_manager', 'project_manager']),
    [],
  );

  /*
   * Whoever is acting is the obvious requester when they are site staff, but
   * the staff list loads asynchronously — so the default is derived at render
   * rather than written into state by an effect. `null` means "untouched".
   */
  const actingIsSiteStaff = (siteTeam ?? []).some((u) => u.id === userId);
  const requesterValue = requestedBy ?? (actingIsSiteStaff ? userId : '');

  function setLine(index: number, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    if (!projectId) {
      setError('Pick the project this material is for');
      return;
    }
    const filled = lines.filter((l) => l.item_name.trim() && Number(l.quantity_requested) > 0);
    if (filled.length === 0) {
      setError('Add at least one item with a quantity');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        project_id: projectId,
        tower_id: towerId || null,
        work_item_id: workItemId || null,
        requested_by: requesterValue || null,
        request_date: requestDate,
        notes: notes.trim() || null,
      };
      const items = filled.map((l) => ({
        id: l.id,
        item_id: l.item_id,
        item_name: l.item_name,
        unit: l.unit || defaultUnit,
        quantity_requested: Number(l.quantity_requested),
      }));

      if (request) {
        await materialRequestRepository.updateRequest(request.id, payload, items, userId);
        router.push(`/admin/material-requests/${request.id}`);
      } else {
        const saved = await materialRequestRepository.createRequest(
          { ...payload, items, decision_note: null },
          userId,
        );
        router.push(`/admin/material-requests/${saved.id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Where it is needed" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" required>
            <SelectInput
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setTowerId('');
                setWorkItemId('');
              }}
            >
              <option value="">Select…</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Tower" hint="Leave blank for a site-wide request">
            <SelectInput
              value={towerId}
              onChange={(e) => {
                setTowerId(e.target.value);
                setWorkItemId('');
              }}
              disabled={!projectId}
            >
              <option value="">Whole site</option>
              {(towers ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Work item" hint="Which part of the work this is for">
            <SelectInput
              value={workItemId}
              onChange={(e) => setWorkItemId(e.target.value)}
              disabled={!towerId}
            >
              <option value="">Not tied to one item</option>
              {(workItems ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.sequence_no}. {w.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Request date" required>
            <TextInput
              type="date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
            />
          </Field>

          <Field label="Requested by">
            <SelectInput
              value={requesterValue}
              onChange={(e) => setRequestedBy(e.target.value)}
            >
              <option value="">Not recorded</option>
              {(siteTeam ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Items"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLines((rows) => [...rows, EMPTY_LINE()])}
            >
              <Plus className="size-4" /> Add item
            </Button>
          }
        />

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={line.id ?? index}
              // stacks on a phone, one row on a desktop — a 4-column grid at
              // 375px squeezes the item name down to nothing
              className="grid gap-3 rounded-xl border border-hairline p-3 sm:grid-cols-[1fr_120px_140px_auto] sm:items-end"
            >
              <MaterialItemPicker
                value={{ item_id: line.item_id, item_name: line.item_name, unit: line.unit }}
                onChange={(picked) => setLine(index, picked)}
              />
              <Field label="Quantity">
                <TextInput
                  type="number"
                  min={0}
                  step="any"
                  value={line.quantity_requested}
                  onChange={(e) => setLine(index, { quantity_requested: e.target.value })}
                  placeholder="0"
                />
              </Field>
              {/* Read-only: the unit belongs to the catalogue item, so choosing
                  it separately is what let one material hold stock in two
                  units under two rows. */}
              <Field label="Unit">
                <TextInput value={line.unit || '—'} readOnly disabled />
              </Field>
              <Button
                variant="ghost"
                onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                disabled={lines.length === 1}
                aria-label="Remove item"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-ink-muted">
          Items come from the shared catalogue (Section 6.6) — type to search it, or add a
          material it does not have yet with the + button.
        </p>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <Field label="Notes">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why it is needed and by when — casting on Thursday, stock ran out…"
          />
        </Field>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : request ? 'Save changes' : 'Raise request'}
        </Button>
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
