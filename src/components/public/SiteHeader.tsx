'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, Phone, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { SITE_NAV } from './site-nav';
import { useCompanyInfo } from './useCompanyInfo';

/** Wordmark: the company name in the display serif, with its initial as a monogram. */
function Wordmark({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-full bg-site-forest font-display text-lg text-site-brass-light">
        {name.charAt(0)}
      </span>
      <span className="font-display text-lg leading-tight text-site-ink sm:text-xl">{name}</span>
    </span>
  );
}

export function SiteHeader() {
  const company = useCompanyInfo();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const name = company?.company_name ?? '';

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-site-stone/70 bg-site-sand/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="min-w-0" onClick={() => setOpen(false)}>
          {name ? <Wordmark name={name} /> : <span className="block h-9 w-40" />}
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-sm transition-colors',
                isActive(item.href) ? 'text-site-forest' : 'text-site-muted hover:text-site-ink',
              )}
            >
              {item.label}
            </Link>
          ))}
          {company?.phone && (
            <a
              href={`tel:${company.phone.replace(/\D/g, '')}`}
              className="flex items-center gap-2 rounded-full bg-site-forest px-4 py-2 text-sm text-white transition-colors hover:bg-site-forest-deep"
            >
              <Phone className="size-4" /> {company.phone}
            </a>
          )}
        </nav>

        <button
          type="button"
          className="grid size-10 place-items-center rounded-full text-site-ink md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-site-stone/70 bg-site-sand px-4 pb-4 md:hidden">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'block border-b border-site-stone/50 py-3 text-base',
                isActive(item.href) ? 'text-site-forest' : 'text-site-ink',
              )}
            >
              {item.label}
            </Link>
          ))}
          {company?.phone && (
            <a
              href={`tel:${company.phone.replace(/\D/g, '')}`}
              className="mt-4 flex items-center justify-center gap-2 rounded-full bg-site-forest px-4 py-3 text-sm text-white"
            >
              <Phone className="size-4" /> Call {company.phone}
            </a>
          )}
        </nav>
      )}
    </header>
  );
}
