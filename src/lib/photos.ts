import sharp, { type Metadata } from 'sharp';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { env } from './env';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    if (!env.supabaseUrl || !env.serviceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.');
    client = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

export class PhotoError extends Error {}

/**
 * Validate an uploaded or camera-captured item photo and return a clean JPEG (EXIF removed, rotated upright,
 * max 1600px). Returns null when no photo was sent. Throws PhotoError with a message for the student.
 */
export async function processItemPhotoUpload(file: FormDataEntryValue | null): Promise<Buffer | null> {
  if (!file || typeof file === 'string' || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new PhotoError('The maximum photo size is 5 MB.');

  const input = Buffer.from(await file.arrayBuffer());
  // Check the real content, not the file name or the browser's claim.
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new PhotoError('Only JPG, PNG, and WEBP images are allowed.');
  }
  const mime = meta.format === 'jpeg' ? 'image/jpeg' : meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : '';
  if (!ALLOWED.has(mime)) throw new PhotoError('Only JPG, PNG, and WEBP images are allowed.');
  if (!meta.width || !meta.height || meta.width * meta.height > 50_000_000) throw new PhotoError('This photo has an unsupported size.');

  try {
    return await sharp(input).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch {
    throw new PhotoError('Unable to read the uploaded photo.');
  }
}

/** Upload to the private item-photos bucket. Returns the storage path to keep in item.photo_path. */
export async function storeItemPhoto(data: Buffer): Promise<string> {
  const path = `items/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.jpg`;
  const { error } = await supabase().storage.from(env.itemBucket).upload(path, data, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('Photo upload failed: ' + error.message);
  return path;
}

export async function deleteItemPhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try { await supabase().storage.from(env.itemBucket).remove([path]); } catch (e) { console.error('[FindIT] Could not delete photo: ' + (e as Error).message); }
}

export async function readItemPhoto(path: string): Promise<Buffer | null> {
  const { data, error } = await supabase().storage.from(env.itemBucket).download(path);
  if (error || !data) {
    console.error('[FindIT] Storage download failed for ' + path + ' (bucket ' + env.itemBucket + '): ' + (error ? (error.message || JSON.stringify(error)) : 'no data'));
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

/** URL the pages use in <img src>. Served by /api/item-photo/[id] (the bucket itself stays private). */
export const itemPhotoUrl = (itemId: number, v?: string | number) => `/api/item-photo/${itemId}${v ? `?v=${encodeURIComponent(String(v))}` : ''}`;