/**
 * CSV export (Tier 3.6).
 *
 * `toCsv` is pure and testable; `downloadCsv` is the only browser-touching
 * part and is called from a click handler, never during render.
 */

export interface CsvColumn<T> {
  header: string;
  /** Return a raw value — quoting and escaping happen here, not at the call site. */
  value: (row: T) => string | number | null | undefined;
}

/**
 * A cell is quoted whenever it could otherwise change the shape of the file.
 *
 * The leading-quote guard on `=`, `+`, `-` and `@` is not cosmetic: Excel
 * treats a cell starting with those as a formula, so a reference number like
 * `-2026/11` becomes a calculation and a supplier's name can become an error
 * code. Prefixing a single quote keeps the text as text.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(c.value(row))).join(','));
  // CRLF, because that is what Excel on Windows expects from a .csv
  return [header, ...body].join('\r\n');
}

/**
 * Hands the browser a file. The UTF-8 BOM matters — without it Excel opens the
 * file in the system code page and every Bangla name in the demo data turns
 * into mojibake.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** `collections-2026-09-04.csv` — the date the export was taken, not today's data. */
export function csvFilename(prefix: string, isoDate: string): string {
  return `${prefix}-${isoDate}.csv`;
}
