import nodemailer from 'nodemailer';
import { env } from './env';

/** Sends the password-reset email (same wording as the PHP mailer). Works with Gmail SMTP, Mailpit and any SMTP host. */
export async function sendResetPasswordEmail(toEmail: string, toName: string, resetUrl: string): Promise<boolean> {
  const m = env.mail;
  let password = m.password;
  if (m.host.toLowerCase().includes('gmail.com')) password = password.replace(/ /g, '');

  let fromAddress = m.fromAddress;
  if (m.username && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.username) && (fromAddress === '' || fromAddress.toLowerCase().endsWith('.local'))) {
    fromAddress = m.username;
  }

  const safeName = toName.replace(/[\r\n]+/g, ' ').trim();
  const safeTo = toEmail.replace(/[\r\n]+/g, '').trim();
  if (!safeTo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(safeTo)) return false;

  const name = safeName || 'Student';
  const escName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const escUrl = resetUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const text =
    `Hi ${name},\r\n\r\nWe received a request to reset your FindIT account password.\r\n` +
    `Open the link below to set a new password (valid for 30 minutes):\r\n\r\n${resetUrl}\r\n\r\n` +
    `If you did not request this, you can safely ignore this email.\r\n`;
  const html =
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;">` +
    `<p>Hi ${escName},</p><p>We received a request to reset your <strong>FindIT</strong> account password.</p>` +
    `<p><a href="${escUrl}" style="display:inline-block;padding:10px 18px;background:#0d6efd;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Reset Password</a></p>` +
    `<p>Or copy and paste this link into your browser (valid for 30 minutes):<br><a href="${escUrl}">${escUrl}</a></p>` +
    `<p style="color:#6b7280;font-size:13px;">If you did not request a password reset, you can safely ignore this email.</p></body></html>`;

  try {
    const transport = nodemailer.createTransport({
      host: m.host,
      port: m.port,
      secure: m.encryption === 'ssl',
      requireTLS: m.encryption === 'tls',
      auth: m.username ? { user: m.username, pass: password } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({
      from: { name: m.fromName.replace(/[\r\n]+/g, ' '), address: fromAddress },
      to: safeTo,
      subject: 'Reset your FindIT password',
      text,
      html,
    });
    return true;
  } catch (e) {
    console.error('[FindIT] Mail failed: ' + (e as Error).message);
    return false;
  }
}
