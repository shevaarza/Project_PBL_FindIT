import { db } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { Crypto } from '@/lib/crypto';
import { fiDateTime, fiOr } from '@/lib/format';
import { AdminNav } from '@/components/Nav';
import { Alert, Badge, EmptyState, Footer, PageHeader } from '@/components/ui';

export const metadata = { title: 'Manage claims | FindIT Admin' };

const FILTER_SCRIPT = `(function(){function init(){
const searchInput=document.getElementById('claim-search'),statusFilter=document.getElementById('claim-status-filter'),resetButton=document.getElementById('reset-claim-filters'),
visibleCount=document.getElementById('claim-visible-count'),noResultsRow=document.getElementById('no-claim-results'),claimRows=Array.from(document.querySelectorAll('#claims-table-body tr[data-search]'));
if(!searchInput||!statusFilter||!resetButton||!visibleCount){return;}
function filterClaims(){const term=searchInput.value.trim().toLowerCase(),sel=statusFilter.value.toLowerCase();let visible=0;
claimRows.forEach(function(row){const show=(row.dataset.search||'').includes(term)&&(sel===''||(row.dataset.status||'')===sel);row.hidden=!show;if(show){visible++;}});
visibleCount.textContent=visible;if(noResultsRow){noResultsRow.hidden=visible!==0;}}
searchInput.addEventListener('input',filterClaims);statusFilter.addEventListener('change',filterClaims);
resetButton.addEventListener('click',function(){searchInput.value='';statusFilter.value='';filterClaims();searchInput.focus();});}
if(document.readyState!=='loading'){init();}else{document.addEventListener('DOMContentLoaded',init);}})();`;

export default async function ClaimsPage() {
  await requireRole('admin');
  let claims: Record<string, any>[] = [];
  let error = '';
  try {
    claims = Crypto.decryptRows(await db.rows(`
      SELECT c.id_claim, c.kode_klaim, c.status_klaim, c.created_at, c.updated_at, c.lokasi_kehilangan, c.terakhir_di_lihat,
             c.ciri_khusus_claim, c.catatan_admin, c.kode_pengambilan, c.lokasi_pengambilan,
             i.kode_laporan, i.nama_barang, i.status_barang, u.name_user, u.email_kampus
      FROM public.claim AS c
      LEFT JOIN public.item AS i ON c.id_item = i.kode_laporan
      LEFT JOIN public."User" AS u ON c.id_user_pengaju = u.id_user
      ORDER BY c.created_at DESC NULLS LAST, c.id_claim DESC`));
  } catch (e) { console.error('Manage Claims error: ' + (e as Error).message); error = 'Unable to load claim requests. Please try again later.'; }

  const total = claims.length;
  const pending = claims.filter((c) => c.status_klaim === 'Pending Verification').length;
  const statuses = [...new Set(claims.map((c) => String(c.status_klaim ?? '').trim()).filter((s) => s !== ''))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));

  return (
    <>
      <AdminNav active="claims" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <PageHeader eyebrow="Campus lost & found / 02" titleHtml="Manage<br><span>claims.</span>"
            lead="Review student claim requests and check the information submitted for each reported item."
            count={total.toLocaleString('en-US')} countLabel="Total claims" />
          <section aria-labelledby="claims-heading">
            <div className="fi-section-head">
              <div><p className="fi-eyebrow mb-1">Claim management</p><h2 id="claims-heading">Claim requests</h2></div>
              {pending > 0 ? <span className="fi-badge fi-badge--warning">{pending} waiting for review</span> : null}
            </div>
            {error !== '' ? <Alert type="danger" message={error} /> : total === 0 ? (
              <div className="fi-empty-boxed"><EmptyState title="No claim requests yet" text="Student claim requests will appear here after they submit a claim for an item." /></div>
            ) : (
              <>
                <div className="fi-toolbar">
                  <div className="fi-toolbar-field"><label htmlFor="claim-search">Search claims</label>
                    <input type="search" className="form-control" id="claim-search" placeholder="Claim code, item or student..." autoComplete="off" /></div>
                  <div className="fi-toolbar-field"><label htmlFor="claim-status-filter">Claim status</label>
                    <select className="form-select" id="claim-status-filter"><option value="">All statuses</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                </div>
                <div className="fi-results-bar" aria-live="polite">
                  <p>Showing <strong id="claim-visible-count">{total}</strong> of {total.toLocaleString('en-US')} claims</p>
                  <button type="button" className="btn btn-sm btn-outline-secondary" id="reset-claim-filters">Reset filters</button>
                </div>
                <div className="fi-table-panel"><div className="fi-table-wrap">
                  <table className="table fi-table">
                    <thead><tr><th scope="col">Claim</th><th scope="col">Item</th><th scope="col">Student</th><th scope="col">Submitted</th><th scope="col">Claim status</th><th scope="col">Pickup code</th><th scope="col">Action</th></tr></thead>
                    <tbody id="claims-table-body">
                      {claims.map((c) => {
                        const code = String(c.kode_klaim ?? '');
                        const status = String(c.status_klaim ?? '');
                        const search = [c.id_claim ?? '', code, c.nama_barang ?? '', c.name_user ?? '', c.email_kampus ?? '', status].join(' ').toLowerCase();
                        const pickup = String(c.kode_pengambilan ?? '');
                        return (
                          <tr key={c.id_claim} data-search={search} data-status={status.toLowerCase()}>
                            <td data-label="Claim"><span className="fi-cell-name">{code !== '' ? code : 'Claim #' + c.id_claim}</span><span className="fi-cell-meta">Internal ID: #{Number(c.id_claim)}</span></td>
                            <td data-label="Item"><span className="fi-cell-name">{fiOr(c.nama_barang, 'Item unavailable')}</span><span className="fi-cell-meta">{c.kode_laporan !== null ? 'Report #' + Number(c.kode_laporan) : 'No linked item'}</span></td>
                            <td data-label="Student"><span className="fi-cell-name">{fiOr(c.name_user, 'Unknown student')}</span><span className="fi-cell-meta">{String(c.email_kampus ?? '')}</span></td>
                            <td data-label="Submitted">{fiDateTime(c.created_at)}</td>
                            <td data-label="Status"><Badge status={status} /></td>
                            <td data-label="Pickup code">{pickup !== '' ? <span className="fi-code">{pickup}</span> : <>&mdash;</>}</td>
                            <td data-label="Action"><a href={`/admin/claim-detail?id=${Number(c.id_claim)}`} className="btn btn-sm btn-outline-secondary">View details</a></td>
                          </tr>
                        );
                      })}
                      <tr id="no-claim-results" hidden><td colSpan={7} data-label=""><EmptyState title="No matching claims" text="Try another search term or reset the filters." mark="?" /></td></tr>
                    </tbody>
                  </table>
                </div></div>
              </>
            )}
          </section>
        </div>
      </main>
      <Footer note="Claim requests / Admin workspace" />
      <script dangerouslySetInnerHTML={{ __html: FILTER_SCRIPT }} />
    </>
  );
}
