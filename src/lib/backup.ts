import { randomBytes } from 'node:crypto';
import { db, tx, type Db } from './db';
import { env } from './env';
import { supabase } from './photos';
import {
  TABLES, DB_NAME, confirmMatches, packSnapshot, unpackSnapshot, sha256Hex, stamp, countsOf, totalRows,
  BackupFormatError, type TableRows,
} from './backup-core';

export { DB_NAME, confirmMatches, fmtBytes } from './backup-core';

export type RunKind = 'daily' | 'manual' | 'pre-restore' | 'restore';

export interface RunRow {
  id: string; kind: RunKind; status: string; remote_status: string | null; trigger_by: string | null; file: string | null;
  size_bytes: number | null; sha256: string | null; table_counts: Record<string, number> | null; message: string | null;
  created_at: string; finished_at: string | null; file_deleted: boolean;
}

const STALE_MINUTES = 10;
const COLS = `id, kind, status, remote_status, trigger_by, file, size_bytes, sha256, table_counts, message, created_at, finished_at, file_deleted`;

const folderOf = (kind: RunKind) => (kind === 'pre-restore' ? 'pre-restore' : kind === 'manual' ? 'manual' : 'daily');
const safeMessage = (e: unknown) => String((e as Error)?.message ?? e).replace(/(postgres(ql)?:\/\/)[^\s]+/gi, '$1***').slice(0, 300);

/** A run that stayed RUNNING for more than 10 minutes was stopped by the platform: mark it FAILED. */
async function reapStale(d: Db = db) {
  await d.query(
    `UPDATE public.backup_run SET status = 'FAILED', finished_at = CURRENT_TIMESTAMP,
            message = 'The run did not finish (stopped by the server) and was closed automatically.'
     WHERE status = 'RUNNING' AND created_at < CURRENT_TIMESTAMP - make_interval(mins => $1::int)`, [STALE_MINUTES]);
}

/** Start a run only if no other backup/restore is running (one insert decides, so two requests cannot both win). */
async function acquire(kind: RunKind, by: string, file: string | null): Promise<string | null> {
  await reapStale();
  const id = `${kind}-${stamp()}-${randomBytes(2).toString('hex')}`;
  const r = await db.query(
    `INSERT INTO public.backup_run (id, kind, status, remote_status, trigger_by, file)
     SELECT $1, $2, 'RUNNING', 'NOT_CONFIGURED', $3, $4
     WHERE NOT EXISTS (SELECT 1 FROM public.backup_run WHERE status = 'RUNNING')`,
    [id, kind, by, file]);
  return r.rowCount === 1 ? id : null;
}

async function fail(id: string, message: string) {
  try {
    await db.query(`UPDATE public.backup_run SET status = 'FAILED', message = $2, finished_at = CURRENT_TIMESTAMP WHERE id = $1`, [id, message]);
  } catch (e) { console.error('[FindIT] Could not record the failed run: ' + safeMessage(e)); }
}

/** Every public table, exactly as stored (encrypted columns stay ciphertext), from one consistent snapshot. */
async function exportTables(): Promise<TableRows> {
  return tx(async (t) => {
    await t.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const out: TableRows = {};
    for (const tbl of TABLES) out[tbl.name] = await t.rows(`SELECT * FROM ${tbl.sql}`);
    return out;
  });
}

export interface RunResult { status: 'SUCCESS' | 'FAILED' | 'BUSY'; id?: string; message: string }

export async function runBackup(kind: 'daily' | 'manual' | 'pre-restore', by: string): Promise<RunResult> {
  const id = await acquire(kind, by, null);
  if (!id) return { status: 'BUSY', message: 'Another backup or restore is running.' };
  try {
    const tables = await exportTables();
    const { data, counts } = packSnapshot(tables);

    // Prove the file can be read back before we call it a backup.
    const check = unpackSnapshot(data);
    if (JSON.stringify(check.counts) !== JSON.stringify(counts)) throw new BackupFormatError('The saved copy did not match the data.');

    const path = `${folderOf(kind)}/findit_${stamp()}.bak`;
    const { error } = await supabase().storage.from(env.backupBucket).upload(path, data, { contentType: 'application/octet-stream', upsert: false });
    if (error) throw new Error('Upload to storage failed: ' + error.message);

    await db.query(
      `UPDATE public.backup_run SET status = 'SUCCESS', file = $2, size_bytes = $3, sha256 = $4, table_counts = $5::jsonb,
              message = $6, finished_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, path, data.length, sha256Hex(data), JSON.stringify(counts), `${totalRows(counts)} rows saved.`]);

    if (kind === 'daily') await applyRetention();
    return { status: 'SUCCESS', id, message: 'Backup finished and stored in Supabase Storage.' };
  } catch (e) {
    console.error('[FindIT] Backup failed: ' + safeMessage(e));
    await fail(id, safeMessage(e));
    return { status: 'FAILED', id, message: 'The backup failed. See the history below for the reason.' };
  }
}

/** Daily backups older than BACKUP_KEEP_DAYS are deleted (file + marked in the log). */
export async function applyRetention(): Promise<string[]> {
  const old = await db.rows<{ id: string; file: string }>(
    `SELECT id, file FROM public.backup_run
     WHERE kind = 'daily' AND file IS NOT NULL AND file_deleted = FALSE
       AND created_at < CURRENT_TIMESTAMP - make_interval(days => $1::int)`, [env.keepDays]);
  const removed: string[] = [];
  for (const r of old) {
    const { error } = await supabase().storage.from(env.backupBucket).remove([r.file]);
    if (error) { console.error('[FindIT] Retention could not delete ' + r.file + ': ' + error.message); continue; }
    await db.query('UPDATE public.backup_run SET file_deleted = TRUE WHERE id = $1', [r.id]);
    removed.push(r.file);
  }
  return removed;
}

// ------------------------------------------------------------------ reading

export const history = (limit = 100) =>
  db.rows<RunRow>(`SELECT ${COLS} FROM public.backup_run ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(500, limit))}`);

export const candidates = () =>
  db.rows<RunRow>(
    `SELECT ${COLS} FROM public.backup_run
     WHERE file IS NOT NULL AND file_deleted = FALSE AND status IN ('SUCCESS','PARTIAL_SUCCESS') AND kind IN ('daily','manual','pre-restore')
     ORDER BY created_at DESC LIMIT 100`);

export const findRun = (id: string) =>
  db.one<RunRow>(`SELECT ${COLS} FROM public.backup_run WHERE id = $1`, [id]);

export const lastRestore = () =>
  db.one<RunRow>(`SELECT ${COLS} FROM public.backup_run WHERE kind = 'restore' ORDER BY created_at DESC LIMIT 1`);

export async function summary() {
  await reapStale();
  const last = await db.one<RunRow>(`SELECT ${COLS} FROM public.backup_run WHERE kind IN ('daily','manual') ORDER BY created_at DESC LIMIT 1`);
  const c = await db.one(
    `SELECT COUNT(*) AS total, COALESCE(SUM(size_bytes), 0) AS bytes, COUNT(*) FILTER (WHERE kind = 'daily') AS daily
     FROM public.backup_run WHERE file IS NOT NULL AND file_deleted = FALSE AND status IN ('SUCCESS','PARTIAL_SUCCESS')`) ?? {};
  const running = (await db.value('SELECT 1 FROM public.backup_run WHERE status = \'RUNNING\' LIMIT 1')) !== null;
  const warnings: string[] = [];
  if (!env.cronSecret) warnings.push('CRON_SECRET is not set, so the automatic daily backup (Vercel Cron) cannot run.');
  if (!env.appEncKey) warnings.push('APP_ENC_KEY is not set. Backups cannot be made or read without it.');
  return {
    last, running, warnings,
    counts: { total: Number(c.total ?? 0), bytes: Number(c.bytes ?? 0), daily: Number(c.daily ?? 0) },
  };
}

/** Is the database reachable and holding data? (the PHP page showed the database state here) */
export async function databaseState(): Promise<{ state: 'HEALTHY' | 'MISSING'; message: string }> {
  try {
    const counts: Record<string, number> = {};
    for (const t of TABLES) counts[t.name] = Number(await db.value(`SELECT COUNT(*) FROM ${t.sql}`) ?? 0);
    return { state: 'HEALTHY', message: `Reachable. ${totalRows(counts)} rows in ${TABLES.length} tables.` };
  } catch (e) {
    console.error('[FindIT] Database state check failed: ' + safeMessage(e));
    return { state: 'MISSING', message: 'The database cannot be reached or its tables are missing.' };
  }
}

// ------------------------------------------------------------------ files

async function download(path: string): Promise<Buffer> {
  const { data, error } = await supabase().storage.from(env.backupBucket).download(path);
  if (error || !data) throw new Error('The backup file could not be downloaded from storage.');
  return Buffer.from(await data.arrayBuffer());
}

/** Raw encrypted file for the Download button (never decrypted by the server for this). */
export async function readBackupFile(run: RunRow): Promise<Buffer> {
  if (!run.file || run.file_deleted) throw new Error('This backup file is no longer available.');
  return download(run.file);
}

async function loadSnapshot(run: RunRow) {
  if (!run.file || run.file_deleted) throw new BackupFormatError('This backup file is no longer available.');
  const data = await download(run.file);
  if (run.sha256 && sha256Hex(data) !== run.sha256) throw new BackupFormatError('The checksum does not match: the file was changed or damaged.');
  return unpackSnapshot(data);
}

export interface RestoreResult { status: 'SUCCESS' | 'FAILED' | 'BUSY'; message: string; counts?: Record<string, number> }

/** "Test restore": download, verify checksum, decrypt, parse and compare counts. Writes nothing to the data tables. */
export async function testRestore(run: RunRow, by: string): Promise<RestoreResult> {
  const id = await acquire('restore', `${by} (test)`, run.file);
  if (!id) return { status: 'BUSY', message: 'Another backup or restore is running. Try again in a moment.' };
  try {
    const snap = await loadSnapshot(run);
    const counts = countsOf(snap.tables);
    const message = `Restore test passed for ${run.file}: ${totalRows(counts)} rows in ${TABLES.length} tables. Nothing was changed.`;
    await db.query(`UPDATE public.backup_run SET status = 'SUCCESS', message = $2, table_counts = $3::jsonb, finished_at = CURRENT_TIMESTAMP WHERE id = $1`, [id, message, JSON.stringify(counts)]);
    return { status: 'SUCCESS', message, counts };
  } catch (e) {
    const m = e instanceof BackupFormatError ? e.message : 'The restore test failed: ' + safeMessage(e);
    await fail(id, m);
    return { status: 'FAILED', message: m };
  }
}

/**
 * Real restore. The admin must type the database name. A safety backup is made first; then ONE transaction
 * empties every table and loads the backup, and identity counters are moved past the highest id.
 * If anything fails the transaction rolls back and the current data stays as it was.
 */
export async function restoreRun(run: RunRow, confirm: string, by: string): Promise<RestoreResult> {
  if (!env.restoreWebEnabled) return { status: 'FAILED', message: 'Restoring from this page is switched off (RESTORE_WEB_ENABLED=false).' };
  if (!confirmMatches(confirm)) {
    return { status: 'FAILED', message: `The confirmation text does not match the database name "${DB_NAME}". Type exactly ${DB_NAME} and try again. Nothing was changed.` };
  }

  // Check the file first, so a bad file never triggers the replacement.
  let snap;
  try { snap = await loadSnapshot(run); }
  catch (e) { return { status: 'FAILED', message: e instanceof BackupFormatError ? e.message + ' Nothing was changed.' : 'The backup file could not be read. Nothing was changed.' }; }

  const safety = await runBackup('pre-restore', by);
  if (safety.status === 'BUSY') return { status: 'BUSY', message: 'Another backup or restore is running. Try again in a moment.' };
  if (safety.status !== 'SUCCESS') return { status: 'FAILED', message: 'The safety copy of the current data could not be made, so nothing was changed.' };

  const id = await acquire('restore', by, run.file);
  if (!id) return { status: 'BUSY', message: 'Another backup or restore is running. Try again in a moment.' };

  try {
    await tx(async (t) => {
      for (const tbl of [...TABLES].reverse()) await t.query(`DELETE FROM ${tbl.sql}`);
      for (const tbl of TABLES) {
        const rows = snap.tables[tbl.name];
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]).map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
        await t.query(
          `INSERT INTO ${tbl.sql} (${cols}) OVERRIDING SYSTEM VALUE SELECT ${cols} FROM json_populate_recordset(null::${tbl.sql}, $1::json)`,
          [JSON.stringify(rows)]);
      }
      for (const tbl of TABLES) {
        for (const col of tbl.identity) {
          await t.query(
            `SELECT setval(pg_get_serial_sequence($1, $2), GREATEST(COALESCE(MAX("${col}"), 1), 1), MAX("${col}") IS NOT NULL) FROM ${tbl.sql}`,
            [tbl.sql, col]);
        }
      }
    });
    const counts = countsOf(snap.tables);
    const message = `Restored ${run.file} (${totalRows(counts)} rows). A safety copy of the previous data was saved first.`;
    await db.query(`UPDATE public.backup_run SET status = 'SUCCESS', message = $2, table_counts = $3::jsonb, finished_at = CURRENT_TIMESTAMP WHERE id = $1`, [id, message, JSON.stringify(counts)]);
    return { status: 'SUCCESS', message, counts };
  } catch (e) {
    console.error('[FindIT] Restore failed: ' + safeMessage(e));
    const m = 'The restore failed and was rolled back: the current data was not changed. ' + safeMessage(e);
    await fail(id, m);
    return { status: 'FAILED', message: m };
  }
}
