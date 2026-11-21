import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { csrfToken, requireRole } from '@/lib/session';
import { Crypto } from '@/lib/crypto';
import { getFlash } from '@/lib/flash';
import { itemPhotoUrl } from '@/lib/photos';
import { AdminNav } from '@/components/Nav';
import CameraCapture from '@/components/CameraCapture';
import { Alert, Footer, PageHeader } from '@/components/ui';

export const metadata = { title: 'Edit item report | FindIT Admin' };

export default async function EditItemPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole('admin');
  const sp = await searchParams;
  const itemId = /^\d+$/.test(String(sp.id ?? '')) ? parseInt(String(sp.id), 10) : 0;
  if (itemId < 1) redirect('/admin/items');

  const flash = await getFlash();
  let errorMessage = flash.error ?? '';
  let categories: Record<string, any>[] = [];
  let item: Record<string, any> | null = null;
  try {
    categories = await db.rows('SELECT id_category, name_category FROM public.category ORDER BY name_category ASC');
    const row = await db.one(
      'SELECT kode_laporan, nama_barang, id_kategori, detail_lokasi, tanggal_ditemukan, ciri_umum, ciri_khusus, photo_path FROM public.item WHERE kode_laporan = $1 LIMIT 1', [itemId]);
    item = row ? Crypto.decryptRow(row) : null;
  } catch (e) { console.error('Edit Item error: ' + (e as Error).message); errorMessage = 'Unable to process this item report. Please try again later.'; }
  if (!item && errorMessage === '') notFound();
  const it = { ...(item ?? {}), ...(flash.form ?? {}) } as Record<string, any>;
  const csrf = await csrfToken();

  return (
    <>
      <AdminNav active="items" />
      <main className="fi-main" id="main">
        <div className="fi-container"><div className="fi-narrow">
          <a href="/admin/items" className="fi-back-link">&larr; Back to items</a>
          <PageHeader eyebrow="Campus lost & found / Inventory" titleHtml="Edit item<br><span>report.</span>" lead="Update the item information and keep the report accurate."
            count={'#' + itemId} countLabel="Report ID" />
          {errorMessage !== '' ? <Alert type="danger" message={errorMessage} /> : null}
          <form method="POST" action="/api/admin/items" encType="multipart/form-data" className="fi-form-card needs-validation" noValidate>
            <input type="hidden" name="csrf_token" value={csrf} />
            <input type="hidden" name="action" value="update" />
            <input type="hidden" name="id" value={itemId} />
            <section className="fi-form-section">
              <h2 className="fi-form-section-title">Item details</h2>
              <p className="fi-form-section-hint">This information is shown publicly on the item listing.</p>
              <div className="row g-3">
                <div className="col-12 col-md-7">
                  <label htmlFor="nama_barang" className="form-label">Item name<span className="fi-required" aria-hidden="true">*</span></label>
                  <input type="text" className="form-control" id="nama_barang" name="nama_barang" maxLength={100} defaultValue={String(it.nama_barang ?? '')} required />
                  <div className="invalid-feedback">Please enter the item name.</div>
                </div>
                <div className="col-12 col-md-5">
                  <label htmlFor="id_kategori" className="form-label">Category<span className="fi-required" aria-hidden="true">*</span></label>
                  <select className="form-select" id="id_kategori" name="id_kategori" required defaultValue={String(it.id_kategori ?? '')}>
                    <option value="">Select a category</option>
                    {categories.map((c) => <option key={c.id_category} value={Number(c.id_category)}>{c.name_category}</option>)}
                  </select>
                  <div className="invalid-feedback">Please choose a category.</div>
                </div>
                <div className="col-12 col-md-8">
                  <label htmlFor="detail_lokasi" className="form-label">Location found<span className="fi-required" aria-hidden="true">*</span></label>
                  <textarea className="form-control" id="detail_lokasi" name="detail_lokasi" rows={2} required defaultValue={String(it.detail_lokasi ?? '')} />
                  <div className="invalid-feedback">Please tell us where the item was found.</div>
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="tanggal_ditemukan" className="form-label">Date found<span className="fi-required" aria-hidden="true">*</span></label>
                  <input type="date" className="form-control" id="tanggal_ditemukan" name="tanggal_ditemukan" defaultValue={String(it.tanggal_ditemukan ?? '')} required />
                  <div className="invalid-feedback">Please choose the date found.</div>
                </div>
                {item?.photo_path ? (
                  <div className="col-12">
                    <span className="form-label d-block">Current photo</span>
                    <figure className="fi-photo-frame mb-2"><a href={itemPhotoUrl(itemId)} target="_blank" rel="noopener"><img src={itemPhotoUrl(itemId)} alt="Current item photo" /></a></figure>
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" id="remove_photo" name="remove_photo" value="1" />
                      <label className="form-check-label" htmlFor="remove_photo">Remove this photo</label>
                    </div>
                  </div>
                ) : null}
                <CameraCapture label={item?.photo_path ? 'Replace photo' : 'Item photo'} />
                <div className="col-12">
                  <label htmlFor="ciri_umum" className="form-label">General features</label>
                  <textarea className="form-control" id="ciri_umum" name="ciri_umum" rows={3} defaultValue={String(it.ciri_umum ?? '')} />
                </div>
              </div>
            </section>
            <section className="fi-form-section">
              <h2 className="fi-form-section-title">Verification details</h2>
              <p className="fi-form-section-hint">Private. Used by admins to compare against claim evidence.</p>
              <label htmlFor="ciri_khusus" className="form-label">Distinctive features</label>
              <textarea className="form-control" id="ciri_khusus" name="ciri_khusus" rows={3} defaultValue={String(it.ciri_khusus ?? '')} />
            </section>
            <div className="fi-form-actions">
              <button type="submit" className="btn btn-primary" data-loading-text="Saving...">Save changes</button>
              <a href="/admin/items" className="btn btn-outline-secondary">Cancel</a>
            </div>
          </form>
        </div></div>
      </main>
      <Footer />
    </>
  );
}
