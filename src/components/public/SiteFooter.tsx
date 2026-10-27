'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, Mail, MapPin, MessageCircle, PhoneCall, ShieldCheck } from 'lucide-react';
import { telLink } from '@/lib/domain/public-portal';
import { cn } from '@/lib/utils/cn';
import { BrandMark } from './BrandMark';
import { useEnquiry } from './enquiry/EnquiryProvider';
import { en } from './i18n/en';
import { FOOTER_EXTRA, LEGAL_NAV, SITE_NAV } from './site-nav';
import { useCompanyInfo } from './useCompanyInfo';
import { useProjectMenu } from './useProjectMenu';

const t = en.footer;

/** Footer (master plan §4): brand, projects by type, explore, contact, fraud notice. */
export function SiteFooter() {
  const company = useCompanyInfo();
  const menu = useProjectMenu();
  const pathname = usePathname();
  // room for the call / WhatsApp bar a project page pins to the bottom on phones
  const barBelow = /^\/projects\/[^/]+/.test(pathname ?? '');
  const year = new Date().getFullYear();
  const tel = telLink(company?.phone);
  const enquiry = useEnquiry();
  const heading = 'mb-5 text-xs font-semibold tracking-[0.16em] text-site-brass uppercase';
  const link = 'transition-colors hover:text-white';

  return (
    <footer className={cn('mt-24 bg-site-night text-white/70', barBelow && 'max-lg:pb-20')}>
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.8fr_1.3fr]">
        <div className="space-y-5">
          <Link href="/" className="inline-block rounded-xl">
            <BrandMark company={company} tone="dark" />
          </Link>
          <p className="max-w-sm leading-relaxed">{t.blurb}</p>
          {company?.trade_license_no && (
            <p className="text-sm text-white/50">
              {t.tradeLicence}: <span className="tabular">{company.trade_license_no}</span>
            </p>
          )}
          {company?.rehab_member_no && (
            <p className="text-sm text-white/50">
              <span className="tabular">{en.about.rehab(company.rehab_member_no)}</span>
            </p>
          )}
          {company && company.social.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={en.contact.follow}>
              {company.social.map((s) => (
                <li key={s.network}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded-full border border-white/15 px-3.5 py-1.5 text-sm capitalize transition-colors hover:border-white/40 hover:text-white"
                  >
                    {s.network === 'youtube' ? 'YouTube' : s.network === 'linkedin' ? 'LinkedIn' : s.network}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className={heading}>{t.projects}</p>
          <ul className="space-y-3">
            {menu?.types.map((ty) => (
              <li key={ty.project_type}>
                <Link href={`/projects?type=${ty.project_type}`} className={link}>
                  {ty.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/projects" className={link}>
                {en.nav.allProjects}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className={heading}>{t.explore}</p>
          <ul className="space-y-3">
            {[...SITE_NAV.filter((item) => item.href !== '/'), ...FOOTER_EXTRA].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={link}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className={heading}>{t.contact}</p>
          <ul className="space-y-4">
            {company?.address && (
              <li className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-site-brass" aria-hidden />
                <span>{company.address}</span>
              </li>
            )}
            {company?.office_hours && (
              <li className="flex gap-3">
                <Clock className="mt-0.5 size-5 shrink-0 text-site-brass" aria-hidden />
                <span>{company.office_hours}</span>
              </li>
            )}
            {tel && (
              <li className="flex gap-3">
                <PhoneCall className="mt-0.5 size-5 shrink-0 text-site-brass" aria-hidden />
                <a href={tel} className={cn(link, 'tabular')}>
                  {company?.phone}
                </a>
              </li>
            )}
            {company?.whatsapp_url && (
              <li className="flex gap-3">
                <MessageCircle className="mt-0.5 size-5 shrink-0 text-site-brass" aria-hidden />
                <a href={enquiry.whatsapp() ?? company.whatsapp_url} target="_blank" rel="noopener noreferrer" className={cn(link, 'tabular')}>
                  {company.whatsapp_number}
                </a>
              </li>
            )}
            {company?.email && (
              <li className="flex gap-3">
                <Mail className="mt-0.5 size-5 shrink-0 text-site-brass" aria-hidden />
                <a href={`mailto:${company.email}`} className={cn(link, 'break-all')}>
                  {company.email}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-site-brass" aria-hidden />
          {t.fraudNotice}
        </p>
      </div>

      <div className="mt-10 bg-site-night-deep">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-white/60 sm:px-6">
          <p>
            © {year} {company?.company_name?.replace(/\.$/, '')}. {t.rights}
          </p>
          {/* demo navigation back to the portal chooser and the admin side */}
          <p className="flex flex-wrap gap-4">
            {LEGAL_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={link}>
                {item.label}
              </Link>
            ))}
            <Link href="/admin" className={link}>
              {t.adminPortal}
            </Link>
            <Link href="/portal" className={link}>
              {t.choosePortal}
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
