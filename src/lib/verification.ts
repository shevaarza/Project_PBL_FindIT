import { randomBytes } from 'node:crypto';
import { db, tx } from './db';
import { User, sha256 } from './models';
import { sendVerificationEmail } from './mailer';
import { env } from './env';

/**
 * Campus-email verification. A student account starts as "Not yet verified". The student asks for a link on the
 * profile page; it is mailed to the registered campus mailbox only. Opening the link marks the account Verified.
 * Reporting a found item and claiming an item both require a verified account.
 */

export const VERIFY_REQUIRED_MESSAGE = 'Please verify your campus email in your profile before you report or claim an item.';
const TTL_MINUTES = 60;
const RESEND_SECONDS = 60;

export async function isVerified(userId: number): Promise<boolean> {
  if (!(userId > 0)) return false;
  return (await db.value('SELECT 1 FROM public."User" WHERE id_user = $1 AND email_verified_at IS NOT NULL', [userId])) !== null;
}

export async function verifiedAt(userId: number): Promise<Date | null> {
  const v = await db.value<Date | string | null>('SELECT email_verified_at FROM public."User" WHERE id_user = $1', [userId]);
  return v ? new Date(v) : null;
}

export type VerifyResult = { ok: true; message: string } | { ok: false; message: string };

export async function sendVerificationLink(userId: number): Promise<VerifyResult> {
  try {
    const account = await User.findById(userId);
    if (!account) return { ok: false, message: 'Your account could not be found.' };
    if (await isVerified(userId)) return { ok: true, message: 'Your account is already verified.' };

    const recent = await db.value(
      `SELECT 1 FROM public.email_verifications WHERE id_user = $1 AND created_at > NOW() - make_interval(secs => $2::int) LIMIT 1`, [userId, RESEND_SECONDS]);
    if (recent !== null) return { ok: false, message: `A verification email was just sent. Please wait a minute before asking for another one.` };

    const raw = randomBytes(32).toString('hex');
    await tx(async (t) => {
      await t.query('DELETE FROM public.email_verifications WHERE id_user = $1 AND used_at IS NULL', [userId]);
      await t.query(
        `INSERT INTO public.email_verifications (id_user, token_hash, expires_at) VALUES ($1, $2, NOW() + make_interval(mins => $3::int))`,
        [userId, sha256(raw), TTL_MINUTES]);
    });
    const url = `${env.appUrl}/verify-email?token=${encodeURIComponent(raw)}`;
    const sent = await sendVerificationEmail(String(account.email_kampus), String(account.name_user || 'Student'), url);
    if (!sent) {
      await db.query('DELETE FROM public.email_verifications WHERE id_user = $1 AND used_at IS NULL', [userId]);
      return { ok: false, message: 'We could not send the verification email right now. Please try again in a moment.' };
    }
    return { ok: true, message: 'A verification link has been sent to your campus email. Open it within 60 minutes to verify your account.' };
  } catch (e) {
    console.error('[FindIT] Verification request failed: ' + (e as Error).message);
    return { ok: false, message: 'Unable to send the verification email right now. Please try again later.' };
  }
}

export async function confirmVerification(rawIn: string): Promise<VerifyResult> {
  const raw = (rawIn ?? '').trim();
  const invalid = 'This verification link is invalid or has expired. Please request a new one from your profile.';
  if (!/^[a-f0-9]{64}$/.test(raw)) return { ok: false, message: invalid };
  try {
    const done = await tx(async (t) => {
      const row = await t.one(
        `SELECT id_verification, id_user FROM public.email_verifications WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE`, [sha256(raw)]);
      if (!row) return false;
      await t.query('UPDATE public.email_verifications SET used_at = NOW() WHERE id_verification = $1', [row.id_verification]);
      await t.query('UPDATE public."User" SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id_user = $1', [row.id_user]);
      return true;
    });
    return done ? { ok: true, message: 'Your campus email has been verified. You can now report and claim items.' } : { ok: false, message: invalid };
  } catch (e) {
    console.error('[FindIT] Verification failed: ' + (e as Error).message);
    return { ok: false, message: 'We could not verify your account right now. Please try again.' };
  }
}
