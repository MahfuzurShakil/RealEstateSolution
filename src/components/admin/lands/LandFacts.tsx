import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/*
 * The land Overview's information card (2026-10-21): facts grouped and laid
 * three across, label over value, instead of sixteen label-left / value-right
 * rows with most of the card empty.
 */

/** A titled block of facts, three across on a wide screen. */
export function FactGroup({ title, last, children }: { title: string; last?: boolean; children: ReactNode }) {
  return (
    <section className={cn('py-4', !last && 'border-b border-hairline', 'first-of-type:pt-1')}>
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h4>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

/** Label over value — reads in a grid, unlike a label-left / value-right row. */
export function Fact({ label, value }: { label: string; value: ReactNode }) {
  const empty = value == null || value === '';
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-sm font-medium', empty ? 'text-slate-300' : 'text-ink')}>
        {empty ? '—' : value}
      </dd>
    </div>
  );
}

