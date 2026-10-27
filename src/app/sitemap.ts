import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

/*
 * The public pages that exist for every install. Project and blog pages are
 * not listed yet: in Phase A their data lives in each browser's IndexedDB,
 * which the server cannot read. Phase B (server database) adds them here from
 * the public repositories.
 */
const PAGES: { path: string; changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; priority: number }[] = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/projects', changeFrequency: 'daily', priority: 0.9 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/buyers-guide', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/nrb', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/landowners', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PAGES.map((p) => ({ url: `${base}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
