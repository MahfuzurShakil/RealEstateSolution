/**
 * Public site navigation. A page joins this list in the batch that builds it
 * (Public Portal v2.0 §7), so the header never links to a route that 404s.
 */
export const SITE_NAV: { href: string; label: string }[] = [{ href: '/', label: 'Home' }];
