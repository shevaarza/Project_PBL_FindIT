import { db } from '@/lib/db';
import { Crypto } from '@/lib/crypto';
import { requireRole } from '@/lib/session';
import { fiDateTime, fiOr } from '@/lib/format';
import { Nl2br, numberFormat } from '@/lib/student-text';
import { PublicNav } from '@/components/Nav';
import { Alert, Badge, EmptyState, Footer, PageHeader, QrBlock } from '@/components/ui';

export const metadata = { title: 'My claims | FindIT' };

export default async function MyClaimsPage() {
  const user = await requireRole('student');
  let claims: Record<string, any>[] = [];
  let errorMessage = '';
  try {
    claims = Crypto.decryptRows(await db.rows(
      `SELECT c.id_claim, c.kode_klaim, c.status_klaim, c.created_at, c.updated_at, c.catatan_admin, c.kode_pengambilan, c.lokasi_pengambilan,
              i.kode_laporan, i.nama_barang, i.detail_lokasi, i.tanggal_ditemukan, i.status_barang, cat.name_category
       FROM public.claim AS c
       LEFT JOIN public.item AS i ON c.id_item = i.kode_laporan
       LEFT JOIN public.category AS cat ON i.id_kategori = cat.id_category
       WHERE c.id_user_pengaju = $1
       ORDER BY c.created_at DESC NULLS LAST, c.id_claim DESC`, [user.id]));
  } catch (e) {
    console.error('[FindIT] Failed to load student claims: ' + (e as Error).message);
    errorMessage = 'Unable to load your claim history. Please try again later.';
  }
  const total = claims.length;

  return (
    <>
      <PublicNav user={user} active="claims" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <div className="fi-narrow" style={{ width: 'min(900px, 100%)' }}>
            <PageHeader eyebrow="Campus lost & found / Student" titleHtml="My<br><span>claims.</span>"
              lead="Track your claim requests and check whether your item is ready for pickup." count={numberFormat(total)} countLabel="Your claim requests" />

            {errorMessage !== '' ? (
              <Alert type="danger" message={errorMessage} />
            ) : total === 0 ? (
              <div className="fi-empty-boxed">
                <EmptyState title="No claims yet" text="When you submit a claim for a found item, it will appear here."
                  action={<a href="/" className="btn btn-primary">Browse found items</a>} />
              </div>
            ) : (
              <div className="fi-claim-list">
                {claims.map((claim) => {
                  const status = String(claim.status_klaim ?? '');
                  const isApproved = status === 'Approved';
                  const pickupCode = String(claim.kode_pengambilan ?? '');
                  return (
                    <article key={claim.id_claim} className="fi-claim-card" id={`claim-${Number(claim.id_claim)}`}>
                      <div className="fi-claim-head">
                        <div>
                          <h2 className="fi-claim-title">{fiOr(claim.nama_barang ?? '', 'Item unavailable')}</h2>
                          <p className="fi-claim-ref">Reference: <span className="fi-code">{fiOr(claim.kode_klaim ?? '', 'Not available')}</span></p>
                        </div>
                        <Badge status={status} />
                      </div>

                      <dl className="fi-fields mb-0">
                        <div className="fi-field"><dt className="fi-field-label">Category</dt><dd className="fi-field-value">{fiOr(claim.name_category ?? '', 'Uncategorized')}</dd></div>
                        <div className="fi-field"><dt className="fi-field-label">Report ID</dt><dd className="fi-field-value">{claim.kode_laporan !== null ? '#' + Number(claim.kode_laporan) : 'Item unavailable'}</dd></div>
                        <div className="fi-field"><dt className="fi-field-label">Claim submitted</dt><dd className="fi-field-value">{fiDateTime(claim.created_at ?? '')}</dd></div>
                        <div className="fi-field"><dt className="fi-field-label">Last updated</dt><dd className="fi-field-value">{fiDateTime(claim.updated_at ?? '')}</dd></div>
                      </dl>

                      {isApproved ? (
                        <section className="fi-pickup" aria-label="Pickup information">
                          <p className="fi-eyebrow mb-2">Claim approved / Pickup information</p>
                          <span className="fi-field-label">Pickup code</span>
                          <div className="fi-pickup-code-row">
                            <span className="fi-pickup-code">{fiOr(pickupCode, 'Not available')}</span>
                            {pickupCode !== '' ? <button type="button" className="btn btn-soft btn-sm" data-copy={pickupCode}>Copy code</button> : null}
                          </div>
                          <span className="fi-field-label">Pickup location</span>
                          <p className="fi-field-value mb-3">{fiOr(claim.lokasi_pengambilan ?? '', 'Not assigned')}</p>
                          {pickupCode !== '' ? (
                            <QrBlock token={pickupCode} fileName={'FindIT-' + pickupCode} caption={pickupCode}
                              note="Scanning this QR code shows your pickup code. Download it and keep it as proof of your claim." />
                          ) : null}
                        </section>
                      ) : status === 'Rejected' ? (
                        <div className="alert alert-danger fi-alert fi-note" role="status">
                          <span className="fi-alert-dot" aria-hidden="true"></span>
                          <div className="fi-alert-text">
                            <strong>Claim not approved.</strong>
                            {claim.catatan_admin ? (
                              <div className="mt-1"><Nl2br text={String(claim.catatan_admin)} /></div>
                            ) : (
                              <div className="mt-1">Please contact the FindIT administrator if you need more information.</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="alert alert-warning fi-alert fi-note" role="status">
                          <span className="fi-alert-dot" aria-hidden="true"></span>
                          <div className="fi-alert-text">Your claim is waiting for admin verification.</div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer note="Student claim history" />
    </>
  );
}
