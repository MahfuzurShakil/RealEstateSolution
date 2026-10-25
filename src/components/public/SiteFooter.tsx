'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Mail, MapPin, PhoneCall } from 'lucide-react';
import { SITE_NAV } from './site-nav';
import { cn } from '@/lib/utils/cn';
import { useCompanyInfo } from './useCompanyInfo';

export function SiteFooter() {
  const company = useCompanyInfo();
  const pathname = usePathname();
  // room for the call / WhatsApp bar a project page pins to the bottom on phones
  const barBelow = /^\/projects\/[^/]+/.test(pathname ?? '');
  const year = new Date().getFullYear();
  const tel = company?.phone ? `tel:${company.phone.replace(/[^\d+]/g, '')}` : null;

  return (
    <footer className={cn('mt-24 bg-site-night text-slate-300', barBelow && 'max-lg:pb-20')}>
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.2fr]">
        <div className="space-y-5">
          <p className="flex items-center gap-2.5 text-xl font-semibold text-white">
            <span className="grid size-10 place-items-center rounded-xl bg-site-primary text-white">
              <Building2 className="size-5" />
            </span>
            {company?.company_name}
          </p>
          <p className="max-w-sm leading-relaxed text-slate-400">
            Apartments, plots and land shares in and around Dhaka — with clear papers, honest prices and
            progress you can follow.
          </p>
        </div>

        <div>
          <p className="mb-5 text-lg font-semibold text-white">Explore</p>
          <ul className="space-y-3">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="transition-colors hover:text-site-primary">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-5 text-lg font-semibold text-white">Contact</p>
          <ul className="space-y-4">
            {company?.address && (
              <li className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-site-primary" />
                <span>{company.address}</span>
              </li>
            )}
            {tel && (
              <li className="flex gap-3">
                <PhoneCall className="mt-0.5 size-5 shrink-0 text-site-primary" />
                <a href={tel} className="hover:text-white">
                  {company?.phone}
                </a>
              </li>
            )}
            {company?.email && (
              <li className="flex gap-3">
                <Mail className="mt-0.5 size-5 shrink-0 text-site-primary" />
                <a href={`mailto:${company.email}`} className="break-all hover:text-white">
                  {company.email}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:px-6">
          <p>© {year} {company?.company_name?.replace(/\.$/, '')}. All rights reserved.</p>
          {/* demo navigation back to the portal chooser and the admin side */}
          <p className="flex gap-4">
            <Link href="/admin" className="hover:text-white">Admin Portal</Link>
            <Link href="/" className="hover:text-white">Choose portal</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
