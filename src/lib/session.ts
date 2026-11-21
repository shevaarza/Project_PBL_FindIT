import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { redirect } from 'next/navigation';
import { env } from './env';

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: 'student' | 'admin';
  access_level?: string;
}

const COOKIE = 'fi_session';
const key = () => {
  if (!env.sessionSecret || env.sessionSecret.length < 16) throw new Error('SESSION_SECRET is missing. Run: node scripts/generate-key.mjs');
  return new TextEncoder().encode(env.sessionSecret);
};

export const cookieBase = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(key());
}

/** The signed-in user, or null. Works in pages and route handlers. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const u = payload.user as SessionUser | undefined;
    return u && u.id && u.role ? u : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE;

// ---- guards (pages) --------------------------------------------------------

export async function requireLogin(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect('/login');
  return u;
}

export async function requireRole(role: 'student' | 'admin'): Promise<SessionUser> {
  const u = await requireLogin();
  if (u.role !== role) redirect('/forbidden');
  return u;
}

/** Already signed in? Send them to their own area (login/register pages). */
export async function redirectLoggedInUser(): Promise<void> {
  const u = await currentUser();
  if (!u) return;
  redirect(u.role === 'admin' ? '/admin' : '/');
}

// ---- CSRF ------------------------------------------------------------------
// middleware.ts hands every visitor a random "fi_sid" cookie. The CSRF token is HMAC(SESSION_SECRET, sid),
// so it is different per browser, never stored, and an attacker's site cannot guess it.

const csrfFor = (sid: string) => createHmac('sha256', key()).update('csrf:' + sid).digest('hex');

export async function csrfToken(): Promise<string> {
  const sid = (await headers()).get('x-fi-sid') || (await cookies()).get('fi_sid')?.value || '';
  return sid ? csrfFor(sid) : '';
}

export async function verifyCsrf(submitted: unknown): Promise<boolean> {
  const sid = (await cookies()).get('fi_sid')?.value || '';
  if (!sid || typeof submitted !== 'string' || submitted === '') return false;
  const expected = Buffer.from(csrfFor(sid));
  const given = Buffer.from(submitted);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
