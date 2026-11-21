import { db } from '@/lib/db';
import { csrfToken, requireRole } from '@/lib/session';
import { Crypto } from '@/lib/crypto';
import { getFlash } from '@/lib/flash';
import { AdminNav } from '@/components/Nav';
import CameraCapture from '@/components/CameraCapture';
import { Alert, Footer, PageHeader } from '@/components/ui';

export const metadata = { title: 'Add item report | FindIT Admin' };

export default async function AddItemPage() {
  await requireRole('admin');
  const flash = await getFlash();
  const f = { nama_barang: '', id_kategori: '', id_user_pelapor: '', detail_lokasi: '', tanggal_ditemukan: new Date().toISOString().slice(0, 10), ciri_umum: '', ciri_khusus: '', ...(flash.form ?? {}) };
  let errorMessage = flash.error ?? '';
  let categories: Record<string, any>[] = [];
  let students: Record<string, any>[] = [];
  try {
    categories = await db.rows('SELECT id_category, name_category FROM public.category ORDER BY name_category ASC');
    // names are stored encrypted, so decrypt first and sort here.
    students = Crypto.decryptRows(await db.rows(`SELECT id_user, name_user, email_kampus FROM public."User" WHERE role_user = 'student'`))
      .sort((a, b) => String(a.name_user).toLowerCase().localeCompare(String(b.name_user).toLowerCase()));
  } catch (e) { console.error('Add Item error: ' + (e as Error).message); errorMessage = 'Unable to create the item report. Please try again later.'; }
  const csrf = await csrfToken();

  return (
    <>
      <AdminNav active="items" />
      <main className="fi-main" id="main">
        <div className="fi-container"><div className="fi-narrow">
          <a href="/admin/items" className="fi-back-link">&larr; Back to items</a>
          <PageHeader eyebrow="Campus lost & found / Inventory" titleHtml="Add item<br><span>report.</span>" lead="Record a found item so students can identify and claim their belongings." />
          {errorMessage !== '' ? <Alert type="danger" message={errorMessage} /> : null}
          <form method="POST" action="/api/admin/items" encType="multipart/form-data" className="fi-form-card needs-validation" noValidate>
            <input type="hidden" name="csrf_token" value={csrf} />
            <input type="hidden" name="action" value="create" />
            <section className="fi-form-section">
              <h2 className="fi-form-section-title">Item details</h2>
              <p className="fi-form-section-hint">This information is shown publicly on the item listing.</p>
              <div className="row g-3">
                <div className="col-12 col-md-7">
                  <label htmlFor="nama_barang" className="form-label">Item name<span className="fi-required" aria-hidden="true">*</span></label>
                  <input type="text" className="form-control" id="nama_barang" name="nama_barang" maxLength={100} defaultValue={f.nama_barang} required />
                  <div className="invalid-feedback">Please enter the item name.</div>
                </div>
                <div className="col-12 col-md-5">
                  <label htmlFor="id_kategori" className="form-label">Category<span className="fi-required" aria-hidden="true">*</span></label>
                  <select className="form-select" id="id_kategori" name="id_kategori" required defaultValue={String(f.id_kategori)}>
                    <option value="">Select a category</option>
                    {categories.map((c) => <option key={c.id_category} value={Number(c.id_category)}>{c.name_category}</option>)}
                  </select>
                  <div className="invalid-feedback">Please choose a category.</div>
                </div>
                <div className="col-12">
                  <label htmlFor="id_user_pelapor" className="form-label">Student reporter<span className="fi-required" aria-hidden="true">*</span></label>
                  <select className="form-select" id="id_user_pelapor" name="id_user_pelapor" required defaultValue={String(f.id_user_pelapor)}>
                    <option value="">Select a student</option>
                    {students.map((s) => <option key={s.id_user} value={Number(s.id_user)}>{s.name_user} ({s.email_kampus})</option>)}
                  </select>
                  <div className="invalid-feedback">Please select the student who reported the item.</div>
                  <div className="form-text">The report will be associated with the selected student.</div>
                </div>
                <div className="col-12 col-md-8">
                  <label htmlFor="detail_lokasi" className="form-label">Location found<span className="fi-required" aria-hidden="true">*</span></label>
                  <textarea className="form-control" id="detail_lokasi" name="detail_lokasi" rows={2} maxLength={5000} required defaultValue={f.detail_lokasi} />
                  <div className="invalid-feedback">Please tell us where the item was found.</div>
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="tanggal_ditemukan" className="form-label">Date found<span className="fi-required" aria-hidden="true">*</span></label>
                  <input type="date" className="form-control" id="tanggal_ditemukan" name="tanggal_ditemukan" defaultValue={f.tanggal_ditemukan} required />
                  <div className="invalid-feedback">Please choose the date found.</div>
                </div>
                <CameraCapture />
                <div className="col-12">
                  <label htmlFor="ciri_umum" className="form-label">General features</label>
                  <textarea className="form-control" id="ciri_umum" name="ciri_umum" rows={3} maxLength={5000} data-counter defaultValue={f.ciri_umum} />
                </div>
              </div>
            </section>
            <section className="fi-form-section">
              <h2 className="fi-form-section-title">Verification details</h2>
              <p className="fi-form-section-hint">Private. Used by admins to compare against claim evidence.</p>
              <label htmlFor="ciri_khusus" className="form-label">Distinctive features</label>
              <textarea className="form-control" id="ciri_khusus" name="ciri_khusus" rows={3} maxLength={5000} data-counter defaultValue={f.ciri_khusus} />
            </section>
            <div className="fi-form-actions">
              <button type="submit" className="btn btn-primary" data-loading-text="Creating...">Create report</button>
              <a href="/admin/items" className="btn btn-outline-secondary">Cancel</a>
            </div>
          </form>
        </div></div>
      </main>
      <Footer />
    </>
  );
}
