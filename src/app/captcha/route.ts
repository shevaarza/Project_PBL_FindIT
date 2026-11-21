import { issueCaptcha } from '@/lib/captcha';

export const dynamic = 'force-dynamic';

export async function GET() {
  const svg = await issueCaptcha();
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache' },
  });
}
