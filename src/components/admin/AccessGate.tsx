'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMockSession } from '@/lib/auth/mock-session';
import {
  MODULE_LABEL,
  USER_ROLE_META,
  canView,
  moduleForPath,
} from '@/lib/domain/access';

/**
 * Section 9.6, enforced at the route.
 *
 * Hiding a menu item is presentation, not access control: the URL still works
 * if it is typed in or arrives in a link somebody pasted. One check in the
 * shell covers every page — putting it on each page instead would mean
 * remembering it on every page added afterwards, which is exactly the kind of
 * thing that gets forgotten.
 *
 * Phase A is still a role *simulation* (Section 0 — no real auth), so this
 * stops a role from wandering into the wrong screen; it is not a security
 * boundary. Phase B moves the same matrix behind the API, where it becomes
 * one.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { role } = useMockSession();

  const moduleKey = moduleForPath(pathname);
  if (!moduleKey || canView(role, moduleKey)) return <>{children}</>;

  const meta = USER_ROLE_META[role];

  return (
    <EmptyState
      icon={ShieldAlert}
      title={`${MODULE_LABEL[moduleKey]} is not open to this role`}
      description={`${meta.label} — ${meta.description} Switch role from the topbar to see this screen, or ask a Super Admin for access.`}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone={meta.tone}>Acting as {meta.label}</Badge>
          <Link href="/admin">
            <Button variant="outline">Back to the dashboard</Button>
          </Link>
        </div>
      }
    />
  );
}
