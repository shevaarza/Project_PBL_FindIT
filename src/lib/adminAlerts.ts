import type { Db } from './db';
import { esc } from './format';
import { iconSvg } from './icons';

export const OVERDUE_HOURS = 72;

export interface Alert {
  key: string; count: number; severity: 'danger' | 'warning' | 'info'; icon: string; label: string;
  title: string; message: string; link: string; action: string;
}

/** Live alerts for admins: claims waiting, new reports (24h), backup problems. Nothing is stored. */
export async function collectAlerts(db: Db): Promise<Alert[]> {
  const alerts: Alert[] = [];

  try {
    const row = await db.one(
      `SELECT COUNT(*) AS pending,
              COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') AS pending_new,
              COALESCE(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(created_at)))::bigint, 0) AS oldest_seconds,
              MIN(id_claim) AS first_id
       FROM public.claim WHERE status_klaim = 'Pending Verification'`);
    const pending = Number(row?.pending ?? 0);
    if (pending > 0) {
      const fresh = Number(row!.pending_new);
      const oldestHours = Math.floor(Number(row!.oldest_seconds) / 3600);
      const overdue = oldestHours >= OVERDUE_HOURS;
      const parts: string[] = [];
      if (fresh > 0) parts.push(fresh + ' submitted in the last 24 hours');
      if (oldestHours >= 24) parts.push('the oldest has waited ' + Math.floor(oldestHours / 24) + ' days');
      const msg = parts.length ? parts.join(', ') : '';
      alerts.push({
        key: 'claims-pending', count: pending, severity: overdue ? 'danger' : 'warning',
        icon: overdue ? 'alert-triangle' : 'clock', label: overdue ? 'Overdue' : 'Needs review',
        title: pending === 1 ? '1 claim is waiting for review' : pending + ' claims are waiting for review',
        message: msg ? msg.charAt(0).toUpperCase() + msg.slice(1) + '.' : 'Compare the evidence and approve or reject.',
        link: pending === 1 ? '/admin/claim-detail?id=' + Number(row!.first_id) : '/admin/claims', action: 'Review claims',
      });
    }
  } catch (e) { console.error('[FindIT] Admin alert (claims) failed: ' + (e as Error).message); }

  try {
    const n = Number(await db.value(`SELECT COUNT(*) FROM public.item WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'`) ?? 0);
    if (n > 0) {
      alerts.push({
        key: 'items-new', count: n, severity: 'info', icon: 'package', label: 'New reports',
        title: n === 1 ? '1 new found item reported' : n + ' new found items reported',
        message: 'Reported in the last 24 hours. Check the details look right.', link: '/admin/items', action: 'View items',
      });
    }
  } catch (e) { console.error('[FindIT] Admin alert (items) failed: ' + (e as Error).message); }

  const backup = await backupAlert(db);
  if (backup) alerts.push(backup);

  const rank = { danger: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

async function backupAlert(db: Db): Promise<Alert | null> {
  let run: Record<string, any> | null = null;
  try {
    run = await db.one(`SELECT status, remote_status FROM public.backup_run WHERE kind IN ('daily','manual') ORDER BY created_at DESC LIMIT 1`);
  } catch { return null; }
  if (!run) return null;
  if (run.status === 'FAILED') {
    return { key: 'backup-failed', count: 1, severity: 'danger', icon: 'database', label: 'Backup failed', title: 'The latest backup failed',
      message: 'No new backup was saved. Open the backup page to see what happened and run it again.', link: '/admin/backups', action: 'Open backups' };
  }
  if (run.status === 'PARTIAL_SUCCESS' && !['NOT_CONFIGURED', 'SKIPPED'].includes(String(run.remote_status ?? ''))) {
    return { key: 'backup-partial', count: 1, severity: 'warning', icon: 'database', label: 'Backup incomplete', title: 'The latest backup has only one copy',
      message: 'It was saved locally, but the second copy was not confirmed.', link: '/admin/backups', action: 'Open backups' };
  }
  return null;
}

export function renderAlertItem(a: Alert, mode: 'menu' | 'card' = 'menu'): string {
  let html = `<li class="fi-notif fi-notif--${esc(a.severity)}${mode === 'card' ? ' fi-notif--page' : ''} is-alert" data-alert-key="${esc(a.key)}">`;
  html += `<a class="fi-notif-link" href="${esc(a.link)}"><span class="fi-notif-icon" aria-hidden="true">${iconSvg(a.icon, 20)}</span><span class="fi-notif-body">`;
  html += `<span class="fi-notif-meta"><span class="fi-notif-type">${esc(a.label)}</span></span>`;
  html += `<span class="fi-notif-title">${esc(a.title)}</span><span class="fi-notif-msg">${esc(a.message)}</span></span></a>`;
  if (mode === 'card') html += `<div class="fi-notif-actions"><a class="btn btn-outline-secondary btn-sm" href="${esc(a.link)}">${esc(a.action)}</a></div>`;
  return html + '</li>';
}

export function alertSummary(alerts: Alert[]): { count: number; severity: 'danger' | 'warning' | 'info' } {
  let severity: 'danger' | 'warning' | 'info' = 'info';
  for (const a of alerts) {
    if (a.severity === 'danger') { severity = 'danger'; break; }
    if (a.severity === 'warning') severity = 'warning';
  }
  return { count: alerts.filter((a) => a.severity !== 'info').length, severity };
}
