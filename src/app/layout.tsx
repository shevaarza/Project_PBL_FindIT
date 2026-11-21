import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import AppScripts from '@/components/AppScripts';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F6F3EC' };
export const metadata = { title: 'FindIT - Lost and Found' };
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" href="/assets/images/favicon.ico?v=1" sizes="48x48" />
        <link rel="icon" href="/assets/images/favicon.svg?v=1" type="image/svg+xml" />
        <link rel="stylesheet" href="/assets/vendor/bootstrap/css/bootstrap.min.css" />
        <link rel="stylesheet" href="/assets/css/style.css" />
      </head>
      <body className="fi-body" suppressHydrationWarning>
        <a className="fi-skip-link" href="#main">Skip to content</a>
        {children}
        <AppScripts />
      </body>
    </html>
  );
}