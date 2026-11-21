import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Crypto } from './crypto';

/** Pure backup helpers (no database, no network) so they can be unit-tested. */

export const DB_NAME = 'FindIT';

/** Insert order is FK-safe (parents first); delete order is the reverse. */
export const TABLES = [
  { name: 'category', sql: 'public.category', identity: ['id_category'] },
  { name: 'location', sql: 'public.location', identity: ['id_location'] },
  { name: 'admin', sql: 'public.admin', identity: ['id_admin'] },
  { name: 'User', sql: 'public."User"', identity: ['id_user'] },
  { name: 'item', sql: 'public.item', identity: ['kode_laporan', 'id_item'] },
  { name: 'claim', sql: 'public.claim', identity: ['id_claim'] },
  { name: 'notification', sql: 'public.notification', identity: ['id_notification'] },
  { name: 'password_resets', sql: 'public.password_resets', identity: ['id_reset'] },
  { name: 'pickup_token', sql: 'public.pickup_token', identity: ['id_pickup'] },
  { name: 'user_photo', sql: 'public.user_photo', identity: [] as string[] },
] as const;

export type TableRows = Record<string, Record<string, unknown>[]>;

export interface Snapshot {
  format: 'findit-backup';
  version: 1;
  created_at: string;
  tables: TableRows;
  counts: Record<string, number>;
}

/** The admin types the database name; spaces and letter case are ignored (like the PHP version). */
export const normalizeConfirm = (s: string) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
export const confirmMatches = (typed: string) => normalizeConfirm(typed) === normalizeConfirm(DB_NAME);

export const sha256Hex = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** YYYYMMDD_HHMMSS in UTC. */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function countsOf(tables: TableRows): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t.name] = (tables[t.name] ?? []).length;
  return out;
}

export const totalRows = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

/** snapshot -> JSON -> gzip -> AES-256-GCM (key derived from APP_ENC_KEY). Encrypted columns stay ciphertext inside. */
export function packSnapshot(tables: TableRows, createdAt = new Date()): { data: Buffer; counts: Record<string, number> } {
  const counts = countsOf(tables);
  const snap: Snapshot = { format: 'findit-backup', version: 1, created_at: createdAt.toISOString(), tables, counts };
  const gz = gzipSync(Buffer.from(JSON.stringify(snap), 'utf8'), { level: 9 });
  return { data: Crypto.sealBytes(gz, 'backup'), counts };
}

export class BackupFormatError extends Error {}

export function unpackSnapshot(data: Buffer): Snapshot {
  let gz: Buffer;
  try {
    gz = Crypto.openBytes(data, 'backup');
  } catch {
    throw new BackupFormatError('The file could not be decrypted. It is damaged, or APP_ENC_KEY is not the key that made it.');
  }
  let snap: Snapshot;
  try {
    snap = JSON.parse(gunzipSync(gz).toString('utf8')) as Snapshot;
  } catch {
    throw new BackupFormatError('The backup content is damaged.');
  }
  const problem = validateSnapshot(snap);
  if (problem) throw new BackupFormatError(problem);
  return snap;
}

/** Returns null when the snapshot is consistent, or a message. */
export function validateSnapshot(snap: Snapshot): string | null {
  if (!snap || snap.format !== 'findit-backup' || snap.version !== 1 || typeof snap.tables !== 'object' || !snap.tables) {
    return 'This is not a FindIT backup file.';
  }
  for (const t of TABLES) {
    const rows = snap.tables[t.name];
    if (!Array.isArray(rows)) return `The backup has no data for table "${t.name}".`;
    if (snap.counts?.[t.name] !== rows.length) return `Row count mismatch in table "${t.name}".`;
  }
  return null;
}

/** Same look as the PHP fiBytes(). */
export function fmtBytes(bytes: unknown): string {
  let b = Number(bytes) || 0;
  for (const unit of ['B', 'KB', 'MB', 'GB']) {
    if (b < 1024 || unit === 'GB') return (unit === 'B' ? String(Math.trunc(b)) : b.toFixed(1)) + ' ' + unit;
    b /= 1024;
  }
  return '';
}
