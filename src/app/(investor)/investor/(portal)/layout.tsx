'use client';

import { CustomerPortalProvider } from '@/components/investor/CustomerPortalProvider';
import { PortalShell } from '@/components/investor/PortalShell';
import { PortalSkeleton } from '@/components/investor/ui';

/** Every signed-in page: session guard, the customer's data, and the portal shell. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <CustomerPortalProvider fallback={<PortalSkeleton />}>
      <PortalShell>{children}</PortalShell>
    </CustomerPortalProvider>
  );
}
