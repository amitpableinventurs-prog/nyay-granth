// User Management: registration, login (email, mobile OTP, Google), profile, password and password reset.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { findOne, insert, update, now } from '../db.js';
import { HttpError, fields, signToken, publicUser, requireAuth, upload, uploadedPath } from '../middleware.js';
import { USER_TYPES, USER_TYPE_LABELS, activeSubscription, aiQuota, unreadNotificationIds } from '../services.js';
import { checkOtp, isEmail, normalizePhone, sendOtp, userByPhone } from '../otp.js';
import { membershipOf } from './membership.js';

const r = Router();

/** A valid user_type, the fallback when none was given, or a 422 naming the allowed values. */
function userType(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const t = String(value).toLowerCase();
  if (!USER_TYPES.includes(t)) throw new HttpError(422, `user_type must be one of: ${USER_TYPES.join(', ')}.`);
  return t;
}

/** Normalised mobile number, null when blank, or a 422. */
function phoneOrNull(value) {
  if (!value) return null;
  const phone = normalizePhone(value);
  if (!phone) throw new HttpError(422, 'Please enter a valid mobile number.');
  return phone;
}

/** Throws 409 if another account has already verified this number. */
async function assertPhoneFree(phone, userId) {
  const local = phone.slice(-10);
  const other = await findOne('users', { id: { $ne: userId }, phone_verified: 1, phone: { $in: [phone, phone.slice(1), local, '0' + local] } });
  if (other) throw new HttpError(409, 'This mobile number is already registered with another account.');
}

/** Choices for the "I am a" field of sign-up and profile forms. */
r.get('/user-types', (_req, res) => {
  res.json(USER_TYPES.map((value) => ({ value, label: USER_TYPE_LABELS[value] })));
});

r.post('/register', async (req, res) => {
  const d = fields(req.body, ['name', 'email', 'password'], ['phone', 'user_type', 'institution']);
  const email = d.email.toLowerCase();
  if (!isEmail(email)) throw new HttpError(422, 'Please enter a valid email address.');
  if (d.password.length < 6) throw new HttpError(422, 'Password must be at least 6 characters.');
  const user_type = userType(d.user_type, 'student');
  const phone = phoneOrNull(d.phone);
  if (await findOne('users', { email })) throw new HttpError(409, 'An account with this email already exists. Please log in.');
  if (phone) await assertPhoneFree(phone, 0);
  const id = await insert('users', {
    name: d.name.slice(0, 120), email, phone, phone_verified: 0, password_hash: await bcrypt.hash(d.password, 10),
    role: 'user', user_type, institution: d.institution || null,
    status: 'active', is_public: 0, created_at: now(), last_login_at: now(),
  });
  await insert('notifications', { user_id: id, title: 'Welcome, ' + d.name.split(' ')[0] + '!', body: 'Start with the Tarkasaṅgraha in the library, or ask the AI tutor what to read first.', link: '/library', created_at: now() });
  const user = await findOne('users', { id });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

r.post('/login', async (req, res) => {
  const d = fields(req.body, ['email', 'password']);
  const user = await findOne('users', { email: d.email.toLowerCase() });
  if (!user || !user.password_hash || !(await bcrypt.compare(d.password, user.password_hash))) throw new HttpError(401, 'Incorrect email or password.');
  if (user.status !== 'active') throw new HttpError(403, 'This account has been suspended. Please contact support.');
  await update('users', { last_login_at: now() }, { id: user.id });
  res.json({ token: signToken(user), user: publicUser(user) });
});

// Mobile OTP. Without a token, send + verify logs in with an already registered number. With a token
// (e.g. right after /register) they verify the logged-in user's own number instead.
r.post('/otp/send', async (req, res) => {
  const phone = phoneOrNull(fields(req.body, ['phone']).phone);
  if (req.user) await assertPhoneFree(phone, req.user.id);
  else {
    const user = await userByPhone(phone);
    if (!user) throw new HttpError(404, 'No account uses this mobile number. Please create an account first.');
    if (user.status !== 'active') throw new HttpError(403, 'This account has been suspended. Please contact support.');
  }
  res.json(await sendOtp(phone, req.user ? 'verify' : 'login', 'phone'));
});

r.post('/otp/verify', async (req, res) => {
  const d = fields(req.body, ['phone', 'code']);
  const phone = phoneOrNull(d.phone);
  if (req.user) {
    await checkOtp(phone, 'verify', d.code);
    await assertPhoneFree(phone, req.user.id);
    await update('users', { phone, phone_verified: 1 }, { id: req.user.id });
    return res.json({ user: publicUser(await findOne('users', { id: req.user.id })) });
  }
  await checkOtp(phone, 'login', d.code);
  const user = await userByPhone(phone);
  if (!user) throw new HttpError(404, 'No account uses this mobile number. Please create an account first.');
  if (user.status !== 'active') throw new HttpError(403, 'This account has been suspended. Please contact support.');
  await update('users', { phone, phone_verified: 1, last_login_at: now() }, { id: user.id });
  res.json({ token: signToken(user), user: publicUser(await findOne('users', { id: user.id })) });
});

// Social login with Google Identity Services: the client sends the ID token ("credential").
r.post('/google', async (req, res) => {
  if (!config.google.clientId) throw new HttpError(400, 'Google login is not configured.');
  const { credential } = fields(req.body, ['credential']);
  const info = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)).then((x) => x.json()).catch(() => null);
  if (!info || info.aud !== config.google.clientId || String(info.email_verified) !== 'true') throw new HttpError(401, 'Google sign-in could not be verified.');
  let user = await findOne('users', { $or: [{ google_id: info.sub }, { email: info.email.toLowerCase() }] });
  if (!user) {
    const id = await insert('users', { name: info.name || info.email, email: info.email.toLowerCase(), google_id: info.sub, avatar: info.picture || null, role: 'user', user_type: 'student', status: 'active', is_public: 0, created_at: now() });
    user = await findOne('users', { id });
  } else if (!user.google_id) {
    await update('users', { google_id: info.sub }, { id: user.id });
  }
  if (user.status !== 'active') throw new HttpError(403, 'This account has been suspended.');
  await update('users', { last_login_at: now() }, { id: user.id });
  res.json({ token: signToken(user), user: publicUser(user) });
});

r.get('/me', requireAuth, async (req, res) => {
  const u = req.user;
  const [unreadIds, subscription, ai, membership] = await Promise.all([unreadNotificationIds(u), activeSubscription(u.id), aiQuota(u), membershipOf(u)]);
  res.json({ user: publicUser(u), subscription, membership, ai, unread: unreadIds.length });
});

// Tokens are stateless, so a plain logout is the app deleting its token. With { all: true } every token
// issued so far stops working (all devices), and the user has to log in again.
r.post('/logout', requireAuth, async (req, res) => {
  if (req.body?.all === true || req.body?.all === 'true') {
    await update('users', { token_version: (req.user.token_version ?? 0) + 1 }, { id: req.user.id });
  }
  res.json({ ok: true });
});

r.put('/profile', requireAuth, upload.single('avatar'), async (req, res) => {
  const d = fields(req.body, ['name'], ['phone', 'user_type', 'institution', 'bio', 'is_public']);
  const phone = phoneOrNull(d.phone);
  const data = {
    name: d.name.slice(0, 120), phone, institution: d.institution || null, bio: d.bio || null,
    user_type: userType(d.user_type, req.user.user_type),
    is_public: d.is_public === true || d.is_public === '1' || d.is_public === 'true' ? 1 : 0,
  };
  // A changed number has to be verified again.
  if (phone !== normalizePhone(req.user.phone)) data.phone_verified = 0;
  if (req.file) {
    if (!/^image\//.test(req.file.mimetype)) throw new HttpError(422, 'Avatar must be an image.');
    data.avatar = uploadedPath(req.file);
  }
  await update('users', data, { id: req.user.id });
  res.json({ user: publicUser(await findOne('users', { id: req.user.id })) });
});

r.put('/password', requireAuth, async (req, res) => {
  const d = fields(req.body, ['new_password'], ['current_password']);
  if (req.user.password_hash && !(await bcrypt.compare(d.current_password || '', req.user.password_hash))) throw new HttpError(422, 'Current password is incorrect.');
  if (d.new_password.length < 6) throw new HttpError(422, 'New password must be at least 6 characters.');
  await update('users', { password_hash: await bcrypt.hash(d.new_password, 10) }, { id: req.user.id });
  res.json({ ok: true });
});

// Forgot password: a 6-digit code goes to the account's email or mobile (WhatsApp), whichever was entered.
// /password/verify-code optionally checks the code before the app asks for the new password;
// /password/reset then sets it and logs the user in.
async function resetTarget(identifier) {
  const id = String(identifier ?? '').trim();
  if (isEmail(id)) {
    const email = id.toLowerCase();
    return { target: email, channel: 'email', user: await findOne('users', { email }) };
  }
  const phone = normalizePhone(id);
  if (!phone) throw new HttpError(422, 'Please enter your registered email or mobile number.');
  return { target: phone, channel: 'phone', user: await userByPhone(phone) };
}

r.post('/password/forgot', async (req, res) => {
  const { identifier } = fields(req.body, ['identifier']);
  const { target, channel, user } = await resetTarget(identifier);
  if (!user || user.status !== 'active') throw new HttpError(404, 'No active account uses this email or mobile number.');
  res.json(await sendOtp(target, 'reset', channel));
});

r.post('/password/verify-code', async (req, res) => {
  const d = fields(req.body, ['identifier', 'code']);
  await checkOtp((await resetTarget(d.identifier)).target, 'reset', d.code, { consume: false });
  res.json({ ok: true });
});

r.post('/password/reset', async (req, res) => {
  const d = fields(req.body, ['identifier', 'code', 'new_password']);
  if (d.new_password.length < 6) throw new HttpError(422, 'New password must be at least 6 characters.');
  const { target, channel, user } = await resetTarget(d.identifier);
  await checkOtp(target, 'reset', d.code);
  if (!user || user.status !== 'active') throw new HttpError(404, 'No active account uses this email or mobile number.');
  // Signing out every other device: whoever knew the old password may still hold a token.
  await update('users', {
    password_hash: await bcrypt.hash(d.new_password, 10), last_login_at: now(), token_version: (user.token_version ?? 0) + 1,
    ...(channel === 'phone' && { phone: target, phone_verified: 1 }),
  }, { id: user.id });
  res.json({ token: signToken(user), user: publicUser(await findOne('users', { id: user.id })) });
});

export default r;
