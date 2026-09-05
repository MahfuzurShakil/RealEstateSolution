'use client';

import { Search, X } from 'lucide-react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Button } from './Button';
import { SelectInput, TextInput } from './Field';
import { cn } from '@/lib/utils/cn';

/**
 * The filter row above a list (Design Reference A.7).
 *
 * Every list page grew its own: some had a labelled grid, some a bare flex row,
 * some no search at all, and only one had a way to clear what you had set. This
 * is the one shape they all use now — search on the left, filters beside it,
 * a Reset that appears only when something is active, and the result count on
 * the right.
 *
 * Filters are **content-width**, not full-width. A select stretched across a
 * row tells you nothing about how much you can choose and makes a four-filter
 * bar look like a form. (They stretched because `cn` used to concatenate
 * rather than merge Tailwind classes, so every `w-auto` was dead — see
 * `lib/utils/cn.ts`.)
 */
export function FilterBar({
  search,
  onReset,
  isFiltered,
  resultLabel,
  children,
  className,
}: {
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  /** Clears every filter. The button only renders when `isFiltered`. */
  onReset?: () => void;
  isFiltered?: boolean;
  /** e.g. "12 of 102 costs" — sits at the end of the row. */
  resultLabel?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end gap-3', className)}>
      {search && (
        <label className="block min-w-0 flex-1 sm:max-w-xs">
          <span className="mb-1.5 block text-xs font-medium text-ink-muted">Search</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? 'Search…'}
              className="pr-9"
            />
          </span>
        </label>
      )}

      {children}

      {/*
        Only when there is something to clear. A permanently visible Reset on an
        unfiltered list is a button that does nothing, and it trains people to
        ignore it.
      */}
      {onReset && isFiltered && (
        <Button variant="outline" onClick={onReset} className="shrink-0">
          <X className="size-4" /> Reset
        </Button>
      )}

      {resultLabel && (
        <p className="ml-auto self-end pb-2.5 text-sm text-ink-muted">{resultLabel}</p>
      )}
    </div>
  );
}

/**
 * A labelled slot for a filter control that is not a dropdown — a date box, a
 * pair of them, a checkbox. Keeps the label styling identical to
 * `FilterSelect` so a mixed row still reads as one row.
 */
export function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('shrink-0', className)}>
      <span className="mb-1.5 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * One labelled dropdown in a `FilterBar`.
 *
 * Labelled because an unlabelled "All projects" is only readable while it still
 * says "All" — once somebody picks one, a bare select reading "Nokshi Green
 * Residence" gives no clue which field it is filtering.
 */
export function FilterSelect({
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block shrink-0">
      <span className="mb-1.5 block text-xs font-medium text-ink-muted">{label}</span>
      <SelectInput className={cn('w-auto max-w-[16rem]', className)} {...props}>
        {children}
      </SelectInput>
    </label>
  );
}
