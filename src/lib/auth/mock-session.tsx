'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { userRepository } from '@/lib/repositories';

/**
 * Phase A has no real auth (Section 0). Role is simulated with a dropdown so
 * role-dependent UI can be demonstrated; Phase B replaces this with RBAC.
 */
export const ROLES = [
  'super_admin',
  'management',
  'land_team',
  'project_manager',
  'sales_executive',
  'sales_manager',
  'head_of_sales',
  'site_manager',
  'procurement',
  'accounts',
] as const;
export type Role = (typeof ROLES)[number];

interface MockSession {
  role: Role;
  setRole: (role: Role) => void;
  userName: string;
  userId: string;
}

const SessionContext = createContext<MockSession | null>(null);

const ROLE_STORAGE_KEY = 'admin.mock-role';
const DEFAULT_ROLE: Role = 'super_admin';
/** same-tab notification; the native `storage` event only fires in OTHER tabs */
const ROLE_EVENT = 'admin-mock-role-change';

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/*
 * The chosen role is kept in `localStorage` rather than component state,
 * because it has to survive a reload. It did not: switching to Accounts and
 * refreshing put you back as Super Admin, looking at screens that role cannot
 * open, while the topbar and the route guard both believed you.
 *
 * Read through `useSyncExternalStore` rather than an effect. `localStorage`
 * does not exist while the server renders, so seeding `useState` from it gives
 * a hydration mismatch, and reading it in an effect is a cascading render the
 * lint rule rightly objects to. This is what the hook is for: the server
 * snapshot is the default role, the client snapshot is whatever was stored.
 */
function readStoredRole(): Role {
  try {
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
    return isRole(stored) ? stored : DEFAULT_ROLE;
  } catch {
    // private mode, or site data blocked — the dropdown still works per-session
    return DEFAULT_ROLE;
  }
}

function subscribeToRole(onChange: () => void): () => void {
  window.addEventListener(ROLE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(ROLE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function MockSessionProvider({ children }: { children: ReactNode }) {
  const role = useSyncExternalStore(subscribeToRole, readStoredRole, () => DEFAULT_ROLE);

  const setRole = useCallback((next: Role) => {
    try {
      window.localStorage.setItem(ROLE_STORAGE_KEY, next);
    } catch {
      // failing to remember is not worth breaking the page over
    }
    window.dispatchEvent(new Event(ROLE_EVENT));
  }, []);

  /*
   * Resolve the simulated role to a real `users` row where one exists, so
   * anything that records who did something ("Approved by", `created_by`)
   * points at an actual person instead of a placeholder id. Falls back to the
   * placeholder on a database with no staff seeded.
   */
  const actingUser = useLiveQuery(
    async () => (await userRepository.listByRole([role]))[0],
    [role],
  );

  const value = useMemo(
    () => ({
      role,
      setRole,
      userName: actingUser?.name ?? 'Demo User',
      userId: actingUser?.id ?? 'mock-user',
    }),
    [role, setRole, actingUser],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useMockSession(): MockSession {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useMockSession must be used inside MockSessionProvider');
  return ctx;
}
