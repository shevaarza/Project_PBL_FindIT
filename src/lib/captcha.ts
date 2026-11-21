import { SignJWT, jwtVerify } from 'jose';
import { randomInt } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './env';
import { cookieBase } from './session';

// Same rules as the PHP captcha: 5 characters, no look-alike letters, valid 5 minutes, single use.
const LENGTH = 5;
const LIFETIME_S = 300;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COOKIE = 'fi_captcha';
const key = () => new TextEncoder().encode(env.sessionSecret + ':captcha');

export function randomCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(0, ALPHABET.length)];
  return code;
}

/** Create a code, remember it in a signed cookie and return the SVG image (200x60, cream background, noise). */
export async function issueCaptcha(): Promise<string> {
  const code = randomCode();
  const token = await new SignJWT({ code }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(`${LIFETIME_S}s`).sign(key());
  (await cookies()).set(COOKIE, token, { ...cookieBase, maxAge: LIFETIME_S });
  return captchaSvg(code);
}

export function captchaSvg(code: string): string {
  const letters = [...code].map((ch, i) => {
    const r = randomInt(20, 91), g = randomInt(40, 101), b = randomInt(20, 91);
    const x = 16 + i * 34, y = 40 + randomInt(-6, 7), rot = randomInt(-12, 13);
    return `<text x="${x}" y="${y}" fill="rgb(${r},${g},${b})" font-family="Verdana,Arial,sans-serif" font-size="34" font-weight="bold" transform="rotate(${rot} ${x} ${y})">${ch}</text>`;
  }).join('');
  let noise = '';
  for (let i = 0; i < 5; i++) noise += `<line x1="${randomInt(0, 200)}" y1="${randomInt(0, 60)}" x2="${randomInt(0, 200)}" y2="${randomInt(0, 60)}" stroke="rgb(150,170,120)" stroke-width="1.5"/>`;
  for (let i = 0; i < 120; i++) noise += `<rect x="${randomInt(0, 200)}" y="${randomInt(0, 60)}" width="1.5" height="1.5" fill="rgb(150,170,120)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60"><rect width="200" height="60" fill="rgb(246,243,236)"/>${letters}${noise}</svg>`;
}

/** Check the visitor's answer (case-insensitive). The code is removed either way: it can be used once. */
export async function verifyCaptcha(answer: string): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key());
    const a = String(answer ?? '').trim().toUpperCase();
    return a !== '' && a === String(payload.code);
  } catch {
    return false;
  }
}
