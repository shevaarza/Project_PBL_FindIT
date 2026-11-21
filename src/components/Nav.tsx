import { db } from '@/lib/db';
import { csrfToken, type SessionUser } from '@/lib/session';
import { avatarInfo } from '@/lib/avatar';
import * as Notify from '@/lib/notify';
import { collectAlerts, renderAlertItem, alertSummary } from '@/lib/adminAlerts';
import Bell from './Bell';
import { Avatar } from './ui';

function NavLink({ href, label, k, active }: { href: string; label: string; k: string; active: string }) {
  return (
    <li className="nav-item"><a className={`nav-link${k === active ? ' active' : ''}`} href={href} {...(k === active ? { 'aria-current': 'page' as const } : {})}>{label}</a></li>
  );
}

async function StudentBell({ user, active }: { user: SessionUser; active: string }) {
  let unread = 0, latest = 0, itemsHtml = '';
  try {
    unread = await Notify.unreadCount(db, user.id);
    latest = await Notify.latestId(db, user.id);
    for (const n of await Notify.recent(db, user.id)) itemsHtml += Notify.renderItem(n, 'menu');
  } catch (e) { console.error('[FindIT] Failed to load the notification bell: ' + (e as Error).message); }
  return (
    <Bell mode="student" endpoint="/api/notifications" csrf={await csrfToken()} count={unread} severity="danger" itemsHtml={itemsHtml}
      extra={{ 'data-latest-id': String(latest) }} title="Notifications" footerHref="/notifications" footerLabel="View all notifications"
      emptyIcon="inbox" emptyTitle="You are all caught up" emptyText="Decisions about your claims will show up here." active={active === 'notifications'} />
  );
}

async function AdminBell() {
  let alerts: Awaited<ReturnType<typeof collectAlerts>> = [];
  try { alerts = await collectAlerts(db); } catch (e) { console.error('[FindIT] Failed to load admin alerts: ' + (e as Error).message); }
  const summary = alertSummary(alerts);
  let itemsHtml = '';
  const counts: Record<string, number> = {};
  for (const a of alerts) { itemsHtml += renderAlertItem(a, 'menu'); counts[a.key] = a.count; }
  return (
    <Bell mode="admin" endpoint="/api/admin/alerts" csrf="" count={summary.count} severity={summary.severity === 'danger' ? 'danger' : 'warning'}
      itemsHtml={itemsHtml} extra={{ 'data-counts': JSON.stringify(counts) }} title="Alerts" footerHref="/admin" footerLabel="Open dashboard"
      emptyIcon="shield-check" emptyTitle="All clear" emptyText="Nothing needs your attention right now." />
  );
}

const Toggler = () => (
  <button className="navbar-toggler fi-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#fiNav" aria-controls="fiNav" aria-expanded="false" aria-label="Toggle navigation">
    <span className="navbar-toggler-icon" />
  </button>
);

/** Top bar of the student/public pages (fiPublicNav). */
export async function PublicNav({ user, active = '' }: { user: SessionUser | null; active?: string }) {
  const role = user?.role ?? '';
  const info = role === 'student' && user ? await avatarInfo(db, user.id) : null;
  return (
    <header className="fi-navbar">
      <nav className="navbar navbar-expand-md" aria-label="Main navigation">
        <div className="fi-container">
          <a className="fi-brand" href="/"><img src="/assets/images/findit-logo.png" alt="FindIT Logo" className="fi-brand-logo" /><span className="fi-brand-name">FindIT</span></a>
          {role === 'student' && user ? <StudentBell user={user} active={active} /> : null}
          <Toggler />
          <div className="collapse navbar-collapse" id="fiNav">
            <ul className="navbar-nav ms-auto align-items-md-center gap-md-1">
              <NavLink href="/" label="Home" k="home" active={active} />
              {role === 'student' && user ? (
                <>
                  <NavLink href="/report-item" label="Report found item" k="report" active={active} />
                  <NavLink href="/my-claims" label="My claims" k="claims" active={active} />
                  <li className="nav-item">
                    <a className={`fi-nav-profile${active === 'profile' ? ' active' : ''}`} href="/profile" {...(active === 'profile' ? { 'aria-current': 'page' as const } : {})}>
                      <Avatar info={info!} size={30} /><span className="fi-nav-user">{user.name || 'Student'}</span>
                    </a>
                  </li>
                  <li className="nav-item ms-md-2"><a className="btn btn-outline-secondary btn-sm" href="/logout">Sign out</a></li>
                </>
              ) : role === 'admin' ? (
                <>
                  <li className="nav-item"><a className="nav-link" href="/admin">Admin dashboard</a></li>
                  <li className="nav-item ms-md-2"><a className="btn btn-outline-secondary btn-sm" href="/logout">Sign out</a></li>
                </>
              ) : (
                <>
                  <NavLink href="/login" label="Sign in" k="login" active={active} />
                  <li className="nav-item ms-md-2"><a className="btn btn-primary btn-sm" href="/register">Register</a></li>
                </>
              )}
            </ul>
          </div>
        </div>
      </nav>
    </header>
  );
}

/** Top bar of the admin pages (fiAdminNav). */
export async function AdminNav({ active = '' }: { active?: string }) {
  return (
    <header className="fi-navbar fi-navbar--admin">
      <nav className="navbar navbar-expand-md" aria-label="Admin navigation">
        <div className="fi-container">
          <a className="fi-brand" href="/admin"><img src="/assets/images/findit-logo.png" alt="FindIT Logo" className="fi-brand-logo" /><span className="fi-brand-name">FindIT</span><small className="fi-brand-tag">Admin</small></a>
          <AdminBell />
          <Toggler />
          <div className="collapse navbar-collapse" id="fiNav">
            <ul className="navbar-nav ms-auto align-items-md-center gap-md-1">
              <NavLink href="/admin" label="Dashboard" k="dashboard" active={active} />
              <NavLink href="/admin/items" label="Item" k="items" active={active} />
              <NavLink href="/admin/claims" label="Claim" k="claims" active={active} />
              <NavLink href="/admin/users" label="User Management" k="users" active={active} />
              <NavLink href="/admin/backups" label="Backup" k="backups" active={active} />
              <li className="nav-item"><a className="nav-link" href="/">View site</a></li>
              <li className="nav-item ms-md-2"><a className="btn btn-outline-secondary btn-sm" href="/logout">Sign out</a></li>
            </ul>
          </div>
        </div>
      </nav>
    </header>
  );
}
