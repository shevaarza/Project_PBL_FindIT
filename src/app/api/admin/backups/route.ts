import { currentUser } from '@/lib/session';
import { setFlash } from '@/lib/flash';
import { csrfOk, readForm, redirectTo, str } from '@/lib/http';
import * as Backup from '@/lib/backup';
import { env } from '@/lib/env';

export const maxDuration = 60;
const PAGE = '/admin/backups';

/** Admin: backup now (action=backup), restore test (action=test), real restore (action=restore) and file download (GET ?download=id). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== 'admin') return redirectTo(req, '/login');
  const fd = await readForm(req);
  const by = `admin#${user.id} ${user.name}`;
  const action = str(fd, 'action') || 'backup';
  const flash = async (kind: 'success' | 'error', message: string, to = PAGE) => {
    await setFlash(kind === 'success' ? { success: message } : { error: message });
    return redirectTo(req, to);
  };
  if (!(await csrfOk(req, fd))) return flash('error', 'The form expired. Please try again.');

  try {
    if (action === 'backup') {
      const r = await Backup.runBackup('manual', by);
      if (r.status === 'BUSY') return flash('error', 'Another backup or restore is running. Try again in a moment.');
      return r.status === 'SUCCESS'
        ? flash('success', 'Backup finished and stored in Supabase Storage.')
        : flash('error', 'The backup failed. ' + r.message);
    }
    const run = await Backup.findRun(str(fd, 'id'));
    if (!run) return flash('error', 'That backup file is not in the list any more. Reload the page and choose it again.');
    if (action === 'test') {
      const r = await Backup.testRestore(run, by);
      return flash(r.status === 'SUCCESS' ? 'success' : 'error', r.message);
    }
    if (action === 'restore') {
      if (!env.restoreWebEnabled) return flash('error', 'Restoring from this page is switched off (RESTORE_WEB_ENABLED=false).');
      const r = await Backup.restoreRun(run, str(fd, 'confirm'), by);
      return flash(r.status === 'SUCCESS' ? 'success' : 'error', r.message);
    }
  } catch (e) {
    console.error('[FindIT] Backup action failed: ' + (e as Error).message);
    return flash('error', 'The backup could not be started. Check the server logs.');
  }
  return flash('error', 'Unknown action.');
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const run = await Backup.findRun(new URL(req.url).searchParams.get('download') ?? '');
  if (!run) return new Response('Not found', { status: 404 });
  try {
    const data = await Backup.readBackupFile(run);
    const name = (run.file ?? 'backup.bak').split('/').pop()!;
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
  } catch { return new Response('Not available', { status: 404 }); }
}
