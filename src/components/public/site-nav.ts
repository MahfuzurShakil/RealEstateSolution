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
];
