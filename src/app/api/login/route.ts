import { NextResponse } from 'next/server';
import { csrfOk, readForm, redirectTo, str } from '@/lib/http';
import { setFlash } from '@/lib/flash';
import { login } from '@/lib/auth';
import { SESSION_COOKIE, cookieBase, signSession } from '@/lib/session';

export async function POST(req: Request) {
  const fd = await readForm(req);
  const email = str(fd, 'email').trim();
  if (!(await csrfOk(req, fd))) {
    await setFlash({ error: 'Your session has expired. Please refresh the page and try again.', form: { email } });
    return redirectTo(req, '/login');
  }
  const result = await login(email, str(fd, 'password'));
  if (!result.success) {
    await setFlash({ error: result.message || 'Login failed. Please try again.', form: { email } });
    return redirectTo(req, '/login');
  }
  const res = redirectTo(req, result.role === 'admin' ? '/admin' : '/');
  res.cookies.set(SESSION_COOKIE, await signSession(result.user), { ...cookieBase });
  return res as NextResponse;
}
