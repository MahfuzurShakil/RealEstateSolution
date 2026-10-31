'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell,
  Briefcase,
  CreditCard,
  ExternalLink,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { BrandMark } from '@/components/public/BrandMark';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import { CUSTOMER_TYPE_LABEL } from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { useCustomerPortal } from './CustomerPortalProvider';

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: '/investor', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/investor/investments', label: 'My investments', icon: Briefcase },
  { href: '/investor/payments', label: 'Make a payment', icon: CreditCard },
  { href: '/investor/history', label: 'Payment history', icon: History },
  { href: '/investor/documents', label: 'Documents', icon: FileText },
  { href: '/investor/notifications', label: 'Notifications', icon: Bell },
  { href: '/investor/profile', label: 'My profile', icon: UserRound },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '';
  const company = useCompanyInfo();
  const { snapshot, unread, signOut } = useCustomerPortal();
  const c = snapshot.customer;
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6 pb-5">
        <Link href="/investor" onClick={onNavigate} className="block rounded-xl">
          <BrandMark company={company} tone="dark" />
        </Link>
        <p className="mt-3 text-xs font-semibold tracking-[0.18em] text-site-brass uppercase">Customer Portal</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Customer Portal">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const on = active(href, exact);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium transition-colors',
                on ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white',
              )}
            >
              {on && <span aria-hidden className="absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 rounded-r-full bg-site-brass" />}
              <Icon className={cn('size-5 shrink-0', on ? 'text-site-brass' : 'text-white/50 group-hover:text-white/80')} aria-hidden />
              {label}
              {href === '/investor/notifications' && unread > 0 && (
                <span className="tabular ml-auto rounded-full bg-site-brass px-2 py-0.5 text-xs font-bold text-site-night">{unread}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <span className="font-display grid size-10 shrink-0 place-items-center rounded-full bg-site-brass text-sm font-bold text-site-night">
            {initials(c.full_name)}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-white">{c.full_name}</span>
            <span className="block truncate text-xs text-white/55">
              {c.code} · {CUSTOMER_TYPE_LABEL[c.customer_type]}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/" className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white">
            <ExternalLink className="size-3.5" aria-hidden /> Website
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-3.5" aria-hidden /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sidebar on desktop, top bar + drawer on phones. The demo reset lives on My profile. */
export function PortalShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const company = useCompanyInfo();
  const { unread } = useCustomerPortal();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-site-ivory print:bg-white">
      <aside className="print-hide fixed inset-y-0 left-0 z-40 hidden w-72 bg-site-night lg:block">
        <SidebarBody />
      </aside>

      {open && (
        <div className="print-hide fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-site-night-deep/60 motion-safe:animate-[site-fade-in_.2s_ease-out]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[82%] max-w-80 bg-site-night shadow-site-3">
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute top-5 right-4 grid size-10 place-items-center rounded-full bg-white/10 text-white">
              <X className="size-5" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-72 print:pl-0">

        <header className="print-hide sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-site-line bg-white/90 px-4 backdrop-blur-md lg:hidden">
          <Link href="/investor" className="min-w-0">
            <BrandMark company={company} />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/investor/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative grid size-11 place-items-center rounded-full bg-site-soft">
              <Bell className="size-5" />
              {unread > 0 && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-site-danger ring-2 ring-white" />}
            </Link>
            <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-full bg-site-night text-white">
              <Menu className="size-5" />
            </button>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-10 lg:py-10 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
