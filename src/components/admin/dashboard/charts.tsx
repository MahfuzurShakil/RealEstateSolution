'use client';

import { useState } from 'react';
import type { MonthFlow } from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/*
 * Small hand-built charts for the dashboard. No chart library: four shapes
 * are not worth a dependency, and plain HTML/SVG keeps them on the admin
 * palette. Money is always shown in full in tooltips and labels; only the
 * cash chart's axis ticks are shortened (lakh / crore), because a tick is a
 * gridline's name, not a figure anybody adds up.
 */

/** Axis ticks only — see the note above. */
function tickLabel(value: number): string {
  if (value === 0) return '0';
  if (value >= 10_000_000) return `${+(value / 10_000_000).toFixed(1)} Cr`;
  if (value >= 100_000) return `${+(value / 100_000).toFixed(1)} L`;
  if (value >= 1_000) return `${+(value / 1_000).toFixed(0)}K`;
  return String(Math.round(value));
}

/** A round ceiling with 4 even steps: 11.4 Cr → 12 Cr (ticks of 3 Cr). */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const raw = value / 4;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * exp >= raw) ?? 10;
  return step * exp * 4;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => MONTH[Number(ym.slice(5, 7)) - 1] ?? ym;

/** A progress ring for a share-of-target KPI (Design Reference A.4, pattern 2). */
export function Ring({
  pct,
  size = 64,
  tone = 'teal',
  label,
}: {
  pct: number | null;
  size?: number;
  tone?: 'teal' | 'amber' | 'red';
  label?: string;
}) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const shown = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  const stroke = tone === 'red' ? '#dc2626' : tone === 'amber' ? '#f5a623' : '#0d919c';
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8eef0" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${(shown / 100) * c} ${c}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <span className="absolute text-xs font-semibold text-ink">
        {label ?? (pct === null ? '—' : `${Math.round(pct)}%`)}
      </span>
    </div>
  );
}

/**
 * Money in vs money out per month: paired columns on one axis (same unit, so
 * one scale is honest), legend above, full figures on hover.
 */
export function CashFlowChart({ data }: { data: MonthFlow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.money_in, d.money_out)), 0));
  const ticks = [4, 3, 2, 1, 0].map((i) => (max / 4) * i);
  const empty = data.every((d) => d.money_in === 0 && d.money_out === 0);
  const active = hover === null ? null : data[hover];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-admin-500" /> Money in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent-coral" /> Money out
        </span>
        <span className="ml-auto min-h-4 text-ink">
          {active ? (
            <>
              <span className="font-medium">{monthLabel(active.month)} {active.month.slice(0, 4)}</span>
              {' · '}in {formatBdt(active.money_in)} · out {formatBdt(active.money_out)} · net{' '}
              <span className="font-medium">{formatBdt(active.money_in - active.money_out)}</span>
            </>
          ) : (
            <span className="text-ink-muted">Hover a month for the figures</span>
          )}
        </span>
      </div>

      <div className="relative flex h-56">
        {/* y-axis */}
        <div className="flex w-10 shrink-0 flex-col justify-between pb-6 pr-2 text-right text-[10px] text-ink-muted">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none">
              {tickLabel(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {/* gridlines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className="h-px bg-slate-100" />
            ))}
          </div>
          {empty && (
            <p className="absolute inset-0 grid place-items-center pb-6 text-sm text-ink-muted">
              No money has moved in the last twelve months.
            </p>
          )}
          <div className="absolute inset-0 flex">
            {data.map((d, i) => (
              <div
                key={d.month}
                className="flex flex-1 flex-col"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={cn(
                    'flex flex-1 items-end justify-center gap-[2px] rounded-t-md transition-colors',
                    hover === i && 'bg-admin-50/70',
                  )}
                >
                  <div
                    className="w-[38%] max-w-3 rounded-t bg-admin-500 transition-[height] duration-500"
                    style={{ height: `${(d.money_in / max) * 100}%` }}
                  />
                  <div
                    className="w-[38%] max-w-3 rounded-t bg-accent-coral transition-[height] duration-500"
                    style={{ height: `${(d.money_out / max) * 100}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'h-6 pt-1.5 text-center text-[10px]',
                    hover === i ? 'font-medium text-ink' : 'text-ink-muted',
                  )}
                >
                  {monthLabel(d.month)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Share of a whole: the units by where they are in the sale. */
export function Donut({
  slices,
  centerValue,
  centerLabel,
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const size = 128;
  const r = 50;
  const c = 2 * Math.PI * r;
  // a 2px surface gap between segments, in arc length
  const gap = total > 0 && slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  const focus = slices.find((s) => s.key === hover);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f3" strokeWidth={18} />
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * c;
              const dash = Math.max(0, len - gap);
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover === s.key ? 22 : 18}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                />
              );
              offset += len;
              return s.value > 0 ? el : null;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-xl font-semibold text-ink">{focus ? focus.value : centerValue}</p>
            <p className="text-[11px] text-ink-muted">{focus ? focus.label : centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="min-w-[11rem] flex-1 space-y-1.5 text-sm">
        {slices.map((s) => (
          <li
            key={s.key}
            className={cn(
              'flex items-center gap-2 rounded-md px-1.5 py-0.5',
              hover === s.key && 'bg-slate-50',
            )}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 whitespace-nowrap text-ink-muted">{s.label}</span>
            <span className="font-medium text-ink">{s.value}</span>
            <span className="w-10 text-right text-xs text-ink-muted">
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars, value at the tip — for "which is biggest" lists. */
export function BarList({
  rows,
  format = (v) => String(v),
  barClass = 'bg-admin-500',
}: {
  rows: { key: string; label: string; value: number; muted?: boolean }[];
  format?: (v: number) => string;
  barClass?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${format(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink-muted">{r.label}</span>
            <span className="shrink-0 font-medium text-ink">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full transition-[width] duration-500', r.muted ? 'bg-slate-300' : barClass)}
              style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
