'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getDb } from './database';
import { seedIfEmpty } from './seed';

type DbStatus = 'loading' | 'ready' | 'error';

const DatabaseContext = createContext<{ status: DbStatus; error?: string }>({ status: 'loading' });

/**
 * Opens the shared IndexedDB once per browser session and seeds master data.
 * Wraps both the Admin and the Public tree, so both portals talk to the same DB.
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: DbStatus; error?: string }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getDb().open();
        await seedIfEmpty();
        if (!cancelled) setState({ status: 'ready' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', error: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <DatabaseContext.Provider value={state}>{children}</DatabaseContext.Provider>;
}

export function useDatabaseStatus() {
  return useContext(DatabaseContext);
}
