'use client';

import { Download } from 'lucide-react';
import { Button } from './Button';
import { csvFilename, downloadCsv, toCsv, type CsvColumn } from '@/lib/utils/csv';
import { todayLocal } from '@/lib/utils/format';

/**
 * Export what is on screen (Tier 3.6).
 *
 * It exports the **filtered set**, not the visible page: the tables page at 12
 * or 25 rows, and an accountant who filtered to one project and pressed this
 * expects the project, not the first screenful of it. The label says so, so
 * nobody has to guess which of the two they got.
 */
export function ExportCsvButton<T>({
  rows,
  columns,
  filenamePrefix,
  label = 'Export CSV',
}: {
  rows: T[];
  columns: CsvColumn<T>[];
  filenamePrefix: string;
  label?: string;
}) {
  const count = rows.length;

  return (
    <Button
      variant="outline"
      disabled={count === 0}
      title={
        count === 0
          ? 'Nothing to export with these filters'
          : `Exports all ${count} row${count === 1 ? '' : 's'} matching the current filters, not just this page`
      }
      onClick={() => downloadCsv(csvFilename(filenamePrefix, todayLocal()), toCsv(rows, columns))}
    >
      <Download className="size-4" /> {label}
      {count > 0 ? <span className="text-ink-muted">({count})</span> : null}
    </Button>
  );
}
