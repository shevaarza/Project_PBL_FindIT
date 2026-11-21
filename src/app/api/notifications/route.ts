import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { csrfOk, json, readForm, str } from '@/lib/http';
import * as Notify from '@/lib/notify';
import { iconSvg } from '@/lib/icons';

/**
 * JSON endpoint behind the notification bell (port of notifications-api.php).
 *   GET  ?action=summary&since=<id>   unread count, dropdown HTML, new items for a toast
 *   POST action=mark_read id=<id> | action=mark_all   (CSRF token: header X-CSRF-Token or field csrf_token)
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return json(401, { ok: false, error: 'signed_out' });
  if (user.role !== 'student' || user.id < 1) return json(403, { ok: false, error: 'forbidden' });
  try {
    const s = new URL(req.url).searchParams.get('since') ?? '';
    const since = /^\d+$/.test(s) ? parseInt(s, 10) : 0;
    let html = '';
    for (const n of await Notify.recent(db, user.id)) html += Notify.renderItem(n, 'menu');
    const toasts = (await Notify.unreadSince(db, user.id, since)).reverse().map((n) => ({
      id: n.id, title: n.title, message: n.message, severity: n.severity, icon: iconSvg(n.icon, 20), url: Notify.openUrl(n.id),
    }));
    return json(200, { ok: true, unread: await Notify.unreadCount(db, user.id), latest_id: await Notify.latestId(db, user.id), html, toasts });
  } catch (e) {
    console.error('[FindIT] Notification API failed: ' + (e as Error).message);
    return json(500, { ok: false, error: 'server' });
  }
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return json(401, { ok: false, error: 'signed_out' });
  if (user.role !== 'student' || user.id < 1) return json(403, { ok: false, error: 'forbidden' });
  try {
    const fd = await readForm(req);
    if (!(await csrfOk(req, fd))) return json(403, { ok: false, error: 'csrf' });
    const action = str(fd, 'action');
    if (action === 'mark_read') {
      const raw = str(fd, 'id');
      const id = /^\d+$/.test(raw) ? parseInt(raw, 10) : 0;
      if (id < 1) return json(400, { ok: false, error: 'bad_id' });
      await Notify.markRead(db, user.id, id);
    } else if (action === 'mark_all') {
      await Notify.markAllRead(db, user.id);
    } else {
      return json(400, { ok: false, error: 'bad_action' });
    }
    return json(200, { ok: true, unread: await Notify.unreadCount(db, user.id) });
  } catch (e) {
    console.error('[FindIT] Notification API failed: ' + (e as Error).message);
    return json(500, { ok: false, error: 'server' });
  }
}
