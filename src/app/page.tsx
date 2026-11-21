import { db } from '@/lib/db';
import { Crypto } from '@/lib/crypto';
import { currentUser } from '@/lib/session';
import { fiDate, fiOr } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { numberFormat } from '@/lib/student-text';
import { PublicNav } from '@/components/Nav';
import { EmptyState, Footer } from '@/components/ui';

export const metadata = { title: 'FindIT - Lost and Found' };

export default async function HomePage() {
  let items: Record<string, any>[] = [];
  try {
    items = Crypto.decryptRows(await db.rows(
      `SELECT i.kode_laporan, i.nama_barang, i.detail_lokasi, i.tanggal_ditemukan, i.photo_path, c.name_category
       FROM public.item AS i
       INNER JOIN public.category AS c ON i.id_kategori = c.id_category
       WHERE i.status_barang = $1
       ORDER BY i.tanggal_ditemukan DESC`, ['Found']));
  } catch (e) {
    console.error('[FindIT] Failed to retrieve items: ' + (e as Error).message);
    return <>Sorry, the item catalog is currently unavailable.</>;
  }

  const user = await currentUser();
  const names = new Set<string>();
  for (const r of items) { const n = String(r.name_category ?? '').trim(); if (n) names.add(n); }
  const categoryNames = [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const total = items.length;
  const isStudent = user?.role === 'student';

  return (
    <>
      <PublicNav user={user} active="home" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <header className="fi-hero">
            <div className="fi-hero-text">
              <p className="fi-eyebrow">Campus lost &amp; found / FindIT</p>
              <h1 className="fi-title">Lost something?<br /><span>FindIT.</span></h1>
              <p className="fi-lead">
                Find your lost belongings and help others find theirs.<br />
                Browse the items found around campus below.
              </p>
              <div className="fi-hero-actions">
                {isStudent ? (
                  <>
                    <a href="/report-item" className="btn btn-primary">+ Report found item</a>
                    <a href="/my-claims" className="btn btn-outline-secondary">My claims</a>
                  </>
                ) : user?.role === 'admin' ? (
                  <a href="/admin" className="btn btn-primary">Open admin dashboard</a>
                ) : (
                  <>
                    <a href="/register" className="btn btn-primary">Create an account</a>
                    <a href="/login" className="btn btn-outline-secondary">Sign in</a>
                  </>
                )}
              </div>
            </div>
            <div className="fi-count" role="group" aria-label="Items waiting for their owners">
              <span className="fi-count-number">{numberFormat(total)}</span>
              <span className="fi-count-label">Items waiting</span>
            </div>
          </header>

          <section aria-labelledby="found-items-heading">
            <div className="fi-section-head">
              <div>
                <p className="fi-eyebrow mb-1">The inventory</p>
                <h2 id="found-items-heading">Found items</h2>
              </div>
              {total > 0 ? (
                <span className="small" aria-live="polite">
                  Showing <strong id="home-visible-count">{total}</strong> of {numberFormat(total)} item(s)
                </span>
              ) : null}
            </div>

            {total === 0 ? (
              <div className="fi-empty-boxed">
                <EmptyState title="No found items yet" text="Found item reports will appear here as soon as they are available."
                  action={isStudent ? <a href="/report-item" className="btn btn-primary">Report a found item</a> : undefined} />
              </div>
            ) : (
              <>
                <div className="fi-toolbar fi-toolbar--standalone">
                  <div className="fi-toolbar-field">
                    <label htmlFor="home-search">Search items</label>
                    <input type="search" className="form-control" id="home-search" placeholder="Item name, category, or location..." autoComplete="off" />
                  </div>
                  <div className="fi-toolbar-field">
                    <label htmlFor="home-category">Category</label>
                    <select className="form-select" id="home-category">
                      <option value="">All categories</option>
                      {categoryNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="fi-toolbar-field d-flex align-items-end">
                    <button type="button" className="btn btn-outline-secondary w-100" id="home-reset">Reset filters</button>
                  </div>
                </div>

                <div className="fi-item-grid">
                  {items.map((item) => {
                    const searchText = [item.nama_barang ?? '', item.name_category ?? '', item.detail_lokasi ?? ''].join(' ').toLowerCase();
                    const id = Number(item.kode_laporan);
                    return (
                      <article key={id} className="fi-item-card" data-item-card data-search={searchText} data-category={item.name_category ?? ''}>
                        <div className="fi-item-card-image">
                          {item.photo_path ? (
                            <img src={itemPhotoUrl(id)} alt={String(item.nama_barang ?? '')} loading="lazy" />
                          ) : (
                            <div className="fi-item-card-placeholder"><span>FindIT</span><small>No photo available</small></div>
                          )}
                        </div>
                        <div className="fi-item-card-content">
                          <div className="fi-item-card-top">
                            <span className="fi-chip">{fiOr(item.name_category ?? '', 'Uncategorized')}</span>
                            <span className="fi-item-card-id">#{id}</span>
                          </div>
                          <h3 className="fi-item-card-title">{item.nama_barang}</h3>
                          <div className="fi-item-card-meta">
                            <div className="fi-field">
                              <span className="fi-field-label">Location</span>
                              <p className="fi-field-value">{fiOr(item.detail_lokasi ?? '', 'Not specified')}</p>
                            </div>
                            <div className="fi-field">
                              <span className="fi-field-label">Date found</span>
                              <p className="fi-field-value">{fiDate(item.tanggal_ditemukan ?? '')}</p>
                            </div>
                          </div>
                          <div className="fi-item-card-footer">
                            <a className="btn btn-outline-secondary w-100" href={`/item-detail?id=${id}`}>View details</a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div id="home-no-results" className="fi-empty-boxed mt-3" hidden>
                  <EmptyState title="No matching items" text="Try a different search term or choose another category." mark="?" />
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
