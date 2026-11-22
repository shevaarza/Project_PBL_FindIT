import { randomBytes } from 'node:crypto';
import { db, tx } from '@/lib/db';
import { Crypto } from '@/lib/crypto';
import { currentUser } from '@/lib/session';
import { csrfOk, readForm, redirectTo, str } from '@/lib/http';
import { setFlash } from '@/lib/flash';
import { createNotification } from '@/lib/notify';
import { intParam } from '@/lib/student-text';
import { VERIFY_REQUIRED_MESSAGE, isVerified } from '@/lib/verification';

class ClaimError extends Error {}
const len = (s: string) => [...s].length;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return redirectTo(req, '/login');
  if (user.role !== 'student') return new Response('You do not have permission to access this page.', { status: 403 });

  const itemId = intParam(new URL(req.url).searchParams.get('id'));
  if (!itemId) return new Response('Invalid item ID.', { status: 400 });
  const back = `/claim?id=${itemId}`;

  let item: Record<string, any> | null;
  try {
    const row = await db.one(`SELECT i.kode_laporan, i.nama_barang, i.id_user_pelapor FROM public.item AS i WHERE i.kode_laporan = $1 LIMIT 1`, [itemId]);
    item = row ? Crypto.decryptRow(row) : null;
  } catch (e) {
    console.error('[FindIT] Failed to load claim item: ' + (e as Error).message);
    return new Response('Unable to load this item right now. Please try again later.', { status: 500 });
  }
  if (!item) return new Response('The selected item could not be found.', { status: 404 });

  const fd = await readForm(req);
  const form = {
    lokasi_kehilangan: str(fd, 'lokasi_kehilangan').trim(),
    terakhir_di_lihat: str(fd, 'terakhir_di_lihat').trim(),
    ciri_khusus_claim: str(fd, 'ciri_khusus_claim').trim(),
  };
  const fail = async (error: string) => { await setFlash({ error, form }); return redirectTo(req, back); };

  if (Number(item.id_user_pelapor ?? 0) === user.id) return fail('You cannot claim an item that you reported yourself.');
  if (!(await csrfOk(req, fd))) return fail('Your form session has expired. Please refresh the page and try again.');
  try {
    if (!(await isVerified(user.id))) return fail(VERIFY_REQUIRED_MESSAGE);
  } catch (e) {
    console.error('[FindIT] Failed to check verification: ' + (e as Error).message);
    return fail('We could not submit your claim right now. Please try again.');
  }
  if (!form.lokasi_kehilangan || !form.terakhir_di_lihat || !form.ciri_khusus_claim) return fail('Please complete all fields before submitting your claim.');
  if (len(form.lokasi_kehilangan) > 5000 || len(form.terakhir_di_lihat) > 5000 || len(form.ciri_khusus_claim) > 5000) {
    return fail('Each answer must be no longer than 5,000 characters.');
  }

  try {
    const code = await tx(async (t) => {
      // Lock the item row and check its current status.
      const locked = await t.one('SELECT status_barang, id_user_pelapor FROM public.item WHERE kode_laporan = $1 FOR UPDATE', [itemId]);
      if (!locked || locked.status_barang !== 'Found') throw new ClaimError('This item is no longer available for claims.');
      if (Number(locked.id_user_pelapor) === user.id) throw new ClaimError('You cannot claim an item that you reported yourself.');

      const approved = await t.value(`SELECT 1 FROM public.claim WHERE id_item = $1 AND status_klaim = 'Approved' LIMIT 1`, [itemId]);
      if (approved) throw new ClaimError('This item is no longer available for claims.');

      const prev = await t.one('SELECT status_klaim FROM public.claim WHERE id_item = $1 AND id_user_pengaju = $2 LIMIT 1', [itemId, user.id]);
      if (prev) {
        throw new ClaimError(prev.status_klaim === 'Rejected'
          ? 'Your previous claim for this item was rejected, so you cannot claim it again.'
          : 'You have already submitted a claim for this item.');
      }

      const d = new Date();
      const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const claimCode = 'CLM-' + ymd + '-' + randomBytes(4).toString('hex').toUpperCase();

      const claimId = Number(await t.value(
        `INSERT INTO public.claim (kode_klaim, id_item, id_user_pengaju, lokasi_kehilangan, terakhir_di_lihat, ciri_khusus_claim, status_klaim)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_claim`,
        [claimCode, itemId, user.id,
         Crypto.protect('lokasi_kehilangan', form.lokasi_kehilangan),
         Crypto.protect('terakhir_di_lihat', form.terakhir_di_lihat),
         Crypto.protect('ciri_khusus_claim', form.ciri_khusus_claim),
         'Pending Verification']));

      await createNotification(t, {
        user_id: user.id, claim_id: claimId, item_id: itemId, type: 'claim_review', title: 'Claim under review',
        message: 'Your claim for "' + String(item!.nama_barang ?? 'this item') + '" is being reviewed by an administrator. We will notify you when a decision is made.',
        link: 'my-claims#claim-' + claimId, dedupe_key: 'claim:' + claimId + ':review',
      });
      return claimCode;
    });
    await setFlash({ success: 'Your claim has been submitted successfully. Reference: ' + code });
    return redirectTo(req, back);
  } catch (e) {
    if (e instanceof ClaimError) return fail(e.message);
    console.error('[FindIT] Failed to submit claim: ' + (e as Error).message);
    const isDb = typeof e === 'object' && e !== null && 'code' in e;
    return fail(isDb ? 'We could not submit your claim right now. Please try again.' : 'Something went wrong while submitting your claim. Please try again.');
  }
}
