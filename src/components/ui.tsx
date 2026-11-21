import type { ReactNode } from 'react';
import { PATHS } from '@/lib/icons';
import { fiStatusClass } from '@/lib/format';
import { presetSvg, defaultSvg, type AvatarInfo } from '@/lib/avatar';
import { qrPngDataUri } from '@/lib/qr';

/** Same helpers as app/helpers/ui.php. React escapes text for us (that is what fiE() did). */

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const s = Math.max(12, Math.min(48, size));
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" focusable="false"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.info }} />
  );
}

export function Badge({ status, fallback = 'Not set' }: { status?: string | null; fallback?: string }) {
  const label = String(status ?? '').trim() !== '' ? String(status) : fallback;
  return <span className={`fi-badge ${fiStatusClass(status)}`}>{label}</span>;
}

export function Alert({ type, message, autoHide = false }: { type: 'success' | 'danger' | 'warning' | 'info'; message: string; autoHide?: boolean }) {
  const allowed = ['success', 'danger', 'warning', 'info'];
  const t = allowed.includes(type) ? type : 'info';
  const icons = { success: 'check-circle', danger: 'x-circle', warning: 'alert-triangle', info: 'info' } as const;
  const labels = { success: 'Done', danger: 'Something went wrong', warning: 'Heads up', info: 'Note' } as const;
  return (
    <div className={`alert alert-${t} fi-alert fi-alert--rich`} role={t === 'danger' ? 'alert' : 'status'} {...(autoHide ? { 'data-autohide': '6000' } : {})}>
      <span className="fi-alert-icon" aria-hidden="true"><Icon name={icons[t]} size={20} /></span>
      <div className="fi-alert-text"><strong className="fi-alert-label">{labels[t]}</strong><span className="fi-alert-message">{message}</span></div>
      <button type="button" className="fi-alert-close" data-bs-dismiss="alert" aria-label="Dismiss message"><Icon name="x" size={16} /></button>
      {autoHide ? <span className="fi-alert-timer" aria-hidden="true" /> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, titleHtml, lead = '', count = null, countLabel = '' }: {
  eyebrow: string; titleHtml: string; lead?: string; count?: string | null; countLabel?: string;
}) {
  return (
    <header className="fi-hero">
      <div className="fi-hero-text">
        <p className="fi-eyebrow">{eyebrow}</p>
        <h1 className="fi-title" dangerouslySetInnerHTML={{ __html: titleHtml }} />
        {lead !== '' ? <p className="fi-lead">{lead}</p> : null}
      </div>
      {count !== null ? (
        <div className="fi-count" role="group" aria-label={countLabel}>
          <span className="fi-count-number">{count}</span>
          <span className="fi-count-label">{countLabel}</span>
        </div>
      ) : null}
    </header>
  );
}

export function EmptyState({ title, text, action, mark = '+' }: { title: string; text: string; action?: ReactNode; mark?: string }) {
  return (
    <div className="fi-empty">
      <div className="fi-empty-mark" aria-hidden="true">{mark}</div>
      <h2 className="fi-empty-title">{title}</h2>
      <p className="fi-empty-text">{text}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Footer({ note = 'Helping students reconnect with their lost belongings.' }: { note?: string }) {
  return (
    <footer className="fi-footer">
      <div className="fi-container fi-footer-inner">
        <span>FindIT &middot; Campus Lost &amp; Found</span>
        <span>{note}</span>
      </div>
    </footer>
  );
}

/** Round avatar. $info comes from avatarInfo(). */
export function Avatar({ info, size = 40, photoUrl = '/api/avatar', extraClass = '' }: { info: AvatarInfo; size?: number; photoUrl?: string; extraClass?: string }) {
  const cls = `fi-avatar${extraClass ? ' ' + extraClass : ''}`;
  const style = { width: size + 'px', height: size + 'px' };
  if (info.type === 'photo') {
    return <span className={cls} style={style} data-fi-avatar><img src={`${photoUrl}?v=${info.v}`} width={size} height={size} alt="" loading="lazy" /></span>;
  }
  const svg = info.type === 'preset' ? presetSvg(String(info.preset), size) : defaultSvg(size);
  return <span className={cls} style={style} data-fi-avatar dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Pickup QR code (PNG) with a download link. Used on My claims and the admin claim page. */
export async function QrBlock({ token, fileName, caption, note = '' }: { token: string; fileName: string; caption: string; note?: string }) {
  let uri = '';
  try { uri = await qrPngDataUri(token); } catch (e) {
    console.error('[FindIT] QR generation failed: ' + (e as Error).message);
    return (<><span className="fi-field-label">Pickup QR code</span><p className="text-danger small">The QR code could not be generated.</p></>);
  }
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, '-') || 'FindIT-pickup-qr';
  return (
    <>
      <span className="fi-field-label">Pickup QR code</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '18px', marginTop: '6px' }}>
        <img src={uri} width={220} height={220} alt={`Pickup QR code for ${caption}`}
          style={{ width: '220px', height: '220px', maxWidth: '100%', background: '#fff', border: '1px solid #d9d4c3', borderRadius: '12px', padding: '6px', imageRendering: 'pixelated' }} />
        <div style={{ flex: '1 1 220px' }}>
          {note !== '' ? <p className="fi-field-value mb-2">{note}</p> : null}
          <a className="btn btn-primary btn-sm" href={uri} download={`${safe}.png`}>Download QR Code</a>
        </div>
      </div>
    </>
  );
}
