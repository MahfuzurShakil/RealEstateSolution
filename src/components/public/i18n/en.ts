/**
 * Public website copy (PUBLIC-WEBSITE-MASTER-PLAN.md §0.1, Bangla-ready).
 *
 * Every word the website shows that is not data from Admin lives here, so:
 *  - a Bangla `bn.ts` with the same shape can be added later (Phase 2 toggle);
 *  - the site never names a company — copy says "we", the name comes from
 *    Settings → Company.
 * Sections move in here as each batch rebuilds them.
 */
export const en = {
  nav: {
    home: 'Home',
    projects: 'Projects',
    allProjects: 'All projects',
    byType: 'By type',
    byArea: 'By area',
    featured: 'Featured',
    viewProject: 'View project',
    hotline: 'Hotline',
    bookVisit: 'Book a site visit',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    skipToContent: 'Skip to content',
    call: 'Call',
    whatsapp: 'WhatsApp',
    chatOnWhatsapp: 'Chat with us on WhatsApp',
  },
  footer: {
    blurb: 'Apartments, plots and land shares — with clear papers, honest prices and progress you can follow.',
    projects: 'Projects',
    explore: 'Explore',
    contact: 'Contact',
    tradeLicence: 'Trade licence',
    fraudNotice:
      'Pay only into the company bank accounts printed on your money receipt. We never ask for payment to a personal account.',
    rights: 'All rights reserved.',
    adminPortal: 'Admin Portal',
    choosePortal: 'Choose portal',
  },
  common: {
    projectsCount: (n: number) => `${n} project${n === 1 ? '' : 's'}`,
    loading: 'Loading…',
  },
  notFound: {
    eyebrow: 'Page not found',
    title: 'We couldn’t find that page',
    body: 'The link may be old, or the project may no longer be on our website.',
    browse: 'Browse projects',
    home: 'Back to home',
  },
  error: {
    title: 'Something went wrong',
    body: 'Please try again. If it keeps happening, call or WhatsApp us and we’ll help.',
    retry: 'Try again',
  },
} as const;

export type SiteCopy = typeof en;
