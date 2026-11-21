import { Icon } from './ui';

export interface BellProps {
  mode: 'student' | 'admin'; endpoint: string; csrf: string; count: number; severity: string; itemsHtml: string;
  extra: Record<string, string>; title: string; footerHref: string; footerLabel: string;
  emptyIcon: string; emptyTitle: string; emptyText: string; active?: boolean;
}

/** The bell + dropdown shared by students (notifications) and admins (live alerts). Same markup as fiBellMarkup(). */
export default function Bell(o: BellProps) {
  const badge = o.count > 99 ? '99+' : String(o.count);
  const noun = o.mode === 'admin' ? 'alerts' : 'unread notifications';
  const label = o.title + (o.count > 0 ? `, ${o.count} ${noun}` : ', nothing new');
  const hasItems = o.itemsHtml !== '';
  return (
    <div className={`fi-bell dropdown${o.active ? ' is-current' : ''}`} data-fi-bell data-mode={o.mode} data-endpoint={o.endpoint}
      data-csrf={o.csrf} data-poll="45" data-title={o.title} {...o.extra}>
      <a href={o.footerHref} className="fi-bell-btn" id={`fiBellBtn-${o.mode}`} role="button" data-bs-toggle="dropdown"
        data-bs-auto-close="outside" aria-expanded="false" aria-haspopup="true" aria-label={label} data-bell-button>
        <Icon name="bell" size={22} />
        <span className={`fi-bell-badge fi-bell-badge--${o.severity}`} data-bell-badge hidden={o.count > 0 ? undefined : true}>{badge}</span>
      </a>
      <div className="dropdown-menu dropdown-menu-end fi-bell-menu" aria-labelledby={`fiBellBtn-${o.mode}`}>
        <div className="fi-bell-head"><h2 className="fi-bell-title">{o.title}</h2></div>
        <ul className="fi-notif-list" data-bell-list hidden={hasItems ? undefined : true} dangerouslySetInnerHTML={{ __html: o.itemsHtml }} />
        <div className="fi-bell-empty" data-bell-empty hidden={hasItems ? true : undefined}>
          <span className="fi-bell-empty-icon" aria-hidden="true"><Icon name={o.emptyIcon} size={24} /></span>
          <strong>{o.emptyTitle}</strong><span>{o.emptyText}</span>
        </div>
        <div className="fi-bell-foot"><a href={o.footerHref}>{o.footerLabel}</a></div>
      </div>
      <span className="visually-hidden" role="status" aria-live="polite" data-bell-live />
    </div>
  );
}
