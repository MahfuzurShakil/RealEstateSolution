'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layers } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { LAND_SIZE_UNITS, type LandSizeUnit, type Tower } from '@/lib/db/types';
import { LAND_SIZE_UNIT_LABEL } from '@/lib/domain/land';
import type { ProjectShape } from '@/lib/domain/project';
import {
  landAcquisitionCostRepository,
  landProjectMappingRepository,
  unitRepository,
} from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';

/**
 * Bulk generator for the two shapes that are not a tower (v26).
 *
 * Deliberately not folded into `UnitBulkGenerateModal`: that one asks for a
 * floor range and one floor's layout repeated up the building, and neither
 * question means anything here. A plot schedule is a numbered run inside a
 * block; a share register is a count and a price.
 *
 * Both live in one file because they are the same small form with a different
 * middle, and splitting them would duplicate the preview, the result panel and
 * the code-collision handling three ways.
 */
export function PlotShareGenerateModal({
  open,
  tower,
  shape,
  onClose,
}: {
  open: boolean;
  tower: Tower;
  shape: ProjectShape;
  onClose: () => void;
}) {
  const isPlot = shape.item === 'plot';
  const L = shape.labels;

  /* ---- shared ---- */
  const [prefix, setPrefix] = useState(() =>
    isPlot ? tower.name.replace(/^block\s*/i, '').trim().slice(0, 4) || 'A' : 'SHARE',
  );
  const [separator, setSeparator] = useState('-');
  const [count, setCount] = useState(isPlot ? '10' : '20');
  const [unitType, setUnitType] = useState(isPlot ? 'Residential Plot' : 'Land Share');
  const [sizeUnit, setSizeUnit] = useState<LandSizeUnit>('katha');

  /* ---- plots ---- */
  const [startNumber, setStartNumber] = useState('1');
  const [plotSize, setPlotSize] = useState('5');
  const [ratePerKatha, setRatePerKatha] = useState('1200000');
  const [roadWidth, setRoadWidth] = useState('25');
  const [cornerNumbers, setCornerNumbers] = useState('');
  const [cornerPremium, setCornerPremium] = useState('500000');
  const [facing, setFacing] = useState('South');

  /* ---- shares ---- */
  // empty until the register's own price (if any) is known: typed by hand (D2)
  const [pricePerShare, setPricePerShare] = useState(isPlot ? '100000' : '');
  const [priceTouched, setPriceTouched] = useState(false);
  const [error, setError] = useState('');

  /*
   * A register divides the project's own land (client walkthrough
   * 2026-10-10): its size and cost are read from the linked land, and the
   * price per share is set against the land cost per share.
   */
  const shareContext = useLiveQuery(async () => {
    if (isPlot) return null;
    const lands = await landProjectMappingRepository.landsForProject(tower.project_id);
    const sameUnit = lands.length > 0 && new Set(lands.map((l) => l.land_size_unit)).size === 1;
    let cost = 0;
    for (const l of lands) {
      const sheet = await landAcquisitionCostRepository.sheetForLand(l.id);
      cost += Math.max(sheet.landTotal.estimated, sheet.landTotal.actual);
    }
    const existing = await unitRepository.listForTower(tower.id);
    return {
      lands,
      size: sameUnit ? lands.reduce((s, l) => s + (Number(l.land_size) || 0), 0) : null,
      unit: sameUnit ? lands[0].land_size_unit : null,
      cost,
      existing: existing.length,
      price: existing[0]?.base_price ?? null,
      sold: existing.filter((u) => u.status !== 'available' && u.status !== 'hold').length,
    };
  }, [isPlot, tower.id, tower.project_id]);

  // regenerating starts from the price the register already has
  useEffect(() => {
    if (!priceTouched && shareContext?.price) setPricePerShare(String(shareContext.price));
  }, [shareContext?.price, priceTouched]);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);

  const n = Math.max(0, Math.trunc(Number(count) || 0));

  /**
   * The plot numbers typed as corners, e.g. "1, 7, 12".
   *
   * Free text rather than a picker: the block layout is on a drawing in front
   * of whoever is entering this, and ticking twelve boxes to say three of them
   * are corners is slower than typing three numbers.
   */
  const corners = useMemo(
    () =>
      cornerNumbers
        .split(/[,\s]+/)
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v) && v > 0),
    [cornerNumbers],
  );

  /** First and last code, so a collision is obvious before anything is written. */
  const codes = useMemo(() => {
    if (n === 0) return [];
    if (isPlot) {
      const start = Math.trunc(Number(startNumber) || 1);
      return [`${prefix}${separator}${start}`, `${prefix}${separator}${start + n - 1}`];
    }
    const width = String(n).length;
    return [
      `${prefix}${separator}${'1'.padStart(width, '0')}`,
      `${prefix}${separator}${String(n).padStart(width, '0')}`,
    ];
  }, [n, isPlot, prefix, separator, startNumber]);

  const perItem = isPlot
    ? (Number(plotSize) || 0) * (Number(ratePerKatha) || 0)
    : Number(pricePerShare) || 0;
  const totalValue = perItem * n + (isPlot ? corners.length * (Number(cornerPremium) || 0) : 0);

  /** A register has to add up to the whole plot, so unequal shares are a later edit. */
  const sharePct = n > 0 ? 100 / n : 0;

  async function generate() {
    setBusy(true);
    try {
      const res = isPlot
        ? await unitRepository.bulkGeneratePlots(tower.id, {
            prefix,
            separator,
            start_number: Number(startNumber) || 1,
            count: n,
            unit_type: unitType,
            land_size: Number(plotSize) || 0,
            land_size_unit: sizeUnit,
            rate_per_katha: Number(ratePerKatha) || 0,
            road_width_ft: roadWidth,
            corner_numbers: corners,
            corner_premium: cornerPremium,
            facing,
          })
        : await unitRepository.bulkGenerateShares(tower.id, {
            prefix,
            separator,
            count: n,
            price_per_share: Number(pricePerShare) || 0,
            unit_type: unitType,
            total_land_size: null,
            land_size_unit: sizeUnit,
            replace: (shareContext?.existing ?? 0) > 0,
          });
      setResult({ created: res.created.length, skipped: res.skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Generate ${L.itemPlural.toLowerCase()}${isPlot ? ` — ${tower.name}` : ''}`}
      subtitle={
        isPlot
          ? 'A numbered run of plots — one run per size'
          : 'How many shares the plot is divided into, and the price of one'
      }
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
            <Button
              onClick={generate}
              disabled={
                busy ||
                n === 0 ||
                (!isPlot && (!shareContext || shareContext.lands.length === 0 || shareContext.sold > 0))
              }
            >
              {busy
                ? 'Generating…'
                : `${!isPlot && (shareContext?.existing ?? 0) > 0 ? 'Regenerate' : 'Generate'} ${n} ${n === 1 ? L.item.toLowerCase() : L.itemPlural.toLowerCase()}`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <span className="font-semibold text-admin-700">{result.created}</span>{' '}
            {result.created === 1 ? L.item.toLowerCase() : L.itemPlural.toLowerCase()} created
            {isPlot ? ` in ${tower.name}` : ''}.
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
            {isPlot
              ? 'Run this again for a different plot size — a block of 5-katha and 3-katha plots takes two runs — and edit the odd plot afterwards.'
              : 'Edit a share afterwards to record a buyer taking two as one holding.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {!isPlot && shareContext && (
            <ShareLandBanner context={shareContext} count={n} />
          )}
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <section className="rounded-xl border border-hairline bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">
              1. How many {L.itemPlural.toLowerCase()}
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`Number of ${L.itemPlural.toLowerCase()}`} required>
                <TextInput value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" />
              </Field>
              {isPlot ? (
                <Field label="Starting plot number" hint="C-1, C-2, C-3 …">
                  <TextInput
                    value={startNumber}
                    onChange={(e) => setStartNumber(e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
              ) : (
                <Field
                  label="Each share is"
                  hint="Divided evenly; edit a share later if one buyer takes two"
                >
                  <TextInput value={`${sharePct.toFixed(2)}%`} readOnly disabled />
                </Field>
              )}
              <Field label="Type" hint="Shown on the price list and the booking">
                <TextInput value={unitType} onChange={(e) => setUnitType(e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">2. Size & price</h3>
            {isPlot ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Plot size" required>
                    <TextInput
                      value={plotSize}
                      onChange={(e) => setPlotSize(e.target.value)}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Unit">
                    <SelectInput
                      value={sizeUnit}
                      onChange={(e) => setSizeUnit(e.target.value as LandSizeUnit)}
                    >
                      {LAND_SIZE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {LAND_SIZE_UNIT_LABEL[u] ?? u}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label={`Rate ${L.rate} (BDT)`} required>
                    <TextInput
                      value={ratePerKatha}
                      onChange={(e) => setRatePerKatha(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-4">
                  <Field label="Road width (ft)" hint="What the plots front onto">
                    <TextInput
                      value={roadWidth}
                      onChange={(e) => setRoadWidth(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Corner plot numbers" hint="e.g. 1, 7, 12">
                    <TextInput
                      value={cornerNumbers}
                      onChange={(e) => setCornerNumbers(e.target.value)}
                      placeholder="none"
                    />
                  </Field>
                  <Field label="Corner premium (BDT)">
                    <TextInput
                      value={cornerPremium}
                      onChange={(e) => setCornerPremium(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Facing">
                    <TextInput value={facing} onChange={(e) => setFacing(e.target.value)} />
                  </Field>
                </div>
              </>
            ) : (
              <SharePricing
                price={pricePerShare}
                onPrice={(v) => {
                  setPriceTouched(true);
                  setPricePerShare(v);
                }}
                count={n}
                context={shareContext ?? null}
              />
            )}
          </section>

          <section className="rounded-xl border border-hairline bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">3. Code pattern & preview</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Code prefix">
                <TextInput value={prefix} onChange={(e) => setPrefix(e.target.value)} />
              </Field>
              <Field label="Separator">
                <SelectInput value={separator} onChange={(e) => setSeparator(e.target.value)}>
                  <option value="-">{isPlot ? 'C-14 (dash)' : 'SHARE-07 (dash)'}</option>
                  <option value="">{isPlot ? 'C14 (none)' : 'SHARE07 (none)'}</option>
                  <option value="/">{isPlot ? 'C/14 (slash)' : 'SHARE/07 (slash)'}</option>
                </SelectInput>
              </Field>
              <div className="flex items-end pb-1">
                <div>
                  <p className="text-xs text-ink-muted">Total for this run</p>
                  <p className="text-sm font-semibold text-ink">{formatBdt(totalValue)}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {codes.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing to generate yet.</p>
              ) : (
                <>
                  <Badge tone="teal">First: {codes[0]}</Badge>
                  <Badge tone="teal">Last: {codes[1]}</Badge>
                  <Badge>
                    {n} {n === 1 ? L.item.toLowerCase() : L.itemPlural.toLowerCase()}
                    {isPlot ? ` × ${formatBdt(perItem)}` : ` × ${formatBdt(perItem)}`}
                  </Badge>
                  {isPlot && corners.length > 0 && (
                    <Badge tone="amber">{corners.length} corner</Badge>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

interface ShareContext {
  lands: Array<{ code: string; name: string }>;
  size: number | null;
  unit: LandSizeUnit | null;
  cost: number;
  existing: number;
  price: number | null;
  sold: number;
}

/** The land being divided, read only, and why the button may be disabled. */
function ShareLandBanner({ context, count }: { context: ShareContext; count: number }) {
  if (context.lands.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Link the land to this project first. The register divides that land.
      </p>
    );
  }
  const each =
    context.size && count > 0 ? Math.round((context.size / count) * 10000) / 10000 : null;
  return (
    <div className="rounded-xl border border-admin-100 bg-admin-50/60 p-3 text-sm text-admin-800">
      <p>
        Dividing <strong>{context.lands.map((l) => l.code).join(', ')}</strong>
        {context.size !== null && context.unit && (
          <>
            {' '}· {context.size} {LAND_SIZE_UNIT_LABEL[context.unit]}
            {each !== null && (
              <>
                {' '}· each share {each} {LAND_SIZE_UNIT_LABEL[context.unit]}
              </>
            )}
          </>
        )}
        . Shares always add up to 100%.
      </p>
      {context.existing > 0 && (
        <p className={context.sold > 0 ? 'mt-1 font-medium text-red-700' : 'mt-1'}>
          {context.sold > 0
            ? `${context.sold} of ${context.existing} shares are already booked or sold, so the register cannot be regenerated.`
            : `A register of ${context.existing} shares exists. Generating replaces it (none is sold yet).`}
        </p>
      )}
    </div>
  );
}

/** Price per share, with the land cost per share and the profit beside it (D2). */
function SharePricing({
  price,
  onPrice,
  count,
  context,
}: {
  price: string;
  onPrice: (v: string) => void;
  count: number;
  context: ShareContext | null;
}) {
  const p = Number(price) || 0;
  const costEach = context && count > 0 ? context.cost / count : 0;
  const profit = p - costEach;
  const pct = p > 0 ? Math.round((profit / p) * 1000) / 10 : null;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Price per share (BDT)" required>
        <TextInput value={price} onChange={(e) => onPrice(e.target.value)} inputMode="numeric" />
      </Field>
      <Field label="Land cost per share" hint="Land cost sheet ÷ number of shares">
        <TextInput value={costEach > 0 ? formatBdt(Math.round(costEach)) : 'No land cost recorded'} readOnly disabled />
      </Field>
      <Field label="Profit per share" hint={pct === null ? undefined : `${pct}% of the price`}>
        <TextInput
          value={costEach > 0 ? formatBdt(Math.round(profit)) : '—'}
          readOnly
          disabled
          className={profit < 0 ? 'text-red-600' : undefined}
        />
      </Field>
    </div>
  );
}

