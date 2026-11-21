import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { avatarPhoto } from '@/lib/avatar';

// Sends the signed-in student's own profile photo (stored encrypted, decrypted here).
export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== 'student') return new Response(null, { status: 403 });
  let photo: Awaited<ReturnType<typeof avatarPhoto>> = null;
  try { photo = await avatarPhoto(db, user.id); } catch (e) { console.error('[FindIT] Failed to read the profile photo: ' + (e as Error).message); }
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      'Content-Type': photo.mime, 'Content-Length': String(photo.data.length), 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=86400', 'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
