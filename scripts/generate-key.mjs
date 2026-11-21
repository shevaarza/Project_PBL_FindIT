import { randomBytes } from 'node:crypto';
console.log('APP_ENC_KEY=base64:' + randomBytes(32).toString('base64'));
console.log('SESSION_SECRET=' + randomBytes(48).toString('base64url'));
console.log('CRON_SECRET=' + randomBytes(24).toString('base64url'));
