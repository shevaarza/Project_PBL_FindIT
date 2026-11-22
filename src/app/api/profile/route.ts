import { db } from '@/lib/db';
import { currentUser, verifyCsrf } from '@/lib/session';
import { readForm, redirectTo, str } from '@/lib/http';
import { setFlash } from '@/lib/flash';
import { removeAvatar, savePhoto, setPreset } from '@/lib/avatar';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { User } from '@/lib/models';
import { sendVerificationLink } from '@/lib/verification';
import { timingSafeEqual } from 'node:crypto';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return redirectTo(req, '/login');
  if (user.role !== 'student') return new Response('You do not have permission to access this page.', { status: 403 });

  const fd = await readForm(req);
  const action = str(fd, 'action');
  const section = action === 'change_password' ? 'password' : action === 'send_verification' ? 'verify' : 'photo';
  // The page reads { section } from the flash form and shows the message in that card.
  const back = async (type: 'success' | 'danger', message: string) => {
    await setFlash({ ...(type === 'success' ? { success: message } : { error: message }), form: { section } });
    return redirectTo(req, '/profile#' + section);
  };

  if (!(await verifyCsrf(str(fd, 'csrf_token')))) return back('danger', 'Your session has expired. Please refresh the page and try again.');

  try {
    switch (action) {
      case 'send_verification': {
        const r = await sendVerificationLink(user.id);
        return back(r.ok ? 'success' : 'danger', r.message);
      }
      case 'upload_photo': {
        const error = await savePhoto(db, user.id, fd.get('photo'));
        return error === null ? back('success', 'Your profile photo has been updated.') : back('danger', error);
      }
      case 'choose_avatar':
        return (await setPreset(db, user.id, str(fd, 'avatar')))
          ? back('success', 'Your avatar has been updated.') : back('danger', 'Please choose one of the avatars.');
      case 'remove_photo':
        await removeAvatar(db, user.id);
        return back('success', 'Your profile picture has been removed.');
      case 'change_password': {
        const current = str(fd, 'current_password'), next = str(fd, 'new_password'), confirm = str(fd, 'confirm_password');
        const account = await User.findById(user.id);
        if (!account) return back('danger', 'Your account could not be found.');
        if (!current || !next || !confirm) return back('danger', 'Please complete all password fields.');
        if (!(await verifyPassword(current, String(account.password_user)))) return back('danger', 'Your current password is incorrect.');
        if (Buffer.byteLength(next) < 8) return back('danger', 'Your new password must contain at least 8 characters.');
        if (Buffer.byteLength(next) > 72) return back('danger', 'Your new password must not be longer than 72 characters.');
        if (next !== confirm) return back('danger', 'The new passwords do not match.');
        const a = Buffer.from(current), b = Buffer.from(next);
        if (a.length === b.length && timingSafeEqual(a, b)) return back('danger', 'Your new password must be different from the current one.');
        await User.updatePassword(user.id, await hashPassword(next));
        return back('success', 'Your password has been changed.');
      }
      default:
        return back('danger', 'Unknown action.');
    }
  } catch (e) {
    console.error('[FindIT] Profile update failed: ' + (e as Error).message);
    return back('danger', 'Your changes could not be saved. Please try again.');
  }
}
