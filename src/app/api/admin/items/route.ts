import { db } from '@/lib/db';
import { Crypto } from '@/lib/crypto';
import { currentUser } from '@/lib/session';
import { setFlash } from '@/lib/flash';
import { csrfOk, readForm, redirectTo, str } from '@/lib/http';
import { PhotoError, deleteItemPhoto, processItemPhotoUpload, storeItemPhoto } from '@/lib/photos';

export const maxDuration = 30;

const len = (s: string) => [...s].length;
const posInt = (s: string) => (/^[+-]?\d+$/.test(s.trim()) && parseInt(s, 10) > 0 ? parseInt(s, 10) : 0);
function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Admin: create (action=create) or update (action=update&id) an item report. Same validation order as add-item.php / edit-item.php. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== 'admin') return redirectTo(req, '/login');

  const fd = await readForm(req);
  const action = str(fd, 'action') === 'update' ? 'update' : 'create';
  const itemId = posInt(str(fd, 'id'));
  const back = action === 'update' ? `/admin/edit-item?id=${itemId}` : '/admin/add-item';
  if (action === 'update' && !itemId) return redirectTo(req, '/admin/items');

  const t = (k: string) => str(fd, k).trim();
  const form: Record<string, string> = {
    nama_barang: t('nama_barang'), id_kategori: t('id_kategori'), id_user_pelapor: t('id_user_pelapor'), detail_lokasi: t('detail_lokasi'),
    tanggal_ditemukan: t('tanggal_ditemukan'), ciri_umum: t('ciri_umum'), ciri_khusus: t('ciri_khusus'),
  };
  const bad = async (error: string) => { await setFlash({ error, form }); return redirectTo(req, back); };

  if (!(await csrfOk(req, fd))) return bad('Your form session has expired. Please refresh the page and try again.');

  const name = form.nama_barang, location = form.detail_lokasi, dateFound = form.tanggal_ditemukan;
  const categoryId = posInt(form.id_kategori), reporterId = posInt(form.id_user_pelapor);

  if (name === '' || len(name) > 100) return bad('The item name is required and must not exceed 100 characters.');
  if (!categoryId) return bad('Please select a valid category.');
  if (action === 'create') {
    if (!reporterId) return bad('Please select a valid student reporter.');
    if (location === '') return bad('Please enter the location where the item was found.');
    if (len(location) > 5000) return bad('The location must not exceed 5,000 characters.');
  } else if (location === '') return bad('Please enter the item location.');
  if (dateFound === '') return bad('Please enter the date the item was found.');
  if (!validDate(dateFound)) return bad('Please enter a valid date.');
  if (action === 'create' && (len(form.ciri_umum) > 5000 || len(form.ciri_khusus) > 5000)) return bad('Each item description must not exceed 5,000 characters.');

  // Photo (camera or file). Validated before anything is written.
  let photo: Buffer | null = null;
  try { photo = await processItemPhotoUpload(fd.get('item_photo')); }
  catch (e) { if (e instanceof PhotoError) return bad(e.message); throw e; }

  let newPath: string | null = null;
  try {
    const cat = await db.value('SELECT 1 FROM public.category WHERE id_category = $1', [categoryId]);
    if (cat === null) return bad('The selected category does not exist.');

    if (action === 'create') {
      const rep = await db.value(`SELECT 1 FROM public."User" WHERE id_user = $1 AND role_user = 'student'`, [reporterId]);
      if (rep === null) return bad('The selected student account does not exist.');
      if (photo) newPath = await storeItemPhoto(photo);
      await db.query(
        `INSERT INTO public.item (id_user_pelapor, id_kategori, nama_barang, detail_lokasi, tanggal_ditemukan, ciri_umum, ciri_khusus, photo_path, status_barang)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Found')`,
        [reporterId, categoryId, Crypto.protect('nama_barang', name), Crypto.protect('detail_lokasi', location), dateFound,
         form.ciri_umum !== '' ? Crypto.protect('ciri_umum', form.ciri_umum) : null,
         form.ciri_khusus !== '' ? Crypto.protect('ciri_khusus', form.ciri_khusus) : null, newPath]);
      return redirectTo(req, '/admin/items?created=1');
    }

    const old = await db.one('SELECT photo_path FROM public.item WHERE kode_laporan = $1', [itemId]);
    if (!old) return redirectTo(req, '/admin/items');
    let photoPath: string | null = old.photo_path ?? null;
    if (photo) { newPath = await storeItemPhoto(photo); photoPath = newPath; }
    else if (str(fd, 'remove_photo') === '1') photoPath = null;

    await db.query(
      `UPDATE public.item SET nama_barang = $1, id_kategori = $2, detail_lokasi = $3, tanggal_ditemukan = $4, ciri_umum = $5, ciri_khusus = $6, photo_path = $7
       WHERE kode_laporan = $8`,
      [Crypto.protect('nama_barang', name), categoryId, Crypto.protect('detail_lokasi', location), dateFound,
       form.ciri_umum !== '' ? Crypto.protect('ciri_umum', form.ciri_umum) : null,
       form.ciri_khusus !== '' ? Crypto.protect('ciri_khusus', form.ciri_khusus) : null, photoPath, itemId]);
    if (old.photo_path && old.photo_path !== photoPath) await deleteItemPhoto(old.photo_path);
    return redirectTo(req, '/admin/items?updated=1');
  } catch (e) {
    console.error(`${action === 'create' ? 'Add' : 'Edit'} Item error: ` + (e as Error).message);
    if (newPath) await deleteItemPhoto(newPath);
    return bad(action === 'create' ? 'Unable to create the item report. Please try again later.' : 'Unable to process this item report. Please try again later.');
  }
}
