import { db } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { Crypto } from '@/lib/crypto';
import { fiDate, fiOr } from '@/lib/format';
import { AdminNav } from '@/components/Nav';
import { Alert, Badge, EmptyState, Footer, PageHeader } from '@/components/ui';

export const metadata = { title: 'User Management | FindIT Admin' };
const PER_PAGE = 20;

// Admin only. READ-ONLY: no edit or delete, and the password hash is never selected.
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole('admin');
  const sp = await searchParams;
  let page = Math.max(1, parseInt(String(sp.page ?? '1'), 10) || 1);
  let users: Record<string, any>[] = [];
  let total = 0, pages = 1, error = '';
  try {
    total = Number(await db.value('SELECT COUNT(*) FROM public."User"') ?? 0);
    pages = Math.max(1, Math.ceil(total / PER_PAGE));
    page = Math.min(page, pages);
    users = Crypto.decryptRows(await db.rows(
      `SELECT id_user, name_user, id_nim, email_kampus, role_user, created_at FROM public."User" ORDER BY id_user ASC LIMIT ${PER_PAGE} OFFSET ${(page - 1) * PER_PAGE}`));
  } catch (e) { console.error('[FindIT] User Management error: ' + (e as Error).message); error = 'Unable to load users. Please try again later.'; pages = 1; }

  return (
    <>
      <AdminNav active="users" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <PageHeader eyebrow="Campus lost & found / Users" titleHtml="User<br><span>management.</span>" lead="A read-only list of registered accounts."
            count={total.toLocaleString('en-US')} countLabel="Registered users" />
          <section aria-labelledby="users-heading">
            <div className="fi-section-head"><div><p className="fi-eyebrow mb-1">Accounts</p><h2 id="users-heading">Users</h2></div></div>
            {error !== '' ? <Alert type="danger" message={error} /> : total === 0 ? (
              <div className="fi-empty-boxed"><EmptyState title="No users yet" text="Registered accounts will appear here." /></div>
            ) : (
              <>
                <div className="fi-table-panel"><div className="fi-table-wrap">
                  <table className="table fi-table">
                    <thead><tr><th scope="col">ID</th><th scope="col">Name</th><th scope="col">NIM</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Registered</th></tr></thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id_user}>
                          <td data-label="ID"><span className="fi-code">#{Number(u.id_user)}</span></td>
                          <td data-label="Name"><span className="fi-cell-name">{String(u.name_user ?? '')}</span></td>
                          <td data-label="NIM">{fiOr(u.id_nim, '–')}</td>
                          <td data-label="Email">{String(u.email_kampus ?? '')}</td>
                          <td data-label="Status"><Badge status={u.role_user} fallback="Unknown" /></td>
                          <td data-label="Registered">{fiDate(u.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></div>
                {pages > 1 ? (
                  <nav className="fi-results-bar" aria-label="Pagination">
                    <p>Page <strong>{page}</strong> of {pages}</p>
                    <div className="d-flex gap-2">
                      {page > 1 ? <a className="btn btn-sm btn-outline-secondary" href={`?page=${page - 1}`}>Previous</a> : null}
                      {page < pages ? <a className="btn btn-sm btn-outline-secondary" href={`?page=${page + 1}`}>Next</a> : null}
                    </div>
                  </nav>
                ) : null}
              </>
            )}
          </section>
        </div>
      </main>
      <Footer note="Admin workspace" />
    </>
  );
}
