import { db } from '@/lib/db';
import { Crypto } from '@/lib/crypto';
import { currentUser } from '@/lib/session';
import { csrfOk, readForm, redirectTo, str } from '@/lib/http';
import { setFlash } from '@/lib/flash';
import { PhotoError, deleteItemPhoto, processItemPhotoUpload, storeItemPhoto } from '@/lib/photos';
import { env } from '@/lib/env';
import { VERIFY_REQUIRED_MESSAGE, isVerified } from '@/lib/verification';

const len = (s: string) => [...s].length;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: env.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return redirectTo(req, '/login');
  if (user.role !== 'student') return new Response('You do not have permission to access this page.', { status: 403 });

  const fd = await readForm(req);
  const form: Record<string, string> = {
    nama_barang: str(fd, 'nama_barang').trim(), id_kategori: str(fd, 'id_kategori').trim(), detail_lokasi: str(fd, 'detail_lokasi').trim(),
    tanggal_ditemukan: str(fd, 'tanggal_ditemukan').trim() || today(), ciri_umum: str(fd, 'ciri_umum').trim(), ciri_khusus: str(fd, 'ciri_khusus').trim(),
  };
  const fail = async (error: string) => { await setFlash({ error, form }); return redirectTo(req, '/report-item'); };

  if (!(await csrfOk(req, fd))) return fail('Your form session has expired. Please refresh the page and try again.');

  try {
    if (!(await isVerified(user.id))) return fail(VERIFY_REQUIRED_MESSAGE);
  } catch (e) {
    console.error('Student Report Item error: ' + (e as Error).message);
    return fail('Unable to submit your item report. Please try again later.');
  }

  const categoryId = /^[+-]?\d+$/.test(form.id_kategori) ? parseInt(form.id_kategori, 10) : 0;
  const d = form.tanggal_ditemukan;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(d) && (() => {
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, day));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
  })();

  if (user.id < 1) return fail('Unable to identify your student account. Please sign in again.');
  if (form.nama_barang === '' || len(form.nama_barang) > 100) return fail('The item name is required and must not exceed 100 characters.');
  if (!categoryId || categoryId < 1) return fail('Please select a valid category.');
  if (form.detail_lokasi === '') return fail('Please enter the location where the item was found.');
  if (len(form.detail_lokasi) > 5000) return fail('The location must not exceed 5,000 characters.');
  if (d === '') return fail('Please enter the date the item was found.');
  if (!validDate) return fail('Please enter a valid date.');
  if (d > today()) return fail('The date found cannot be in the future.');
  if (len(form.ciri_umum) > 5000 || len(form.ciri_khusus) > 5000) return fail('Each description must not exceed 5,000 characters.');
  if (form.ciri_khusus === '') return fail('Please enter the distinctive features. This information will be kept private.');

  let photo: Buffer | null = null;
  try {
    photo = await processItemPhotoUpload(fd.get('item_photo'));
  } catch (e) {
    if (e instanceof PhotoError) return fail(e.message);
    console.error('Student Report Item error: ' + (e as Error).message);
    return fail('Unable to submit your item report. Please try again later.');
  }

  let photoPath: string | null = null;
  try {
    const exists = await db.one('SELECT id_category FROM public.category WHERE id_category = $1', [categoryId]);
    if (!exists) return fail('The selected category does not exist.');

    if (photo) photoPath = await storeItemPhoto(photo);

    await db.query(
      `INSERT INTO public.item (id_user_pelapor, id_kategori, nama_barang, detail_lokasi, tanggal_ditemukan, ciri_umum, ciri_khusus, photo_path, status_barang)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [user.id, categoryId, Crypto.protect('nama_barang', form.nama_barang), Crypto.protect('detail_lokasi', form.detail_lokasi), d,
       form.ciri_umum !== '' ? Crypto.protect('ciri_umum', form.ciri_umum) : null, Crypto.protect('ciri_khusus', form.ciri_khusus),
       photoPath, 'Found']);
  } catch (e) {
    await deleteItemPhoto(photoPath);
    console.error('Student Report Item error: ' + (e as Error).message);
    return fail('Unable to submit your item report. Please try again later.');
  }
  return redirectTo(req, '/report-item?created=1');
}
