import { redirectTo } from '@/lib/http';
import { SESSION_COOKIE, cookieBase } from '@/lib/session';

export async function GET(req: Request) {
  const res = redirectTo(req, '/login');
  res.cookies.set(SESSION_COOKIE, '', { ...cookieBase, maxAge: 0 });
  return res;
}
