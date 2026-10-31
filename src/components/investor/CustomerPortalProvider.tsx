'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildNotifications,
  viewPortfolio,
  type InvestorSnapshot,
  type PortalNotification,
  type PortfolioView,
} from '@/lib/domain/investor-portal';
import { CUSTOMER_PORTAL_CHANGED, investorRepository } from '@/lib/repositories/investor/investor.mock.repository';

interface CustomerPortal {
  snapshot: InvestorSnapshot;
  portfolio: PortfolioView;
  notifications: PortalNotification[];
  unread: number;
  signOut: () => void;
}

const Ctx = createContext<CustomerPortal | null>(null);

/** The signed-in customer's data for every portal page; `null` only before it loads. */
export function useCustomerPortal(): CustomerPortal {
  const value = useContext(Ctx);
  if (!value) throw new Error('useCustomerPortal is used outside the Customer Portal');
  return value;
}

/**
 * Guards the portal (no session → sign-in page) and keeps one snapshot of the
 * customer's data, reloaded whenever the repository reports a change.
 */
export function CustomerPortalProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<InvestorSnapshot | null>(null);

  const reload = useCallback(() => {
    investorRepository.snapshot().then(setSnapshot);
  }, []);

  useEffect(() => {
    if (!investorRepository.session()) {
      router.replace(`/investor/login?next=${encodeURIComponent(pathname ?? '/investor')}`);
      return;
    }
    reload();
    window.addEventListener(CUSTOMER_PORTAL_CHANGED, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(CUSTOMER_PORTAL_CHANGED, reload);
      window.removeEventListener('storage', reload);
    };
    // the guard runs once per mount; page changes inside the portal keep the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<CustomerPortal | null>(() => {
    if (!snapshot) return null;
    const portfolio = viewPortfolio(snapshot);
    const notifications = buildNotifications(snapshot, portfolio);
    const read = new Set(snapshot.read_notification_ids);
    return {
      snapshot,
      portfolio,
      notifications,
      unread: notifications.filter((n) => !read.has(n.id)).length,
      signOut: () => {
        investorRepository.signOut();
        router.replace('/investor/login?signed_out=1');
      },
    };
  }, [snapshot, router]);

  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
