'use client';

import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import type { Unit, UnitStatus } from '@/lib/db/types';
import { UNIT_STATUS_META, isUnitEditable } from '@/lib/domain/project';
import { cn } from '@/lib/utils/cn';

/**
 * Colour per status. These are deliberately the same hues as the status badges
 * elsewhere, so the legend only has to be read once.
 */
const CELL_STYLES: Record<UnitStatus, string> = {
  available: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:border-emerald-400',
  hold: 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-400',
  reserved: 'bg-orange-50 border-orange-200 text-orange-800 hover:border-orange-400',
  booked: 'bg-blue-50 border-blue-200 text-blue-800 hover:border-blue-400',
  sold: 'bg-admin-50 border-admin-200 text-admin-800 hover:border-admin-400',
  handed_over: 'bg-slate-100 border-slate-300 text-slate-600 hover:border-slate-400',
};

const LEGEND_SWATCH: Record<UnitStatus, string> = {
  available: 'bg-emerald-200',
  hold: 'bg-amber-200',
  reserved: 'bg-orange-200',
  booked: 'bg-blue-200',
  sold: 'bg-admin-200',
  handed_over: 'bg-slate-300',
};

/**
 * Floor-by-floor map of a tower: one row per floor with the top floor at the
 * top, one column per unit position, each box coloured by status.
 *
 * A 78-unit table tells you nothing about the building; this is how a sales
 * office actually looks at inventory — which floors are still open, where the
 * unsold ones cluster. Clicking a box opens the same editor the table uses.
 */
export function UnitMatrix({
  units,
  onSelect,
}: {
  units: Unit[];
  onSelect: (unit: Unit) => void;
}) {
  /** Floors high-to-low, and the column positions used anywhere in the tower. */
  const { floors, positions, byFloorPosition } = useMemo(() => {
    const map = new Map<string, Unit>();
    const floorSet = new Set<number>();
    const positionSet = new Set<string>();

    for (const unit of units) {
      // the position is what is left of the code after the floor number,
      // e.g. A-501 -> "1", A-5A -> "A". Falls back to the whole code.
      const suffix = unit.code.replace(new RegExp(`^.*?${unit.floor}`), '') || unit.code;
      floorSet.add(unit.floor);
      positionSet.add(suffix);
      map.set(`${unit.floor}::${suffix}`, unit);
    }

    return {
      floors: [...floorSet].sort((a, b) => b - a),
      positions: [...positionSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      byFloorPosition: map,
    };
  }, [units]);

  /*
   * Every status, with how many units are in it.
   *
   * This used to list only the statuses present, so the legend could never
   * describe a colour that was not on screen. Honest, but it meant the key
   * changed shape between towers and a reader never learned the full colour
   * system — the first tower they opened taught them three colours out of six.
   * Showing all of them with a count keeps it honest a different way: an
   * absent status reads "0" and is dimmed, rather than being hidden.
   */
  const statusCounts = useMemo(() => {
    const counts = new Map<UnitStatus, number>();
    for (const status of Object.keys(UNIT_STATUS_META) as UnitStatus[]) counts.set(status, 0);
    for (const unit of units) counts.set(unit.status, (counts.get(unit.status) ?? 0) + 1);
    return [...counts.entries()];
  }, [units]);

  if (units.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-hairline bg-canvas/50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Legend</span>
        {statusCounts.map(([status, count]) => (
          <span
            key={status}
            className={cn(
              'flex items-center gap-1.5 text-xs',
              count > 0 ? 'text-ink' : 'text-slate-400',
            )}
          >
            <span
              className={cn(
                'size-3 rounded border border-black/10',
                LEGEND_SWATCH[status],
                count === 0 && 'opacity-40',
              )}
            />
            {UNIT_STATUS_META[status].label}
            <span className={count > 0 ? 'font-semibold text-ink' : ''}>{count}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Lock className="size-3" />
          Locked — sold or handed over, opens read-only
        </span>
      </div>

      <div className="overflow-x-auto pb-2">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Floor
              </th>
              {positions.map((position) => (
                <th
                  key={position}
                  className="min-w-[6.5rem] px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {position}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {floors.map((floor) => (
              <tr key={floor}>
                <th className="sticky left-0 z-10 bg-white pr-2 text-right align-middle text-xs font-semibold text-ink">
                  {floor}
                </th>
                {positions.map((position) => {
                  const unit = byFloorPosition.get(`${floor}::${position}`);
                  if (!unit) {
                    return (
                      <td key={position}>
                        <div className="h-16 rounded-lg border border-dashed border-hairline" />
                      </td>
                    );
                  }
                  const locked = !isUnitEditable(unit.status);
                  return (
                    <td key={position}>
                      <button
                        type="button"
                        onClick={() => onSelect(unit)}
                        title={`${unit.code} · ${unit.unit_type} · ${unit.size_sqft} sqft · ${UNIT_STATUS_META[unit.status].label}`}
                        className={cn(
                          'flex h-16 w-full flex-col items-start justify-center gap-0.5 rounded-lg border px-2 text-left transition-colors',
                          CELL_STYLES[unit.status],
                        )}
                      >
                        <span className="flex w-full items-center justify-between gap-1">
                          <span className="truncate text-xs font-semibold">{unit.code}</span>
                          {locked && <Lock className="size-3 shrink-0 opacity-70" />}
                        </span>
                        <span className="truncate text-[11px] opacity-80">{unit.size_sqft} sqft</span>
                        <span className="truncate text-[11px] opacity-70">{unit.unit_type}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
