import { createHash } from 'node:crypto';
import { db, type Db } from './db';
import { Crypto } from './crypto';
import { normalizeCampusEmail } from './campusEmail';

// ---------------------------------------------------------------- User
export const User = {
  async findByEmail(email: string, d: Db = db) {
    const row = await d.one(
      `SELECT id_user, email_kampus, name_user, password_user, role_user FROM public."User" WHERE email_bidx = $1 LIMIT 1`,
      [Crypto.blindIndex(normalizeCampusEmail(email))]);
    return row ? Crypto.decryptRow(row) : null;
  },

  async create(email: string, name: string, passwordHash: string, phone: string, studentId: string, d: Db = db): Promise<number> {
    const e = normalizeCampusEmail(email);
    const nim = studentId.trim();
    const id = await d.value<number>(
      `INSERT INTO public."User" (email_kampus, email_bidx, name_user, password_user, no_telp, role_user, id_nim, nim_bidx)
       VALUES ($1,$2,$3,$4,$5,'student',$6,$7) RETURNING id_user`,
      [Crypto.protect('email_kampus', e), Crypto.blindIndex(e), Crypto.protect('name_user', name.trim()), passwordHash,
       Crypto.protect('no_telp', phone.trim()), Crypto.protect('id_nim', nim), Crypto.blindIndex(nim)]);
    return Number(id);
  },

  async emailExists(email: string, d: Db = db) {
    return (await d.value('SELECT 1 FROM public."User" WHERE email_bidx = $1 LIMIT 1', [Crypto.blindIndex(normalizeCampusEmail(email))])) !== null;
  },

  async studentIdExists(studentId: string, d: Db = db) {
    return (await d.value('SELECT 1 FROM public."User" WHERE nim_bidx = $1 LIMIT 1', [Crypto.blindIndex(studentId)])) !== null;
  },

  async updatePassword(userId: number, passwordHash: string, d: Db = db) {
    const r = await d.query('UPDATE public."User" SET password_user = $1 WHERE id_user = $2', [passwordHash, userId]);
    return r.rowCount === 1;
  },

  async findById(userId: number, d: Db = db) {
    const row = await d.one(
      `SELECT id_user, email_kampus, name_user, id_nim, password_user, email_verified_at FROM public."User" WHERE id_user = $1 AND role_user = 'student' LIMIT 1`, [userId]);
    return row ? Crypto.decryptRow(row) : null;
  },

  async profileStats(userId: number, d: Db = db) {
    const r = await d.one(
      `SELECT (SELECT COUNT(*) FROM public.item WHERE id_user_pelapor = $1) AS reports,
              (SELECT COUNT(*) FROM public.claim WHERE id_user_pengaju = $1) AS claims,
              (SELECT COUNT(*) FROM public.item WHERE id_user_pelapor = $1 AND status_barang = 'Claimed') AS returned`, [userId]) ?? {};
    return { reports: Number(r.reports ?? 0), claims: Number(r.claims ?? 0), returned: Number(r.returned ?? 0) };
  },
};

// ---------------------------------------------------------------- Admin
export const Admin = {
  async findByEmail(email: string, d: Db = db) {
    return d.one(
      `SELECT id_admin, email_admin, nama_admin, password_admin, level_access FROM public.admin WHERE LOWER(email_admin) = LOWER($1) LIMIT 1`, [email.trim()]);
  },
  async create(email: string, name: string, passwordHash: string, accessLevel: string, d: Db = db): Promise<number> {
    return Number(await d.value(
      `INSERT INTO public.admin (email_admin, nama_admin, password_admin, level_access) VALUES ($1,$2,$3,$4) RETURNING id_admin`,
      [email.trim(), name.trim(), passwordHash, accessLevel.trim()]));
  },
};

// ---------------------------------------------------------------- Password reset
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const PasswordReset = {
  /** Invalidate previous unused tokens for this student, then store the new one (30 minutes by default). */
  async createToken(d: Db, userId: number, tokenHash: string, ttlMinutes = 30) {
    await d.query('DELETE FROM public.password_resets WHERE id_user = $1 AND used_at IS NULL', [userId]);
    await d.query(
      `INSERT INTO public.password_resets (id_user, token_hash, expires_at) VALUES ($1, $2, NOW() + make_interval(mins => $3::int))`,
      [userId, tokenHash, ttlMinutes]);
  },
  async findValidByTokenHash(tokenHash: string, d: Db = db) {
    return d.one(
      `SELECT id_reset, id_user FROM public.password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() LIMIT 1`, [tokenHash]);
  },
  async markUsed(d: Db, resetId: number) {
    const r = await d.query(
      `UPDATE public.password_resets SET used_at = NOW() WHERE id_reset = $1 AND used_at IS NULL AND expires_at > NOW()`, [resetId]);
    return r.rowCount === 1;
  },
};
