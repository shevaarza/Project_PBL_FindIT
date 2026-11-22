import { confirmVerification } from '@/lib/verification';
import { currentUser } from '@/lib/session';
import { redirectTo } from '@/lib/http';
import { setFlash } from '@/lib/flash';

/** The link in the verification email. Marks the account Verified, then shows the result on the profile (or the login page). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const result = await confirmVerification(token);
  await setFlash(result.ok ? { success: result.message, form: { section: 'verify' } } : { error: result.message, form: { section: 'verify' } });
  const user = await currentUser();
  return redirectTo(req, user && user.role === 'student' ? '/profile#verify' : '/login');
}
