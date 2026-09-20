'use client';

import { useEffect, useMemo, useState } from 'react';
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
  type ProjectType,
  type Tower,
  type Unit,
  type UnitStatus,
} from '@/lib/db/types';
import {
  ALLOCATION_TYPE_LABEL,
  FOR_SALE_BY_SHORT,
  TOWER_STATUS_META,
  UNIT_STATUS_META,
  projectShape,
  shapeUses,
  unitSizeLabel,
} from '@/lib/domain/project';
import {
  landownerRepository,
  towerRepository,
  unitRepository,
} from '@/lib/repositories';
import { useMockSession } from '@/lib/auth/mock-session';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';
import { TowerFormModal } from './TowerFormModal';
import { UnitMatrix } from './UnitMatrix';
import { UnitBulkAllocateModal } from './UnitBulkAllocateModal';
import { PlotShareGenerateModal } from './PlotShareGenerateModal';
import { UnitBulkGenerateModal } from './UnitBulkGenerateModal';
import { UnitEditModal } from './UnitEditModal';

/**
 * A project's inventory: its containers, and the items inside the selected one.
 *
 * v26 — what a container and an item *are* comes from `projectShape`, not from
 * this component. On an apartment project it reads as Towers and Units; on a
 * plot project as Blocks and Plots, with no floor and no bedroom column; on a
 * land-share project the container disappears entirely and what is left is one
 * share register. Every label, every column and every empty state below asks
 * the shape rather than testing `project_type`.
 */
export function TowersUnitsPanel({
  projectId,
  projectType,
}: {
  projectId: string;
  projectType: ProjectType;
}) {
  const { userId } = useMockSession();
  const shape = projectShape(projectType);
  const L = shape.labels;
  /*
   * A share register has exactly one hidden container (see
   * `towerRepository.ensureShareRegister`), so showing a card for it would be
   * showing the user an implementation detail.
   */
  const showContainers = shape.container !== 'none';
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

  /*
   * A share register's one container is created for it, not by the user.
   *
   * `units.tower_id` stays required (PROJECT-MODULE-PLAN.md section 3), so a
   * share still needs a row to hang off — but asking someone to "add a tower"
   * before they can enter a share register would be asking them to understand
   * our schema. Idempotent, and only ever runs for `container: 'none'`.
   */
  useEffect(() => {
    if (showContainers || towers === undefined || towers.length > 0) return;
    void towerRepository.ensureShareRegister(projectId, userId);
  }, [showContainers, towers, projectId, userId]);

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
      {showContainers && (
      <Card>
        <CardHeader
          title={`${L.containerPlural} (${towers.length})`}
          action={
            <Button size="sm" onClick={() => setTowerModal({ open: true })}>
              <Plus className="size-4" /> Add {L.container}
            </Button>
          }
        />
        {towers.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={`No ${L.container.toLowerCase()} yet`}
            description={`Add a ${L.container.toLowerCase()} first — ${L.itemPlural.toLowerCase()} are generated inside it.`}
            action={
              <Button onClick={() => setTowerModal({ open: true })}>
                <Plus className="size-4" /> Add {L.container}
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
                    {/* a block has no floors and no lifts; its road is what matters */}
                    <p className="mt-1 text-xs text-ink-muted">
                      {shape.container === 'tower'
                        ? [
                            tower.building_type,
                            `${tower.floor_count} floors`,
                            tower.unit_per_floor ? `${tower.unit_per_floor}/floor` : null,
                            tower.lift_count ? `${tower.lift_count} lift` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : [
                            tower.building_type,
                            tower.front_road_width_ft ? `${tower.front_road_width_ft} ft road` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'No details recorded'}
                    </p>
                    {generated !== undefined && (
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          shortfall ? 'font-medium text-amber-700' : 'text-ink-muted',
                        )}
                      >
                        {expected === null
                          ? `${generated} ${generated === 1 ? L.item.toLowerCase() : L.itemPlural.toLowerCase()}`
                          : `${generated} of ${expected} generated`}
                      </p>
                    )}
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setGenerateFor(tower)}>
                      <Layers className="size-4" /> Generate {L.itemPlural.toLowerCase()}
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
      )}

      {activeTower && (
        <Card>
          <CardHeader
            title={
              showContainers
                ? `${L.itemPlural} — ${activeTower.name} (${rows.length})`
                : `${L.itemPlural} (${rows.length})`
            }
            action={
              <div className="flex items-center gap-2">
                {/* the floor × position grid only means something in a tower */}
                {shape.container === 'tower' && <ViewToggle value={view} onChange={setView} />}
                <Button size="sm" variant="outline" onClick={() => setGenerateFor(activeTower)}>
                  <Layers className="size-4" /> Generate {L.itemPlural.toLowerCase()}
                </Button>
              </div>
            }
          />

          <div className="mb-4 flex flex-wrap gap-2">
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${L.item.toLowerCase()} code or type…`}
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
                {selection.length}{' '}
                {selection.length === 1 ? L.item.toLowerCase() : L.itemPlural.toLowerCase()} selected
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
              title={`No ${L.itemPlural.toLowerCase()} here yet`}
              description={
                shape.item === 'flat'
                  ? 'Generate a floor pattern across a floor range — a few runs cover the whole tower.'
                  : shape.item === 'plot'
                    ? 'Generate a numbered run of plots — one run per size, so a block of 5-katha and 3-katha plots takes two.'
                    : 'Generate the register — how many shares the plot is divided into, and the price of one.'
              }
              action={
                <Button onClick={() => setGenerateFor(activeTower)}>
                  <Layers className="size-4" /> Generate {L.itemPlural.toLowerCase()}
                </Button>
              }
            />
          ) : view === 'grid' && shape.container === 'tower' ? (
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
                    {shapeUses(shape, 'floor') && <th className="py-2 pr-3">Floor</th>}
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">{L.size}</th>
                    {shapeUses(shape, 'road_width') && <th className="py-2 pr-3">Road</th>}
                    {shapeUses(shape, 'facing') && <th className="py-2 pr-3">Facing</th>}
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
                      <td className="py-2.5 pr-3 font-medium text-ink">
                        {unit.code}
                        {unit.is_corner && (
                          <span className="ml-1.5 rounded bg-admin-50 px-1.5 py-0.5 text-xs font-normal text-admin-700">
                            corner
                          </span>
                        )}
                      </td>
                      {shapeUses(shape, 'floor') && (
                        <td className="py-2.5 pr-3 text-ink-muted">{unit.floor ?? '—'}</td>
                      )}
                      <td className="py-2.5 pr-3 text-ink-muted">
                        {unit.unit_type}
                        {shapeUses(shape, 'bedrooms') && (
                          <span className="ml-1 text-xs">
                            ({unit.bedroom_count ?? '—'}B/{unit.bathroom_count ?? '—'}Ba/
                            {unit.balcony_count ?? '—'}Bal)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">{unitSizeLabel(unit, shape)}</td>
                      {shapeUses(shape, 'road_width') && (
                        <td className="py-2.5 pr-3 text-ink-muted">
                          {unit.road_width_ft ? `${unit.road_width_ft} ft` : '—'}
                        </td>
                      )}
                      {shapeUses(shape, 'facing') && (
                        <td className="py-2.5 pr-3 text-ink-muted">{unit.facing ?? '—'}</td>
                      )}
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
          shape={shape}
          open
          projectId={projectId}
          tower={towerModal.tower}
          onClose={() => setTowerModal({ open: false })}
        />
      )}

      {/* v26 — a floor pattern for a tower, a numbered run or a register otherwise */}
      {generateFor &&
        (shape.item === 'flat' ? (
          <UnitBulkGenerateModal
            open
            tower={generateFor}
            onClose={() => {
              setSelectedTowerId(generateFor.id);
              setGenerateFor(null);
            }}
          />
        ) : (
          <PlotShareGenerateModal
            open
            tower={generateFor}
            shape={shape}
            onClose={() => {
              setSelectedTowerId(generateFor.id);
              setGenerateFor(null);
            }}
          />
        ))}

      {editUnit && (
        <UnitEditModal
          shape={shape}
          open
          projectId={projectId}
          unit={editUnit}
          onClose={() => setEditUnit(null)}
        />
      )}

      {allocateOpen && (
        <UnitBulkAllocateModal
          open
          projectId={projectId}
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
