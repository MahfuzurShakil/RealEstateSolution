'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Pagination, usePagination } from './Pagination';
import { cn } from '@/lib/utils/cn';

export interface Column<T> {
  key: string;
  header: string;
  /** what to render in the cell */
  cell: (row: T) => ReactNode;
  /** value used for sorting; omit to make the column unsortable */
  sortValue?: (row: T) => string | number;
  /** right-align numeric columns */
  align?: 'left' | 'right';
  className?: string;
}

type Direction = 'asc' | 'desc';

/**
 * Sortable, paginated table (Design Reference A.7 / the UrbanHub datatable
 * pattern): zebra rows, a sticky header, click-to-sort columns and a rows-per-
 * page control.
 *
 * Lists that grow without limit — landowners, users, suppliers, payments —
 * should use this rather than dumping every row on the page.
 *
 * Pass `mobileCard` and the same rows render as a card stack below `md`,
 * sharing this component's sorting and paging. A phone cannot use a nine-
 * column table: collections was 889 px of table inside a 299 px window, three
 * swipes from the customer's name to what they owe. Omit it and the table
 * keeps its horizontal scroll box, which is right for reference tables nobody
 * works from on a phone.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  initialSort,
  onRowClick,
  emptyState,
  rowKey = (row) => row.id,
  label = 'rows',
  mobileCard,
  sort,
  onSortChange,
}: {
  rows: T[];
  columns: Column<T>[];
  initialSort?: { key: string; direction?: Direction };
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  rowKey?: (row: T) => string;
  label?: string;
  /** below `md`, render this instead of a table row */
  mobileCard?: (row: T) => ReactNode;
  /*
   * Sorting is this component's own state unless the caller wants to drive it.
   * Passing `sort` + `onSortChange` lets a page put a sort dropdown beside its
   * filters — the card layout has no column headers to click — without a
   * second, competing sort order.
   */
  sort?: { key: string; direction: Direction };
  onSortChange?: (sort: { key: string; direction: Direction }) => void;
}) {
  const [ownSortKey, setOwnSortKey] = useState<string | null>(initialSort?.key ?? null);
  const [ownDirection, setOwnDirection] = useState<Direction>(initialSort?.direction ?? 'asc');

  const controlled = sort !== undefined;
  const sortKey = controlled ? sort.key : ownSortKey;
  const direction = controlled ? sort.direction : ownDirection;

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return rows;
    const factor = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor;
    });
  }, [rows, columns, sortKey, direction]);

  /*
   * Same paging control the card lists use, so both feel identical — but a
   * worklist default of 25, not the grid's 12. Five rows across 102 collection
   * instalments was 21 pages, and the first page was five rows belonging to
   * one customer.
   */
  const paged = usePagination(sorted, 25);

  function toggleSort(column: Column<T>) {
    if (!column.sortValue) return;
    const next =
      sortKey === column.key
        ? { key: column.key, direction: (direction === 'asc' ? 'desc' : 'asc') as Direction }
        : { key: column.key, direction: 'asc' as Direction };

    if (controlled) {
      onSortChange?.(next);
    } else {
      setOwnSortKey(next.key);
      setOwnDirection(next.direction);
    }
    paged.setPage(0);
  }

  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div>
      {mobileCard && (
        <ul className="space-y-3 md:hidden">
          {paged.pageRows.map((row) => (
            <li key={rowKey(row)}>
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  className="w-full rounded-2xl border border-hairline bg-white p-4 text-left shadow-sm transition-colors hover:bg-admin-50/70"
                >
                  {mobileCard(row)}
                </button>
              ) : (
                <div className="rounded-2xl border border-hairline bg-white p-4 shadow-sm">
                  {mobileCard(row)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        className={cn(
          'overflow-x-auto rounded-2xl border border-hairline bg-white',
          mobileCard && 'hidden md:block',
        )}
      >
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-canvas/80 backdrop-blur">
            <tr>
              {columns.map((column) => {
                const active = sortKey === column.key;
                const Icon = !column.sortValue
                  ? null
                  : active
                    ? direction === 'asc'
                      ? ArrowUp
                      : ArrowDown
                    : ChevronsUpDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      'border-b border-hairline px-4 py-3 text-xs font-semibold uppercase tracking-wide',
                      active ? 'text-admin-700' : 'text-ink-muted',
                      column.align === 'right' && 'text-right',
                      column.className,
                    )}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        aria-label={`Sort by ${column.header}`}
                        className={cn(
                          'inline-flex items-center gap-1.5 transition-colors hover:text-admin-700',
                          column.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {column.header}
                        {Icon && <Icon className={cn('size-3.5', !active && 'text-slate-400')} />}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.pageRows.map((row, index) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-hairline last:border-0 transition-colors',
                  index % 2 === 1 && 'bg-canvas/40',
                  onRowClick && 'cursor-pointer hover:bg-admin-50/70',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 align-middle text-ink',
                      column.align === 'right' && 'text-right',
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={paged.pageSize}
        total={paged.total}
        from={paged.from}
        to={paged.to}
        onPageChange={paged.setPage}
        onPageSizeChange={paged.setPageSize}
        pageSizes={[5, 10, 25, 50, 100]}
        label={label}
        alwaysVisible
        className="mt-3"
      />
    </div>
  );
}
