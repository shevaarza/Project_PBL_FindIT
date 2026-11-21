import { Pool, types, type PoolClient } from 'pg';
import { env } from './env';

// Return dates and timestamps as plain strings (like PHP/PDO did) and bigint as number.
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1114, (v) => v); // timestamp
types.setTypeParser(1184, (v) => v); // timestamptz

type Row = Record<string, any>;

const g = globalThis as unknown as { __finditPool?: Pool };

export function pool(): Pool {
  if (!g.__finditPool) {
    if (!env.databaseUrl) throw new Error('DATABASE_URL is not set.');
    g.__finditPool = new Pool({
      connectionString: env.databaseUrl,
      ssl: process.env.DB_SSL === "off" ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return g.__finditPool;
}

/** Minimal PDO-like handle: run a query, get rows. Used both on the pool and inside a transaction. */
export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  rows<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  value<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
  /** true while inside BEGIN ... COMMIT */
  inTransaction: boolean;
}

function wrap(runner: { query: (sql: string, params?: unknown[]) => Promise<any> }, inTx: boolean): Db {
  const query = async (sql: string, params: unknown[] = []) => {
    const r = await runner.query(sql, params);
    return { rows: r.rows ?? [], rowCount: r.rowCount ?? 0 };
  };
  return {
    inTransaction: inTx,
    query: query as Db['query'],
    rows: (async (sql: string, params?: unknown[]) => (await query(sql, params)).rows) as Db['rows'],
    one: (async (sql: string, params?: unknown[]) => (await query(sql, params)).rows[0] ?? null) as Db['one'],
    value: (async (sql: string, params?: unknown[]) => {
      const row = (await query(sql, params)).rows[0];
      return row ? (Object.values(row)[0] as any) : null;
    }) as Db['value'],
  };
}

export const db: Db = wrap({ query: (s, p) => pool().query(s, p as any[]) }, false);

/** Run `fn` in one transaction (BEGIN/COMMIT, ROLLBACK on error). Use `FOR UPDATE` like the PHP version did. */
export async function tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(wrap(client, true));
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection already unusable */ }
    throw e;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}
