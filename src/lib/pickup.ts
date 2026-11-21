import { createHash, randomBytes } from 'node:crypto';
import type { Db } from './db';
import { Crypto } from './crypto';

export const pickupNewToken = () => randomBytes(24).toString('hex'); // 192 bits
export const pickupHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** One claim can only ever have one token: if it exists nothing changes. Returns the plain token. */
export async function pickupEnsureToken(db: Db, claimId: number): Promise<string> {
  const stored = await db.value<string>('SELECT token_enc FROM public.pickup_token WHERE id_claim = $1', [claimId]);
  if (typeof stored === 'string' && stored !== '') return Crypto.reveal('token_enc', stored) ?? '';

  const token = pickupNewToken();
  const ins = await db.query(
    `INSERT INTO public.pickup_token (id_claim, token_hash, token_enc) VALUES ($1, $2, $3)
     ON CONFLICT (id_claim) DO NOTHING`,
    [claimId, pickupHash(token), Crypto.protect('token_enc', token)],
  );
  if (ins.rowCount === 1) return token;

  const again = await db.value<string>('SELECT token_enc FROM public.pickup_token WHERE id_claim = $1', [claimId]);
  return Crypto.reveal('token_enc', again) ?? '';
}
