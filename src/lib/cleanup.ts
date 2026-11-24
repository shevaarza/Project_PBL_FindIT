import { db } from './db';
import { env } from './env';
import { deleteItemPhoto, supabase } from './photos';

/**
 * Keeps Storage small. A photo is only needed while an item is still waiting for its owner.
 * - purgeClosedItemPhotos: items that are no longer "Found" (claimed/returned) lose their photo and photo_path.
 * - purgeOrphanPhotos: files in the bucket that no item points to (a failed insert, a replaced photo, a delete that failed).
 * Both run from the daily cron (/api/cron/backup) and are safe to run repeatedly.
 */

export async function purgeClosedItemPhotos(): Promise<number> {
  const rows = await db.rows<{ kode_laporan: number; photo_path: string }>(
    `SELECT kode_laporan, photo_path FROM public.item WHERE photo_path IS NOT NULL AND status_barang <> 'Found' LIMIT 500`);
  let n = 0;
  for (const r of rows) {
    await deleteItemPhoto(r.photo_path);
    await db.query('UPDATE public.item SET photo_path = NULL WHERE kode_laporan = $1 AND photo_path = $2', [r.kode_laporan, r.photo_path]);
    n++;
  }
  return n;
}

export async function purgeOrphanPhotos(minAgeMinutes = 60): Promise<number> {
  // Photos in the database that no item points to (a failed insert, a replaced photo, a delete that failed).
  const r = await db.query(
    `DELETE FROM public.item_photo p
      WHERE p.created_at < now() - ($1::int * interval '1 minute')
        AND NOT EXISTS (SELECT 1 FROM public.item i WHERE i.photo_path = p.photo_path)`, [minAgeMinutes]);
  let removed = r.rowCount;
  // Leftover files in the old Storage bucket (only if the bucket is reachable).
  try { removed += await purgeOrphanStorageFiles(minAgeMinutes); } catch { /* bucket missing or not configured: nothing to clean */ }
  return removed;
}

async function purgeOrphanStorageFiles(minAgeMinutes: number): Promise<number> {
  const bucket = supabase().storage.from(env.itemBucket);
  const known = new Set((await db.rows<{ photo_path: string }>('SELECT photo_path FROM public.item WHERE photo_path IS NOT NULL')).map((r) => r.photo_path));
  const cutoff = Date.now() - minAgeMinutes * 60_000;

  const listAll = async (prefix: string) => {
    const out: { name: string; id: string | null; created_at?: string | null }[] = [];
    for (let offset = 0; offset < 10_000; offset += 1000) {
      const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
      if (error) throw new Error('Storage list failed: ' + error.message);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  const orphans: string[] = [];
  for (const folder of (await listAll('items')).filter((e) => e.id === null)) {
    for (const f of (await listAll(`items/${folder.name}`)).filter((e) => e.id !== null)) {
      const path = `items/${folder.name}/${f.name}`;
      const created = f.created_at ? new Date(f.created_at).getTime() : 0;
      if (!known.has(path) && created < cutoff) orphans.push(path);
    }
  }
  for (let i = 0; i < orphans.length; i += 100) {
    const { error } = await bucket.remove(orphans.slice(i, i + 100));
    if (error) throw new Error('Storage remove failed: ' + error.message);
  }
  return orphans.length;
}
