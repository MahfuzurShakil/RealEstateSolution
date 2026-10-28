/*
 * Vitest runs in Node: fake-indexeddb stands in for the browser's IndexedDB,
 * and `window` is defined so `getDb()` (browser-only by design) opens it.
 */
import 'fake-indexeddb/auto';

if (typeof window === 'undefined') {
  (globalThis as { window?: unknown }).window = globalThis;
}
