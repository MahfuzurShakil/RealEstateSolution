'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from './Card';
import { cn } from '@/lib/utils/cn';
import type { ViewMode } from './ViewToggle';

/**
 * How a card lays itself out in list view.
 *
 * `stacked` is the default and the original look: identity and status on one
 * line, the badge row under it, the timestamp at the bottom. Cards keep a
 * comfortable height and read the same as they do in the grid.
 *
 * `row` puts everything on a single horizontal line — identity left, facts
 * across the middle, status and timestamp right. It suits a record whose
 * details are short, evenly sized labels (a customer's phone, email, NID) and
 * would otherwise leave the right-hand side of a wide row empty. Used
 * deliberately, not everywhere: applied to badge-heavy records it squashes
 * them into thin strips.
 */
export type ListLayout = 'stacked' | 'row';

export function ResultCard({
  href,
  view,
  listLayout = 'stacked',
  code,
  title,
  subtitle,
  leading,
  status,
  facts,
  footer,
  accent,
}: {
  href: string;
  view: ViewMode;
  listLayout?: ListLayout;
  /** small muted line above the title, usually the display code */
  code?: ReactNode;
  title: ReactNode;
  /** optional line under the title (profession, location…) */
  subtitle?: ReactNode;
  /** avatar or icon shown before the identity block */
  leading?: ReactNode;
  /** status badges, top-right in grid and far-right in list */
  status?: ReactNode;
  /** the pill-badge row (Design Reference A.7) */
  facts?: ReactNode;
  /** the muted line at the bottom — dates, counts */
  footer?: ReactNode;
  /** left border tint used to flag a row (overdue, for instance) */
  accent?: string;
}) {
  const identity = (
    <div className="flex min-w-0 items-start gap-3">
      {leading}
      <div className="min-w-0">
        {code && <p className="text-xs font-medium text-ink-muted">{code}</p>}
        <h3 className="truncate text-base font-semibold text-ink">{title}</h3>
        {subtitle && <div className="truncate text-xs text-ink-muted">{subtitle}</div>}
      </div>
    </div>
  );

  if (view === 'list' && listLayout === 'row') {
    return (
      <Link href={href} className="block">
        <Card className={cn('transition-shadow hover:shadow-md', accent)}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* identity — a fixed share of the row so every card lines up */}
            <div className="min-w-0 lg:w-64 lg:shrink-0">{identity}</div>

            {/* facts spread across the middle instead of stacking on the left */}
            {facts && (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{facts}</div>
            )}

            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              {status}
              {footer && <span className="text-xs text-ink-muted">{footer}</span>}
            </div>
          </div>
        </Card>
      </Link>
    );
  }

  const isGrid = view === 'grid';

  return (
    /*
     * No `h-full` on the link in grid view: it is the grid item, so
     * `align-items: stretch` already gives it the row height. Adding an
     * explicit percentage height here made it resolve against auto instead,
     * which is what left cards in the same row at different heights.
     */
    <Link href={href} className="block">
      <Card
        className={cn(
          'transition-shadow hover:shadow-md',
          // only the grid needs equal heights; a list card takes its own
          isGrid && 'flex h-full flex-col',
          accent,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          {identity}
          {status && <div className="flex shrink-0 flex-wrap justify-end gap-2">{status}</div>}
        </div>

        {facts && (
          <div className={cn('mt-3 flex flex-wrap gap-2', isGrid && 'flex-1 content-start')}>
            {facts}
          </div>
        )}

        {footer && (
          <p
            className={cn(
              'mt-3 text-xs text-ink-muted',
              // the divider earns its place only when the card is stretched
              isGrid && 'border-t border-hairline pt-3',
            )}
          >
            {footer}
          </p>
        )}
      </Card>
    </Link>
  );
}
