import { env } from '@/lib/env';
import { applyRetention, runBackup } from '@/lib/backup';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  try {
    const r = await runBackup('daily', 'cron');
    const removed = r.status === 'SUCCESS' ? await applyRetention() : [];
    return Response.json({ ok: r.status === 'SUCCESS', status: r.status, message: r.message, removed: removed.length }, { status: r.status === 'FAILED' ? 500 : 200 });
  } catch (e) {
    console.error('[FindIT] Cron backup failed: ' + (e as Error).message);
    return Response.json({ ok: false }, { status: 500 });
  }
}
