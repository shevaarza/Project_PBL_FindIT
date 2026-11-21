import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { db, tx, isUniqueViolation } from './db';
import { User, Admin, PasswordReset, sha256 } from './models';
import { CAMPUS_EMAIL_ERROR, campusEmailNim, isCampusStudentEmail, normalizeCampusEmail } from './campusEmail';
import { sendResetPasswordEmail } from './mailer';
import { env } from './env';
import type { SessionUser } from './session';

export type Result<T = {}> = ({ success: true; message?: string } & T) | { success: false; message: string };

const fail = (message: string) => ({ success: false as const, message });
const hash = (pw: string) => bcrypt.hash(pw, 10);

// PHP password_hash() produces "$2y$"; bcryptjs reads it as-is.
const verify = (pw: string, h: string) => bcrypt.compare(pw, h.startsWith('$2y$') ? '$2a$' + h.slice(4) : h);

export async function register(data: Record<string, string>): Promise<Result<{ user_id: number }>> {
  const name = (data.name ?? '').trim();
  const email = normalizeCampusEmail(data.email ?? '');
  const phone = (data.phone ?? '').trim();
  const studentId = (data.student_id ?? '').trim();
  const password = data.password ?? '';
  const confirm = data.confirm_password ?? '';

  if (!name || !email || !phone || !studentId || !password || !confirm) return fail('Please complete all required fields.');
  if (!isCampusStudentEmail(email)) return fail(CAMPUS_EMAIL_ERROR);
  const emailNim = campusEmailNim(email);
  if (!/^[0-9]{12}$/.test(studentId) || emailNim === null || studentId !== emailNim) {
    return fail('Your student ID must be 12 digits and match the NIM in your campus email.');
  }
  if (email.length > 100 || name.length > 50 || phone.length > 15 || studentId.length > 20) return fail('Please check your information and try again.');
  if (password !== confirm) return fail('The passwords do not match.');
  if (password.length < 8) return fail('Your password must contain at least 8 characters.');

  try {
    if (await User.emailExists(email)) return fail('This campus email is already registered.');
    if (await User.studentIdExists(studentId)) return fail('This student ID is already registered.');
    const userId = await User.create(email, name, await hash(password), phone, studentId);
    return { success: true, message: 'Your account has been created. You can now log in.', user_id: userId };
  } catch (e) {
    if (isUniqueViolation(e)) return fail('This campus email or student ID is already registered.');
    console.error('[FindIT] Registration failed: ' + (e as Error).message);
    return fail('Registration could not be completed. Please try again.');
  }
}

export async function login(emailIn: string, password: string): Promise<Result<{ role: 'admin' | 'student'; user: SessionUser }>> {
  const email = normalizeCampusEmail(emailIn);
  if (!email || !password) return fail('Please enter your email and password.');
  try {
    // admin and student accounts live in different tables, so both are checked.
    const admin = await Admin.findByEmail(email);
    if (admin && (await verify(password, admin.password_admin))) {
      return { success: true, role: 'admin', user: { id: Number(admin.id_admin), name: admin.nama_admin, email: admin.email_admin, role: 'admin', access_level: admin.level_access } };
    }
    // students must sign in with their campus email.
    if (!isCampusStudentEmail(email)) return fail(CAMPUS_EMAIL_ERROR);
    const user = await User.findByEmail(email);
    if (user && (await verify(password, user.password_user))) {
      return { success: true, role: 'student', user: { id: Number(user.id_user), name: user.name_user, email: user.email_kampus, role: 'student' } };
    }
    return fail('Invalid email or password.');
  } catch (e) {
    console.error('[FindIT] Login failed: ' + (e as Error).message);
    return fail('Login is temporarily unavailable. Please try again.');
  }
}

/**
 * Password reset is tied to campus-email validation: only a valid NIM@student.polinema.ac.id address is accepted,
 * and the link is only ever sent to the campus mailbox that belongs to the account. The answer is always generic.
 */
export async function requestPasswordReset(emailIn: string): Promise<Result> {
  const email = normalizeCampusEmail(emailIn);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Please enter a valid campus email address.');
  if (!isCampusStudentEmail(email)) return fail(CAMPUS_EMAIL_ERROR);

  const generic = { success: true as const, message: 'If that campus email is registered, we have sent a password reset link. Please check your inbox.' };
  try {
    const user = await User.findByEmail(email);
    if (!user) return generic;

    const raw = randomBytes(32).toString('hex');
    await tx((t) => PasswordReset.createToken(t, Number(user.id_user), sha256(raw), 30));
    const url = `${env.appUrl}/reset-password?token=${encodeURIComponent(raw)}`;
    const sent = await sendResetPasswordEmail(user.email_kampus, user.name_user || 'Student', url);
    if (!sent) console.error('[FindIT] Failed to send password reset email to user ID ' + Number(user.id_user));
    return generic;
  } catch (e) {
    console.error('[FindIT] Password reset request error: ' + (e as Error).message);
    return fail('Unable to process your request right now. Please try again.');
  }
}

export async function validateResetToken(raw: string): Promise<boolean> {
  const t = (raw ?? '').trim();
  if (!/^[a-f0-9]{64}$/.test(t)) return false;
  try { return (await PasswordReset.findValidByTokenHash(sha256(t))) !== null; }
  catch (e) { console.error('[FindIT] Token validation error: ' + (e as Error).message); return false; }
}

export async function resetPassword(rawIn: string, password: string, confirm: string): Promise<Result> {
  const raw = (rawIn ?? '').trim();
  const invalid = 'This password reset link is invalid or has expired.';
  if (!/^[a-f0-9]{64}$/.test(raw)) return fail(invalid);
  if (!password || !confirm) return fail('Please enter and confirm your new password.');
  if (password !== confirm) return fail('The passwords do not match.');
  if (password.length < 8) return fail('Your password must contain at least 8 characters.');
  try {
    const row = await PasswordReset.findValidByTokenHash(sha256(raw));
    if (!row) return fail(invalid);
    const pwHash = await hash(password);
    const ok = await tx(async (t) => {
      if (!(await PasswordReset.markUsed(t, Number(row.id_reset)))) return false;
      await User.updatePassword(Number(row.id_user), pwHash, t);
      return true;
    });
    if (!ok) return fail('This password reset link has already been used.');
    return { success: true, message: 'Your password has been updated. You can now sign in.' };
  } catch (e) {
    console.error('[FindIT] Password reset failed: ' + (e as Error).message);
    return fail('Could not update your password. Please try again.');
  }
}

export const hashPassword = hash;
export const verifyPassword = verify;
export { db };
