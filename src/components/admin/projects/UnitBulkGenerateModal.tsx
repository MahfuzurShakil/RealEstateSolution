'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { Tower } from '@/lib/db/types';
import {
  floorsInRange,
  previewUnitCodes,
  priceFor,
  type UnitPatternRow,
} from '@/lib/domain/project';
import { lookupRepository, unitRepository } from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';

const emptyRow = (suffix: string): UnitPatternRow => ({
  suffix,
  unit_type: '3 Bed',
  bedroom_count: '3',
  bathroom_count: '3',
  balcony_count: '2',
  size_sqft: '1450',
  facing: 'South',
  price_mode: 'per_sqft',
  price_value: '9500',
  parking_allocated: '1',
});

/**
 * Bulk unit generator (decided 2026-09-01).
 *
 * A Bangladeshi tower repeats one floor layout, so the input is: a floor range
 * with the floors to skip (the ground floor is usually parking or commercial),
 * the units on ONE floor as repeatable rows, and a code pattern with a live
 * preview. Running it a few times covers a whole tower; existing codes are
 * skipped, so a second run for the penthouse floors is safe.
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
  // mounted only while open, so the defaults are read off the tower once
  const [prefix, setPrefix] = useState(
    () => tower.name.replace(/^tower\s*/i, '').trim().slice(0, 4) || 'A',
  );
  const [separator, setSeparator] = useState('-');
  const [floorFrom, setFloorFrom] = useState('2');
  const [floorTo, setFloorTo] = useState(() => String(tower.floor_count || 10));
  const [excluded, setExcluded] = useState('');
  const [rows, setRows] = useState<UnitPatternRow[]>(() =>
    Array.from({ length: Math.min(Math.max(tower.unit_per_floor ?? 2, 1), 8) }, (_, i) =>
      emptyRow(String.fromCharCode(65 + i)),
    ),
  );
  const [unitTypes, setUnitTypes] = useState<string[]>([]);
  const [facings, setFacings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);

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
    prefix,
    separator,
    floor_from: Number(floorFrom),
    floor_to: Number(floorTo),
    excluded_floors: excludedFloors,
    rows,
  };

  const floors = floorsInRange(pattern);
  const codes = previewUnitCodes(pattern);
  const totalValue = floors.length * rows.reduce((sum, r) => sum + priceFor(r), 0);

  const rangeInvalid = floors.length === 0;
  const overFloorCount = Number(floorTo) > tower.floor_count;

  function updateRow(index: number, patch: Partial<UnitPatternRow>) {
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function generate() {
    setBusy(true);
    try {
      const { created, skipped } = await unitRepository.bulkGenerate(tower.id, pattern);
      setResult({ created: created.length, skipped });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Generate units — ${tower.name}`}
      subtitle="One floor pattern, repeated over a floor range"
      icon={Layers}
      size="xl"
      onClose={onClose}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={busy || rangeInvalid || codes.length === 0}>
              {busy ? 'Generating…' : `Generate ${codes.length} unit${codes.length === 1 ? '' : 's'}`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <span className="font-semibold text-admin-700">{result.created}</span> unit
            {result.created === 1 ? '' : 's'} created in {tower.name}.
          </p>
          {result.skipped.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">
                {result.skipped.length} code{result.skipped.length === 1 ? '' : 's'} already existed
                and {result.skipped.length === 1 ? 'was' : 'were'} left untouched
              </p>
              <p className="mt-1 text-xs text-amber-700">{result.skipped.join(', ')}</p>
            </div>
          )}
          <p className="text-xs text-ink-muted">
            Run this again for a different floor range — a penthouse or duplex floor — and edit the
            odd unit afterwards.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-xl border border-hairline bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">1. Floor range</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="From floor"
                error={rangeInvalid ? 'Range is empty' : undefined}
              >
                <TextInput
                  type="number"
                  min="0"
                  value={floorFrom}
                  onChange={(e) => setFloorFrom(e.target.value)}
                />
              </Field>
              <Field
                label="To floor"
                error={overFloorCount ? `Tower has ${tower.floor_count} floors` : undefined}
              >
                <TextInput
                  type="number"
                  min="0"
                  value={floorTo}
                  onChange={(e) => setFloorTo(e.target.value)}
                  invalid={overFloorCount}
                />
              </Field>
              <Field
                label="Skip floors"
                hint="Comma separated — the ground floor is often parking"
              >
                <TextInput
                  value={excluded}
                  onChange={(e) => setExcluded(e.target.value)}
                  placeholder="e.g. 1, 13"
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {floors.length} floor{floors.length === 1 ? '' : 's'}:{' '}
              {floors.length > 0 ? floors.join(', ') : '—'}
            </p>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">2. Units on one floor</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows((list) => [...list, emptyRow(String.fromCharCode(65 + list.length))])}
              >
                <Plus className="size-4" /> Add unit
              </Button>
            </div>

            <div className="space-y-3">
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border border-hairline p-3 md:grid-cols-4 xl:grid-cols-8"
                >
                  <Field label="Suffix">
                    <TextInput
                      value={row.suffix}
                      onChange={(e) => updateRow(index, { suffix: e.target.value })}
                      placeholder="A"
                    />
                  </Field>
                  <Field label="Unit type" className="xl:col-span-2">
                    <SelectInput
                      value={row.unit_type}
                      onChange={(e) => updateRow(index, { unit_type: e.target.value })}
                    >
                      {[...new Set([row.unit_type, ...unitTypes])].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Bed">
                    <TextInput
                      type="number"
                      min="0"
                      value={row.bedroom_count}
                      onChange={(e) => updateRow(index, { bedroom_count: e.target.value })}
                    />
                  </Field>
                  <Field label="Bath">
                    <TextInput
                      type="number"
                      min="0"
                      value={row.bathroom_count}
                      onChange={(e) => updateRow(index, { bathroom_count: e.target.value })}
                    />
                  </Field>
                  <Field label="Balcony">
                    <TextInput
                      type="number"
                      min="0"
                      value={row.balcony_count}
                      onChange={(e) => updateRow(index, { balcony_count: e.target.value })}
                    />
                  </Field>
                  <Field label="Size (sqft)">
                    <TextInput
                      type="number"
                      min="0"
                      value={row.size_sqft}
                      onChange={(e) => updateRow(index, { size_sqft: e.target.value })}
                    />
                  </Field>
                  <Field label="Facing">
                    <SelectInput
                      value={row.facing}
                      onChange={(e) => updateRow(index, { facing: e.target.value })}
                    >
                      <option value="">—</option>
                      {[...new Set([row.facing, ...facings])].filter(Boolean).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
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
                  <Field label={row.price_mode === 'per_sqft' ? 'Rate / sqft' : 'Unit price'}>
                    <TextInput
                      type="number"
                      min="0"
                      value={row.price_value}
                      onChange={(e) => updateRow(index, { price_value: e.target.value })}
                    />
                  </Field>
                  <Field label="Parking">
                    <TextInput
                      type="number"
                      min="0"
                      value={row.parking_allocated}
                      onChange={(e) => updateRow(index, { parking_allocated: e.target.value })}
                    />
                  </Field>
                  <div className="flex items-end justify-between gap-2 xl:col-span-2">
                    <p className="pb-2.5 text-sm font-medium text-ink">{formatBdt(priceFor(row))}</p>
                    {rows.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mb-1.5"
                        aria-label="Remove unit row"
                        onClick={() => setRows((list) => list.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">3. Code pattern & preview</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Code prefix">
                <TextInput value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="A" />
              </Field>
              <Field label="Separator">
                <SelectInput value={separator} onChange={(e) => setSeparator(e.target.value)}>
                  <option value="-">A-501 (dash)</option>
                  <option value="">A501 (none)</option>
                  <option value="/">A/501 (slash)</option>
                </SelectInput>
              </Field>
              <div className="flex items-end pb-1">
                <div>
                  <p className="text-xs text-ink-muted">Total for this run</p>
                  <p className="text-sm font-semibold text-ink">{formatBdt(totalValue, { compact: true })}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {codes.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing to generate yet.</p>
              ) : (
                <>
                  <Badge tone="teal">First: {codes[0]}</Badge>
                  <Badge tone="teal">Last: {codes[codes.length - 1]}</Badge>
                  <Badge>
                    {codes.length} unit{codes.length === 1 ? '' : 's'} ({rows.length} × {floors.length}{' '}
                    floors)
                  </Badge>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
