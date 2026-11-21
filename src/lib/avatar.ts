import sharp, { type Metadata } from 'sharp';
import type { Db } from './db';
import { Crypto } from './crypto';

export const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** key => [label, background, skin, hair, shirt] */
export const PRESETS: Record<string, [string, string, string, string, string]> = {
  a1: ['Sage', '#E4F0B5', '#F1C9A5', '#3B2A20', '#66794A'],
  a2: ['Lilac', '#E6E8FA', '#E8B896', '#1F1A17', '#54478F'],
  a3: ['Clay', '#F0DDD0', '#D9A67E', '#5A3A24', '#8A3B32'],
  a4: ['Sky', '#D8ECF5', '#F5D3B3', '#8A5A2B', '#2F6C8F'],
  a5: ['Sand', '#F7ECC8', '#C98F66', '#241B16', '#77601F'],
  a6: ['Mint', '#D6EFE2', '#F0C4A0', '#6B3E26', '#2F7A5A'],
  a7: ['Rose', '#F6E0DC', '#E5B28D', '#2B1E18', '#B2546A'],
  a8: ['Stone', '#ECE9DF', '#B98260', '#161212', '#5A6150'],
};
const STYLES: Record<string, 'short' | 'long' | 'bun'> = { a1: 'short', a2: 'long', a3: 'bun', a4: 'short', a5: 'long', a6: 'bun', a7: 'long', a8: 'short' };

export const isPreset = (k: string) => Object.prototype.hasOwnProperty.call(PRESETS, k);

export interface AvatarInfo { type: 'none' | 'preset' | 'photo'; preset: string | null; v: number }

export async function avatarInfo(db: Db, userId: number): Promise<AvatarInfo> {
  const none: AvatarInfo = { type: 'none', preset: null, v: 0 };
  try {
    const row = await db.one(
      `SELECT avatar_preset, (foto_data IS NOT NULL) AS has_photo, EXTRACT(EPOCH FROM updated_at)::bigint AS v
       FROM public.user_photo WHERE id_user = $1`, [userId]);
    if (!row) return none;
    if (row.has_photo) return { type: 'photo', preset: null, v: Number(row.v) };
    if (row.avatar_preset && isPreset(String(row.avatar_preset))) return { type: 'preset', preset: String(row.avatar_preset), v: Number(row.v) };
  } catch (e) { console.error('[FindIT] Failed to load the profile picture: ' + (e as Error).message); }
  return none;
}

export async function avatarPhoto(db: Db, userId: number): Promise<{ mime: string; data: Buffer } | null> {
  const row = await db.one('SELECT mime, foto_data FROM public.user_photo WHERE id_user = $1 AND foto_data IS NOT NULL', [userId]);
  if (!row || !ALLOWED.has(row.mime)) return null;
  const b64 = Crypto.reveal('foto_data', row.foto_data);
  return b64 ? { mime: row.mime, data: Buffer.from(b64, 'base64') } : null;
}

export async function setPreset(db: Db, userId: number, key: string): Promise<boolean> {
  if (!isPreset(key)) return false;
  await db.query(
    `INSERT INTO public.user_photo (id_user, avatar_preset, mime, foto_data, updated_at) VALUES ($1, $2, NULL, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT (id_user) DO UPDATE SET avatar_preset = EXCLUDED.avatar_preset, mime = NULL, foto_data = NULL, updated_at = CURRENT_TIMESTAMP`,
    [userId, key]);
  return true;
}

/** Validate an uploaded file and store it (encrypted). Returns null on success or an error message. */
export async function savePhoto(db: Db, userId: number, file: FormDataEntryValue | null): Promise<string | null> {
  if (!file || typeof file === 'string' || file.size === 0) return 'Please choose a photo first.';
  if (file.size > MAX_BYTES) return 'The photo is too large. The maximum size is 2 MB.';
  const input = Buffer.from(await file.arrayBuffer());
  let meta: Metadata;
  try { meta = await sharp(input).metadata(); } catch { return 'Only JPG, PNG or WebP photos are allowed.'; }
  const mime = meta.format === 'jpeg' ? 'image/jpeg' : meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : '';
  if (!ALLOWED.has(mime)) return 'Only JPG, PNG or WebP photos are allowed.';
  if (!meta.width || !meta.height || meta.width * meta.height > 25_000_000) return 'This photo has an unsupported size.';
  let out: Buffer;
  try {
    // Crop to a centered square, shrink to 400x400, re-encode as JPEG (removes EXIF and hidden data).
    out = await sharp(input).rotate().resize(400, 400, { fit: 'cover', position: 'centre' }).flatten({ background: '#ffffff' }).jpeg({ quality: 86 }).toBuffer();
  } catch { return 'This photo could not be processed. Please try another one.'; }
  await db.query(
    `INSERT INTO public.user_photo (id_user, avatar_preset, mime, foto_data, updated_at) VALUES ($1, NULL, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (id_user) DO UPDATE SET avatar_preset = NULL, mime = EXCLUDED.mime, foto_data = EXCLUDED.foto_data, updated_at = CURRENT_TIMESTAMP`,
    [userId, 'image/jpeg', Crypto.protect('foto_data', out.toString('base64'))]);
  return null;
}

export async function removeAvatar(db: Db, userId: number): Promise<void> {
  await db.query('DELETE FROM public.user_photo WHERE id_user = $1', [userId]);
}

export function presetSvg(key: string, size = 96): string {
  if (!isPreset(key)) return defaultSvg(size);
  const [, bg, skin, hair, shirt] = PRESETS[key];
  const style = STYLES[key] ?? 'short';
  let back = '', front = '';
  if (style === 'long') {
    back = `<path d="M26 46c0-17 9-26 24-26s24 9 24 26v22H26z" fill="${hair}"/>`;
    front = `<path d="M31 44c4-10 12-14 19-14s15 4 19 14c-8-4-14-6-19-6s-11 2-19 6z" fill="${hair}"/>`;
  } else if (style === 'bun') {
    back = `<circle cx="50" cy="19" r="9" fill="${hair}"/>`;
    front = `<path d="M31 45c1-12 9-17 19-17s18 5 19 17c-6-5-12-7-19-7s-13 2-19 7z" fill="${hair}"/>`;
  } else {
    front = `<path d="M31 46c0-13 8-19 19-19s19 6 19 19c-5-5-11-8-19-8s-14 3-19 8z" fill="${hair}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">` +
    `<rect width="100" height="100" fill="${bg}"/>${back}<path d="M14 100c0-20 15-30 36-30s36 10 36 30z" fill="${shirt}"/>` +
    `<rect x="43" y="58" width="14" height="14" rx="5" fill="${skin}"/><ellipse cx="50" cy="46" rx="19" ry="21" fill="${skin}"/>${front}` +
    `<circle cx="43" cy="48" r="1.8" fill="#2B2B2B"/><circle cx="57" cy="48" r="1.8" fill="#2B2B2B"/>` +
    `<path d="M44 57q6 4 12 0" fill="none" stroke="#2B2B2B" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

export function defaultSvg(size = 96): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">` +
    `<rect width="100" height="100" fill="#E6E8FA"/><circle cx="50" cy="38" r="15" fill="none" stroke="#54478F" stroke-width="5"/>` +
    `<path d="M22 84c0-17 12-25 28-25s28 8 28 25" fill="none" stroke="#54478F" stroke-width="5" stroke-linecap="round"/></svg>`;
}
