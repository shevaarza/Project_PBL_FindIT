import { db } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { Crypto } from '@/lib/crypto';
import { fiDate, fiOr } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { AdminNav } from '@/components/Nav';
import { Alert, Badge, EmptyState, Footer, PageHeader } from '@/components/ui';

export const metadata = { title: 'Manage items | FindIT Admin' };

const FILTER_SCRIPT = `(function(){function init(){
const searchInput=document.getElementById('item-search'),categoryFilter=document.getElementById('category-filter'),statusFilter=document.getElementById('status-filter'),
resetButton=document.getElementById('reset-filters'),visibleCount=document.getElementById('visible-count'),noResultsRow=document.getElementById('no-filter-results'),
itemRows=Array.from(document.querySelectorAll('#items-table-body tr[data-search]'));
if(!searchInput||!categoryFilter||!statusFilter||!visibleCount){return;}
function filterItems(){const searchTerm=searchInput.value.trim().toLowerCase(),selectedCategory=categoryFilter.value.toLowerCase(),selectedStatus=statusFilter.value.toLowerCase();let visibleItems=0;
itemRows.forEach(function(row){const t=row.dataset.search||'',c=(row.dataset.category||'').toLowerCase(),s=(row.dataset.status||'').toLowerCase();
const show=t.includes(searchTerm)&&(selectedCategory===''||c===selectedCategory)&&(selectedStatus===''||s===selectedStatus);row.hidden=!show;if(show){visibleItems++;}});
visibleCount.textContent=visibleItems;if(noResultsRow){noResultsRow.hidden=visibleItems!==0;}}
searchInput.addEventListener('input',filterItems);categoryFilter.addEventListener('change',filterItems);statusFilter.addEventListener('change',filterItems);
resetButton.addEventListener('click',function(){searchInput.value='';categoryFilter.value='';statusFilter.value='';filterItems();searchInput.focus();});}
if(document.readyState!=='loading'){init();}else{document.addEventListener('DOMContentLoaded',init);}})();`;

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole('admin');
  const sp = await searchParams;
  const success = sp.updated === '1' ? 'Item report updated successfully.' : sp.created === '1' ? 'Item report created successfully.' : '';

  let items: Record<string, any>[] = [];
  let error = '';
  try {
    items = Crypto.decryptRows(await db.rows(`
      SELECT i.kode_laporan, i.nama_barang, i.status_barang, i.tanggal_ditemukan, i.detail_lokasi, i.photo_path, c.name_category, u.name_user
      FROM public.item AS i
      LEFT JOIN public.category AS c ON i.id_kategori = c.id_category
      LEFT JOIN public."User" AS u ON i.id_user_pelapor = u.id_user
      ORDER BY i.created_at DESC`));
  } catch (e) { console.error('Manage Items error: ' + (e as Error).message); error = 'Unable to load item reports. Please try again later.'; }

  const natSort = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
  const categories = [...new Set(items.map((i) => String(i.name_category ?? '')).filter((c) => c !== ''))].sort(natSort);
  const statuses = [...new Set(items.map((i) => String(i.status_barang ?? '').trim()).filter((c) => c !== ''))].sort(natSort);
  const total = items.length;

  return (
    <>
      <AdminNav active="items" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <PageHeader eyebrow="Campus lost & found / 01" titleHtml="Manage<br><span>items.</span>"
            lead="Every item has a story. Keep track of reported belongings and help them find their way back."
            count={total.toLocaleString('en-US')} countLabel="Total reports" />
          <section aria-labelledby="item-reports-heading">
            <div className="fi-section-head">
              <div><p className="fi-eyebrow mb-1">The inventory</p><h2 id="item-reports-heading">Item reports</h2></div>
              <a href="/admin/add-item" className="btn btn-primary">+ Add item</a>
            </div>
            {error !== '' ? <Alert type="danger" message={error} /> : (
              <>
                {success !== '' ? <Alert type="success" message={success} autoHide /> : null}
                {total === 0 ? (
                  <div className="fi-empty-boxed">
                    <EmptyState title="No item reports yet" text="When an item is reported, its information will appear here."
                      action={<a href="/admin/add-item" className="btn btn-primary">Add the first item</a>} />
                  </div>
                ) : (
                  <>
                    <div className="fi-toolbar">
                      <div className="fi-toolbar-field"><label htmlFor="item-search">Search items</label>
                        <input type="search" className="form-control" id="item-search" placeholder="Name, location, reporter or ID..." autoComplete="off" /></div>
                      <div className="fi-toolbar-field"><label htmlFor="category-filter">Category</label>
                        <select className="form-select" id="category-filter"><option value="">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                      <div className="fi-toolbar-field"><label htmlFor="status-filter">Status</label>
                        <select className="form-select" id="status-filter"><option value="">All statuses</option>{statuses.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                    </div>
                    <div className="fi-results-bar" aria-live="polite">
                      <p>Showing <strong id="visible-count">{total}</strong> of {total.toLocaleString('en-US')} reports</p>
                      <button type="button" className="btn btn-sm btn-outline-secondary" id="reset-filters">Reset filters</button>
                    </div>
                    <div className="fi-table-panel"><div className="fi-table-wrap">
                      <table className="table fi-table">
                        <thead><tr><th scope="col">Report</th><th scope="col">Item</th><th scope="col">Category</th><th scope="col">Location</th><th scope="col">Reporter</th><th scope="col">Date found</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
                        <tbody id="items-table-body">
                          {items.map((it) => {
                            const cat = String(it.name_category ?? '');
                            const status = String(it.status_barang ?? '');
                            const search = [it.kode_laporan, it.nama_barang ?? '', cat, it.detail_lokasi ?? '', it.name_user ?? '', status, it.tanggal_ditemukan ?? ''].join(' ').toLowerCase();
                            return (
                              <tr key={it.kode_laporan} data-search={search} data-category={cat} data-status={status}>
                                <td data-label="Report"><span className="fi-code">#{Number(it.kode_laporan)}</span></td>
                                <td data-label="Item">
                                  <span className="fi-cell-with-thumb">
                                    {it.photo_path ? <a href={itemPhotoUrl(it.kode_laporan)} target="_blank" rel="noopener"><img className="fi-thumb" src={itemPhotoUrl(it.kode_laporan)} alt={`Photo of ${it.nama_barang ?? 'item'}`} loading="lazy" /></a> : null}
                                    <span className="fi-cell-name">{String(it.nama_barang ?? '')}</span>
                                  </span>
                                </td>
                                <td data-label="Category"><span className="fi-chip">{fiOr(cat, 'Uncategorized')}</span></td>
                                <td data-label="Location">{fiOr(it.detail_lokasi, 'Not specified')}</td>
                                <td data-label="Reporter">{fiOr(it.name_user, 'Unknown')}</td>
                                <td data-label="Date found">{fiDate(it.tanggal_ditemukan)}</td>
                                <td data-label="Status"><Badge status={status} fallback="Unknown" /></td>
                                <td data-label="Action"><a href={`/admin/edit-item?id=${Number(it.kode_laporan)}`} className="btn btn-sm btn-outline-secondary">Edit</a></td>
                              </tr>
                            );
                          })}
                          <tr id="no-filter-results" hidden>
                            <td colSpan={8} data-label=""><EmptyState title="No matching items" text="Try another search term or reset the filters." mark="?" /></td>
                          </tr>
                        </tbody>
                      </table>
                    </div></div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </main>
      <Footer note="Built for the IT student community." />
      <script dangerouslySetInnerHTML={{ __html: FILTER_SCRIPT }} />
    </>
  );
}
