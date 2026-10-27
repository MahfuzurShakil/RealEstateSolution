/**
 * The public site's own address, for robots.txt and the sitemap (W10).
 *
 * No domain is written into the code (master plan §0.1 — the platform is sold
 * to more than one developer): set NEXT_PUBLIC_SITE_URL per deployment. On
 * Vercel the production URL is used until then; locally, localhost.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}
