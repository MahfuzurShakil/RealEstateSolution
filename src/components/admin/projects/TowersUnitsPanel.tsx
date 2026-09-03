'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  Handshake,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import {
  ALLOCATION_TYPES,
  UNIT_STATUSES,
  type AllocationType,
  type Landowner,
  type Tower,
  type Unit,
  type UnitStatus,
} from '@/lib/db/types';
import {
  ALLOCATION_TYPE_LABEL,
  FOR_SALE_BY_SHORT,
  TOWER_STATUS_META,
  UNIT_STATUS_META,
} from '@/lib/domain/project';
import {
  landownerRepository,
  towerRepository,
  unitRepository,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';
import { TowerFormModal } from './TowerFormModal';
import { UnitMatrix } from './UnitMatrix';
import { UnitBulkAllocateModal } from './UnitBulkAllocateModal';
import { UnitBulkGenerateModal } from './UnitBulkGenerateModal';
import { UnitEditModal } from './UnitEditModal';

/** Towers of a project, and the unit list of whichever tower is selected. */
export function TowersUnitsPanel({ projectId }: { projectId: string }) {
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);
  const [towerModal, setTowerModal] = useState<{ open: boolean; tower?: Tower }>({ open: false });
  const [generateFor, setGenerateFor] = useState<Tower | null>(null);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [deleteTower, setDeleteTower] = useState<Tower | null>(null);
  const [deleteUnits, setDeleteUnits] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);

  const [status, setStatus] = useState<UnitStatus | 'all'>('all');
  const [allocation, setAllocation] = useState<AllocationType | 'all'>('all');
  const [search, setSearch] = useState('');
  // the matrix is the default: a floor map reads far faster than 78 table rows
  const [view, setView] = useState<ViewMode>('grid');

  const towers = useLiveQuery(() => towerRepository.listForProject(projectId), [projectId]);
  const unitCounts = useLiveQuery(
    () => towerRepository.unitCountsForProject(projectId),
    [projectId],
  );
  const owners = useLiveQuery(() => landownerRepository.getAll(), []);
  const ownerById = useMemo(
    () => new Map((owners ?? []).map((o: Landowner) => [o.id, o])),
    [owners],
  );

  // no explicit pick yet → show the first tower
  const activeTowerId = selectedTowerId ?? towers?.[0]?.id ?? null;
  const activeTower = towers?.find((t) => t.id === activeTowerId);

  const units = useLiveQuery(
    () =>
      activeTowerId
        ? unitRepository.listForProject(projectId, {
            tower_id: activeTowerId,
            status,
            allocation_type: allocation,
            search,
          })
        : Promise.resolve([]),
    [projectId, activeTowerId, status, allocation, search],
  );

  const rows = units ?? [];
  const allSelected = rows.length > 0 && rows.every((u) => selection.includes(u.id));

  function toggleAll() {
    setSelection(allSelected ? [] : rows.map((u) => u.id));
  }

  function toggleOne(id: string) {
    setSelection((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  if (towers === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Towers (${towers.length})`}
          action={
            <Button size="sm" onClick={() => setTowerModal({ open: true })}>
              <Plus className="size-4" /> Add Tower
            </Button>
          }
        />
        {towers.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No tower yet"
            description="Add a tower or block first — units are generated inside it."
            action={
              <Button onClick={() => setTowerModal({ open: true })}>
                <Plus className="size-4" /> Add Tower
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {towers.map((tower) => {
              const active = tower.id === activeTowerId;
              /*
               * Bulk generation can leave a hole — Tower A is 11 floors at
               * 2/floor but its grid starts at floor 2, so it holds 18 of 22
               * and nothing flagged it. Only claimed when the tower says how
               * many it should have; without `unit_per_floor` there is no
               * expected number to compare against.
               */
              const generated = unitCounts?.[tower.id];
              const expected =
                tower.unit_per_floor && tower.floor_count
                  ? tower.unit_per_floor * tower.floor_count
                  : null;
              const shortfall =
                expected !== null && generated !== undefined && generated < expected;
              return (
                <div
                  key={tower.id}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    active ? 'border-admin-400 bg-admin-50' : 'border-hairline bg-white',
                  )}
                >
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => {
                      setSelectedTowerId(tower.id);
                      setSelection([]);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{tower.name}</p>
                      <Badge tone={TOWER_STATUS_META[tower.status].tone}>
                        {TOWER_STATUS_META[tower.status].label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {tower.building_type ? `${tower.building_type} · ` : ''}
                      {tower.floor_count} floors
                      {tower.unit_per_floor ? ` · ${tower.unit_per_floor}/floor` : ''}
                      {tower.lift_count ? ` · ${tower.lift_count} lift` : ''}
                    </p>
                    {generated !== undefined && (
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          shortfall ? 'font-medium text-amber-700' : 'text-ink-muted',
                        )}
                      >
                        {expected === null
                          ? `${generated} unit${generated === 1 ? '' : 's'}`
                          : `${generated} of ${expected} generated`}
                      </p>
                    )}
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setGenerateFor(tower)}>
                      <Layers className="size-4" /> Generate units
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${tower.name}`}
                      onClick={() => setTowerModal({ open: true, tower })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${tower.name}`}
                      onClick={() => setDeleteTower(tower)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {activeTower && (
        <Card>
          <CardHeader
            title={`Units — ${activeTower.name} (${rows.length})`}
            action={
              <div className="flex items-center gap-2">
                <ViewToggle value={view} onChange={setView} />
                <Button size="sm" variant="outline" onClick={() => setGenerateFor(activeTower)}>
                  <Layers className="size-4" /> Generate units
                </Button>
              </div>
            }
          />

          <div className="mb-4 flex flex-wrap gap-2">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, type, facing…"
              className="w-auto max-w-[16rem] flex-1"
            />
            <SelectInput
              value={status}
              onChange={(e) => setStatus(e.target.value as UnitStatus | 'all')}
              className="w-auto max-w-[11rem]"
            >
              <option value="all">All statuses</option>
              {UNIT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {UNIT_STATUS_META[s].label}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              value={allocation}
              onChange={(e) => setAllocation(e.target.value as AllocationType | 'all')}
              className="w-auto max-w-[13rem]"
            >
              <option value="all">All allocations</option>
              {ALLOCATION_TYPES.map((a) => (
                <option key={a} value={a}>
                  {ALLOCATION_TYPE_LABEL[a]}
                </option>
              ))}
            </SelectInput>
          </div>

          {view === 'list' && selection.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-admin-200 bg-admin-50 p-3">
              <p className="mr-auto text-sm font-medium text-admin-800">
                {selection.length} unit{selection.length === 1 ? '' : 's'} selected
              </p>
              <Button size="sm" onClick={() => setAllocateOpen(true)}>
                <Handshake className="size-4" /> Allocate
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDeleteUnits(true)}>
                <Trash2 className="size-4" /> Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelection([])}>
                Clear
              </Button>
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No units here yet"
              description="Generate a floor pattern across a floor range — a few runs cover the whole tower."
              action={
                <Button onClick={() => setGenerateFor(activeTower)}>
                  <Layers className="size-4" /> Generate units
                </Button>
              }
            />
          ) : view === 'grid' ? (
            <UnitMatrix units={rows} onSelect={setEditUnit} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="w-10 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all units"
                        className="size-4 rounded border-hairline accent-admin-500"
                        checked={allSelected}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Floor</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Size</th>
                    <th className="py-2 pr-3">Facing</th>
                    <th className="py-2 pr-3">Price</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Allocation</th>
                    <th className="py-2 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((unit) => (
                    <tr key={unit.id} className="border-b border-hairline last:border-0">
                      <td className="py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${unit.code}`}
                          className="size-4 rounded border-hairline accent-admin-500"
                          checked={selection.includes(unit.id)}
                          onChange={() => toggleOne(unit.id)}
                        />
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-ink">{unit.code}</td>
                      <td className="py-2.5 pr-3 text-ink-muted">{unit.floor}</td>
                      <td className="py-2.5 pr-3 text-ink-muted">
                        {unit.unit_type}
                        <span className="ml-1 text-xs">
                          ({unit.bedroom_count ?? '—'}B/{unit.bathroom_count ?? '—'}Ba/
                          {unit.balcony_count ?? '—'}Bal)
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">{unit.size_sqft} sqft</td>
                      <td className="py-2.5 pr-3 text-ink-muted">{unit.facing ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-ink">{formatBdt(unit.base_price )}</td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={UNIT_STATUS_META[unit.status].tone}>
                          {UNIT_STATUS_META[unit.status].label}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3">
                        {unit.allocation_type === 'landowner_share' ? (
                          <span className="text-xs text-ink-muted">
                            <Badge tone="amber">Owner</Badge>{' '}
                            {ownerById.get(unit.allocated_to_owner_id ?? '')?.name ?? 'Unassigned'}
                          </span>
                        ) : (
                          <Badge tone="teal">Developer</Badge>
                        )}
                        <span className="ml-1 text-xs text-ink-muted">
                          · {FOR_SALE_BY_SHORT[unit.for_sale_by]}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit ${unit.code}`}
                          onClick={() => setEditUnit(unit)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {towerModal.open && (
        <TowerFormModal
          open
          projectId={projectId}
          tower={towerModal.tower}
          onClose={() => setTowerModal({ open: false })}
        />
      )}

      {generateFor && (
        <UnitBulkGenerateModal
          open
          tower={generateFor}
          onClose={() => {
            setSelectedTowerId(generateFor.id);
            setGenerateFor(null);
          }}
        />
      )}

      {editUnit && <UnitEditModal open unit={editUnit} onClose={() => setEditUnit(null)} />}

      {allocateOpen && (
        <UnitBulkAllocateModal
          open
          unitIds={selection}
          onClose={() => {
            setAllocateOpen(false);
            setSelection([]);
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTower !== null}
        title={deleteTower ? `Delete ${deleteTower.name}` : ''}
        confirmLabel="Delete tower"
        message="The tower and every unit inside it are deleted. This cannot be undone."
        onCancel={() => setDeleteTower(null)}
        onConfirm={async () => {
          if (deleteTower) {
            await towerRepository.removeCascade(deleteTower.id);
            if (selectedTowerId === deleteTower.id) setSelectedTowerId(null);
          }
          setDeleteTower(null);
        }}
      />

      <ConfirmDialog
        open={deleteUnits}
        title={`Delete ${selection.length} unit${selection.length === 1 ? '' : 's'}`}
        confirmLabel="Delete units"
        message="The selected units are removed from this tower. This cannot be undone."
        onCancel={() => setDeleteUnits(false)}
        onConfirm={async () => {
          await unitRepository.bulkRemove(selection);
          setSelection([]);
          setDeleteUnits(false);
        }}
      />
    </div>
  );
}
