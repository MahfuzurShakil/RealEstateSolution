'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  buildNotifications,
  viewPortfolio,
  type InvestorSnapshot,
  type PortalNotification,
  type PortfolioView,
} from '@/lib/domain/investor-portal';
import { CUSTOMER_PORTAL_CHANGED, investorRepository } from '@/lib/repositories/investor/investor.repository';

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
 * customer's data. It is a live query over the platform database, so a
 * payment the office records or a request it answers shows up here at once,
 * even from another tab; the event covers what is kept per browser (read
 * notifications, open checkouts).
 */
export function CustomerPortalProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tick, setTick] = useState(0);
  const snapshot: InvestorSnapshot | null | undefined = useLiveQuery(() => investorRepository.snapshot(), [tick]);

  useEffect(() => {
    const reload = () => setTick((t) => t + 1);
    window.addEventListener(CUSTOMER_PORTAL_CHANGED, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(CUSTOMER_PORTAL_CHANGED, reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  // signed out, session expired, or the customer record is gone
  useEffect(() => {
    if (snapshot === null) {
      // a session whose customer is gone would bounce between here and the sign-in page
      investorRepository.signOut();
      router.replace(`/customer/login?next=${encodeURIComponent(pathname ?? '/customer')}`);
    }
    // the guard follows the snapshot; page changes inside the portal keep the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

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
        router.replace('/customer/login?signed_out=1');
      },
    };
  }, [snapshot, router]);

  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
