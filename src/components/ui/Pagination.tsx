'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { SelectInput } from './Field';
import { cn } from '@/lib/utils/cn';

/**
 * Paging for card lists as well as tables.
 *
 * Admin lists get filtered first and then acted on — somebody opens a record,
 * comes back, and expects to be where they were. Infinite scroll loses that,
 * and hides the total; numbered paging keeps both, which is why every
 * inventory-style admin UI (and Airbnb, Zillow, Amazon on their card grids)
 * uses it rather than an endless feed.
 *
 * The default is 12 because these are card grids: 12 fills a three-across grid
 * exactly and shows a whole screen's worth. It used to be 6, which turned an
 * 11-row list of lands into two pages for no reason. Worklist tables default
 * to 25 — see `DataTable`.
 */
export function usePagination<T>(rows: T[], defaultPageSize = 12) {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  /*
   * Going from 200 results to 3 should land on the first page, not page 9.
   * Adjusted during render rather than in an effect — React's own pattern for
   * "state derived from changing input", and it avoids a wasted second render.
   */
  const resetKey = `${rows.length}|${pageSize}`;
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPage(0);
  }

  // still clamp, for the render that happens before the reset settles
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const pageRows = useMemo(
    () => rows.slice(start, start + pageSize),
    [rows, start, pageSize],
  );

  return {
    pageRows,
    page: currentPage,
    pageCount,
    pageSize,
    setPage,
    setPageSize,
    total: rows.length,
    from: rows.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, rows.length),
  };
}

/** Page numbers with ellipses, so 40 pages do not become 40 buttons. */
function pageNumbers(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i);

  const pages = new Set<number>([0, pageCount - 1, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 0 && p < pageCount).sort((a, b) => a - b);

  const out: Array<number | 'gap'> = [];
  let previous = -1;
  for (const p of sorted) {
    if (previous >= 0 && p - previous > 1) out.push('gap');
    out.push(p);
    previous = p;
  }
  return out;
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  from,
  to,
  onPageChange,
  onPageSizeChange,
  pageSizes = [6, 12, 24, 48, 96],
  label = 'results',
  /** tables keep the bar even on one page; card grids hide it as noise */
  alwaysVisible = false,
  className,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizes?: number[];
  label?: string;
  alwaysVisible?: boolean;
  className?: string;
}) {
  /*
   * Nothing to page through. Compared against the page size in force rather
   * than the smallest offered size: with a default of 12, `Math.min` (6) left
   * a paging bar sitting under an eight-card list that had no second page.
   */
  if (!alwaysVisible && total <= pageSize) return null;

  // "1 refund", not "1 refunds" — every label passed in is a regular plural
  const noun = total === 1 && label.endsWith('s') ? label.slice(0, -1) : label;

  return (
    <div className={cn('mt-5 flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-xs text-ink-muted">
        Showing {from}–{to} of {total} {noun}
      </p>

      {/*
        wraps as well as the outer row: on a 375px screen "Per page [6]" plus
        five numbered buttons is ~20px wider than the viewport, and an
        unwrapped inner row pushed the whole page sideways
      */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* keep the label beside its dropdown; the row as a whole wraps if space runs out */}
        <label className="flex items-center gap-2 whitespace-nowrap text-xs text-ink-muted">
          Per page
          <SelectInput
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 w-auto py-1 text-xs"
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </SelectInput>
        </label>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>

          {pageNumbers(page, pageCount).map((entry, index) =>
            entry === 'gap' ? (
              <span key={`gap-${index}`} className="px-1 text-xs text-slate-400">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === page ? 'page' : undefined}
                className={cn(
                  'h-9 min-w-9 rounded-xl px-2 text-sm font-medium transition-colors',
                  entry === page
                    ? 'bg-admin-500 text-white'
                    : 'border border-hairline bg-white text-ink hover:bg-admin-50',
                )}
              >
                {entry + 1}
              </button>
            ),
          )}

          <Button
            variant="outline"
            size="sm"
            aria-label="Next page"
            disabled={page >= pageCount - 1}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
