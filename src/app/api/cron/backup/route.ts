import { env } from '@/lib/env';
import { applyRetention, runBackup } from '@/lib/backup';
import { purgeClosedItemPhotos, purgeOrphanPhotos } from '@/lib/cleanup';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  try {
    const r = await runBackup('daily', 'cron');
    const removed = r.status === 'SUCCESS' ? await applyRetention() : [];
    // Storage housekeeping: photos of returned items and files no item points to. Never fails the backup.
    let photosClosed = 0, photosOrphan = 0;
    try { photosClosed = await purgeClosedItemPhotos(); } catch (e) { console.error('[FindIT] Photo cleanup (closed items) failed: ' + (e as Error).message); }
    try { photosOrphan = await purgeOrphanPhotos(); } catch (e) { console.error('[FindIT] Photo cleanup (orphans) failed: ' + (e as Error).message); }
    return Response.json({ ok: r.status === 'SUCCESS', status: r.status, message: r.message, removed: removed.length, photosClosed, photosOrphan }, { status: r.status === 'FAILED' ? 500 : 200 });
  } catch (e) {
    console.error('[FindIT] Cron backup failed: ' + (e as Error).message);
    return Response.json({ ok: false }, { status: 500 });
  }
}
