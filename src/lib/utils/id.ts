/** UUID + display-code helpers (Section 0 — ID convention). */

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

const HWM_KEY = 'code-hwm:';

/** The highest number ever issued for a prefix-year, in this browser. */
function readMark(head: string): number {
  try {
    return Number(globalThis.localStorage?.getItem(HWM_KEY + head)) || 0;
  } catch {
    return 0;
  }
}

function writeMark(head: string, value: number): void {
  try {
    globalThis.localStorage?.setItem(HWM_KEY + head, String(value));
  } catch {
    // private window or blocked storage: codes still follow the table
  }
}

/**
 * Builds the next sequential display code for a year, e.g. LND-2026-001.
 * `existing` is the list of codes already used by that table.
 *
 * QA audit 2026-10-11 (X-02): the next number is one past the highest ever
 * issued, not only the highest still on file, so deleting the newest record
 * does not hand its code to a different one — an LND-2026-021 on an old
 * printout keeps meaning one plot. Phase A keeps the mark in the browser;
 * Phase B replaces it with a database sequence. Gaps are expected, as with
 * any sequence. The demo reset clears the marks (`resetCodeMarks`).
 */
export function nextCode(prefix: string, existing: string[], year = new Date().getFullYear()): string {
  const head = `${prefix}-${year}-`;
  const onFile = existing
    .filter((c) => c.startsWith(head))
    .reduce((acc, c) => Math.max(acc, Number.parseInt(c.slice(head.length), 10) || 0), 0);
  const next = Math.max(onFile, readMark(head)) + 1;
  writeMark(head, next);
  return `${head}${String(next).padStart(3, '0')}`;
}

/** Forget every issued-code mark — only when all records are wiped (demo reset). */
export function resetCodeMarks(): void {
  try {
    const store = globalThis.localStorage;
    if (!store) return;
    for (const key of Object.keys(store)) if (key.startsWith(HWM_KEY)) store.removeItem(key);
  } catch {
    // nothing to clear
  }
}
