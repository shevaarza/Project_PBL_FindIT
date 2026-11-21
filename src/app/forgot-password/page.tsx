import { PublicNav } from '@/components/Nav';
import { Alert, Footer } from '@/components/ui';
import { csrfToken, redirectLoggedInUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';

export const metadata = { title: 'Forgot password | FindIT' };

export default async function ForgotPasswordPage() {
  await redirectLoggedInUser();
  const flash = await getFlash();
  const token = await csrfToken();

  return (
    <>
      <PublicNav user={null} active="login" />
      <main className="fi-auth" id="main">
        <div className="fi-auth-card">
          <div className="fi-auth-head">
            <a href="/" className="fi-brand">FindIT<span>.</span></a>
            <p>Enter your Polinema student email and we&apos;ll send you a reset link.</p>
          </div>

          {flash.error ? <Alert type="danger" message={flash.error} /> : null}
          {flash.success ? <Alert type="success" message={flash.success} /> : null}

          <form method="POST" action="/api/forgot-password" className="needs-validation" noValidate>
            <input type="hidden" name="csrf_token" value={token} />
            <div className="mb-4">
              <label htmlFor="email" className="form-label">Campus email</label>
              <input type="email" className="form-control" id="email" name="email" maxLength={100} defaultValue={flash.form?.email ?? ''}
                placeholder="NIM@student.polinema.ac.id" autoComplete="email" required />
              <div className="form-text">Only Polinema student emails (@student.polinema.ac.id) are supported.</div>
              <div className="invalid-feedback">Please enter your Polinema student email.</div>
            </div>
            <button type="submit" className="btn btn-primary w-100" data-loading-text="Sending reset link...">Send reset link</button>
          </form>

          <p className="fi-auth-foot">Remembered your password? <a href="/login">Sign in</a></p>
          <p className="fi-auth-foot"><a href="/" className="small">&larr; Back to homepage</a></p>
        </div>
      </main>
      <Footer />
    </>
  );
}
