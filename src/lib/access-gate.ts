/*
 * Site-wide access code (all three portals: admin, public website, Customer
 * Portal) while the build is hosted publicly for review.
 *
 * The repository is public, so the code itself is never written here. What
 * is kept is a check value: SHA-256 of a slow PBKDF2 key made from the code.
 * The browser's cookie holds that key, which only someone who typed the code
 * can have; the proxy just hashes the cookie and compares. Changing the code
 * means recomputing ACCESS_SALT / ACCESS_CHECK for the new one.
 */

export const ACCESS_COOKIE = 'site_access';
export const ACCESS_PAGE = '/access';
export const ACCESS_VERIFY = '/access/verify';
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

const ACCESS_SALT = '638fdfb6e06ac9821db58636d77cab50';
const ACCESS_ITERATIONS = 600_000;
const ACCESS_CHECK = 'e3ab03ae92131e0a1306f6c6aa73953c51d742b6ed43facfd37831adad715b1a';

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The cookie value for a typed code — slow on purpose, so codes cannot be guessed quickly. */
export async function accessKey(code: string): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(ACCESS_SALT), iterations: ACCESS_ITERATIONS, hash: 'SHA-256' },
    base,
    256,
  );
  return hex(bits);
}

/** Whether a cookie value is the key of the right code. */
export async function isAccessKey(key: string | undefined): Promise<boolean> {
  if (!key) return false;
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))) === ACCESS_CHECK;
}

/** Only a path on this site — never another host — is a valid place to return to. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith(ACCESS_PAGE) ? next : '/';
}
