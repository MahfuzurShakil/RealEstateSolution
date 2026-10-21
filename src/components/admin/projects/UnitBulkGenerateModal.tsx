'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ResultDialog } from '@/components/ui/ResultDialog';
import type { Tower } from '@/lib/db/types';
import {
  cleanTowerCode,
  flatLetter,
  floorsInRange,
  previewUnitCodes,
  priceFor,
  priceOnFloor,
  suggestTowerCode,
  unitCode,
  unitPatternProblems,
  unitRowMissing,
  type UnitPatternRow,
} from '@/lib/domain/project';
import { lookupRepository, unitRepository } from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';

/* client meeting 2026-10-18: nothing prefilled, the user types every figure */
const emptyRow = (): UnitPatternRow => ({
  unit_type: '',
  bedroom_count: '',
  bathroom_count: '',
  balcony_count: '',
  size_sqft: '',
  facing: '',
  price_mode: 'per_sqft',
  price_value: '',
  parking_allocated: '',
});

/**
 * Bulk unit generator (decided 2026-09-01, simplified 2026-10-18).
 *
 * A Bangladeshi tower repeats one floor layout, so the input is: a floor range
 * with the floors to skip (the ground floor is usually parking or commercial),
 * the flats on ONE floor as rows, and a live preview of the codes. Running it
 * a few times covers a whole tower; existing codes are skipped, so a second
 * run for the penthouse floors is safe.
 *
 * Codes are Tower-FloorLetter (A-5B), the letter following the row order, so
 * there is no suffix or separator to choose. Every field starts blank and may
 * stay blank: those flats are saved as drafts and finished later.
 */
export function UnitBulkGenerateModal({
  open,
  tower,
  onClose,
}: {
  open: boolean;
  tower: Tower;
  onClose: () => void;
}) {
  const suggestedCode = suggestTowerCode(tower.name);
  const [towerCode, setTowerCode] = useState('');
  const [floorFrom, setFloorFrom] = useState('');
  const [floorTo, setFloorTo] = useState('');
  const [excluded, setExcluded] = useState('');
  // the tower's own units-per-floor says how many flat rows to start with
  const [rows, setRows] = useState<UnitPatternRow[]>(() =>
    Array.from({ length: Math.min(Math.max(tower.unit_per_floor ?? 1, 1), 8) }, emptyRow),
  );
  /*
   * Height is priced everywhere in this market. The step is counted from the
   * first floor generated, so the price typed into a row is the price of that
   * first flat.
   */
  const [premiumMode, setPremiumMode] = useState<'none' | 'amount' | 'percent'>('none');
  const [premiumValue, setPremiumValue] = useState('');
  const [unitTypes, setUnitTypes] = useState<string[]>([]);
  const [facings, setFacings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; drafts: number; skipped: string[] } | null>(
    null,
  );
  const [error, setError] = useState('');

  useEffect(() => {
    lookupRepository.options('unit_type').then((o) => setUnitTypes(o.map((r) => r.value)));
    lookupRepository.options('facing').then((o) => setFacings(o.map((r) => r.value)));
  }, []);

  const excludedFloors = useMemo(
    () =>
      excluded
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isFinite(n) && n !== 0),
    [excluded],
  );

  const pattern = {
    tower_code: towerCode,
    floor_from: floorFrom.trim() === '' ? NaN : Number(floorFrom),
    floor_to: floorTo.trim() === '' ? NaN : Number(floorTo),
    excluded_floors: excludedFloors,
    floor_premium_mode: premiumMode,
    floor_premium_value: premiumValue,
    rows,
  };

  const floors = floorsInRange(pattern);
  const codes = previewUnitCodes(pattern);
  const totalValue = floors.reduce(
    (sum, floor) => sum + rows.reduce((rowSum, r) => rowSum + priceOnFloor(r, floor, pattern), 0),
    0,
  );
  const draftRows = rows.filter((r) => unitRowMissing(r).length > 0).length;

  const rangeInvalid = floorFrom.trim() !== '' && floorTo.trim() !== '' && floors.length === 0;
  const overFloorCount = Number(floorTo) > tower.floor_count;
  const problems = unitPatternProblems(pattern, tower.floor_count);

  function updateRow(index: number, patch: Partial<UnitPatternRow>) {
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const { created, skipped } = await unitRepository.bulkGenerate(tower.id, pattern);
      setResult({
        created: created.length,
        drafts: created.filter((u) => u.status === 'draft').length,
        skipped,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const numberField = (index: number, key: keyof UnitPatternRow, label: string) => (
    <Field label={label}>
      <TextInput
        type="number"
        min="0"
        value={rows[index][key]}
        onChange={(e) => updateRow(index, { [key]: e.target.value })}
      />
    </Field>
  );

  if (result) {
    return (
      <ResultDialog
        open={open}
        title={`${result.created} unit${result.created === 1 ? '' : 's'} created`}
        message={`in ${tower.name}`}
        onClose={onClose}
      >
        {result.drafts > 0 && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-ink">
            {result.drafts} saved as <span className="font-medium">Draft</span>. Open each from the
            unit grid to add its type, size and price — a draft becomes Available once those are in.
          </p>
        )}
        {result.skipped.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">
              {result.skipped.length} code{result.skipped.length === 1 ? '' : 's'} already existed
              and {result.skipped.length === 1 ? 'was' : 'were'} left untouched
            </p>
            <p className="mt-1 text-xs text-amber-700">{result.skipped.join(', ')}</p>
          </div>
        )}
      </ResultDialog>
    );
  }

  return (
    <Modal
      open={open}
      title={`Generate units — ${tower.name}`}
      subtitle="One floor layout, repeated over a floor range"
      icon={Layers}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={busy}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={busy || problems.length > 0 || codes.length === 0}>
            {busy ? 'Generating…' : `Generate ${codes.length} unit${codes.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      {(
        <div className="space-y-5">
          <section className="rounded-xl border border-hairline bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">1. Floor range</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="From floor" required error={rangeInvalid ? 'Range is empty' : undefined}>
                <TextInput
                  type="number"
                  min="0"
                  value={floorFrom}
                  onChange={(e) => setFloorFrom(e.target.value)}
                />
              </Field>
              <Field
                label="To floor"
                required
                error={overFloorCount ? `Tower has ${tower.floor_count} floors` : undefined}
              >
                <TextInput
                  type="number"
                  min="0"
                  value={floorTo}
                  onChange={(e) => setFloorTo(e.target.value)}
                  placeholder={tower.floor_count ? `up to ${tower.floor_count}` : undefined}
                  invalid={overFloorCount}
                />
              </Field>
              <Field label="Skip floors" hint="Comma separated. The ground floor is often parking">
                <TextInput value={excluded} onChange={(e) => setExcluded(e.target.value)} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {floors.length} floor{floors.length === 1 ? '' : 's'}:{' '}
              {floors.length > 0 ? floors.join(', ') : '—'}
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="Higher floors cost more"
                hint="Counted from the first floor generated, so the price below is that floor's price"
              >
                <SelectInput
                  value={premiumMode}
                  onChange={(e) => setPremiumMode(e.target.value as 'none' | 'amount' | 'percent')}
                >
                  <option value="none">No, every floor the same price</option>
                  <option value="percent">Yes, a % per floor</option>
                  <option value="amount">Yes, a fixed amount per floor</option>
                </SelectInput>
              </Field>
              {premiumMode !== 'none' && (
                <Field label={premiumMode === 'percent' ? 'Per floor (%)' : 'Per floor (BDT)'}>
                  <TextInput
                    type="number"
                    min="0"
                    step={premiumMode === 'percent' ? '0.1' : '1000'}
                    value={premiumValue}
                    onChange={(e) => setPremiumValue(e.target.value)}
                  />
                </Field>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">2. Flats on one floor</h3>
                <p className="text-xs text-ink-muted">
                  Lettered A, B, C… in this order. Leave anything blank to finish it later as a draft.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRows((list) => [...list, emptyRow()])}>
                <Plus className="size-4" /> Add flat
              </Button>
            </div>

            <div className="space-y-3">
              {rows.map((row, index) => {
                const missing = unitRowMissing(row);
                return (
                  <div
                    key={index}
                    className="grid gap-3 rounded-xl border border-hairline p-3 md:grid-cols-4 xl:grid-cols-8"
                  >
                    <div className="flex flex-wrap items-center gap-2 md:col-span-4 xl:col-span-8">
                      <span className="text-sm font-semibold text-ink">Flat {flatLetter(index)}</span>
                      {towerCode && floors.length > 0 && (
                        <span className="font-mono text-xs text-ink-muted">
                          {unitCode(towerCode, floors[0], flatLetter(index))}
                          {floors.length > 1 ? ` … ${unitCode(towerCode, floors[floors.length - 1], flatLetter(index))}` : ''}
                        </span>
                      )}
                      {missing.length > 0 && <Badge tone="neutral">Draft: no {missing.join(', ')}</Badge>}
                    </div>
                    <Field label="Unit type" className="xl:col-span-2">
                      <SelectInput
                        value={row.unit_type}
                        onChange={(e) => {
                          const type = e.target.value;
                          // "3 Bed" names the bedrooms; fill Bed only while it is still blank
                          const beds = /^(\d+)\s*bed/i.exec(type)?.[1];
                          updateRow(index, {
                            unit_type: type,
                            ...(beds && !row.bedroom_count ? { bedroom_count: beds } : {}),
                          });
                        }}
                      >
                        <option value="">Select…</option>
                        {[...new Set([row.unit_type, ...unitTypes])].filter(Boolean).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    {numberField(index, 'bedroom_count', 'Bed')}
                    {numberField(index, 'bathroom_count', 'Bath')}
                    {numberField(index, 'balcony_count', 'Balcony')}
                    {numberField(index, 'size_sqft', 'Size (sqft)')}
                    <Field label="Facing">
                      <SelectInput value={row.facing} onChange={(e) => updateRow(index, { facing: e.target.value })}>
                        <option value="">—</option>
                        {[...new Set([row.facing, ...facings])].filter(Boolean).map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    {numberField(index, 'parking_allocated', 'Parking')}
                    <Field label="Price mode">
                      <SelectInput
                        value={row.price_mode}
                        onChange={(e) =>
                          updateRow(index, { price_mode: e.target.value as UnitPatternRow['price_mode'] })
                        }
                      >
                        <option value="per_sqft">Per sqft</option>
                        <option value="fixed">Fixed</option>
                      </SelectInput>
                    </Field>
                    {numberField(index, 'price_value', row.price_mode === 'per_sqft' ? 'Rate / sqft' : 'Unit price')}
                    <div className="flex items-end justify-between gap-2 xl:col-span-2">
                      <p className="pb-2.5 text-sm font-medium text-ink">
                        {priceFor(row) > 0 ? formatBdt(priceFor(row)) : '—'}
                        {premiumMode !== 'none' && floors.length > 0 && priceFor(row) > 0 && (
                          <span className="block text-xs font-normal text-ink-muted">
                            on floor {floors[0]}, rising with height
                          </span>
                        )}
                      </p>
                      {rows.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mb-1.5"
                          aria-label="Remove flat"
                          onClick={() => setRows((list) => list.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">3. Unit codes</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Tower code"
                required
                hint="Tower, floor, flat: A-5B is Tower A, 5th floor, flat B"
                className="sm:col-span-2"
              >
                <TextInput
                  value={towerCode}
                  onChange={(e) => setTowerCode(cleanTowerCode(e.target.value))}
                  placeholder={suggestedCode ? `e.g. ${suggestedCode}` : 'e.g. A'}
                />
              </Field>
              <div className="flex items-end pb-1">
                <div>
                  <p className="text-xs text-ink-muted">Total for this run</p>
                  <p className="text-sm font-semibold text-ink">{formatBdt(totalValue)}</p>
                </div>
              </div>
            </div>

            {towerCode && codes.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-hairline bg-slate-50 p-2 font-mono text-xs text-ink">
                {[...floors].reverse().map((floor) => (
                  <div key={floor} className="flex flex-wrap gap-x-4">
                    {rows.map((_, i) => (
                      <span key={i}>{unitCode(towerCode, floor, flatLetter(i))}</span>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {codes.length === 0 ? (
                <p className="text-sm text-ink-muted">Enter a floor range and a tower code to see the codes.</p>
              ) : (
                <>
                  <Badge>
                    {codes.length} unit{codes.length === 1 ? '' : 's'} ({rows.length} × {floors.length}{' '}
                    floors)
                  </Badge>
                  {draftRows > 0 && <Badge tone="neutral">{draftRows * floors.length} as draft</Badge>}
                </>
              )}
            </div>
            {(problems.length > 0 || error) && (towerCode || floorFrom || floorTo || error) && (
              <ul className="mt-3 space-y-0.5 text-xs text-red-600">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
                {error && <li>{error}</li>}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
