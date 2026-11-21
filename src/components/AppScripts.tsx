'use client';
import { useEffect } from 'react';

/**
 * Loads Bootstrap's JS and FindIT's app.js after React has hydrated, so these scripts' DOM changes
 * (alerts, bell, validation, photo preview) are never overwritten by hydration. Pages use normal links,
 * so every page view runs it again, exactly like the PHP site.
 */
export default function AppScripts() {
  useEffect(() => {
    const w = window as unknown as { __fiScripts?: boolean };
    if (w.__fiScripts) return;
    w.__fiScripts = true;
    const load = (src: string) => new Promise<void>((resolve) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => resolve(); s.onerror = () => resolve();
      document.body.appendChild(s);
    });
    load('/assets/vendor/bootstrap/js/bootstrap.bundle.min.js').then(() => load('/assets/js/app.js?v=3'));
  }, []);
  return null;
}
