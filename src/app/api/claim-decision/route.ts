import { randomBytes } from 'node:crypto';
import { tx } from '@/lib/db';
import { Crypto } from '@/lib/crypto';
import { currentUser } from '@/lib/session';
import { setFlash } from '@/lib/flash';
import { csrfOk, readForm, redirectTo, str } from '@/lib/http';
import { createNotification } from '@/lib/notify';
import { deleteItemPhoto } from '@/lib/photos';

class UserError extends Error {}

/** Port of the POST part of admin/claim-detail.php: one transaction, same locks, same notifications. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const claimId = parseInt(url.searchParams.get('id') ?? '', 10);
  const user = await currentUser();
  if (!user || user.role !== 'admin') return redirectTo(req, '/login');
  if (!(claimId >= 1)) return redirectTo(req, '/admin/claims');

  const back = `/admin/claim-detail?id=${claimId}`;
  const fd = await readForm(req);
  const decision = str(fd, 'decision');
  const adminNote = str(fd, 'catatan_admin').trim();
  const pickupLocation = str(fd, 'lokasi_pengambilan').trim();
  const form = { catatan_admin: str(fd, 'catatan_admin'), lokasi_pengambilan: str(fd, 'lokasi_pengambilan') };
  const bad = async (error: string) => { await setFlash({ error, form }); return redirectTo(req, back); };

  if (!(await csrfOk(req, fd))) return bad('Your form session has expired. Refresh the page and try again.');
  if (!['approve', 'reject'].includes(decision)) return bad('Invalid decision. Please choose approve or reject.');
  if (adminNote === '') return bad('Please enter an admin note explaining your decision.');
  if ([...adminNote].length > 5000) return bad('The admin note must not exceed 5,000 characters.');
  if (decision === 'approve' && (pickupLocation === '' || [...pickupLocation].length > 100)) return bad('Enter a pickup location of no more than 100 characters.');
  const adminId = user.id;
  if (adminId < 1) return bad('Your admin session is invalid. Please sign in again.');

  let photoToDelete: string | null = null;
  try {
    await tx(async (t) => {
      // Lock the selected claim to prevent simultaneous decisions.
      const locked = await t.one('SELECT id_claim, id_item, id_user_pengaju, status_klaim FROM public.claim WHERE id_claim = $1 FOR UPDATE', [claimId]);
      if (!locked) throw new UserError('Claim request not found.');
      if (locked.status_klaim !== 'Pending Verification') throw new UserError('This claim has already been reviewed and cannot be changed again.');

      const itemId = Number(locked.id_item ?? 0);
      let lockedItem: Record<string, any> | null = null;

      if (decision === 'approve') {
        if (itemId < 1) throw new UserError('This claim is not linked to an available item.');
        lockedItem = await t.one('SELECT status_barang, id_user_pelapor, photo_path FROM public.item WHERE kode_laporan = $1 FOR UPDATE', [itemId]);
        // Safety net: never approve a claim made by the item's own reporter.
        if (lockedItem && Number(lockedItem.id_user_pelapor) === Number(locked.id_user_pengaju)) {
          throw new UserError('This claim cannot be approved because the claimant reported this item. Please reject it.');
        }
        if (!lockedItem || lockedItem.status_barang !== 'Found') throw new UserError('This item is no longer available for approval.');
      }

      const approve = decision === 'approve';
      const newStatus = approve ? 'Approved' : 'Rejected';
      const pickupCode = approve ? 'PICK-' + randomBytes(4).toString('hex').toUpperCase() : null;
      const savedLocation = approve ? pickupLocation : null;

      const upd = await t.query(
        `UPDATE public.claim SET status_klaim = $1, catatan_admin = $2, id_admin_verifikator = $3, kode_pengambilan = $4,
                lokasi_pengambilan = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id_claim = $6 AND status_klaim = 'Pending Verification'`,
        [newStatus, Crypto.protect('catatan_admin', adminNote), adminId, Crypto.protect('kode_pengambilan', pickupCode),
         Crypto.protect('lokasi_pengambilan', savedLocation), claimId]);
      if (upd.rowCount !== 1) throw new UserError('The claim was not updated. Reload the page and try again.');

      const nameRow = itemId > 0 ? await t.one('SELECT nama_barang FROM public.item WHERE kode_laporan = $1', [itemId]) : null;
      const decrypted = nameRow ? Crypto.decryptRow(nameRow) : null;
      const itemName = String(decrypted?.nama_barang ?? '').trim() !== '' ? String(decrypted!.nama_barang) : 'your reported item';
      const claimantId = Number(locked.id_user_pengaju);
      const itemRef = itemId > 0 ? itemId : null;

      if (approve) {
        let msg = `Your claim for "${itemName}" has been approved. Open My Claims to see your pickup code and QR code.`;
        if (savedLocation) msg += ` Pickup location: ${savedLocation}.`;
        await createNotification(t, {
          user_id: claimantId, claim_id: claimId, item_id: itemRef, type: 'claim_approved', title: 'Claim approved', message: msg,
          link: `my-claims#claim-${claimId}`, dedupe_key: `claim:${claimId}:approved`,
        });
      } else {
        await createNotification(t, {
          user_id: claimantId, claim_id: claimId, item_id: itemRef, type: 'claim_rejected', title: 'Claim rejected',
          message: `Your claim for "${itemName}" could not be approved. Admin note: ` + (adminNote.length > 300 ? [...adminNote].slice(0, 297).join('') + '...' : adminNote),
          link: `my-claims#claim-${claimId}`, dedupe_key: `claim:${claimId}:rejected`,
        });
      }

      if (approve) {
        // Approval marks the item as Claimed so nobody else can claim it.
        // The photo is no longer needed once the owner has the item, so its path is cleared here and the file is deleted after commit.
        const claimedItem = await t.query(`UPDATE public.item SET status_barang = 'Claimed', photo_path = NULL WHERE kode_laporan = $1 AND status_barang = 'Found'`, [itemId]);
        if (claimedItem.rowCount !== 1) throw new UserError('This item is no longer available for approval.');
        photoToDelete = lockedItem?.photo_path ?? null;

        // Reject the other pending claims; RETURNING gives the students to notify.
        const rejected = await t.query(
          `UPDATE public.claim SET status_klaim = 'Rejected', catatan_admin = $1, id_admin_verifikator = $2, kode_pengambilan = NULL,
                  lokasi_pengambilan = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id_item = $3 AND id_claim <> $4 AND status_klaim = 'Pending Verification'
           RETURNING id_claim, id_user_pengaju`,
          [Crypto.protect('catatan_admin', 'This item has already been claimed by another student.'), adminId, itemId, claimId]);
        for (const r of rejected.rows) {
          await createNotification(t, {
            user_id: Number(r.id_user_pengaju), claim_id: Number(r.id_claim), item_id: itemId, type: 'claim_rejected', title: 'Claim rejected',
            message: `Your claim for "${itemName}" could not be approved because this item has already been returned to another student.`,
            link: `my-claims#claim-${Number(r.id_claim)}`, dedupe_key: `claim:${Number(r.id_claim)}:rejected`,
          });
        }

        // Let the student who found and reported the item know it reached its owner.
        const reporterId = Number(lockedItem?.id_user_pelapor ?? 0);
        if (reporterId > 0 && reporterId !== claimantId) {
          await createNotification(t, {
            user_id: reporterId, claim_id: null, item_id: itemId, type: 'item_claimed', title: 'Your found item was returned',
            message: `The item you reported, "${itemName}", has been claimed by its owner. Thank you for helping a fellow student.`,
            link: `item-detail?id=${itemId}`, dedupe_key: `item:${itemId}:returned`,
          });
        }
      }
    });
    // Best effort: if this fails the daily cleanup removes the leftover file.
    if (photoToDelete) await deleteItemPhoto(photoToDelete);
    return redirectTo(req, `${back}&updated=1`);
  } catch (e) {
    console.error('[FindIT] Claim decision failed: ' + (e as Error).message);
    return bad(e instanceof UserError ? e.message : 'Unable to save the decision. Please try again.');
  }
}
