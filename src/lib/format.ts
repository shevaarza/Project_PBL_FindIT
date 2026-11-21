import { env } from './env';

export function fiOr(value: unknown, fallback = 'Not provided'): string {
  const t = String(value ?? '').trim();
  return t !== '' ? t : fallback;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Parse a DB value. Date-only values stay as written; timestamps are UTC on Supabase and shown in APP_TIMEZONE. */
function parts(value: unknown): { d: number; m: number; y: number; hh: number; mm: number } | null {
  const t = String(value ?? '').trim();
  if (!t) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (dateOnly) return { y: +dateOnly[1], m: +dateOnly[2], d: +dateOnly[3], hh: 0, mm: 0 };
  const iso = t.includes('T') ? t : t.replace(' ', 'T');
  const hasZone = /([zZ]|[+-]\d{2}(:?\d{2})?)$/.test(iso);
  const date = new Date(hasZone ? iso : iso + 'Z');
  if (isNaN(date.getTime())) return null;
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: env.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (k: string) => parseInt(f.find((p) => p.type === k)?.value ?? '0', 10);
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') };
}

export function fiDate(value: unknown, fallback = 'Not specified'): string {
  const t = String(value ?? '').trim();
  if (!t) return fallback;
  const p = parts(t);
  return p ? `${pad(p.d)} ${MONTHS[p.m - 1]} ${p.y}` : t;
}

export function fiDateTime(value: unknown, fallback = 'Not available'): string {
  const t = String(value ?? '').trim();
  if (!t) return fallback;
  const p = parts(t);
  return p ? `${pad(p.d)} ${MONTHS[p.m - 1]} ${p.y}, ${pad(p.hh)}:${pad(p.mm)}` : t;
}

export function fiStatusClass(status: unknown): string {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'ditemukan': case 'disetujui': case 'approved':
      return 'fi-badge--success';
    case 'menunggu verifikasi': case 'menunggu': case 'pending':
      return 'fi-badge--warning';
    case 'ditolak': case 'rejected':
      return 'fi-badge--danger';
    case 'diklaim': case 'selesai': case 'claimed':
      return 'fi-badge--info';
    default:
      return 'fi-badge--neutral';
  }
}

/** Escape for the few places HTML is built as a string (notification dropdown, polling API). */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
