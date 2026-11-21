import { csrfOk, readForm, redirectTo, str } from '@/lib/http';
import { setFlash } from '@/lib/flash';
import { requestPasswordReset } from '@/lib/auth';

export async function POST(req: Request) {
  const fd = await readForm(req);
  const email = str(fd, 'email').trim();
  if (!(await csrfOk(req, fd))) {
    await setFlash({ error: 'Your session has expired. Please refresh the page and try again.', form: { email } });
  } else {
    const result = await requestPasswordReset(email);
    if (result.success) await setFlash({ success: result.message });
    else await setFlash({ error: result.message || 'Unable to process your request.', form: { email } });
  }
  return redirectTo(req, '/forgot-password');
}
