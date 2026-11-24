// Central place for environment variables. Values come from .env.local (dev) or the Vercel dashboard.
export const env = {
  get databaseUrl() { return process.env.DATABASE_URL ?? ''; },
  /** FINDIT_SUPABASE_URL / FINDIT_SUPABASE_KEY win over SUPABASE_*: the Vercel-Supabase integration locks the SUPABASE_* variables to its own project. */
  get supabaseUrl() { return process.env.FINDIT_SUPABASE_URL || process.env.SUPABASE_URL || ''; },
  get serviceKey() { return process.env.FINDIT_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; },
  get itemBucket() { return process.env.ITEM_PHOTO_BUCKET || 'item-photos'; },
  get backupBucket() { return process.env.BACKUP_BUCKET || 'findit-backups'; },
  get appEncKey() { return (process.env.APP_ENC_KEY ?? '').trim(); },
  get sessionSecret() { return process.env.SESSION_SECRET ?? ''; },
  get cronSecret() { return process.env.CRON_SECRET ?? ''; },
  get appUrl() { return (process.env.APP_URL || 'http://localhost:3000').trim().replace(/\/+$/, ''); },
  get timeZone() { return process.env.APP_TIMEZONE || 'Asia/Jakarta'; },
  get restoreWebEnabled() { return (process.env.RESTORE_WEB_ENABLED ?? 'true').toLowerCase() !== 'false'; },
  get keepDays() { return Math.max(1, parseInt(process.env.BACKUP_KEEP_DAYS ?? '14', 10) || 14); },
  mail: {
    get host() { return (process.env.MAIL_HOST ?? '127.0.0.1').trim(); },
    get port() { return parseInt(process.env.MAIL_PORT ?? '1025', 10) || 1025; },
    get username() { return (process.env.MAIL_USERNAME ?? '').trim(); },
    get password() { return (process.env.MAIL_PASSWORD ?? '').trim(); },
    get encryption() { return (process.env.MAIL_ENCRYPTION ?? '').trim().toLowerCase(); },
    get fromAddress() { return (process.env.MAIL_FROM_ADDRESS ?? 'noreply@findit.local').trim(); },
    get fromName() { return (process.env.MAIL_FROM_NAME ?? 'FindIT').trim(); },
  },
};