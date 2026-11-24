import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { supabase } from '@/lib/photos';

export const dynamic = 'force-dynamic';

/**
 * Deployment self-check. Needs "Authorization: Bearer <CRON_SECRET>". Only reports which settings exist (yes/no, never their
 * values) and whether the database and Storage answer. Handy on Vercel where the logs are the only other window.
 */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });

  const present = (v: string) => v.trim() !== '';
  const settings = {
    DATABASE_URL: present(env.databaseUrl) && /^postgres(ql)?:\/\//.test(env.databaseUrl),
    SUPABASE_URL: present(env.supabaseUrl),
    SUPABASE_SERVICE_ROLE_KEY: present(env.serviceKey),
    APP_ENC_KEY: present(env.appEncKey),
    SESSION_SECRET: present(env.sessionSecret),
    CRON_SECRET: true,
    APP_URL: present(process.env.APP_URL ?? ''),
    MAIL_HOST: present(process.env.MAIL_HOST ?? ''),
    MAIL_USERNAME: present(process.env.MAIL_USERNAME ?? ''),
    MAIL_PASSWORD: present(process.env.MAIL_PASSWORD ?? ''),
    MAIL_FROM_ADDRESS: present(process.env.MAIL_FROM_ADDRESS ?? ''),
  };
  const out: Record<string, unknown> = { appUrl: env.appUrl, settings };

  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e) { out[name] = 'ERROR: ' + ((e as Error).message || JSON.stringify(e)).slice(0, 300); }
  };
  await step('database', async () => {
    const [{ n }] = await db.rows<{ n: string }>('SELECT count(*)::text AS n FROM public.item');
    return `ok (${n} items)`;
  });
  await step('migration_002', async () => {
    const v = await db.value(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'email_verified_at'`);
    return v !== null ? 'applied' : 'MISSING: run 002_email_verification.sql in the Supabase SQL Editor';
  });
  await step('migration_003', async () => {
    const v = await db.value(`SELECT to_regclass('public.item_photo')::text`);
    return v ? 'applied' : 'MISSING: run 003_item_photo_table.sql in the Supabase SQL Editor (item photos cannot be saved without it)';
  });
  await step('storage', async () => {
    if (!env.supabaseUrl || !env.serviceKey) return 'not configured (optional: only needed for the daily backup files)';
    const { data, error } = await supabase().storage.listBuckets();
    if (error) throw new Error(error.message || JSON.stringify(error));
    const names = (data ?? []).map((b) => b.name);
    return { buckets: names, itemBucket: names.includes(env.itemBucket), backupBucket: names.includes(env.backupBucket) };
  });
  return Response.json(out);
}
