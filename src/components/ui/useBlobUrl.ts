'use client';

import { useEffect, useState } from 'react';

/**
 * Reads a stored blob into a data URL for display.
 *
 * A data URL rather than `URL.createObjectURL`: React double-invokes effects in
 * development and revokes the object URL between the two runs, which leaves a
 * broken image. Phase A keeps uploaded files as Blobs in IndexedDB (Section
 * 1.1), so every preview in the app goes through this.
 */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // nothing to read; state already starts at null, and callers key the
    // component by document id so the blob never swaps under a mounted preview
    if (!blob) return;

    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled) setUrl(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(blob);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [blob]);

  return url;
}
