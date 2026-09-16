'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The land Timeline's list shape (L7, LAND-L7-PLAN.md).
 *
 * Wherever a sub-tab holds several records — visits, study versions, offer
 * rounds, development activities — they sit on one vertical line, newest
 * first, each showing its date and the one line worth seeing. Clicking an item
 * opens its full details and the actions that belong to it.
 */
export function TimelineList({ children }: { children: ReactNode }) {
  return (
    <ol className="relative space-y-3 pl-9">
      <span className="absolute bottom-4 left-[13px] top-4 w-px bg-hairline" aria-hidden />
      {children}
    </ol>
  );
}

export function TimelineItem({
  marker,
  markerClassName,
  date,
  title,
  meta,
  aside,
  muted,
  defaultOpen = false,
  children,
}: {
  /** icon or short text inside the dot */
  marker: ReactNode;
  markerClassName?: string;
  date: string;
  title: ReactNode;
  /** one line under the title */
  meta?: ReactNode;
  /** right side of the header — an amount, a badge */
  aside?: ReactNode;
  /** superseded / cancelled records */
  muted?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-9 top-3 grid size-7 place-items-center rounded-full text-[11px] font-semibold ring-4 ring-white',
          markerClassName ?? 'bg-admin-100 text-admin-700',
        )}
      >
        {marker}
      </span>
      <div
        className={cn(
          'rounded-xl border bg-white transition-colors',
          open ? 'border-admin-200' : 'border-hairline',
          muted && !open && 'opacity-75',
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-3 px-4 py-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">{title}</div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {date}
              {meta && <> · {meta}</>}
            </p>
          </div>
          {aside && <div className="shrink-0 text-right">{aside}</div>}
          <ChevronDown
            className={cn('mt-0.5 size-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')}
          />
        </button>
        {open && <div className="border-t border-hairline px-4 py-3">{children}</div>}
      </div>
    </li>
  );
}

/** A rule that keeps an action closed, stated where the action would be. */
export function LockedNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
      {children}
    </p>
  );
}
