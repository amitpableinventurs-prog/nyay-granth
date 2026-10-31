// One-time codes for mobile login, mobile verification and password reset.
// A code has 6 digits, lives 5 minutes and allows 5 wrong tries. It can be resent after 30 seconds,
// at most 5 times an hour per number or email. Only an HMAC of the code is stored.
// With no WhatsApp/SMTP configured and NODE_ENV != production, the code is returned as `dev_code`
// (and logged) so the apps can be tested without a messaging account.
import crypto from 'node:crypto';
import { config } from './config.js';
import { find, findOne, insert, now, remove, toSqlDate, update } from './db.js';
import { HttpError } from './middleware.js';
import { emailConfigured, sendEmail, whatsappConfigured, whatsappSend } from './services.js';

const TTL = 5 * 60;
const RESEND_AFTER = 30;
const MAX_SENDS_PER_HOUR = 5;
const MAX_TRIES = 5;

const at = (secondsFromNow) => toSqlDate(new Date(Date.now() + secondsFromNow * 1000));
const hash = (target, purpose, code) => crypto.createHmac('sha256', config.jwtSecret).update(`${purpose}:${target}:${code}`).digest('hex');
const secondsUntil = (sqlDate) => Math.max(0, Math.ceil((new Date(sqlDate.replace(' ', 'T')) - Date.now()) / 1000));

/** '+91 98765-43210', '09876543210' or '9876543210' → '+919876543210'; null if it isn't a mobile number. */
export function normalizePhone(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d.length >= 11 && d.length <= 15 ? '+' + d : null;
}

export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export const maskPhone = (p) => p.slice(0, p.length - 10) + ' ' + p.slice(-10, -8) + 'XXXXXX' + p.slice(-2);
export const maskEmail = (e) => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 6)) + c);

/** The account using this mobile number; older rows may store it without the country code. */
export async function userByPhone(phone) {
  const local = phone.slice(-10);
  const rows = await find('users', { phone: { $in: [phone, phone.slice(1), local, '0' + local] } }, { sort: { phone_verified: -1, id: -1 }, limit: 1 });
  return rows[0] ?? null;
}

/** Creates (or replaces) the code for `target` and delivers it by WhatsApp ('phone') or email. */
export async function sendOtp(target, purpose, channel) {
  const existing = await findOne('otps', { target, purpose });
  const wait = existing ? RESEND_AFTER - (Date.now() - new Date(existing.last_sent_at.replace(' ', 'T'))) / 1000 : 0;
  if (wait > 0) throw new HttpError(429, `Please wait ${Math.ceil(wait)} seconds before requesting another code.`);
  const freshWindow = !existing || secondsUntil(existing.window_ends_at) === 0;
  const sends = freshWindow ? 1 : existing.sends + 1;
  if (sends > MAX_SENDS_PER_HOUR) throw new HttpError(429, `Too many codes requested. Try again in ${Math.ceil(secondsUntil(existing.window_ends_at) / 60)} minutes.`);

  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const text = {
    login: `${code} is your ${config.appName} login code. It expires in 5 minutes. Do not share it with anyone.`,
    verify: `${code} is your ${config.appName} verification code. It expires in 5 minutes.`,
    reset: `${code} is your ${config.appName} password reset code. It expires in 5 minutes. If you did not ask to reset your password, ignore this message.`,
  }[purpose];

  const configured = channel === 'email' ? emailConfigured() : whatsappConfigured();
  let devCode = null;
  if (configured) {
    const sent = channel === 'email' ? await sendEmail(target, `${config.appName} code: ${code}`, text) : await whatsappSend(target, text);
    if (!sent.ok) throw new HttpError(502, `Could not send the code (${sent.error}). Please try again.`);
  } else if (process.env.NODE_ENV !== 'production') {
    devCode = code;
    console.log(`[otp] ${purpose} code for ${target}: ${code} (${channel} delivery not configured)`);
  } else {
    throw new HttpError(503, channel === 'email' ? 'Email delivery is not configured. Please use your mobile number.' : 'Mobile codes are not available right now. Please use your email.');
  }

  const doc = {
    code_hash: hash(target, purpose, code), tries: 0, expires_at: at(TTL), last_sent_at: now(), sends,
    window_ends_at: freshWindow ? at(3600) : existing.window_ends_at,
  };
  if (existing) await update('otps', doc, { id: existing.id });
  else await insert('otps', { target, purpose, ...doc, created_at: now() });

  return {
    ok: true, channel: channel === 'email' ? 'email' : 'whatsapp', sent_to: channel === 'email' ? maskEmail(target) : maskPhone(target),
    expires_in: TTL, resend_in: RESEND_AFTER, ...(devCode && { dev_code: devCode }),
  };
}

/** Throws 422 unless `code` is the live code for `target`; by default the code is then used up. */
export async function checkOtp(target, purpose, code, { consume = true } = {}) {
  const row = await findOne('otps', { target, purpose });
  if (!row || secondsUntil(row.expires_at) === 0) throw new HttpError(422, 'This code has expired. Please request a new one.');
  if (row.tries >= MAX_TRIES) throw new HttpError(429, 'Too many wrong attempts. Please request a new code.');
  const given = hash(target, purpose, String(code ?? '').replace(/\D/g, ''));
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(row.code_hash))) {
    await update('otps', { tries: row.tries + 1 }, { id: row.id });
    const left = MAX_TRIES - row.tries - 1;
    throw new HttpError(422, left ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Please request a new one.');
  }
  if (consume) await remove('otps', { id: row.id });
}
