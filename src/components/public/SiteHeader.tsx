'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, MapPin, Menu, MessageCircle, PhoneCall, X } from 'lucide-react';
import { formatPublicPrice, telLink } from '@/lib/domain/public-portal';
import { cn } from '@/lib/utils/cn';
import { BrandMark } from './BrandMark';
import { en } from './i18n/en';
import { SiteImage } from './SiteImage';
import { SITE_NAV } from './site-nav';
import { COVER_FALLBACK } from './stock-images';
import { ButtonLink } from './ui/Button';
import { useCompanyInfo } from './useCompanyInfo';
import { useProjectMenu, type ProjectMenu } from './useProjectMenu';

const t = en.nav;

/** Desktop drop-down under "Projects": by type, by area, one featured project (§4). */
function ProjectsMega({ menu, onNavigate }: { menu: ProjectMenu | undefined; onNavigate: () => void }) {
  const f = menu?.featured;
  return (
    <div className="grid grid-cols-[1fr_1fr_300px] gap-8 p-7">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-site-brass-dark uppercase">{t.byType}</p>
        <ul className="mt-4 space-y-1">
          {menu?.types.map((ty) => (
            <li key={ty.project_type}>
              <Link
                href={`/projects?type=${ty.project_type}`}
                onClick={onNavigate}
                className="group flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-site-soft"
              >
                <span className="font-medium">{ty.label}</span>
                <span className="text-sm text-site-muted">{en.common.projectsCount(ty.count)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/projects"
          onClick={onNavigate}
          className="group mt-4 inline-flex items-center gap-1.5 px-3 text-sm font-semibold text-site-primary"
        >
          {t.allProjects}
          {menu ? ` (${menu.total})` : ''}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </div>
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-site-brass-dark uppercase">{t.byArea}</p>
        <ul className="mt-4 grid gap-1">
          {menu?.areas.map((a) => (
            <li key={a.area}>
              <Link
                href={`/projects?area=${encodeURIComponent(a.area)}`}
                onClick={onNavigate}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-site-soft"
              >
                <MapPin className="size-4 text-site-primary-bright" aria-hidden />
                <span className="font-medium">{a.area}</span>
                <span className="ml-auto text-sm text-site-muted">{a.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {f && (
        <Link href={`/projects/${f.code}`} onClick={onNavigate} className="group overflow-hidden rounded-2xl bg-site-soft">
          <SiteImage image={f.cover} fallback={COVER_FALLBACK[f.project_type]} alt={f.name} className="aspect-[16/10]" />
          <div className="p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-site-brass-dark uppercase">{t.featured}</p>
            <p className="font-display mt-1 text-lg leading-tight font-semibold group-hover:text-site-primary">{f.name}</p>
            <p className="mt-1 line-clamp-1 text-sm text-site-muted">{f.location_summary}</p>
            {f.price_from != null && (
              <p className="tabular mt-2 text-sm font-semibold">
                from <span className="font-taka">{formatPublicPrice(f.price_from)}</span>
              </p>
            )}
          </div>
        </Link>
      )}
    </div>
  );
}

export function SiteHeader() {
  const company = useCompanyInfo();
  const menu = useProjectMenu();
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile sheet
  const [mega, setMega] = useState(false); // desktop projects menu
  const [scrolled, setScrolled] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const megaWrap = useRef<HTMLDivElement>(null);
  const hoverOpenedAt = useRef(0);
  const tel = telLink(company?.phone);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // mobile sheet: lock page scroll, Esc closes, focus the close button
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // desktop mega menu: Esc or a click outside closes it
  useEffect(() => {
    if (!mega) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMega(false);
    const onClick = (e: MouseEvent) => {
      if (!megaWrap.current?.contains(e.target as Node)) setMega(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [mega]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href));

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-[background-color,box-shadow,border-color] duration-200',
        scrolled ? 'border-site-line bg-white/90 shadow-site-1 backdrop-blur-md' : 'border-transparent bg-site-ivory',
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-site-primary focus:px-4 focus:py-2 focus:text-white"
      >
        {t.skipToContent}
      </a>
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-20">
        <Link href="/" className="min-w-0 rounded-xl">
          <BrandMark company={company} />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {SITE_NAV.map((item) =>
            item.mega ? (
              <div key={item.href} ref={megaWrap} className="relative" onMouseLeave={() => setMega(false)}>
                <button
                  type="button"
                  aria-expanded={mega}
                  aria-haspopup="true"
                  onMouseEnter={() => {
                    hoverOpenedAt.current = Date.now();
                    setMega(true);
                  }}
                  // a click right after hover-open would otherwise close the menu again
                  onClick={() => setMega((m) => (m && Date.now() - hoverOpenedAt.current < 500 ? true : !m))}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-4 py-2 text-[15px] font-medium transition-colors hover:text-site-primary',
                    (isActive(item.href) || mega) && 'text-site-primary',
                  )}
                >
                  {item.label}
                  <ChevronDown className={cn('size-4 transition-transform duration-200', mega && 'rotate-180')} />
                </button>
                {/* invisible bridge keeps hover alive between the button and the panel */}
                <div
                  className={cn(
                    'absolute top-full left-1/2 w-[860px] -translate-x-1/2 pt-3 transition-[opacity,translate] duration-200 ease-site-out',
                    mega ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0',
                  )}
                >
                  <div className="overflow-hidden rounded-3xl border border-site-line bg-white shadow-site-3">
                    <ProjectsMega menu={menu} onNavigate={() => setMega(false)} />
                  </div>
                </div>
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'rounded-full px-4 py-2 text-[15px] font-medium transition-colors hover:text-site-primary',
                  isActive(item.href) && 'text-site-primary',
                )}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          {tel && (
            <a href={tel} className="group flex items-center gap-3 rounded-full">
              <span className="grid size-10 place-items-center rounded-full bg-site-primary-soft text-site-primary transition-colors group-hover:bg-site-primary group-hover:text-white">
                <PhoneCall className="size-4.5" aria-hidden />
              </span>
              <span className="leading-tight">
                <span className="block text-xs text-site-muted">{t.hotline}</span>
                <span className="tabular block text-[15px] font-semibold">{company?.phone}</span>
              </span>
            </a>
          )}
          {tel && (
            <ButtonLink href={tel} size="md">
              {t.bookVisit}
            </ButtonLink>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          {tel && (
            <a href={tel} aria-label={`${t.call} ${company?.phone}`} className="grid size-11 place-items-center rounded-full bg-site-primary-soft text-site-primary">
              <PhoneCall className="size-5" />
            </a>
          )}
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full bg-white text-site-ink shadow-site-1"
            aria-label={t.openMenu}
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {/* Mobile: full-screen sheet with big links and contact buttons at the bottom */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={cn(
          'fixed inset-0 z-50 flex flex-col bg-site-ivory transition-[opacity,visibility] duration-300 ease-site-out lg:hidden',
          open ? 'visible opacity-100' : 'invisible opacity-0',
        )}
      >
        <div className="flex h-18 items-center justify-between px-4 sm:px-6">
          <BrandMark company={company} />
          <button
            ref={closeBtn}
            type="button"
            className="grid size-11 place-items-center rounded-full bg-white shadow-site-1"
            aria-label={t.closeMenu}
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 pt-4 sm:px-6" aria-label="Mobile">
          {SITE_NAV.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              style={{ transitionDelay: open ? `${80 + i * 50}ms` : '0ms' }}
              className={cn(
                'font-display flex items-center justify-between border-b border-site-line py-4 text-3xl font-semibold transition-[opacity,translate] duration-500 ease-site-out',
                open ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
                isActive(item.href) && 'text-site-primary',
              )}
            >
              {item.label}
              <ArrowRight className="size-6 text-site-faint" />
            </Link>
          ))}
          {menu && menu.types.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold tracking-[0.16em] text-site-brass-dark uppercase">{t.byType}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {menu.types.map((ty) => (
                  <Link
                    key={ty.project_type}
                    href={`/projects?type=${ty.project_type}`}
                    onClick={() => setOpen(false)}
                    className="rounded-full border border-site-line bg-white px-4 py-2 text-sm font-medium"
                  >
                    {ty.label} <span className="text-site-muted">· {ty.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
        <div className="grid grid-cols-2 gap-3 border-t border-site-line p-4 sm:px-6">
          {tel && (
            <ButtonLink href={tel} icon={<PhoneCall className="size-4" />} className="w-full">
              {t.call}
            </ButtonLink>
          )}
          {company?.whatsapp_url && (
            <ButtonLink href={company.whatsapp_url} variant="whatsapp" icon={<MessageCircle className="size-4" />} className="w-full">
              {t.whatsapp}
            </ButtonLink>
          )}
        </div>
      </div>
    </header>
  );
}
