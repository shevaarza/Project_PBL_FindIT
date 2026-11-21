import { db } from '@/lib/db';
import { readItemPhoto } from '@/lib/photos';

// Public: item photos are shown on the home page. The bucket itself stays private; only this route reads it.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const itemId = /^\d+$/.test(id) ? parseInt(id, 10) : 0;
  if (itemId < 1) return new Response(null, { status: 404 });
  try {
    const path = await db.value<string>('SELECT photo_path FROM public.item WHERE kode_laporan = $1', [itemId]);
    if (!path) return new Response(null, { status: 404 });
    const data = await readItemPhoto(path);
    if (!data) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(data), {
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(data.length), 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (e) {
    console.error('[FindIT] Failed to read the item photo: ' + (e as Error).message);
    return new Response(null, { status: 404 });
  }
}
