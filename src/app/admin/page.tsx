import { db } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { Crypto } from '@/lib/crypto';
import { collectAlerts, renderAlertItem, type Alert } from '@/lib/adminAlerts';
import { fiDate } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { AdminNav } from '@/components/Nav';
import { Alert as AlertBox, Badge, Footer, Icon, PageHeader } from '@/components/ui';

export const metadata = { title: 'Admin dashboard | FindIT' };

export default async function AdminDashboard() {
  const admin = await requireRole('admin');

  let alerts: Alert[] = [];
  try { alerts = await collectAlerts(db); } catch (e) { console.error('[FindIT] Dashboard alerts error: ' + (e as Error).message); }

  let stats: Record<string, number> | null = null;
  let statsError = false;
  try {
    const row = await db.one(`
      SELECT (SELECT COUNT(*) FROM public.item) AS items,
             (SELECT COUNT(*) FROM public.item WHERE status_barang = 'Found') AS available,
             (SELECT COUNT(*) FROM public.claim WHERE status_klaim = 'Pending Verification') AS pending,
             (SELECT COUNT(*) FROM public.claim WHERE status_klaim = 'Approved') AS approved`);
    if (row) stats = { items: Number(row.items), available: Number(row.available), pending: Number(row.pending), approved: Number(row.approved) };
  } catch (e) { console.error('[FindIT] Dashboard statistics error: ' + (e as Error).message); statsError = true; }

  // Latest reports with their photo (taken or uploaded by the student).
  let latest: Record<string, any>[] = [];
  try {
    latest = Crypto.decryptRows(await db.rows(`
      SELECT i.kode_laporan, i.nama_barang, i.status_barang, i.tanggal_ditemukan, i.photo_path, c.name_category
      FROM public.item AS i LEFT JOIN public.category AS c ON i.id_kategori = c.id_category
      ORDER BY i.created_at DESC LIMIT 6`));
  } catch (e) { console.error('[FindIT] Dashboard latest reports error: ' + (e as Error).message); }

  const show = (v: number | undefined) => (v === undefined || stats === null ? '–' : v.toLocaleString('en-US'));
  const alertsHtml = alerts.map((a) => renderAlertItem(a, 'card')).join('');

  return (
    <>
      <AdminNav active="dashboard" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <PageHeader eyebrow="Campus lost & found / Admin" titleHtml="Admin<br><span>dashboard.</span>"
            lead={`Welcome back, ${admin.name || 'Administrator'}. Manage reported items and review student claims.`} />

          {statsError ? <AlertBox type="warning" message="The statistics could not be loaded right now. You can still use the links below." /> : null}

          <section className="fi-attention" aria-labelledby="fi-attention-title">
            <h2 className="fi-attention-title" id="fi-attention-title">Needs attention</h2>
            {alerts.length === 0 ? (
              <div className="fi-attention-clear" role="status">
                <Icon name="shield-check" size={28} />
                <div><strong>All clear</strong><span>No claims are waiting and nothing needs your attention right now.</span></div>
              </div>
            ) : (
              <ul className="fi-notif-list fi-notif-list--page" dangerouslySetInnerHTML={{ __html: alertsHtml }} />
            )}
          </section>

          <section className="fi-stat-grid" aria-label="Summary">
            <div className="fi-stat fi-stat--lime"><span className="fi-stat-value">{show(stats?.pending)}</span><span className="fi-stat-label">Claims to review</span></div>
            <div className="fi-stat"><span className="fi-stat-value">{show(stats?.available)}</span><span className="fi-stat-label">Items available</span></div>
            <div className="fi-stat fi-stat--lilac"><span className="fi-stat-value">{show(stats?.items)}</span><span className="fi-stat-label">Total item reports</span></div>
            <div className="fi-stat fi-stat--clay"><span className="fi-stat-value">{show(stats?.approved)}</span><span className="fi-stat-label">Claims approved</span></div>
          </section>

          <section className="fi-action-grid" aria-label="Admin shortcuts">
            <div className="fi-action-card">
              <h2>Manage items</h2>
              <p>Review, add, and edit items reported by students.</p>
              <a href="/admin/items" className="btn btn-primary">View items</a>
            </div>
            <div className="fi-action-card">
              <h2>Manage claims</h2>
              <p>Review claim requests, compare the evidence with the original report, and approve or reject.</p>
              <a href="/admin/claims" className="btn btn-primary">View claims{stats && stats.pending ? ` (${stats.pending} waiting)` : ''}</a>
            </div>
          </section>

          {latest.length > 0 ? (
            <section aria-labelledby="latest-reports-heading" className="mt-4">
              <div className="fi-section-head">
                <div><p className="fi-eyebrow mb-1">Newest first</p><h2 id="latest-reports-heading">Latest reports</h2></div>
                <a href="/admin/items" className="btn btn-sm btn-outline-secondary">All items</a>
              </div>
              <div className="fi-table-panel">
                <div className="fi-table-wrap">
                  <table className="table fi-table">
                    <thead><tr><th scope="col">Report</th><th scope="col">Item</th><th scope="col">Category</th><th scope="col">Date found</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
                    <tbody>
                      {latest.map((it) => (
                        <tr key={it.kode_laporan}>
                          <td data-label="Report"><span className="fi-code">#{Number(it.kode_laporan)}</span></td>
                          <td data-label="Item">
                            <span className="fi-cell-with-thumb">
                              {it.photo_path ? <a href={itemPhotoUrl(it.kode_laporan)} target="_blank" rel="noopener"><img className="fi-thumb" src={itemPhotoUrl(it.kode_laporan)} alt={`Photo of ${it.nama_barang ?? 'item'}`} loading="lazy" /></a> : null}
                              <span className="fi-cell-name">{it.nama_barang}</span>
                            </span>
                          </td>
                          <td data-label="Category"><span className="fi-chip">{String(it.name_category ?? '').trim() || 'Uncategorized'}</span></td>
                          <td data-label="Date found">{fiDate(it.tanggal_ditemukan)}</td>
                          <td data-label="Status"><Badge status={it.status_barang} fallback="Unknown" /></td>
                          <td data-label="Action"><a href={`/admin/edit-item?id=${Number(it.kode_laporan)}`} className="btn btn-sm btn-outline-secondary">Edit</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <Footer note="Admin workspace" />
    </>
  );
}
