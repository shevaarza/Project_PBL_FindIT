import { PublicNav } from '@/components/Nav';
import { Alert, Footer } from '@/components/ui';
import { csrfToken, redirectLoggedInUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';

export const metadata = { title: 'Sign in | FindIT' };

export default async function LoginPage() {
  await redirectLoggedInUser();
  const flash = await getFlash();
  const errorMessage = flash.error ?? '';
  const email = flash.form?.email ?? '';
  const token = await csrfToken();

  return (
    <>
      <PublicNav user={null} active="login" />
      <main className="fi-auth" id="main">
        <div className="fi-auth-card">
          <div className="fi-auth-head">
            <a href="/" className="fi-brand">FindIT<span>.</span></a>
            <p>Welcome back! Sign in to your account.</p>
          </div>

          {errorMessage !== '' ? <Alert type="danger" message={errorMessage} /> : null}

          <form method="POST" action="/api/login" className="needs-validation" noValidate>
            <input type="hidden" name="csrf_token" value={token} />

            <div className="mb-3">
              <label htmlFor="email" className="form-label">Campus email</label>
              <input type="email" className="form-control" id="email" name="email" maxLength={100} defaultValue={email}
                placeholder="NIM@student.polinema.ac.id" autoComplete="username" required />
              <div className="form-text">Sign in with your Polinema student email.</div>
              <div className="invalid-feedback">Please enter a valid email address.</div>
            </div>

            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center">
                <label htmlFor="password" className="form-label mb-1">Password</label>
                <a href="/forgot-password" className="small">Forgot password?</a>
              </div>
              <div className="input-group has-validation">
                <input type="password" className="form-control" id="password" name="password" autoComplete="current-password"
                  placeholder="Enter your password" required />
                <button type="button" className="btn fi-pass-toggle" data-toggle-password="#password" aria-label="Show or hide password">Show</button>
                <div className="invalid-feedback">Please enter your password.</div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-100" data-loading-text="Signing in...">Sign in</button>
          </form>

          <p className="fi-auth-foot">Don&apos;t have an account? <a href="/register">Create one</a></p>
          <p className="fi-auth-foot"><a href="/" className="small">&larr; Back to homepage</a></p>
        </div>
      </main>
      <Footer />
    </>
  );
}
