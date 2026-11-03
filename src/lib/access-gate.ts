/*
 * Site-wide access code (all three portals: admin, public website, Customer
 * Portal) while the build is hosted publicly for review.
 *
 * The code itself never lives in the repository: it is read from the
 * server-only ACCESS_CODE environment variable (.env.local locally, the
 * hosting project's settings in production). With no code set, every page
 * stays locked. The cookie holds a hash of the code, never the code.
 */

export const ACCESS_COOKIE = 'site_access';
export const ACCESS_PAGE = '/access';
export const ACCESS_VERIFY = '/access/verify';
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

export function accessCode(): string | null {
  return process.env.ACCESS_CODE?.trim() || null;
}

export async function accessToken(code: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`site-access:${code}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Only a path on this site — never another host — is a valid place to return to. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith(ACCESS_PAGE) ? next : '/';
}
