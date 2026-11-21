import { db } from '@/lib/db';
import { Crypto } from '@/lib/crypto';
import { currentUser } from '@/lib/session';
import { fiDate, fiOr } from '@/lib/format';
import { itemPhotoUrl } from '@/lib/photos';
import { Nl2br, intParam } from '@/lib/student-text';
import { PublicNav } from '@/components/Nav';
import { Badge, EmptyState, Footer } from '@/components/ui';

export const dynamic = 'force-dynamic';

async function load(id: number) {
  const row = await db.one(
    `SELECT i.kode_laporan, i.nama_barang, i.detail_lokasi, i.tanggal_ditemukan, i.ciri_umum, i.status_barang, i.id_user_pelapor, i.photo_path, c.name_category
     FROM public.item AS i INNER JOIN public.category AS c ON i.id_kategori = c.id_category
     WHERE i.kode_laporan = $1 LIMIT 1`, [id]);
  return row ? Crypto.decryptRow(row) : null;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const id = intParam((await searchParams).id);
  try {
    const item = id ? await load(id) : null;
    return { title: item ? `${item.nama_barang} - FindIT` : 'Item Not Found - FindIT' };
  } catch { return { title: 'Item Not Found - FindIT' }; }
}

export default async function ItemDetailPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const itemId = intParam((await searchParams).id);
  if (!itemId) return <>Invalid item ID.</>;

  let item: Awaited<ReturnType<typeof load>>;
  try { item = await load(itemId); } catch (e) {
    console.error('[FindIT] Failed to retrieve item details: ' + (e as Error).message);
    return <>Sorry, the item details are currently unavailable.</>;
  }

  const viewer = await currentUser();
  let isAvailable = !!item && item.status_barang === 'Found';

  if (isAvailable) {
    try {
      const approved = await db.value(`SELECT 1 FROM public.claim WHERE id_item = $1 AND status_klaim = 'Approved' LIMIT 1`, [Number(item!.kode_laporan)]);
      if (approved) isAvailable = false;
    } catch (e) { console.error('[FindIT] Failed to check approved claim: ' + (e as Error).message); }
  }

  const isOwnReport = !!item && !!viewer && viewer.id === Number(item.id_user_pelapor) && viewer.role === 'student';

  let hasClaimed = false;
  if (item && viewer && viewer.role === 'student') {
    try {
      hasClaimed = (await db.value('SELECT 1 FROM public.claim WHERE id_item = $1 AND id_user_pengaju = $2 LIMIT 1', [Number(item.kode_laporan), viewer.id])) !== null;
    } catch (e) { console.error('[FindIT] Failed to check existing claim: ' + (e as Error).message); }
  }

  return (
    <>
      <PublicNav user={viewer} active="home" />
      <main className="fi-main" id="main">
        <div className="fi-container">
          {!item ? (
            <div className="fi-narrow fi-empty-boxed">
              <EmptyState title="Item not found" text="The item may have been removed or the link may be invalid."
                action={<a href="/" className="btn btn-primary">Return to homepage</a>} mark="?" />
            </div>
          ) : (
            <>
              <a href="/" className="fi-back-link">&larr; Back to found items</a>
              <div className="row g-4">
                <div className="col-12 col-lg-8">
                  <article className="fi-panel">
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                      <Badge status={item.status_barang} />
                      <span className="small">Report #{Number(item.kode_laporan)}</span>
                    </div>

                    <h1 className="fi-title mb-3" style={{ fontSize: 'clamp(1.9rem, 4.5vw, 2.8rem)' }}>{item.nama_barang}</h1>

                    {item.photo_path ? (
                      <img src={itemPhotoUrl(Number(item.kode_laporan))} alt={String(item.nama_barang ?? '')} className="img-fluid rounded mb-4"
                        style={{ maxHeight: '420px', objectFit: 'contain' }} />
                    ) : null}

                    <p className="text-secondary mb-4">Review the information below to check whether this is the item you are looking for.</p>

                    <h2 className="fi-form-section-title mb-3">Item information</h2>

                    <dl className="fi-fields mb-0">
                      <div className="fi-field">
                        <dt className="fi-field-label">Category</dt>
                        <dd className="fi-field-value"><span className="fi-chip">{fiOr(item.name_category)}</span></dd>
                      </div>
                      <div className="fi-field">
                        <dt className="fi-field-label">Date found</dt>
                        <dd className="fi-field-value">{fiDate(item.tanggal_ditemukan, 'Not provided')}</dd>
                      </div>
                      <div className="fi-field fi-field--wide">
                        <dt className="fi-field-label">Location found</dt>
                        <dd className="fi-field-value"><Nl2br text={fiOr(item.detail_lokasi)} /></dd>
                      </div>
                      <div className="fi-field fi-field--wide">
                        <dt className="fi-field-label">General description</dt>
                        <dd className="fi-field-value"><Nl2br text={fiOr(item.ciri_umum)} /></dd>
                      </div>
                    </dl>
                  </article>
                </div>

                <aside className="col-12 col-lg-4">
                  <div className="fi-panel fi-sticky">
                    <p className="fi-panel-kicker">Claim process</p>
                    <h2 className="h5 mb-2">Is this your item?</h2>

                    {isOwnReport ? (
                      <>
                        <p className="text-secondary mb-3">You reported this item as found, so you cannot claim it. Only the real owner can submit a claim.</p>
                        <a href="/" className="btn btn-outline-secondary w-100">Browse other items</a>
                      </>
                    ) : hasClaimed ? (
                      <>
                        <p className="text-secondary mb-3">You have already submitted a claim for this item. Each student can claim an item only once, and a rejected claim cannot be repeated.</p>
                        <a href="/my-claims" className="btn btn-outline-secondary w-100">View my claims</a>
                      </>
                    ) : isAvailable ? (
                      <>
                        <p className="text-secondary">If you believe this item belongs to you, continue to the claim form. An admin will verify your answers before pickup.</p>
                        <a href={`/claim?id=${Number(item.kode_laporan)}`} className="btn btn-primary w-100">Claim this item</a>
                        {!viewer ? (
                          <p className="small mt-3 mb-0">You need to <a href="/login">sign in</a> as a student before you can submit a claim.</p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <p className="text-secondary mb-3">This item is no longer available for new claims.</p>
                        <a href="/" className="btn btn-outline-secondary w-100">Browse other items</a>
                      </>
                    )}

                    <div className="fi-callout mt-4">Distinctive features are kept private. You will be asked to describe them to prove ownership.</div>
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
