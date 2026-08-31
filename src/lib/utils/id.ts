/** UUID + display-code helpers (Section 0 — ID convention). */

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Builds the next sequential display code for a year, e.g. LND-2026-001.
 * `existing` is the list of codes already used by that table.
 */
export function nextCode(prefix: string, existing: string[], year = new Date().getFullYear()): string {
  const head = `${prefix}-${year}-`;
  const max = existing
    .filter((c) => c.startsWith(head))
    .reduce((acc, c) => Math.max(acc, Number.parseInt(c.slice(head.length), 10) || 0), 0);
  return `${head}${String(max + 1).padStart(3, '0')}`;
}
