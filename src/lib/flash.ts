import { cookies, headers } from 'next/headers';
import { cookieBase } from './session';

/**
 * One-shot messages between a POST (route handler) and the page it redirects to.
 * The route handler stores {error, success, form} in the "fi_flash" cookie; middleware.ts hands it to
 * the next page view through the "x-fi-flash" header and deletes the cookie, so it shows exactly once.
 * Form values are trimmed so the cookie stays under the browser's 4 KB limit.
 */
export interface Flash {
  error?: string;
  success?: string;
  form?: Record<string, string>;
}

function fit(form: Record<string, string> | undefined, budget = 2400): Record<string, string> | undefined {
  if (!form) return undefined;
  const keys = Object.keys(form);
  const per = Math.max(60, Math.floor(budget / Math.max(1, keys.length)));
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = [...String(form[k] ?? '')].slice(0, per).join('');
  return out;
}

export async function setFlash(flash: Flash): Promise<void> {
  const body = JSON.stringify({ ...flash, form: fit(flash.form) });
  (await cookies()).set('fi_flash', Buffer.from(body, 'utf8').toString('base64url'), { ...cookieBase, maxAge: 120 });
}

export async function getFlash(): Promise<Flash> {
  const raw = (await headers()).get('x-fi-flash');
  if (!raw) return {};
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Flash;
  } catch {
    return {};
  }
}
