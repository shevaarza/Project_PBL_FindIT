import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { env } from './env';

/**
 * Field-level encryption, byte-compatible with the old PHP app (app/helpers/crypto.php):
 * AES-256-GCM, stored as  enc:v1:<base64( iv(12) | tag(16) | ciphertext )>,
 * column name bound in as AAD, sub-keys derived with HKDF-SHA256 ("findit:<purpose>:v1").
 * So data (and APP_ENC_KEY) from the PHP version keeps working.
 */
const PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;

export const FIELD_MAP = {
  User: { pk: 'id_user', table: 'public."User"', columns: ['email_kampus', 'name_user', 'no_telp', 'id_nim'] },
  item: { pk: 'kode_laporan', table: 'public.item', columns: ['nama_barang', 'detail_lokasi', 'ciri_umum', 'ciri_khusus'] },
  claim: {
    pk: 'id_claim', table: 'public.claim',
    columns: ['lokasi_kehilangan', 'terakhir_di_lihat', 'ciri_khusus_claim', 'catatan_admin', 'kode_pengambilan', 'lokasi_pengambilan'],
  },
  pickup: { pk: 'id_pickup', table: 'public.pickup_token', columns: ['token_enc'] },
  notification: { pk: 'id_notification', table: 'public.notification', columns: ['title', 'message'] },
} as const;

let masterKey: Buffer | null = null;
const subKeys = new Map<string, Buffer>();

export function parseKey(raw: string): Buffer {
  let r = raw.trim();
  if (r.startsWith('base64:')) r = r.slice(7);
  const key = Buffer.from(r, 'base64');
  if (!r || key.length !== 32) {
    throw new Error('APP_ENC_KEY is missing or invalid. Run: node scripts/generate-key.mjs');
  }
  return key;
}

function master(): Buffer {
  if (!masterKey) masterKey = parseKey(env.appEncKey);
  return masterKey;
}

function subKey(purpose: string): Buffer {
  let k = subKeys.get(purpose);
  if (!k) {
    k = Buffer.from(hkdfSync('sha256', master(), Buffer.alloc(0), `findit:${purpose}:v1`, 32));
    subKeys.set(purpose, k);
  }
  return k;
}

function seal(plain: Buffer, key: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const c = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function open(blob: Buffer, key: Buffer, aad: string): Buffer {
  if (blob.length < IV_LEN + TAG_LEN) throw new Error('Encrypted value is malformed.');
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const d = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(ct), d.final()]);
  } catch {
    throw new Error('Decryption failed (wrong key or tampered data).');
  }
}

export const Crypto = {
  fields(): string[] {
    const all = new Set<string>();
    for (const spec of Object.values(FIELD_MAP)) spec.columns.forEach((c) => all.add(c));
    return [...all];
  },

  isEncrypted(v: unknown): v is string {
    return typeof v === 'string' && v.startsWith(PREFIX);
  },

  /** Encrypt one value for storage. null/undefined stay null. */
  protect(column: string, value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (Crypto.isEncrypted(value)) return value;
    return PREFIX + seal(Buffer.from(value, 'utf8'), subKey('field'), column).toString('base64');
  },

  /** Decrypt one stored value. Plain values pass through. Throws if it cannot be opened. */
  reveal(column: string, value: string | null | undefined): string | null {
    if (value === null || value === undefined || !Crypto.isEncrypted(value)) return value ?? null;
    const blob = Buffer.from(value.slice(PREFIX.length), 'base64');
    return open(blob, subKey('field'), column).toString('utf8');
  },

  decryptRow<T extends Record<string, any>>(row: T): T {
    const out: Record<string, any> = { ...row };
    for (const col of Crypto.fields()) {
      if (typeof out[col] === 'string' && Crypto.isEncrypted(out[col])) {
        try {
          out[col] = Crypto.reveal(col, out[col]);
        } catch (e) {
          console.error('[FindIT] Could not decrypt column ' + col + ': ' + (e as Error).message);
          out[col] = '[unreadable]';
        }
      }
    }
    return out as T;
  },

  decryptRows<T extends Record<string, any>>(rows: T[]): T[] {
    return rows.map((r) => Crypto.decryptRow(r));
  },

  /** Deterministic keyed hash used to look up encrypted email / NIM values. */
  blindIndex(value: string): string {
    return createHmac('sha256', subKey('blind')).update(value.trim().toLowerCase()).digest('hex');
  },

  /** Encrypt a whole binary (used for backups). Format: iv | tag | ciphertext. */
  sealBytes(plain: Buffer, purpose = 'backup'): Buffer {
    return seal(plain, subKey(purpose), purpose);
  },
  openBytes(blob: Buffer, purpose = 'backup'): Buffer {
    return open(blob, subKey(purpose), purpose);
  },
};
