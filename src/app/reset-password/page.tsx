import { PublicNav } from '@/components/Nav';
import { Alert, Footer } from '@/components/ui';
import { csrfToken, redirectLoggedInUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { validateResetToken } from '@/lib/auth';

export const metadata = { title: 'Reset password | FindIT' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await redirectLoggedInUser();
  const sp = await searchParams;
  const flash = await getFlash();
  const token = (typeof sp.token === 'string' ? sp.token : '').trim();
  const errorMessage = flash.error ?? '';
  const successMessage = flash.success ?? '';
  const tokenValid = successMessage !== '' ? false : await validateResetToken(token);
  const csrf = await csrfToken();

  return (
    <>
      <PublicNav user={null} active="login" />
      <main className="fi-auth" id="main">
        <div className="fi-auth-card">
          <div className="fi-auth-head">
            <a href="/" className="fi-brand">FindIT<span>.</span></a>
            <p>Choose a new password for your student account.</p>
          </div>

          {errorMessage !== '' ? <Alert type="danger" message={errorMessage} /> : null}

          {successMessage !== '' ? (
            <>
              <Alert type="success" message={successMessage} />
              <a href="/login" className="btn btn-primary w-100 mt-2">Go to sign in</a>
            </>
          ) : !tokenValid ? (
            <>
              <Alert type="danger" message="This password reset link is invalid or has expired." />
              <a href="/forgot-password" className="btn btn-primary w-100 mt-2">Request a new link</a>
            </>
          ) : (
            <form method="POST" action="/api/reset-password" className="needs-validation" noValidate>
              <input type="hidden" name="csrf_token" value={csrf} />
              <input type="hidden" name="token" value={token} />

              <div className="mb-3">
                <label htmlFor="password" className="form-label">New password</label>
                <div className="input-group has-validation">
                  <input type="password" className="form-control" id="password" name="password" minLength={8} autoComplete="new-password"
                    placeholder="At least 8 characters" required />
                  <button type="button" className="btn fi-pass-toggle" data-toggle-password="#password" aria-label="Show or hide password">Show</button>
                  <div className="invalid-feedback">Password must be at least 8 characters.</div>
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="confirm_password" className="form-label">Confirm new password</label>
                <div className="input-group has-validation">
                  <input type="password" className="form-control" id="confirm_password" name="confirm_password" minLength={8}
                    autoComplete="new-password" placeholder="Re-enter your new password" required />
                  <button type="button" className="btn fi-pass-toggle" data-toggle-password="#confirm_password" aria-label="Show or hide confirm password">Show</button>
                  <div className="invalid-feedback">Please confirm your new password.</div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary w-100" data-loading-text="Updating password...">Update password</button>
            </form>
          )}

          <p className="fi-auth-foot"><a href="/login" className="small">&larr; Back to sign in</a></p>
        </div>
      </main>
      <Footer />
    </>
  );
}
