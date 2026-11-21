import { csrfOk, readForm, redirectTo, str } from '@/lib/http';
import { setFlash } from '@/lib/flash';
import { register } from '@/lib/auth';
import { verifyCaptcha } from '@/lib/captcha';

export async function POST(req: Request) {
  const fd = await readForm(req);
  const form = { name: str(fd, 'name').trim(), email: str(fd, 'email').trim(), phone: str(fd, 'phone').trim(), student_id: str(fd, 'student_id').trim() };

  if (!(await csrfOk(req, fd))) {
    await setFlash({ error: 'Your session has expired. Please refresh the page and try again.', form });
  } else if (!(await verifyCaptcha(str(fd, 'captcha')))) {
    await setFlash({ error: 'The captcha code is incorrect. Please try again.', form });
  } else {
    const result = await register({ ...form, password: str(fd, 'password'), confirm_password: str(fd, 'confirm_password') });
    if (result.success) await setFlash({ success: result.message });
    else await setFlash({ error: result.message || 'Registration failed. Please try again.', form });
  }
  return redirectTo(req, '/register');
}
