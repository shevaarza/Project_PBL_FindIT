import { NextResponse } from 'next/server';
import { verifyCsrf } from './session';

/** Redirect that works behind Vercel's proxy (always relative to the public URL). */
export function redirectTo(req: Request, path: string, status = 303): NextResponse {
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  return NextResponse.redirect(new URL(path, `${proto}://${host}`), status);
}

/** Read a form body as plain strings (files stay as File). */
export async function readForm(req: Request): Promise<FormData> {
  try { return await req.formData(); } catch { return new FormData(); }
}

export const str = (fd: FormData, key: string): string => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

/** CSRF check for POST handlers: field "csrf_token" or header X-CSRF-Token. */
export async function csrfOk(req: Request, fd?: FormData): Promise<boolean> {
  const token = req.headers.get('x-csrf-token') || (fd ? str(fd, 'csrf_token') : '');
  return verifyCsrf(token);
}

export const json = (status: number, payload: unknown) =>
  NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
