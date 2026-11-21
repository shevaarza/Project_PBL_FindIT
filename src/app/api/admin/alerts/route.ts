import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { json } from '@/lib/http';
import { iconSvg } from '@/lib/icons';
import { alertSummary, collectAlerts, renderAlertItem } from '@/lib/adminAlerts';

/** JSON behind the admin bell (port of admin/alerts-api.php). GET only; admins only. */
export async function GET() {
  const user = await currentUser();
  if (!user) return json(401, { ok: false, error: 'signed_out' });
  if (user.role !== 'admin') return json(403, { ok: false, error: 'forbidden' });
  try {
    const alerts = await collectAlerts(db);
    const summary = alertSummary(alerts);
    return json(200, {
      ok: true, unread: summary.count, severity: summary.severity === 'danger' ? 'danger' : 'warning',
      html: alerts.map((a) => renderAlertItem(a, 'menu')).join(''),
      toasts: alerts.map((a) => ({ key: a.key, count: a.count, title: a.title, message: a.message, severity: a.severity, icon: iconSvg(a.icon, 20), url: a.link })),
    });
  } catch (e) {
    console.error('[FindIT] Admin alerts API failed: ' + (e as Error).message);
    return json(500, { ok: false, error: 'server' });
  }
}
