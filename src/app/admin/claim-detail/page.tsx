import { db } from '@/lib/db';
import { csrfToken, requireRole } from '@/lib/session';
import { Crypto } from '@/lib/crypto';
import { getFlash } from '@/lib/flash';
import { fiDate, fiDateTime, fiOr } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { Nl2br } from '@/lib/student-text';
import { AdminNav } from '@/components/Nav';
import { Alert, Badge, Footer, PageHeader, QrBlock } from '@/components/ui';

export const metadata = { title: 'Claim details | FindIT Admin' };

const SQL = `
  SELECT c.id_claim, c.kode_klaim, c.status_klaim, c.created_at, c.updated_at, c.lokasi_kehilangan, c.terakhir_di_lihat,
         c.ciri_khusus_claim, c.catatan_admin, c.kode_pengambilan, c.lokasi_pengambilan,
         i.kode_laporan, i.nama_barang, i.status_barang, i.detail_lokasi, i.tanggal_ditemukan, i.ciri_umum, i.ciri_khusus, i.photo_path,
         u.name_user, u.email_kampus, u.no_telp, a.nama_admin
  FROM public.claim AS c
  LEFT JOIN public.item AS i ON c.id_item = i.kode_laporan
  LEFT JOIN public."User" AS u ON c.id_user_pengaju = u.id_user
  LEFT JOIN public.admin AS a ON c.id_admin_verifikator = a.id_admin
  WHERE c.id_claim = $1 LIMIT 1`;

export default async function ClaimDetail({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole('admin');
  const sp = await searchParams;
  const claimId = /^\d+$/.test(String(sp.id ?? '')) ? parseInt(String(sp.id), 10) : 0;
  const flash = await getFlash();

  let claim: Record<string, any> | null = null;
  let errorMessage = '';
  if (!(claimId >= 1)) errorMessage = 'Invalid claim ID.';
  else {
    try {
      const row = await db.one(SQL, [claimId]);
      claim = row ? Crypto.decryptRow(row) : null;
      if (!claim) errorMessage = 'Claim request not found.';
    } catch (e) { console.error('[FindIT] Claim detail error: ' + (e as Error).message); errorMessage = 'Unable to load this claim request. Please try again later.'; }
  }

  const actionMessage = sp.updated === '1' ? 'The claim decision has been saved successfully.' : '';
  const actionError = flash.error ?? '';
  const isPending = !!claim && claim.status_klaim === 'Pending Verification';
  const csrf = await csrfToken();

  return (
    <>
      <AdminNav active="claims" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <a href="/admin/claims" className="fi-back-link">&larr; Back to claims</a>
          <PageHeader eyebrow="Campus lost & found / Claim review" titleHtml="Claim<br><span>details.</span>"
            lead="Review the submitted information before making a decision."
            count={claim ? '#' + Number(claim.id_claim) : null} countLabel="Internal claim ID" />

          {errorMessage !== '' ? (
            <>
              <Alert type="danger" message={errorMessage} />
              <a href="/admin/claims" className="btn btn-outline-secondary">Return to claims</a>
            </>
          ) : claim ? (
            <>
              {actionMessage !== '' ? <Alert type="success" message={actionMessage} autoHide /> : null}
              {actionError !== '' ? <Alert type="danger" message={actionError} /> : null}

              <div className="fi-review">
                <div>
                  <section className="fi-panel" aria-labelledby="overview-heading">
                    <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
                      <div>
                        <p className="fi-panel-kicker">Request overview</p>
                        <h2 id="overview-heading" className="h4 mb-0">{claim.kode_klaim ?? 'Claim #' + claim.id_claim}</h2>
                      </div>
                      <Badge status={claim.status_klaim ?? ''} />
                    </div>
                    <dl className="fi-fields mb-0">
                      <div className="fi-field"><dt className="fi-field-label">Submitted</dt><dd className="fi-field-value">{fiDateTime(claim.created_at)}</dd></div>
                      <div className="fi-field"><dt className="fi-field-label">Last updated</dt><dd className="fi-field-value">{fiDateTime(claim.updated_at)}</dd></div>
                      <div className="fi-field"><dt className="fi-field-label">Verified by</dt><dd className="fi-field-value">{fiOr(claim.nama_admin, 'Not assigned')}</dd></div>
                    </dl>
                  </section>

                  <section className="fi-panel" aria-labelledby="compare-heading">
                    <p className="fi-panel-kicker">01 / Verification</p>
                    <h2 id="compare-heading" className="fi-panel-title">Compare the evidence</h2>
                    <div className="fi-compare">
                      <div className="fi-compare-col fi-compare-col--claim">
                        <h3 className="fi-compare-title">Claimant&apos;s answers</h3>
                        <div className="fi-field"><span className="fi-field-label">Where the item was lost</span><p className="fi-field-value"><Nl2br text={fiOr(claim.lokasi_kehilangan)} /></p></div>
                        <div className="fi-field"><span className="fi-field-label">Last seen at</span><p className="fi-field-value"><Nl2br text={fiOr(claim.terakhir_di_lihat)} /></p></div>
                        <div className="fi-field"><span className="fi-field-label">Distinctive features</span><p className="fi-field-value"><Nl2br text={fiOr(claim.ciri_khusus_claim)} /></p></div>
                      </div>
                      <div className="fi-compare-col fi-compare-col--item">
                        <h3 className="fi-compare-title">Original report</h3>
                        <div className="fi-field"><span className="fi-field-label">Location found</span><p className="fi-field-value"><Nl2br text={fiOr(claim.detail_lokasi, 'Not specified')} /></p></div>
                        <div className="fi-field"><span className="fi-field-label">General features</span><p className="fi-field-value"><Nl2br text={fiOr(claim.ciri_umum)} /></p></div>
                        <div className="fi-field"><span className="fi-field-label">Distinctive features (private)</span><p className="fi-field-value"><Nl2br text={fiOr(claim.ciri_khusus)} /></p></div>
                      </div>
                    </div>
                  </section>

                  <section className="fi-panel" aria-labelledby="item-heading">
                    <p className="fi-panel-kicker">02 / Reported item</p>
                    <h2 id="item-heading" className="fi-panel-title">{fiOr(claim.nama_barang, 'Item unavailable')}</h2>
                    {claim.photo_path && claim.kode_laporan !== null ? (
                      <figure className="fi-photo-frame">
                        <a href={itemPhotoUrl(claim.kode_laporan)} target="_blank" rel="noopener"><img src={itemPhotoUrl(claim.kode_laporan)} alt={`Photo of ${claim.nama_barang ?? 'the reported item'}`} /></a>
                      </figure>
                    ) : null}
                    <dl className="fi-fields mb-0">
                      <div className="fi-field"><dt className="fi-field-label">Report ID</dt><dd className="fi-field-value">{claim.kode_laporan !== null ? '#' + Number(claim.kode_laporan) : 'No linked item'}</dd></div>
                      <div className="fi-field"><dt className="fi-field-label">Item status</dt><dd className="fi-field-value"><Badge status={claim.status_barang ?? ''} fallback="Unknown" /></dd></div>
                      <div className="fi-field"><dt className="fi-field-label">Date found</dt><dd className="fi-field-value">{fiDate(claim.tanggal_ditemukan)}</dd></div>
                    </dl>
                  </section>

                  <section className="fi-panel" aria-labelledby="claimant-heading">
                    <p className="fi-panel-kicker">03 / Claimant</p>
                    <h2 id="claimant-heading" className="fi-panel-title">{fiOr(claim.name_user, 'Unknown student')}</h2>
                    <dl className="fi-fields mb-0">
                      <div className="fi-field"><dt className="fi-field-label">Campus email</dt><dd className="fi-field-value">{fiOr(claim.email_kampus, 'Not available')}</dd></div>
                      <div className="fi-field"><dt className="fi-field-label">Phone number</dt><dd className="fi-field-value">{fiOr(claim.no_telp, 'Not available')}</dd></div>
                    </dl>
                  </section>
                </div>

                <aside className="fi-sticky" aria-label="Decision">
                  {isPending ? (
                    <section className="fi-panel">
                      <p className="fi-panel-kicker">04 / Admin decision</p>
                      <h2 className="h4 mb-2">Review this claim</h2>
                      <p className="text-secondary small">Check the evidence before deciding. A decision cannot be changed through this form afterward.</p>
                      <form method="POST" action={`/api/admin/claim-decision?id=${Number(claim.id_claim)}`} className="needs-validation" noValidate>
                        <input type="hidden" name="csrf_token" value={csrf} />
                        <div className="mb-3">
                          <label htmlFor="catatan_admin" className="form-label">Admin note / decision reason <span className="fi-required" aria-hidden="true">*</span></label>
                          <textarea className="form-control" id="catatan_admin" name="catatan_admin" rows={4} maxLength={5000} data-counter required defaultValue={flash.form?.catatan_admin ?? ''} />
                          <div className="invalid-feedback">Please explain your decision.</div>
                          <div className="form-text">Explain why the claim is approved or rejected.</div>
                        </div>
                        <div className="mb-2">
                          <label htmlFor="lokasi_pengambilan" className="form-label">Pickup location</label>
                          <input type="text" className="form-control" id="lokasi_pengambilan" name="lokasi_pengambilan" maxLength={100} data-required-for="approve"
                            placeholder="Example: IT Building, Administration Office" defaultValue={flash.form?.lokasi_pengambilan ?? ''} />
                          <div className="invalid-feedback">Enter a pickup location before approving.</div>
                          <div className="form-text">Required when approving. Not needed when rejecting.</div>
                        </div>
                        <div className="fi-decision-actions">
                          <button type="submit" name="decision" value="approve" className="btn btn-primary"
                            data-confirm="The student will get a pickup code and QR code. Other pending claims for this item will be rejected automatically."
                            data-confirm-title="Approve this claim?" data-confirm-tone="success" data-confirm-label="Yes, approve">Approve claim</button>
                          <button type="submit" name="decision" value="reject" className="btn btn-outline-danger"
                            data-confirm="The student will be notified and will see your admin note. This cannot be undone from this form."
                            data-confirm-title="Reject this claim?" data-confirm-tone="danger" data-confirm-label="Yes, reject">Reject claim</button>
                        </div>
                      </form>
                    </section>
                  ) : (
                    <section className="fi-panel">
                      <p className="fi-panel-kicker">04 / Decision completed</p>
                      <h2 className="h4 mb-3">This claim has been reviewed</h2>
                      <p className="mb-3">Current status: <Badge status={claim.status_klaim ?? ''} /></p>
                      <dl className="fi-fields fi-fields--single mb-3">
                        <div className="fi-field"><dt className="fi-field-label">Admin note</dt><dd className="fi-field-value"><Nl2br text={fiOr(claim.catatan_admin, 'No admin note')} /></dd></div>
                        <div className="fi-field"><dt className="fi-field-label">Pickup code</dt><dd className="fi-field-value">{claim.kode_pengambilan ? <span className="fi-code">{claim.kode_pengambilan}</span> : 'Not generated'}</dd></div>
                        <div className="fi-field"><dt className="fi-field-label">Pickup location</dt><dd className="fi-field-value">{fiOr(claim.lokasi_pengambilan, 'Not assigned')}</dd></div>
                      </dl>
                      {claim.status_klaim === 'Approved' && claim.kode_pengambilan ? (
                        <div className="mb-3">
                          <QrBlock token={String(claim.kode_pengambilan)} fileName={'FindIT-' + claim.kode_pengambilan} caption={String(claim.kode_pengambilan)} />
                        </div>
                      ) : null}
                      <p className="small mb-0">This claim can no longer be approved or rejected using this form.</p>
                    </section>
                  )}
                  <a href="/admin/claims" className="btn btn-outline-secondary w-100 mt-3">Back to claims</a>
                </aside>
              </div>
            </>
          ) : null}
        </div>
      </main>
      <Footer note="Admin claim review" />
    </>
  );
}
