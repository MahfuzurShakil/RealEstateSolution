'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();

  /**
   * A printed document (Tier 3.6) is a page in its own right, not a screen with
   * the chrome hidden. Rendering the sidebar and topbar and then suppressing
   * them in `@media print` would leave the shell's layout — its flex column,
   * its padding, its canvas background — shaping the sheet. So the shell steps
   * aside entirely for `/print` routes, while `MockSessionProvider` and
   * `AccessGate` stay: a document must still obey Section 9.6, and a URL
   * pasted to the wrong role must not render a customer's money.
   */
  if (pathname?.endsWith('/print')) {
    return (
      <MockSessionProvider>
        <div className="min-h-screen bg-canvas py-6 print:bg-white print:py-0">
          <AccessGate>{children}</AccessGate>
        </div>
      </MockSessionProvider>
    );
  }

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
