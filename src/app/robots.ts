import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

/** The public website is crawlable; Admin and the demo portal chooser are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/portal'] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
