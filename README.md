# FindIT — Campus Lost and Found (Next.js + Supabase + Vercel)

FindIT is the Lost and Found system of the JTI Polinema campus community. This is the Next.js rewrite of the PHP
version: same features, same pages, same design (the original `style.css`, Bootstrap and `app.js` are reused as-is).

New in this version: students (and admins) can **take a photo with the device camera** when reporting an item;
the photo appears on the home page, the item detail page and the **admin dashboard / item list / claim page**.
Password reset still works only through a valid campus email (`NIM@student.polinema.ac.id`).

## Stack

| Technology | Purpose |
| --- | --- |
| Next.js 15 (App Router, TypeScript) | Pages and API routes, deployed on Vercel |
| Supabase PostgreSQL | Database (same tables and column names as the PHP version) |
| Supabase Storage (private buckets) | Item photos and encrypted backups |
| `pg` | Direct SQL with transactions (`SELECT ... FOR UPDATE`, as before) |
| Node `crypto` | AES-256-GCM field encryption + blind indexes (compatible with the PHP data) |
| `jose` + `bcryptjs` | Signed session cookie, password hashes (PHP `$2y$` hashes keep working) |
| `nodemailer` | Password-reset email (Gmail SMTP or Mailpit) |
| `sharp` | Photo clean-up (resize, strip EXIF) |
| Bootstrap 5, vanilla JS | Unchanged design and behaviour |

## Routes

| PHP page | Next.js route |
| --- | --- |
| `public/index.php` | `/` |
| `login`, `register`, `forgot-password`, `reset-password`, `logout` | `/login`, `/register`, `/forgot-password`, `/reset-password?token=`, `/logout` |
| `item-detail`, `claim`, `report-item`, `my-claims`, `notifications`, `profile` | `/item-detail?id=`, `/claim?id=`, `/report-item`, `/my-claims`, `/notifications`, `/profile` |
| `admin/*.php` | `/admin`, `/admin/items`, `/admin/claims`, `/admin/claim-detail?id=`, `/admin/users`, `/admin/add-item`, `/admin/edit-item?id=`, `/admin/backups` |

Form posts go to `/api/*` route handlers. Item photos are served by `/api/item-photo/[id]`, profile photos by `/api/avatar`.

## 1. Supabase setup

1. Create a project at supabase.com.
2. **SQL Editor** → paste and run `supabase/migrations/001_findit.sql`. It creates every table, the seed data
   (categories and the initial admin `findit@gmail.com`), Row Level Security (no public access) and the two private
   Storage buckets `item-photos` and `findit-backups`. It is safe to run again.
3. Collect these values:
   * `DATABASE_URL`: Project Settings → Database → Connection string → **Transaction pooler** (port 6543).
   * `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: Project Settings → API. The service-role key is server-only; never expose it.

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill it in. Generate the secrets with:

```bash
node scripts/generate-key.mjs
```

* `APP_ENC_KEY` encrypts personal data and backups. **Keep a safe copy.** If it is lost, encrypted data cannot be recovered.
  To keep using data from the PHP version, reuse the **same key**.
* `SESSION_SECRET` signs the login cookie. `CRON_SECRET` protects the daily backup endpoint.
* `APP_URL` is the public URL (used in the reset-password link). `MAIL_*` are the SMTP settings
  (Gmail: `smtp.gmail.com`, `587`, `tls`, an App Password).

## 3. Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Register with an address like `123456789012@student.polinema.ac.id` (the 12-digit NIM must match the Student ID).
Sign in as the admin with the seeded account; ask the team for its password and change it before any demonstration.

## 4. Deploy on Vercel

1. Push this folder to GitHub and **Import** it in Vercel (framework: Next.js, no build settings to change).
2. Add every variable from `.env.example` in Project Settings → Environment Variables (set `APP_URL` to your Vercel URL).
3. Deploy. `vercel.json` already schedules `GET /api/cron/backup` daily at 20:00 UTC (03:00 WIB); Vercel sends
   `Authorization: Bearer $CRON_SECRET` automatically.

## Moving the existing PHP data

Table and column names are unchanged and encrypted values keep their format, so with the same `APP_ENC_KEY`:

```bash
pg_dump --data-only --inserts -t '"User"' -t admin -t category -t location -t claim -t notification \
        -t password_resets -t pickup_token -t user_photo FindIT > data.sql
```

Import `item` rows without the old `photo_url` column (photos are now in Storage, column `photo_path`), then run in the SQL editor:
`SELECT setval(pg_get_serial_sequence('public."User"','id_user'), (SELECT MAX(id_user) FROM public."User"));`
(repeat for each table with an identity column).

## Backup and restore

Admin → **Backup** works from the app, because Vercel has no `pg_dump`, no disk and no Task Scheduler:

* A backup exports every table as it is stored (personal data stays encrypted), compresses it, encrypts the file with
  `APP_ENC_KEY` and saves it in the private `findit-backups` bucket, with a checksum and a history entry.
* Daily automatic backups run through Vercel Cron; old ones are deleted after `BACKUP_KEEP_DAYS` (default 14).
* Restore needs the database name typed as confirmation (`FindIT`), takes a safety backup first, replaces the data in one
  transaction and resets the ID counters. `RESTORE_WEB_ENABLED=false` turns the button off. "Test" only validates a file.
* Photos live in Supabase Storage and are not inside the backup file.

## Security notes

Prepared statements everywhere, CSRF token on every form (derived from a per-browser cookie), escaped output,
bcrypt password hashes, AES-256-GCM field encryption with blind indexes for email/NIM lookups, hashed single-use reset
tokens, Row Level Security with no policies (the public Supabase API cannot read any table), private Storage buckets.
Still planned (as in the PHP README): rate limiting for login/reset, per-level admin permissions.

## Development notes

* Server components render the pages; they use plain links on purpose so `public/assets/js/app.js` runs on every page view like before.
* Put every schema change in a new numbered file in `supabase/migrations/`.
* Never commit `.env*`. Run `npm run typecheck` and `npm test` before pushing.

## Update: verified accounts, photo crop, automatic photo cleanup

1. **Run `supabase/migrations/002_email_verification.sql`** once in Supabase > SQL Editor (safe to run again). It adds `User.email_verified_at` and the `email_verifications` table.
2. **Verified accounts.** A student starts as "Not yet verified". On the profile page, "Send verification email" mails a link (valid 60 minutes) to the registered campus mailbox; opening it marks the account Verified. Reporting a found item and claiming an item both require a verified account (pages and APIs). It uses the same `MAIL_*` settings and `APP_URL` as the password reset.
3. **Photo crop.** Every picture (upload or camera) opens a crop dialog in the 4:3 frame the item cards use. Drag, zoom, "Fit whole photo" (nothing is cut) or "Fill frame". The result is a 1280x960 JPEG, usually well under 1 MB, which also keeps uploads under Vercel's 4.5 MB request limit.
4. **Storage cleanup.** When an admin approves a claim the item becomes Claimed, `photo_path` is cleared and the file is deleted from the `item-photos` bucket. The daily cron (`/api/cron/backup`) also removes photos of returned items and files that no item points to.
