import type { Db } from './db';
import { Crypto } from './crypto';
import { esc, fiDateTime } from './format';
import { iconSvg } from './icons';

export const PAGE_SIZE = 10;
export const DROPDOWN_SIZE = 6;
export const FILTERS = ['all', 'claims', 'items'] as const;

const TYPES: Record<string, { label: string; severity: string; icon: string }> = {
  claim_approved: { label: 'Claim approved', severity: 'success', icon: 'check-circle' },
  claim_rejected: { label: 'Claim rejected', severity: 'danger', icon: 'x-circle' },
  claim_review: { label: 'Under review', severity: 'warning', icon: 'clock' },
  item_claimed: { label: 'Item returned', severity: 'success', icon: 'package' },
  general: { label: 'Update', severity: 'info', icon: 'info' },
};

export const meta = (type: string) => TYPES[type] ?? TYPES.general;

/**
 * Only plain internal pages are allowed as a destination, e.g. "my-claims#claim-12" or "item-detail?id=5".
 * (Old rows saved with ".php" are mapped to the new route names.)
 */
export function safeLink(link: string | null | undefined): string | null {
  let l = String(link ?? '').trim();
  if (!l || l.length > 255) return null;
  if (!/^[a-z][a-z0-9_-]*(\.php)?(\?[A-Za-z0-9_=&-]*)?(#[A-Za-z0-9_-]+)?$/.test(l)) return null;
  l = l.replace(/\.php(?=[?#]|$)/, '');
  return l;
}

export function ago(seconds: number, fallbackDate = ''): string {
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' h ago';
  if (seconds < 7 * 86400) return Math.floor(seconds / 86400) + ' d ago';
  return fallbackDate !== '' ? fallbackDate : Math.floor(seconds / 86400) + ' d ago';
}

const SELECT = `
  SELECT id_notification, id_claim, id_item, type, severity, title, message,
         link, is_read, created_at,
         GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::bigint) AS age_seconds
  FROM public.notification`;

export interface Presented {
  id: number; type: string; type_label: string; severity: string; icon: string;
  title: string; message: string; link: string | null; is_read: boolean; ago: string; created: string;
}

export interface CreateData {
  user_id: number; claim_id?: number | null; item_id?: number | null; type: string;
  title: string; message: string; link?: string | null; dedupe_key?: string | null;
}

/**
 * Save one notification. Call it inside the same transaction as the event. A savepoint keeps a notification
 * problem from undoing the claim or the admin's decision it belongs to. Returns false for a duplicate event.
 */
export async function createNotification(db: Db, d: CreateData): Promise<boolean> {
  if (!(d.user_id >= 1)) return false;
  const type = TYPES[d.type] ? d.type : 'general';
  const m = meta(type);
  const inTx = db.inTransaction;
  try {
    if (inTx) await db.query('SAVEPOINT fi_notify');
    const r = await db.query(
      `INSERT INTO public.notification (id_user, id_claim, id_item, type, severity, title, message, link, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id_user, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [
        d.user_id, d.claim_id || null, d.item_id || null, type, m.severity,
        Crypto.protect('title', [...d.title].slice(0, 150).join('')),
        Crypto.protect('message', [...d.message].slice(0, 1000).join('')),
        safeLink(d.link ?? null),
        d.dedupe_key ? String(d.dedupe_key).slice(0, 120) : null,
      ],
    );
    if (inTx) await db.query('RELEASE SAVEPOINT fi_notify');
    return r.rowCount === 1;
  } catch (e) {
    if (inTx) { try { await db.query('ROLLBACK TO SAVEPOINT fi_notify'); } catch { /* caller will roll back */ } }
    console.error('[FindIT] Notification could not be saved: ' + (e as Error).message);
    return false;
  }
}

export function present(row: Record<string, any>): Presented {
  let type = String(row.type ?? 'general');
  const title = String(row.title ?? '');
  if (type === 'general') {
    if (/approved/i.test(title)) type = 'claim_approved';
    else if (/rejected/i.test(title)) type = 'claim_rejected';
  }
  const m = meta(type);
  const claimId = Number(row.id_claim ?? 0);
  const itemId = Number(row.id_item ?? 0);
  let link = safeLink(row.link);
  if (link === null && claimId > 0) link = 'my-claims#claim-' + claimId;
  else if (link === null && itemId > 0) link = 'item-detail?id=' + itemId;
  const created = String(row.created_at ?? '');
  return {
    id: Number(row.id_notification), type, type_label: m.label, severity: m.severity, icon: m.icon,
    title, message: String(row.message ?? ''), link, is_read: Boolean(row.is_read),
    ago: ago(Number(row.age_seconds ?? 0), created ? fiDateTime(created).split(',')[0] : ''),
    created: created ? fiDateTime(created) : '',
  };
}

export const unreadCount = async (db: Db, u: number) =>
  Number(await db.value('SELECT COUNT(*) FROM public.notification WHERE id_user = $1 AND is_read = FALSE', [u]) ?? 0);

export const latestId = async (db: Db, u: number) =>
  Number(await db.value('SELECT COALESCE(MAX(id_notification), 0) FROM public.notification WHERE id_user = $1', [u]) ?? 0);

export async function recent(db: Db, u: number, limit = DROPDOWN_SIZE): Promise<Presented[]> {
  const rows = await db.rows(`${SELECT} WHERE id_user = $1 ORDER BY created_at DESC, id_notification DESC LIMIT ${Math.max(1, Math.min(20, limit))}`, [u]);
  return Crypto.decryptRows(rows).map(present);
}

export async function unreadSince(db: Db, u: number, since: number, limit = 3): Promise<Presented[]> {
  const rows = await db.rows(
    `${SELECT} WHERE id_user = $1 AND is_read = FALSE AND id_notification > $2 ORDER BY id_notification DESC LIMIT ${Math.max(1, Math.min(5, limit))}`, [u, since]);
  return Crypto.decryptRows(rows).map(present);
}

function filterSql(filter: string): string {
  switch (filter) {
    case 'unread': return ' AND is_read = FALSE';
    case 'claims': return " AND (type LIKE 'claim\\_%' OR (type = 'general' AND id_claim IS NOT NULL))";
    case 'items': return " AND type LIKE 'item\\_%'";
    default: return '';
  }
}

export async function page(db: Db, u: number, filterIn: string, pageIn: number) {
  const filter = (FILTERS as readonly string[]).includes(filterIn) ? filterIn : 'all';
  const where = ' WHERE id_user = $1' + filterSql(filter);
  const total = Number(await db.value('SELECT COUNT(*) FROM public.notification' + where, [u]) ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pg = Math.max(1, Math.min(pageIn, pages));
  const rows = await db.rows(`${SELECT}${where} ORDER BY created_at DESC, id_notification DESC LIMIT ${PAGE_SIZE} OFFSET ${(pg - 1) * PAGE_SIZE}`, [u]);
  return { rows: Crypto.decryptRows(rows).map(present), total, pages, page: pg, filter };
}

export async function counts(db: Db, u: number) {
  const r = await db.one(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_read = FALSE) AS unread,
            COUNT(*) FILTER (WHERE type LIKE 'claim\\_%' OR (type = 'general' AND id_claim IS NOT NULL)) AS claims,
            COUNT(*) FILTER (WHERE type LIKE 'item\\_%') AS items
     FROM public.notification WHERE id_user = $1`, [u]) ?? {};
  return { all: Number(r.total ?? 0), unread: Number(r.unread ?? 0), claims: Number(r.claims ?? 0), items: Number(r.items ?? 0) };
}

export async function findOwn(db: Db, u: number, id: number): Promise<Presented | null> {
  const row = await db.one(`${SELECT} WHERE id_notification = $1 AND id_user = $2`, [id, u]);
  return row ? present(Crypto.decryptRow(row)) : null;
}

export async function markRead(db: Db, u: number, id: number): Promise<boolean> {
  const r = await db.query(
    `UPDATE public.notification SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id_notification = $1 AND id_user = $2 AND is_read = FALSE`, [id, u]);
  return r.rowCount === 1;
}

export async function markAllRead(db: Db, u: number): Promise<number> {
  const r = await db.query(
    `UPDATE public.notification SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id_user = $1 AND is_read = FALSE`, [u]);
  return r.rowCount;
}

export const openUrl = (id: number) => 'notifications?open=' + id;

/** HTML for one notification (page, dropdown and polling endpoint all use it). Every value is escaped. */
export function renderItem(n: Presented, mode: 'menu' | 'page' = 'menu'): string {
  const unread = !n.is_read;
  let html = `<li class="fi-notif fi-notif--${esc(n.severity)}${unread ? ' is-unread' : ''}${mode === 'page' ? ' fi-notif--page' : ''}" data-notif-id="${n.id}">`;
  html += `<a class="fi-notif-link" href="${esc(openUrl(n.id))}">`;
  html += `<span class="fi-notif-icon" aria-hidden="true">${iconSvg(n.icon, 20)}</span>`;
  html += '<span class="fi-notif-body"><span class="fi-notif-meta">';
  html += `<span class="fi-notif-type">${esc(n.type_label)}</span>`;
  html += `<time class="fi-notif-time" title="${n.created}">${esc(n.ago)}</time></span>`;
  html += `<span class="fi-notif-title">${esc(n.title)}</span>`;
  html += `<span class="fi-notif-msg">${esc(n.message)}</span>`;
  if (unread) html += '<span class="visually-hidden">Unread</span>';
  html += '</span></a>';
  if (mode === 'page' && n.link !== null) {
    html += `<div class="fi-notif-actions"><a class="btn btn-outline-secondary btn-sm" href="${esc(openUrl(n.id))}">Open</a></div>`;
  }
  return html + '</li>';
}
