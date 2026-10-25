'use client';

import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { SITE_NAV } from './site-nav';
import { useCompanyInfo } from './useCompanyInfo';

export function SiteFooter() {
  const company = useCompanyInfo();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-site-forest-deep text-site-stone">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-display text-2xl text-white">{company?.company_name}</p>
          <p className="max-w-sm text-sm leading-relaxed text-site-stone/80">
            Homes, plots and land shares, built and sold with clear paperwork and honest pricing.
          </p>
        </div>

        <div>
          <p className="mb-3 text-xs tracking-[0.2em] text-site-brass-light uppercase">Explore</p>
          <ul className="space-y-2 text-sm">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-3 text-xs tracking-[0.2em] text-site-brass-light uppercase">Get in touch</p>
          <ul className="space-y-3 text-sm">
            {company?.address && (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-site-brass" />
                <span>{company.address}</span>
              </li>
            )}
            {company?.phone && (
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0 text-site-brass" />
                <a href={`tel:${company.phone.replace(/\D/g, '')}`} className="hover:text-white">
                  {company.phone}
                </a>
              </li>
            )}
            {company?.email && (
              <li className="flex gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0 text-site-brass" />
                <a href={`mailto:${company.email}`} className="break-all hover:text-white">
                  {company.email}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-site-stone/60 sm:px-6">
          © {year} {company?.company_name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
