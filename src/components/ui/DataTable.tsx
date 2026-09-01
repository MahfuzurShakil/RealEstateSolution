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
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  initialSort,
  onRowClick,
  emptyState,
  rowKey = (row) => row.id,
  label = 'rows',
}: {
  rows: T[];
  columns: Column<T>[];
  initialSort?: { key: string; direction?: Direction };
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  rowKey?: (row: T) => string;
  label?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null);
  const [direction, setDirection] = useState<Direction>(initialSort?.direction ?? 'asc');

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

  // same paging control the card lists use, so both feel identical
  const paged = usePagination(sorted, 5);

  function toggleSort(column: Column<T>) {
    if (!column.sortValue) return;
    if (sortKey === column.key) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column.key);
      setDirection('asc');
    }
    paged.setPage(0);
  }

  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
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
