import { csrfOk, readForm, redirectTo, str } from '@/lib/http';
import { setFlash } from '@/lib/flash';
import { resetPassword } from '@/lib/auth';

export async function POST(req: Request) {
  const fd = await readForm(req);
  const token = str(fd, 'token').trim();
  if (!(await csrfOk(req, fd))) {
    await setFlash({ error: 'Your session has expired. Please refresh the page and try again.' });
  } else {
    const result = await resetPassword(token, str(fd, 'password'), str(fd, 'confirm_password'));
    if (result.success) await setFlash({ success: result.message });
    else await setFlash({ error: result.message || 'Could not reset password.' });
  }
  return redirectTo(req, '/reset-password?token=' + encodeURIComponent(token));
}
