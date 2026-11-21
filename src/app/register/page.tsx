import { PublicNav } from '@/components/Nav';
import { Alert, Footer } from '@/components/ui';
import { csrfToken, redirectLoggedInUser } from '@/lib/session';
import { getFlash } from '@/lib/flash';

export const metadata = { title: 'Create account | FindIT' };

const CAPTCHA_ROW =
  '<img id="captcha-image" src="/captcha" alt="Captcha code" width="200" height="60" style="border: 1px solid #ddd; border-radius: 8px;">' +
  '<button type="button" class="btn btn-outline-secondary btn-sm" onclick="document.getElementById(\'captcha-image\').src = \'/captcha?t=\' + Date.now();">Refresh</button>';

export default async function RegisterPage() {
  await redirectLoggedInUser();
  const flash = await getFlash();
  const errorMessage = flash.error ?? '';
  const successMessage = flash.success ?? '';
  const f = flash.form ?? {};
  const token = await csrfToken();

  return (
    <>
      <PublicNav user={null} active="register" />
      <main className="fi-auth" id="main">
        <div className="fi-auth-card fi-auth-card--wide">
          <div className="fi-auth-head">
            <a href="/" className="fi-brand">FindIT<span>.</span></a>
            <p>Create your student account to get started.</p>
          </div>

          {errorMessage !== '' ? <Alert type="danger" message={errorMessage} /> : null}

          {successMessage !== '' ? (
            <div className="alert alert-success fi-alert" role="status">
              <span className="fi-alert-dot" aria-hidden="true"></span>
              <div className="fi-alert-text">{successMessage} <a href="/login" className="alert-link">Sign in here.</a></div>
            </div>
          ) : null}

          <form method="POST" action="/api/register" className="needs-validation" noValidate>
            <input type="hidden" name="csrf_token" value={token} />

            <div className="row g-3">
              <div className="col-12">
                <label htmlFor="name" className="form-label">Full name</label>
                <input type="text" className="form-control" id="name" name="name" maxLength={50} defaultValue={f.name ?? ''}
                  placeholder="Enter your full name" autoComplete="name" required />
                <div className="invalid-feedback">Please enter your full name.</div>
              </div>

              <div className="col-12">
                <label htmlFor="email" className="form-label">Campus email</label>
                <input type="email" className="form-control" id="email" name="email" maxLength={100} defaultValue={f.email ?? ''}
                  placeholder="123456789012@student.polinema.ac.id" pattern="[0-9]{12}@student\.polinema\.ac\.id" data-nim-source
                  title="Use your student email: 12-digit NIM@student.polinema.ac.id" autoComplete="email" required />
                <div className="form-text">Only Polinema student emails work: NIM@student.polinema.ac.id</div>
                <div className="invalid-feedback">Please use your student email in the format NIM@student.polinema.ac.id.</div>
              </div>

              <div className="col-12 col-sm-6">
                <label htmlFor="phone" className="form-label">Phone number</label>
                <input type="tel" className="form-control" id="phone" name="phone" maxLength={15} defaultValue={f.phone ?? ''}
                  placeholder="08xxxxxxxxxx" autoComplete="tel" required />
                <div className="invalid-feedback">Please enter your phone number.</div>
              </div>

              <div className="col-12 col-sm-6">
                <label htmlFor="student_id" className="form-label">Student ID (NIM)</label>
                <input type="text" className="form-control" id="student_id" name="student_id" maxLength={12} inputMode="numeric"
                  pattern="[0-9]{12}" data-nim-email="#email" title="12 digits, and must be the same as the NIM in your campus email"
                  defaultValue={f.student_id ?? ''} placeholder="12-digit NIM" autoComplete="off" required />
                <div className="invalid-feedback" data-nim-feedback>Enter your 12-digit NIM.</div>
              </div>

              <div className="col-12 col-sm-6">
                <label htmlFor="password" className="form-label">Password</label>
                <div className="input-group has-validation">
                  <input type="password" className="form-control" id="password" name="password" minLength={8} autoComplete="new-password"
                    placeholder="At least 8 characters" required />
                  <button type="button" className="btn fi-pass-toggle" data-toggle-password="#password" aria-label="Show or hide password">Show</button>
                  <div className="invalid-feedback">Use at least 8 characters.</div>
                </div>
              </div>

              <div className="col-12 col-sm-6">
                <label htmlFor="confirm_password" className="form-label">Confirm password</label>
                <div className="input-group has-validation">
                  <input type="password" className="form-control" id="confirm_password" name="confirm_password" minLength={8}
                    data-match="#password" autoComplete="new-password" placeholder="Repeat your password" required />
                  <button type="button" className="btn fi-pass-toggle" data-toggle-password="#confirm_password" aria-label="Show or hide confirm password">Show</button>
                  <div className="invalid-feedback">The passwords do not match.</div>
                </div>
              </div>
            </div>

            <div className="mt-3">
              <label htmlFor="captcha" className="form-label">Verify that you are not a bot</label>
              <div className="d-flex align-items-center gap-2 mb-2" dangerouslySetInnerHTML={{ __html: CAPTCHA_ROW }} />
              <input type="text" className="form-control" id="captcha" name="captcha" maxLength={5} autoComplete="off"
                placeholder="Type the characters above" required />
            </div>
            <button type="submit" className="btn btn-primary w-100 mt-3" data-loading-text="Creating account...">Create account</button>
          </form>

          <p className="fi-auth-foot">Already have an account? <a href="/login">Sign in</a></p>
          <p className="fi-auth-foot"><a href="/" className="small">&larr; Back to homepage</a></p>
        </div>
      </main>
      <Footer />
    </>
  );
}
