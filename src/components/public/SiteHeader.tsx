'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, Menu, PhoneCall, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { SITE_NAV } from './site-nav';
import { useCompanyInfo } from './useCompanyInfo';

/** Wordmark: a green house tile and the company name. */
function Wordmark({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-10 place-items-center rounded-xl bg-site-primary text-white shadow-sm shadow-site-primary/30">
        <Building2 className="size-5" />
      </span>
      <span className="text-xl leading-none font-semibold tracking-tight text-site-ink">{name}</span>
    </span>
  );
}

export function SiteHeader() {
  const company = useCompanyInfo();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const name = company?.company_name ?? '';
  const tel = company?.phone ? `tel:${company.phone.replace(/[^\d+]/g, '')}` : null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href));

  return (
    <header
      className={cn(
        'sticky top-0 z-40 bg-white/95 backdrop-blur transition-shadow',
        scrolled ? 'shadow-md shadow-slate-900/5' : 'shadow-none',
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="min-w-0" onClick={() => setOpen(false)}>
          {name ? <Wordmark name={name} /> : <span className="block h-10 w-44" />}
        </Link>

        <nav className="hidden items-center gap-9 lg:flex">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-[15px] font-medium transition-colors',
                isActive(item.href) ? 'text-site-primary' : 'text-site-ink hover:text-site-primary',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          {tel && (
            <a href={tel} className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-site-primary-soft text-site-primary">
                <PhoneCall className="size-4.5" />
              </span>
              <span className="leading-tight">
                <span className="block text-xs text-site-muted">Hotline</span>
                <span className="block text-[15px] font-semibold text-site-ink">{company?.phone}</span>
              </span>
            </a>
          )}
          <Link
            href="/projects"
            className="rounded-full bg-site-primary px-6 py-2.5 text-[15px] font-medium text-white shadow-sm shadow-site-primary/30 transition-colors hover:bg-site-primary-dark"
          >
            Find a home
          </Link>
        </div>

        <button
          type="button"
          className="grid size-11 place-items-center rounded-full bg-site-soft text-site-ink lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-site-line bg-white px-4 pb-5 lg:hidden">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'block border-b border-site-line py-3.5 text-base font-medium',
                isActive(item.href) ? 'text-site-primary' : 'text-site-ink',
              )}
            >
              {item.label}
            </Link>
          ))}
          {tel && (
            <a
              href={tel}
              className="mt-5 flex items-center justify-center gap-2 rounded-full bg-site-primary px-4 py-3 text-sm font-medium text-white"
            >
              <PhoneCall className="size-4" /> Call {company?.phone}
            </a>
          )}
        </nav>
      )}
    </header>
  );
}
