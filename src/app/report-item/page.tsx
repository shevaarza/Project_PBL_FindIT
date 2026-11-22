import { db } from '@/lib/db';
import { csrfToken, requireRole } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { env } from '@/lib/env';
import { PublicNav } from '@/components/Nav';
import { Alert, Footer, PageHeader } from '@/components/ui';
import CameraCapture from '@/components/CameraCapture';
import { isVerified } from '@/lib/verification';

export const metadata = { title: 'Report found item | FindIT' };

const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: env.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default async function ReportItemPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const user = await requireRole('student');
  const sp = await searchParams;
  const flash = await getFlash();
  let errorMessage = flash.error ?? '';
  let categories: Record<string, any>[] = [];
  try {
    categories = await db.rows('SELECT id_category, name_category FROM public.category ORDER BY name_category ASC');
  } catch (e) {
    console.error('Student Report Item error: ' + (e as Error).message);
    errorMessage = 'Unable to submit your item report. Please try again later.';
  }
  const f = flash.form ?? {};
  const form = {
    nama_barang: f.nama_barang ?? '', id_kategori: f.id_kategori ?? '', detail_lokasi: f.detail_lokasi ?? '',
    tanggal_ditemukan: f.tanggal_ditemukan ?? todayYmd(), ciri_umum: f.ciri_umum ?? '', ciri_khusus: f.ciri_khusus ?? '',
  };
  let verified = true;
  try { verified = await isVerified(user.id); } catch (e) { console.error('[FindIT] Failed to check verification: ' + (e as Error).message); }
  const successMessage = sp.created === '1' ? 'Your found item report has been submitted successfully.' : '';
  const token = await csrfToken();

  return (
    <>
      <PublicNav user={user} active="report" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <div className="fi-narrow">
            <a href="/" className="fi-back-link">&larr; Back to found items</a>

            <PageHeader eyebrow="Campus lost & found / Report item" titleHtml="Report a<br><span>found item.</span>"
              lead="Share the general details so the owner can recognize the item. Keep distinctive features private for verification." />

            {errorMessage !== '' ? <Alert type="danger" message={errorMessage} /> : null}
            {successMessage !== '' ? <Alert type="success" message={successMessage} autoHide /> : null}

            {!verified ? (
              <>
                <Alert type="warning" message="Your account is not yet verified. Please verify your campus email in your profile before you report a found item." />
                <div className="d-flex flex-wrap gap-2">
                  <a href="/profile#verify" className="btn btn-primary">Verify my account</a>
                  <a href="/" className="btn btn-outline-secondary">Back to found items</a>
                </div>
              </>
            ) : (
            <form method="POST" action="/api/report-item" className="fi-form-card needs-validation" encType="multipart/form-data" noValidate>
              <input type="hidden" name="csrf_token" value={token} />

              <section className="fi-form-section">
                <h2 className="fi-form-section-title">Item details</h2>
                <p className="fi-form-section-hint">This information is shown publicly on the item listing.</p>

                <div className="row g-3">
                  <div className="col-12 col-md-7">
                    <label htmlFor="nama_barang" className="form-label">Item name<span className="fi-required" aria-hidden="true">*</span></label>
                    <input type="text" className="form-control" id="nama_barang" name="nama_barang" maxLength={100}
                      placeholder="Example: Black wireless headphones" defaultValue={form.nama_barang} required />
                    <div className="invalid-feedback">Please enter the item name.</div>
                  </div>

                  <div className="col-12 col-md-5">
                    <label htmlFor="id_kategori" className="form-label">Category<span className="fi-required" aria-hidden="true">*</span></label>
                    <select className="form-select" id="id_kategori" name="id_kategori" required defaultValue={form.id_kategori}>
                      <option value="">Select a category</option>
                      {categories.map((c) => <option key={c.id_category} value={Number(c.id_category)}>{c.name_category}</option>)}
                    </select>
                    <div className="invalid-feedback">Please choose a category.</div>
                  </div>

                  <div className="col-12 col-md-8">
                    <label htmlFor="detail_lokasi" className="form-label">Location found<span className="fi-required" aria-hidden="true">*</span></label>
                    <textarea className="form-control" id="detail_lokasi" name="detail_lokasi" rows={2} maxLength={5000}
                      placeholder="Example: IT Building, 5th floor corridor" required defaultValue={form.detail_lokasi} />
                    <div className="invalid-feedback">Please tell us where you found the item.</div>
                  </div>

                  <div className="col-12 col-md-4">
                    <label htmlFor="tanggal_ditemukan" className="form-label">Date found<span className="fi-required" aria-hidden="true">*</span></label>
                    <input type="date" className="form-control" id="tanggal_ditemukan" name="tanggal_ditemukan" max={todayYmd()} defaultValue={form.tanggal_ditemukan} required />
                    <div className="invalid-feedback">Choose a date that is not in the future.</div>
                  </div>

                  <CameraCapture />

                  <div className="col-12">
                    <label htmlFor="ciri_umum" className="form-label">General features</label>
                    <textarea className="form-control" id="ciri_umum" name="ciri_umum" rows={3} maxLength={5000} data-counter
                      placeholder="Describe the item's visible appearance, such as color and brand." defaultValue={form.ciri_umum} />
                  </div>
                </div>
              </section>

              <section className="fi-form-section">
                <h2 className="fi-form-section-title">Verification details</h2>
                <p className="fi-form-section-hint">Only the admin can see this. It is used to verify ownership claims.</p>

                <label htmlFor="ciri_khusus" className="form-label">Distinctive features (private)<span className="fi-required" aria-hidden="true">*</span></label>
                <textarea className="form-control" id="ciri_khusus" name="ciri_khusus" rows={3} maxLength={5000} data-counter
                  placeholder="Enter details only the finder and admin should know." required defaultValue={form.ciri_khusus} />
                <div className="invalid-feedback">Please add at least one distinctive feature for verification.</div>

                <div className="fi-callout mt-3">
                  This information will not be shown on the public item listing. The admin will use it to help verify ownership claims.
                </div>
              </section>

              <div className="fi-form-actions">
                <button type="submit" className="btn btn-primary" data-loading-text="Submitting...">Submit report</button>
                <a href="/" className="btn btn-outline-secondary">Cancel</a>
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
