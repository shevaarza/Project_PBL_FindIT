import { NextResponse, type NextRequest } from 'next/server';

// 1) gives every browser a random "fi_sid" (used for CSRF tokens),
// 2) turns the one-shot "fi_flash" cookie into a request header for the next page view and deletes it.
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete('x-fi-sid');
  headers.delete('x-fi-flash');

  let sid = req.cookies.get('fi_sid')?.value ?? '';
  let newSid = '';
  if (!/^[a-f0-9]{32}$/.test(sid)) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    sid = newSid = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  headers.set('x-fi-sid', sid);

  const isNavigation =
    req.method === 'GET' &&
    (req.headers.get('accept') ?? '').includes('text/html') &&
    !req.headers.get('next-router-prefetch');
  const flash = req.cookies.get('fi_flash')?.value;
  if (flash && isNavigation) headers.set('x-fi-flash', flash);

  const res = NextResponse.next({ request: { headers } });
  if (newSid) {
    res.cookies.set('fi_sid', newSid, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  }
  if (flash && isNavigation) res.cookies.delete('fi_flash');
  return res;
}

export const config = {
  matcher: ['/((?!_next/|assets/|favicon\\.ico).*)'],
};
