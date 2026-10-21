'use client';

import type { Partner } from '@/lib/db/types';
import type { ShareSlice } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';

/*
 * One colour per partner, the same on every bar on every page, so "the blue
 * one is Karim" holds across the screen. Assigned by partner code (stable),
 * never by rank in a bar. Validated categorical palette (dataviz skill);
 * after eight the colours repeat, which a small developer's partner list
 * does not reach.
 */
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

export function partnerColors(partners: Pick<Partner, 'id' | 'code'>[]): Map<string, string> {
  const ordered = [...partners].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  return new Map(ordered.map((p, i) => [p.id, PALETTE[i % PALETTE.length]]));
}

/**
 * Who owns a project, as one bar: the project's own investors first, then
 * the company's partners sharing what is left. Labels sit under the bar so
 * nothing depends on colour alone.
 */
export function ShareBar({
  slices,
  colors,
  size = 'md',
  showLegend = true,
}: {
  slices: ShareSlice[];
  colors: Map<string, string>;
  size?: 'sm' | 'md';
  showLegend?: boolean;
}) {
  const investors = slices.filter((s) => s.kind === 'investor');
  const companyPct = slices.filter((s) => s.kind === 'company').reduce((t, s) => t + s.share_pct, 0);

  if (slices.length === 0) return <p className="text-xs text-ink-muted">No partners set up yet.</p>;

  return (
    <div>
      <div className={cn('flex w-full gap-[2px] overflow-hidden rounded-full bg-slate-100', size === 'sm' ? 'h-2' : 'h-3')}>
        {slices
          .filter((s) => s.share_pct > 0)
          .map((s) => (
            <div
              key={s.partner_id}
              title={`${s.name}: ${s.share_pct}%`}
              style={{ width: `${s.share_pct}%`, background: colors.get(s.partner_id) ?? '#94a3b8' }}
            />
          ))}
      </div>
      {showLegend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {slices.map((s) => (
            <li key={s.partner_id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: colors.get(s.partner_id) ?? '#94a3b8' }} />
              <span className="text-ink">{s.name}</span>
              <span className="font-medium text-ink">{s.share_pct}%</span>
              {s.kind === 'investor' && <span className="text-ink-muted">(this project only)</span>}
            </li>
          ))}
        </ul>
      )}
      {showLegend && investors.length > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-muted">
          {investors.map((i) => `${i.name} takes ${i.share_pct}%`).join(', ')} first; the company&apos;s partners share
          the other {Math.round(companyPct * 100) / 100}% in their company ratio.
        </p>
      )}
    </div>
  );
}
