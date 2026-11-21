import { currentUser, csrfToken, requireRole } from '@/lib/session';
import { getFlash } from '@/lib/flash';
import { fmtBytes, DB_NAME, databaseState, candidates, findRun, history, lastRestore, summary, type RunRow } from '@/lib/backup';
import { env } from '@/lib/env';
import { AdminNav } from '@/components/Nav';
import { Alert, EmptyState, Footer, PageHeader } from '@/components/ui';

export const metadata = { title: 'Backup Management | FindIT Admin' };
export const maxDuration = 30;

function BackupBadge({ status }: { status?: string | null }) {
  const s = status ?? '';
  const cls = ['SUCCESS', 'OK', 'VALID', 'HEALTHY', 'PASSED'].includes(s) ? 'fi-badge--success'
    : ['PARTIAL_SUCCESS', 'RUNNING', 'PENDING', 'NOT_CONFIGURED', 'NOT_RUN', 'SKIPPED'].includes(s) ? 'fi-badge--warning'
    : ['FAILED', 'INVALID', 'DAMAGED', 'MISSING'].includes(s) ? 'fi-badge--danger' : 'fi-badge--neutral';
  const labels: Record<string, string> = { NOT_APPLICABLE: 'Not needed', REFUSED: 'Refused' };
  return <span className={`fi-badge ${cls}`}>{s === '' ? 'Unknown' : labels[s] ?? s.replace(/_/g, ' ')}</span>;
}

function when(v?: string | null) {
  if (!v) return '–';
  const d = new Date(String(v).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z'));
  if (isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat('en-GB', { timeZone: process.env.APP_TIMEZONE || 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', ',');
}

const kindLabel = (k: string) => (k === 'pre-restore' ? 'Safety copy' : k);

export default async function BackupsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole('admin');
  const sp = await searchParams;
  const flash = await getFlash();
  const csrf = await csrfToken();
  const webEnabled = env.restoreWebEnabled;
  const selId = typeof sp.restore === 'string' ? sp.restore : '';

  let runs: RunRow[] = [], files: RunRow[] = [], last: RunRow | null = null, lr: RunRow | null = null, selected: RunRow | null = null;
  let s: Awaited<ReturnType<typeof summary>> = { last: null, running: false, warnings: [], counts: { total: 0, bytes: 0, daily: 0 } };
  let state: Awaited<ReturnType<typeof databaseState>> = { state: 'MISSING', message: 'The database cannot be reached.' };
  let loadError = '';
  try {
    [runs, files, s, state, lr] = await Promise.all([history(100), candidates(), summary(), databaseState(), lastRestore()]);
    last = s.last;
    if (webEnabled && selId) selected = (await findRun(selId)) ?? null;
    if (selected && !files.some((f) => f.id === selected!.id)) selected = null;
  } catch (e) { console.error('[FindIT] Backups page failed: ' + (e as Error).message); loadError = 'Unable to load the backup information. Please try again later.'; }

  return (
    <>
      <AdminNav active="backups" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <PageHeader eyebrow="Campus lost & found / Backup" titleHtml="Backup<br><span>management.</span>"
            lead="Back up the database, restore it from a backup, and review every run." count={String(s.counts.total)} countLabel="Backup files" />
          {flash.success ? <Alert type="success" message={flash.success} autoHide /> : null}
          {flash.error ? <Alert type="danger" message={flash.error} /> : null}
          {loadError ? <Alert type="danger" message={loadError} /> : null}
          {s.warnings.map((w) => <Alert key={w} type="warning" message={w} />)}

          <section className="fi-stat-grid" aria-label="Backup summary">
            <div className="fi-stat fi-stat--lime"><span className="fi-stat-value">{last ? when(last.finished_at ?? last.created_at) : '–'}</span><span className="fi-stat-label">Last backup</span></div>
            <div className="fi-stat"><span className="fi-stat-value">{last ? <BackupBadge status={last.status} /> : '–'}</span><span className="fi-stat-label">Last result</span></div>
            <div className="fi-stat fi-stat--lilac"><span className="fi-stat-value">{last ? <BackupBadge status={last.remote_status ?? 'NOT_CONFIGURED'} /> : '–'}</span><span className="fi-stat-label">Remote copy</span></div>
            <div className="fi-stat fi-stat--clay"><span className="fi-stat-value">{fmtBytes(s.counts.bytes)}</span><span className="fi-stat-label">{s.counts.daily} backup file(s) kept</span></div>
          </section>

          <section className="fi-action-grid" aria-label="Backup actions">
            <div className="fi-action-card">
              <h2>Process status</h2>
              <p>
                {s.running ? <><BackupBadge status="RUNNING" /> A backup or restore is running now.</>
                  : last ? <><BackupBadge status={last.status} /> Last run: {when(last.created_at)} ({last.kind}).</> : 'No backup has run yet.'}
              </p>
              <p className="small text-muted mb-0">Photos live in Supabase Storage and are not inside the backup file.</p>
            </div>
            <div className="fi-action-card">
              <h2>Backup now</h2>
              <p>Make a backup immediately. It is also made automatically every day by Vercel Cron.</p>
              <form method="post" action="/api/admin/backups">
                <input type="hidden" name="csrf_token" value={csrf} />
                <input type="hidden" name="action" value="backup" />
                <button type="submit" className="btn btn-primary" disabled={s.running} data-loading-text="Backing up…">Backup Now</button>
              </form>
            </div>
          </section>

          {state.state === 'MISSING' ? <Alert type="warning" message={`The database "${DB_NAME}" cannot be reached right now. Check DATABASE_URL, then choose a backup under "Restore data" below.`} /> : null}

          <section className="fi-action-grid" aria-label="Database state">
            <div className="fi-action-card">
              <h2>Database &quot;{DB_NAME}&quot;</h2>
              <p><BackupBadge status={state.state} /> {state.message}</p>
              {lr ? (
                <p className="mb-0"><strong>Last restore:</strong> <BackupBadge status={lr.status} /> <span className="badge text-bg-light">Website</span><br />
                  <small className="text-muted">{lr.message ?? ''} {when(lr.created_at)}</small></p>
              ) : <p className="small text-muted mb-0">No restore has been done yet.</p>}
            </div>
          </section>

          {selected && webEnabled ? (
            <section aria-labelledby="confirm-heading">
              <div className="fi-section-head"><div><p className="fi-eyebrow mb-1">Confirm</p><h2 id="confirm-heading">Restore {(selected.file ?? '').split('/').pop()}</h2></div></div>
              <Alert type="warning" message={`The current data will be replaced by this backup. Data entered after ${when(selected.created_at)} will not be in it. A safety backup of the current data is made first.`} />
              <form method="post" action="/api/admin/backups" className="fi-table-panel p-3" autoComplete="off">
                <input type="hidden" name="csrf_token" value={csrf} />
                <input type="hidden" name="action" value="restore" />
                <input type="hidden" name="id" value={selected.id} />
                <label htmlFor="confirm" className="form-label">Type the database name <strong>{DB_NAME}</strong> to confirm</label>
                <input className="form-control mb-1" id="confirm" name="confirm" required placeholder={DB_NAME} autoComplete="off" spellCheck={false} />
                <p className="small text-muted mb-3">This is not a password. Just type the database name shown above ({DB_NAME}).</p>
                <button type="submit" className="btn btn-primary" data-loading-text="Restoring…">Restore now</button>{' '}
                <a className="btn btn-outline-secondary" href="/admin/backups#restore">Cancel</a>
              </form>
            </section>
          ) : null}

          <section id="restore" aria-labelledby="files-heading">
            <div className="fi-section-head"><div><p className="fi-eyebrow mb-1">Backups</p><h2 id="files-heading">Restore data</h2></div></div>
            {!webEnabled ? <Alert type="info" message="Restoring from this page is switched off (RESTORE_WEB_ENABLED=false). Enable it in the environment variables." /> : null}
            {files.length === 0 ? (
              <div className="fi-empty-boxed"><EmptyState title="No backup files" text={'Press "Backup Now" above to make the first one.'} /></div>
            ) : (
              <div className="fi-table-panel"><div className="fi-table-wrap">
                <table className="table fi-table">
                  <thead><tr><th scope="col">File</th><th scope="col">Time</th><th scope="col">Where</th><th scope="col">Size</th><th scope="col">Validation</th><th scope="col">Action</th></tr></thead>
                  <tbody>
                    {files.map((c) => (
                      <tr key={c.id}>
                        <td data-label="File"><span className="fi-cell-name">{c.file}</span>{c.kind === 'pre-restore' ? <><br /><small className="text-muted">Safety copy made automatically before a restore</small></> : null}</td>
                        <td data-label="Time">{when(c.created_at)}</td>
                        <td data-label="Where">Supabase Storage</td>
                        <td data-label="Size">{fmtBytes(c.size_bytes)}</td>
                        <td data-label="Validation"><BackupBadge status={c.sha256 ? 'VALID' : 'NOT_RUN'} /></td>
                        <td data-label="Action">
                          <a className="btn btn-sm btn-outline-secondary" href={`/api/admin/backups?download=${encodeURIComponent(c.id)}`}>Download</a>{' '}
                          <form method="post" action="/api/admin/backups" className="d-inline">
                            <input type="hidden" name="csrf_token" value={csrf} /><input type="hidden" name="action" value="test" /><input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="btn btn-sm btn-outline-secondary">Test</button>
                          </form>
                          {webEnabled ? <>{' '}<a className="btn btn-sm btn-outline-secondary" href={`/admin/backups?restore=${encodeURIComponent(c.id)}#restore`}>Restore</a></> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div></div>
            )}
          </section>

          <section id="history" aria-labelledby="history-heading">
            <div className="fi-section-head"><div><p className="fi-eyebrow mb-1">Log</p><h2 id="history-heading">Runs</h2></div></div>
            {runs.length === 0 ? (
              <div className="fi-empty-boxed"><EmptyState title="No backups yet" text={'Press "Backup Now" above.'} /></div>
            ) : (
              <div className="fi-table-panel"><div className="fi-table-wrap">
                <table className="table fi-table">
                  <thead><tr><th scope="col">File</th><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Result</th><th scope="col">Remote</th></tr></thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td data-label="File"><span className="fi-cell-name">{(r.file ?? '').split('/').pop() || '–'}</span>{r.status === 'FAILED' && r.message ? <><br /><small className="text-muted">{r.message}</small></> : null}</td>
                        <td data-label="Time">{when(r.created_at)}</td>
                        <td data-label="Type">{kindLabel(r.kind)}</td>
                        <td data-label="Size">{r.size_bytes != null ? fmtBytes(r.size_bytes) : '–'}</td>
                        <td data-label="Result"><BackupBadge status={r.status} /></td>
                        <td data-label="Remote"><BackupBadge status={r.remote_status ?? 'NOT_CONFIGURED'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div></div>
            )}
          </section>
        </div>
      </main>
      <Footer note="Admin workspace" />
    </>
  );
}
