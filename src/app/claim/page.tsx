import { db } from '@/lib/db';
import { Crypto } from '@/lib/crypto';
import { csrfToken, requireRole } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { fiDate, fiOr } from '@/lib/format';
import { intParam } from '@/lib/student-text';
import { PublicNav } from '@/components/Nav';
import { Alert, Badge, Footer, PageHeader } from '@/components/ui';

export const metadata = { title: 'Claim item | FindIT' };

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await requireRole('student');
  const itemId = intParam((await searchParams).id);
  if (!itemId) return <>Invalid item ID.</>;

  let item: Record<string, any> | null = null;
  try {
    const row = await db.one(
      `SELECT i.kode_laporan, i.nama_barang, i.detail_lokasi, i.tanggal_ditemukan, i.status_barang, i.id_user_pelapor, c.name_category
       FROM public.item AS i LEFT JOIN public.category AS c ON i.id_kategori = c.id_category
       WHERE i.kode_laporan = $1 LIMIT 1`, [itemId]);
    item = row ? Crypto.decryptRow(row) : null;
  } catch (e) {
    console.error('[FindIT] Failed to load claim item: ' + (e as Error).message);
    return <>Unable to load this item right now. Please try again later.</>;
  }
  if (!item) return <>The selected item could not be found.</>;

  const isOwnReport = user.id > 0 && Number(item.id_user_pelapor ?? 0) === user.id;
  const flash = await getFlash();
  const errorMessage = flash.error ?? '';
  const successMessage = flash.success ?? '';
  const formData = {
    lokasi_kehilangan: flash.form?.lokasi_kehilangan ?? '',
    terakhir_di_lihat: flash.form?.terakhir_di_lihat ?? '',
    ciri_khusus_claim: flash.form?.ciri_khusus_claim ?? '',
  };

  let hasApprovedClaim = false;
  try {
    hasApprovedClaim = (await db.value(`SELECT 1 FROM public.claim WHERE id_item = $1 AND status_klaim = 'Approved' LIMIT 1`, [itemId])) !== null;
  } catch (e) { console.error('[FindIT] Failed to check approved claim: ' + (e as Error).message); }

  let previousClaimStatus: string | null = null;
  if (user.id > 0 && !isOwnReport) {
    try {
      const r = await db.one('SELECT status_klaim FROM public.claim WHERE id_item = $1 AND id_user_pengaju = $2 LIMIT 1', [itemId, user.id]);
      previousClaimStatus = r ? String(r.status_klaim) : null;
    } catch (e) { console.error('[FindIT] Failed to check previous claim: ' + (e as Error).message); }
  }

  const token = await csrfToken();

  return (
    <>
      <PublicNav user={user} active="home" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <div className="fi-narrow">
            <a href={`/item-detail?id=${itemId}`} className="fi-back-link">&larr; Back to item</a>

            <PageHeader eyebrow="Campus lost & found / Claim" titleHtml="Claim this<br><span>item.</span>"
              lead="Tell us a few details that can help the admin verify that this item belongs to you." />

            <section className="fi-summary" aria-label="Item summary">
              <div>
                <p className="fi-panel-kicker mb-1">Item report #{itemId}</p>
                <h2 className="fi-summary-title">{item.nama_barang}</h2>
                <p className="fi-summary-meta">
                  {fiOr(item.name_category ?? '', 'Uncategorized')} &middot; {fiOr(item.detail_lokasi ?? '', 'Location not specified')} &middot; {fiDate(item.tanggal_ditemukan ?? '')}
                </p>
              </div>
              <Badge status={item.status_barang} />
            </section>

            {errorMessage !== '' ? <Alert type="danger" message={errorMessage} /> : null}

            {successMessage !== '' ? (
              <>
                <Alert type="success" message={successMessage} />
                <div className="d-flex flex-wrap gap-2">
                  <a href="/my-claims" className="btn btn-primary">View my claims</a>
                  <a href="/" className="btn btn-outline-secondary">Back to found items</a>
                </div>
              </>
            ) : isOwnReport ? (
              <>
                <Alert type="warning" message="You reported this item as found, so you cannot claim it yourself. Only the real owner can submit a claim." />
                <a href="/" className="btn btn-outline-secondary">Back to found items</a>
              </>
            ) : previousClaimStatus !== null ? (
              <>
                <Alert type="warning" message={previousClaimStatus === 'Rejected'
                  ? 'Your claim for this item was rejected, so you cannot claim it again.'
                  : 'You have already submitted a claim for this item. You can follow its progress on My claims.'} />
                <div className="d-flex flex-wrap gap-2">
                  <a href="/my-claims" className="btn btn-primary">View my claims</a>
                  <a href="/" className="btn btn-outline-secondary">Browse other items</a>
                </div>
              </>
            ) : item.status_barang !== 'Found' || hasApprovedClaim ? (
              <>
                <Alert type="warning" message="This item is not currently available for claims." />
                <a href="/" className="btn btn-outline-secondary">Browse other items</a>
              </>
            ) : (
              <form method="POST" action={`/api/claim?id=${itemId}`} className="fi-form-card needs-validation" noValidate>
                <input type="hidden" name="csrf_token" value={token} />

                <div className="mb-4">
                  <label htmlFor="lokasi_kehilangan" className="form-label">Where did you lose the item?<span className="fi-required" aria-hidden="true">*</span></label>
                  <textarea className="form-control" id="lokasi_kehilangan" name="lokasi_kehilangan" rows={3} maxLength={5000} data-counter required defaultValue={formData.lokasi_kehilangan} />
                  <div className="invalid-feedback">Please describe where you think you lost it.</div>
                  <div className="form-text">Describe the location where you think you lost it.</div>
                </div>

                <div className="mb-4">
                  <label htmlFor="terakhir_di_lihat" className="form-label">When and where did you last see it?<span className="fi-required" aria-hidden="true">*</span></label>
                  <textarea className="form-control" id="terakhir_di_lihat" name="terakhir_di_lihat" rows={3} maxLength={5000} data-counter required defaultValue={formData.terakhir_di_lihat} />
                  <div className="invalid-feedback">Please tell us when and where you last saw it.</div>
                </div>

                <div className="mb-4">
                  <label htmlFor="ciri_khusus_claim" className="form-label">What makes this item yours?<span className="fi-required" aria-hidden="true">*</span></label>
                  <textarea className="form-control" id="ciri_khusus_claim" name="ciri_khusus_claim" rows={4} maxLength={5000} data-counter required defaultValue={formData.ciri_khusus_claim} />
                  <div className="invalid-feedback">Please describe features only the owner would know.</div>
                  <div className="form-text">Include details only the owner would know, such as a sticker, scratch, case, or other distinctive feature.</div>
                </div>

                <div className="fi-callout">Your information will be reviewed by a FindIT administrator. Submitting a claim does not guarantee approval.</div>

                <div className="fi-form-actions">
                  <button type="submit" className="btn btn-primary" data-loading-text="Submitting...">Submit claim</button>
                  <a href={`/item-detail?id=${itemId}`} className="btn btn-outline-secondary">Cancel</a>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
