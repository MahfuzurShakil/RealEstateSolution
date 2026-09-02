'use client';

import { useState, type ReactNode } from 'react';
import { MockSessionProvider } from '@/lib/auth/mock-session';
import { useDatabaseStatus } from '@/lib/db/DatabaseProvider';
import { AccessGate } from './AccessGate';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';

/** Sidebar + topbar frame shared by every /admin page. */
export function AdminShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { status, error } = useDatabaseStatus();

  return (
    <MockSessionProvider>
      <div className="flex min-h-screen bg-canvas">
        <AdminSidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar
            onToggleSidebar={() => setCollapsed((c) => !c)}
            onOpenMenu={() => setMobileOpen(true)}
          />
          <main className="min-w-0 flex-1 p-4 lg:p-6">
            {status === 'error' ? (
              <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Could not open the local database: {error}
              </p>
            ) : (
              // Section 9.6 — the role check sits here so every page inherits it
              <AccessGate>{children}</AccessGate>
            )}
          </main>
        </div>
      </div>
    </MockSessionProvider>
  );
}
