import { db } from '@/lib/db';
import { csrfToken, requireRole } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { avatarInfo, PRESETS, presetSvg } from '@/lib/avatar';
import { User } from '@/lib/models';
import { numberFormat } from '@/lib/student-text';
import { PublicNav } from '@/components/Nav';
import { Alert, Avatar, Footer } from '@/components/ui';

export const metadata = { title: 'My profile | FindIT' };

export default async function ProfilePage() {
  const user = await requireRole('student');
  const flash = await getFlash();
  const flashFor = (section: string) =>
    flash.form?.section === section && (flash.error || flash.success)
      ? { type: (flash.success ? 'success' : 'danger') as 'success' | 'danger', message: String(flash.success || flash.error) } : null;

  let account: Awaited<ReturnType<typeof User.findById>> = null;
  let stats = { reports: 0, claims: 0, returned: 0 };
  let loadError = '';
  try {
    account = await User.findById(user.id);
    stats = await User.profileStats(user.id);
  } catch (e) {
    console.error('[FindIT] Failed to load the profile: ' + (e as Error).message);
    loadError = 'Unable to load your profile. Please try again later.';
  }
  const info = await avatarInfo(db, user.id);
  const csrf = await csrfToken();
  const photoFlash = flashFor('photo');
  const passFlash = flashFor('password');
  const verifyFlash = flashFor('verify');
  const verified = !!account?.email_verified_at;

  return (
    <>
      <PublicNav user={user} active="profile" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <div className="fi-narrow" style={{ width: 'min(760px, 100%)' }}>
            {loadError !== '' || account === null ? (
              <Alert type="danger" message={loadError !== '' ? loadError : 'Your account could not be found.'} />
            ) : (
              <>
                <section className="fi-profile-head" aria-labelledby="profileTitle">
                  <button type="button" className="fi-avatar-zoom-btn" data-avatar-zoom aria-label="View profile photo larger" title="Click to enlarge">
                    <Avatar info={info} size={84} extraClass="fi-avatar--xl" />
                    <span className="fi-avatar-zoom-badge" aria-hidden="true">Zoom</span>
                  </button>
                  <div className="fi-profile-id">
                    <h1 className="fi-profile-name" id="profileTitle">{account.name_user}</h1>
                    <p className="fi-profile-sub">Student &middot; ID {account.id_nim}</p>
                    <div className="fi-profile-badges">
                      <span className="fi-badge fi-badge--info">Student account</span>
                      {verified
                        ? <span className="fi-badge fi-badge--success">Verified</span>
                        : <span className="fi-badge fi-badge--warning">Not yet verified</span>}
                    </div>
                  </div>
                </section>

                <section className="fi-profile-card" aria-labelledby="verifyTitle" id="verify">
                  <h2 className="fi-profile-h" id="verifyTitle">Account verification</h2>
                  {verifyFlash ? <Alert type={verifyFlash.type} message={verifyFlash.message} autoHide={verifyFlash.type === 'success'} /> : null}
                  {verified ? (
                    <p className="mb-0">Your campus email <strong>{account.email_kampus}</strong> is verified. You can report found items and claim items.</p>
                  ) : (
                    <>
                      <p>Your account is <strong>not yet verified</strong>. Verify your campus email to report found items or claim items. We will send a link to <strong>{account.email_kampus}</strong>.</p>
                      <form method="post" action="/api/profile" className="needs-validation" noValidate>
                        <input type="hidden" name="csrf_token" value={csrf} />
                        <input type="hidden" name="action" value="send_verification" />
                        <button type="submit" className="btn btn-primary btn-sm" data-loading-text="Sending...">Send verification email</button>
                      </form>
                      <p className="form-text mb-0 mt-2">The link is valid for 60 minutes. Check your spam folder if you do not see it.</p>
                    </>
                  )}
                </section>

                <section className="fi-profile-card" aria-labelledby="overviewTitle">
                  <h2 className="fi-profile-h" id="overviewTitle">Account overview</h2>
                  <div className="fi-profile-stats">
                    <a className="fi-profile-stat" href="/report-item"><span className="fi-profile-stat-num">{numberFormat(stats.reports)}</span><span className="fi-profile-stat-label">My reports</span></a>
                    <a className="fi-profile-stat" href="/my-claims"><span className="fi-profile-stat-num">{numberFormat(stats.claims)}</span><span className="fi-profile-stat-label">My claims</span></a>
                    <div className="fi-profile-stat"><span className="fi-profile-stat-num fi-profile-stat-num--ok">{numberFormat(stats.returned)}</span><span className="fi-profile-stat-label">Returned</span></div>
                  </div>
                </section>

                <section className="fi-profile-card" aria-labelledby="infoTitle">
                  <h2 className="fi-profile-h" id="infoTitle">Personal information</h2>
                  <dl className="fi-profile-info">
                    <div><dt>Full name</dt><dd>{account.name_user}</dd></div>
                    <div><dt>Student ID</dt><dd>{account.id_nim}</dd></div>
                    <div><dt>Email</dt><dd>{account.email_kampus}</dd></div>
                  </dl>
                </section>

                <section className="fi-profile-card" aria-labelledby="photoTitle" id="photo">
                  <h2 className="fi-profile-h" id="photoTitle">Profile photo</h2>
                  {photoFlash ? <Alert type={photoFlash.type} message={photoFlash.message} autoHide={photoFlash.type === 'success'} /> : null}

                  <form method="post" action="/api/profile" encType="multipart/form-data" className="fi-profile-upload needs-validation" noValidate>
                    <input type="hidden" name="csrf_token" value={csrf} />
                    <input type="hidden" name="action" value="upload_photo" />
                    <div className="fi-profile-preview" data-photo-preview aria-hidden="true"><Avatar info={info} size={72} /></div>
                    <div className="fi-profile-upload-body">
                      <label htmlFor="photo-file" className="form-label">Add a photo</label>
                      <input type="file" className="form-control" id="photo-file" name="photo" accept="image/jpeg,image/png,image/webp" data-photo-input required />
                      <div className="form-text">JPG, PNG or WebP, up to 2 MB. It is cropped to a square.</div>
                      <div className="invalid-feedback">Please choose a photo.</div>
                      <button type="submit" className="btn btn-primary btn-sm mt-3" data-loading-text="Uploading...">Upload photo</button>
                    </div>
                  </form>

                  <hr className="fi-profile-rule" />

                  <form method="post" action="/api/profile" className="needs-validation" noValidate data-avatar-form>
                    <input type="hidden" name="csrf_token" value={csrf} />
                    <input type="hidden" name="action" value="choose_avatar" />
                    <fieldset className="fi-avatar-picker">
                      <legend className="form-label">Or choose an avatar</legend>
                      <div className="fi-avatar-grid">
                        {Object.entries(PRESETS).map(([key, preset]) => (
                          <label className="fi-avatar-option" key={key}>
                            <input type="radio" name="avatar" value={key} defaultChecked={info.type === 'preset' && info.preset === key} required />
                            <span className="fi-avatar-option-face" dangerouslySetInnerHTML={{ __html: presetSvg(key, 64) }} />
                            <span className="visually-hidden">{preset[0]} avatar</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button type="submit" className="btn btn-primary btn-sm mt-3">Use this avatar</button>
                  </form>

                  {info.type !== 'none' ? (
                    <form method="post" action="/api/profile" className="mt-3 needs-validation" noValidate>
                      <input type="hidden" name="csrf_token" value={csrf} />
                      <input type="hidden" name="action" value="remove_photo" />
                      <button type="submit" className="btn btn-outline-secondary btn-sm"
                        data-confirm="Remove your profile picture? The default icon will be shown instead." data-confirm-label="Yes, remove it">Remove picture</button>
                    </form>
                  ) : null}
                </section>

                <section className="fi-profile-card" aria-labelledby="passwordTitle" id="password">
                  <h2 className="fi-profile-h" id="passwordTitle">Change password</h2>
                  {passFlash ? <Alert type={passFlash.type} message={passFlash.message} autoHide={passFlash.type === 'success'} /> : null}
                  <form method="post" action="/api/profile" className="needs-validation" noValidate>
                    <input type="hidden" name="csrf_token" value={csrf} />
                    <input type="hidden" name="action" value="change_password" />
                    <div className="mb-3">
                      <label htmlFor="current_password" className="form-label">Current password</label>
                      <div className="input-group has-validation">
                        <input type="password" className="form-control" id="current_password" name="current_password" autoComplete="current-password" required />
                        <button type="button" className="btn fi-pass-toggle" data-toggle-password="#current_password" aria-label="Show or hide current password">Show</button>
                        <div className="invalid-feedback">Please enter your current password.</div>
                      </div>
                    </div>
                    <div className="mb-3">
                      <label htmlFor="new_password" className="form-label">New password</label>
                      <div className="input-group has-validation">
                        <input type="password" className="form-control" id="new_password" name="new_password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="At least 8 characters" required />
                        <button type="button" className="btn fi-pass-toggle" data-toggle-password="#new_password" aria-label="Show or hide new password">Show</button>
                        <div className="invalid-feedback">Password must be at least 8 characters.</div>
                      </div>
                    </div>
                    <div className="mb-4">
                      <label htmlFor="confirm_password" className="form-label">Confirm new password</label>
                      <div className="input-group has-validation">
                        <input type="password" className="form-control" id="confirm_password" name="confirm_password" minLength={8} maxLength={72} autoComplete="new-password" data-match="#new_password" placeholder="Re-enter your new password" required />
                        <button type="button" className="btn fi-pass-toggle" data-toggle-password="#confirm_password" aria-label="Show or hide confirm password">Show</button>
                        <div className="invalid-feedback">The passwords must match.</div>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" data-loading-text="Updating password...">Update password</button>
                  </form>
                </section>
              </>
            )}
          </div>
        </div>

        <div className="fi-lightbox" id="fiAvatarLightbox" role="dialog" aria-modal="true" aria-label="Profile photo" hidden>
          <div className="fi-lightbox-backdrop" data-lightbox-close></div>
          <div className="fi-lightbox-stage" data-lightbox-stage></div>
          <button type="button" className="fi-lightbox-close" data-lightbox-close aria-label="Close">&times;</button>
        </div>
      </main>
      <Footer />
    </>
  );
}
