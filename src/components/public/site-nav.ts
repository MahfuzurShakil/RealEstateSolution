import { en } from './i18n/en';

/**
 * Public site navigation. A page joins this list in the batch that builds it
 * (PUBLIC-WEBSITE-MASTER-PLAN.md §12), so the header never links to a route
 * that 404s. `mega: 'projects'` opens the projects menu instead of navigating
 * straight away on desktop.
 */
export const SITE_NAV: { href: string; label: string; mega?: 'projects' }[] = [
  { href: '/', label: en.nav.home },
  { href: '/projects', label: en.nav.projects, mega: 'projects' },
  { href: '/buyers-guide', label: en.nav.guide },
  { href: '/about', label: en.nav.about },
  { href: '/contact', label: en.nav.contact },
];

/** Footer-only links: helpful pages that would crowd the header. */
export const FOOTER_EXTRA: { href: string; label: string }[] = [
  { href: '/nrb', label: en.nav.nrb },
  { href: '/landowners', label: en.nav.landowners },
  { href: '/blog', label: en.nav.blog },
];
export const LEGAL_NAV: { href: string; label: string }[] = [
  { href: '/privacy', label: en.nav.privacy },
  { href: '/terms', label: en.nav.terms },
];
