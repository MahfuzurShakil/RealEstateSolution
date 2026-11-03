import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, ACCESS_MAX_AGE, ACCESS_PAGE, accessCode, accessToken, safeNext } from '@/lib/access-gate';

/** Checks the code typed on /access; on a match, remembers this browser for 30 days. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const typed = String(form.get('code') ?? '').trim();
  const next = safeNext(String(form.get('next') ?? ''));
  const code = accessCode();

  if (!code || typed !== code) {
    // a short pause makes guessing six digits slow
    await new Promise((r) => setTimeout(r, 800));
    const back = new URL(ACCESS_PAGE, request.url);
    back.searchParams.set('next', next);
    back.searchParams.set('error', code ? 'wrong' : 'unset');
    return NextResponse.redirect(back, 303);
  }

  const res = NextResponse.redirect(new URL(next, request.url), 303);
  res.cookies.set(ACCESS_COOKIE, await accessToken(code), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCESS_MAX_AGE,
  });
  return res;
}
