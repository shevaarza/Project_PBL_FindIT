import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/session';
import * as Notify from '@/lib/notify';
import { intParam } from '@/lib/student-text';
import { PublicNav } from '@/components/Nav';
import { Alert, EmptyState, Footer, PageHeader } from '@/components/ui';

export const metadata = { title: 'Notifications | FindIT' };

type SP = { f?: string; p?: string; open?: string };

const TABS: Record<string, string> = { all: 'All', claims: 'Claims', items: 'Items' };
const EMPTY: Record<string, [string, string]> = {
  all: ['You are all caught up', 'Updates about your claims and reported items will appear here.'],
  claims: ['No claim updates yet', 'When an admin reviews one of your claims, you will see it here.'],
  items: ['No item updates yet', 'You will be told here when an item you reported is returned to its owner.'],
};

const query = (f: string, p: number) => {
  const parts: string[] = [];
  if (f !== 'all') parts.push('f=' + encodeURIComponent(f));
  if (p > 1) parts.push('p=' + p);
  return parts.length ? '?' + parts.join('&') : '';
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireRole('student');
  const sp = await searchParams;
  const filter = typeof sp.f === 'string' && (Notify.FILTERS as readonly string[]).includes(sp.f) ? sp.f : 'all';
  const pageNumber = intParam(sp.p) || 1;

  // Clicking a notification: mark it as read, then open the claim or item it is about.
  const openId = intParam(sp.open);
  if (openId > 0) {
    let target = '/notifications';
    try {
      const own = await Notify.findOwn(db, user.id, openId);
      if (own) {
        await Notify.markRead(db, user.id, openId);
        const link = Notify.safeLink(own.link);
        if (link) target = '/' + link;
      }
    } catch (e) { console.error('[FindIT] Failed to open a notification: ' + (e as Error).message); }
    redirect(target);
  }

  let errorMessage = '';
  let result: Awaited<ReturnType<typeof Notify.page>> = { rows: [], total: 0, pages: 1, page: 1, filter };
  let counts = { all: 0, unread: 0, claims: 0, items: 0 };
  try {
    result = await Notify.page(db, user.id, filter, pageNumber);
    counts = await Notify.counts(db, user.id);
    // Opening this page means the student has seen their notifications: mark them all as read.
    if (counts.unread > 0) await Notify.markAllRead(db, user.id);
  } catch (e) {
    console.error('[FindIT] Failed to load notifications: ' + (e as Error).message);
    errorMessage = 'Unable to load notifications. Please try again later.';
  }

  const current = result.filter;
  const rowsHtml = result.rows.map((n) => Notify.renderItem(n, 'page')).join('');
  const from = Math.max(1, result.page - 2);
  const to = Math.min(result.pages, result.page + 2);
  const nums: number[] = [];
  for (let i = from; i <= to; i++) nums.push(i);

  return (
    <>
      <PublicNav user={user} active="notifications" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          <PageHeader eyebrow="Campus lost & found / Updates" titleHtml="Your <span>notifications.</span>"
            lead="Stay up to date with decisions about your claims and the items you reported." count={String(counts.unread)} countLabel="New this visit" />

          {errorMessage !== '' ? <Alert type="danger" message={errorMessage} /> : null}

          <section className="fi-notif-toolbar" aria-label="Filter notifications">
            <nav className="fi-notif-tabs" aria-label="Notification filters">
              {Object.entries(TABS).map(([key, label]) => (
                <a key={key} className={`fi-notif-tab${current === key ? ' is-active' : ''}`} href={`/notifications${query(key, 1)}`}
                  {...(current === key ? { 'aria-current': 'page' as const } : {})}>
                  {label}
                  <span className="fi-notif-tab-count">{counts[key as 'all' | 'claims' | 'items']}</span>
                </a>
              ))}
            </nav>
          </section>

          {result.rows.length === 0 && errorMessage === '' ? (
            <section className="fi-panel">
              <EmptyState title={EMPTY[current][0]} text={EMPTY[current][1]}
                action={current !== 'all' ? <a className="btn btn-outline-secondary btn-sm" href="/notifications">Show all notifications</a> : undefined} />
            </section>
          ) : result.rows.length > 0 ? (
            <>
              <section aria-label="Notification list">
                <ul className="fi-notif-list fi-notif-list--page" dangerouslySetInnerHTML={{ __html: rowsHtml }} />
              </section>

              {result.pages > 1 ? (
                <nav className="fi-pager" aria-label="Notification pages">
                  {result.page > 1 ? <a className="fi-pager-link" href={`/notifications${query(current, result.page - 1)}`} rel="prev">Previous</a> : null}
                  {nums.map((i) => (
                    <a key={i} className={`fi-pager-link${i === result.page ? ' is-active' : ''}`} href={`/notifications${query(current, i)}`}
                      {...(i === result.page ? { 'aria-current': 'page' as const } : {})}>{i}</a>
                  ))}
                  {result.page < result.pages ? <a className="fi-pager-link" href={`/notifications${query(current, result.page + 1)}`} rel="next">Next</a> : null}
                </nav>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
