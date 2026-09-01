'use client';

import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type ViewMode = 'list' | 'grid';

/**
 * List/grid switch used by every list page, so the control sits in the same
 * place and behaves the same way everywhere (Design Reference A.7).
 */
export function ViewToggle({
  value,
  onChange,
  className,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex rounded-xl border border-hairline bg-white p-1', className)}>
      {(['list', 'grid'] as const).map((mode) => {
        const Icon = mode === 'list' ? List : LayoutGrid;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-label={`${mode} view`}
            aria-pressed={value === mode}
            className={cn(
              'grid size-8 place-items-center rounded-lg transition-colors',
              value === mode ? 'bg-admin-500 text-white' : 'text-ink-muted hover:bg-admin-50',
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Wrapper for the results of a list page.
 *
 * `min-w-0` on every grid item matters: a CSS grid item defaults to
 * `min-width: auto`, so one long badge (a full address, say) stretches the
 * track wider than the screen and the whole page scrolls sideways on a phone.
 * List mode is normal block flow and never had the problem — which is why the
 * two views used to disagree on mobile.
 */
export function ResultsLayout({
  view,
  className,
  children,
}: {
  view: ViewMode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        view === 'grid'
          ? 'grid gap-4 sm:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0'
          : 'space-y-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
