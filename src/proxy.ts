import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, ACCESS_PAGE, accessCode, accessToken } from './lib/access-gate';

/** Every page of every portal asks for the access code first (lib/access-gate.ts). */
export async function proxy(request: NextRequest) {
  const code = accessCode();
  if (code && request.cookies.get(ACCESS_COOKIE)?.value === (await accessToken(code))) return NextResponse.next();
  const url = new URL(ACCESS_PAGE, request.url);
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // the access page itself and the files it needs to render stay open
  matcher: ['/((?!access|_next/static|_next/image|favicon\\.ico).*)'],
};
