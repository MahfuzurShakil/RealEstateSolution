'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

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

export function MockSessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('super_admin');
  const value = useMemo(
    () => ({ role, setRole, userName: 'Demo User', userId: 'mock-user' }),
    [role],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useMockSession(): MockSession {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useMockSession must be used inside MockSessionProvider');
  return ctx;
}
