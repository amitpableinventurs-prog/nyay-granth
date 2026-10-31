// Domain services shared by several routes: search norms, subscriptions, quotas, notifications, WhatsApp, email.
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { aggregate, attach, count, find, findOne, insert, now, toSqlDate } from './db.js';
import { searchNorm } from '../../shared/translit.js';

export const USER_TYPES = ['student', 'researcher', 'faculty', 'practitioner', 'enthusiast'];
export const USER_TYPE_LABELS = { student: 'Student', researcher: 'Researcher', faculty: 'Faculty', practitioner: 'Practitioner', enthusiast: 'Enthusiast' };

export function sectionNorms(s) {
  const sanskrit = searchNorm(`${s.content_sanskrit ?? ''} ${s.transliteration ?? ''}`);
  const rest = searchNorm([s.chapter, s.title, s.translation, s.translation_hi, s.translation_sa, s.translation_mr, s.translation_gu, s.commentary].filter(Boolean).join(' '));
  // A space-free copy lets a search for one word match inside long unspaced compounds.
  return { sanskrit_norm: `${sanskrit} ${sanskrit.replace(/ /g, '')}`.trim(), search_norm: `${sanskrit} ${rest}`.trim() };
}

// Marketplace product categories: [slug, label].
export const PRODUCT_CATEGORIES = [
  ['books', 'Books'], ['ebooks', 'E-books & PDFs'], ['manuscripts', 'Manuscripts & prints'], ['courses', 'Courses & classes'],
  ['audio', 'Audio & recordings'], ['study-aids', 'Stationery & study aids'], ['other', 'Other'],
];

export const productNorm = (p) => searchNorm([p.title, p.author, p.publisher, p.language, p.description, PRODUCT_CATEGORIES.find(([k]) => k === p.category)?.[1]].filter(Boolean).join(' '));

export function textNorms(t) {
  return {
    search_norm: searchNorm([t.title, t.title_sanskrit, t.author, t.author_sanskrit, t.description].filter(Boolean).join(' ')),
    author_norm: searchNorm(`${t.author ?? ''} ${t.author_sanskrit ?? ''}`).slice(0, 250),
  };
}

export const isStaff = (u) => ['admin', 'editor'].includes(u?.role);
/** Faculty run their own classes; admins and editors may too. */
export const isFaculty = (u) => u?.user_type === 'faculty' || isStaff(u);

/**
 * Published PDFs are public; staff see every PDF. A faculty member's unpublished article is internal: its author
 * sees it, and so do the members of any class that has it as assignment material.
 */
export async function canSeePdf(user, pdf) {
  if (pdf.status === 'published' || isStaff(user)) return true;
  if (!user || !pdf.uploaded_by) return false;
  if (pdf.uploaded_by === user.id) return true;
  return (await count('assignments', { pdf_id: pdf.id, class_id: { $in: await myClassIds(user) } })) > 0;
}

/** Ids of the classes a user teaches or has joined. */
export async function myClassIds(user) {
  if (!user) return [];
  const [taught, joined] = await Promise.all([
    find('classes', { faculty_id: user.id }, { fields: ['id'] }),
    find('class_members', { user_id: user.id }, { fields: ['class_id'] }),
  ]);
  return [...taught.map((c) => c.id), ...joined.map((m) => m.class_id)];
}

/** Events a user may see: public ones plus the sessions of their own classes. */
export const eventScope = async (user) => ({ $or: [{ class_id: null }, { class_id: { $in: await myClassIds(user) } }] });

export async function activeSubscription(userId) {
  if (!userId) return null;
  const subs = await find('subscriptions', { user_id: userId, status: 'active', ends_at: { $gt: now() } }, { sort: { ends_at: -1 }, limit: 1 });
  const [sub] = await attach(subs, 'plans', 'plan_id', { name: 'plan_name', slug: 'plan_slug', ai_daily_quota: 'ai_daily_quota' }, { inner: true });
  return sub ?? null;
}

/** 'month' | 'year' | 'lifetime' | 'days', from a plan's duration (free plans last 100 years). */
export function planPeriod(days) {
  const d = Number(days);
  if (d >= 28 && d <= 31) return 'month';
  if (d >= 360 && d <= 366) return 'year';
  if (d >= 3650) return 'lifetime';
  return 'days';
}

const money = (amount) => {
  const n = Number(amount);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: config.currency, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
};

/** A plan as the membership screens show it: '₹199/mo', a one-line description, features as a list. */
export function planCard(p, currentPlanId = null) {
  const features = String(p.features || '').split('\n').map((f) => f.trim()).filter(Boolean);
  const price = Number(p.price);
  const period = price > 0 ? planPeriod(p.duration_days) : 'lifetime';
  const suffix = { month: '/mo', year: '/yr', lifetime: '', days: ` / ${p.duration_days} days` }[period];
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description || features[0] || '',
    price, currency: config.currency, period, duration_days: Number(p.duration_days), price_label: money(price) + suffix,
    features, ai_daily_quota: Number(p.ai_daily_quota) || 0, ai_unlimited: !Number(p.ai_daily_quota),
    is_free: price <= 0, is_popular: !!p.is_popular, is_current: currentPlanId !== null && Number(currentPlanId) === Number(p.id),
    sort_order: p.sort_order,
  };
}

/** Personal and broadcast notifications since the user joined that they have not read yet. */
export async function unreadNotificationIds(user) {
  const list = await find('notifications', { $or: [{ user_id: user.id }, { user_id: null }], created_at: { $gte: user.created_at } }, { fields: ['id'] });
  const read = new Set((await find('notification_reads', { user_id: user.id }, { fields: ['notification_id'] })).map((r) => r.notification_id));
  return list.map((n) => n.id).filter((id) => !read.has(id));
}

export async function hasPremium(user) {
  if (!user) return false;
  if (isStaff(user)) return true;
  const sub = await activeSubscription(user.id);
  return !!sub && sub.plan_slug !== 'free';
}

/** Returns { quota, used, left } — quota 0 means unlimited (left = null). */
export async function aiQuota(user) {
  let quota = config.ai.freeDailyQuota;
  if (isStaff(user)) quota = 0;
  else {
    const sub = await activeSubscription(user.id);
    if (sub) quota = Number(sub.ai_daily_quota);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const used = await count('ai_logs', { user_id: user.id, created_at: { $gte: toSqlDate(today) } });
  return { quota, used, left: quota === 0 ? null : Math.max(0, quota - used) };
}

/** [{ mode, n }] of AI requests, most used first. */
export async function aiUsageByMode(filter = {}) {
  const rows = await aggregate('ai_logs', [{ $match: filter }, { $group: { _id: '$mode', n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }]);
  return rows.map((x) => ({ mode: x._id, n: x.n }));
}

/** Most searched terms since a date, optionally only searches that found something (research trend analysis). */
export async function searchTrends(since, { withResults = false } = {}) {
  const rows = await aggregate('search_logs', [
    { $match: { created_at: { $gte: since }, ...(withResults && { results: { $gt: 0 } }) } },
    { $group: { _id: '$norm', query: { $max: '$query' }, hits: { $sum: 1 } } },
    { $sort: { hits: -1, _id: 1 } },
    { $limit: 10 },
  ]);
  return rows.map(({ _id, ...x }) => ({ norm: _id, ...x }));
}

export async function notify(userId, title, body, link = null) {
  return insert('notifications', { user_id: userId, title, body, link, created_at: now() });
}

export async function notifyMany(userIds, title, body, link = null) {
  for (const id of userIds) await notify(id, title, body, link);
}

export async function notifyAdmins(title, body, link = null) {
  await notifyMany((await find('users', { role: 'admin', status: 'active' }, { fields: ['id'] })).map((u) => u.id), title, body, link);
}

export async function activateSubscription(userId, planId, paymentId) {
  const plan = await findOne('plans', { id: Number(planId) });
  const current = await activeSubscription(userId);
  const start = current && Number(current.plan_id) === Number(planId) ? new Date(current.ends_at.replace(' ', 'T')) : new Date();
  const end = new Date(start.getTime() + Number(plan.duration_days) * 86400000);
  await insert('subscriptions', { user_id: userId, plan_id: planId, payment_id: paymentId, starts_at: toSqlDate(start), ends_at: toSqlDate(end), status: 'active', created_at: now() });
  await notify(userId, 'Membership activated', `Your ${plan.name} membership is active until ${end.toDateString()}. Enjoy premium texts, audio, presentations and extended AI assistance.`, '/profile');
}

export const whatsappConfigured = () => !!(config.whatsapp.token && config.whatsapp.phoneNumberId);

/** Send a plain-text WhatsApp message through the WhatsApp Business Cloud API. */
export async function whatsappSend(to, text) {
  if (!whatsappConfigured()) return { ok: false, error: 'not_configured' };
  const phone = String(to).replace(/\D/g, '');
  if (phone.length < 10) return { ok: false, error: 'invalid_number' };
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${config.whatsapp.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
    });
    return { ok: res.ok, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export const emailConfigured = () => !!config.mail.host;

let mailer = null;

/** Send a plain-text email over SMTP. */
export async function sendEmail(to, subject, text) {
  if (!emailConfigured()) return { ok: false, error: 'not_configured' };
  mailer ??= nodemailer.createTransport({
    host: config.mail.host, port: config.mail.port, secure: config.mail.port === 465,
    ...(config.mail.user && { auth: { user: config.mail.user, pass: config.mail.pass } }),
  });
  try {
    await mailer.sendMail({ from: config.mail.from || config.mail.user, to, subject, text });
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Broadcast a WhatsApp message to all active users who have a phone number. */
export async function whatsappBroadcast(text) {
  const users = await find('users', { status: 'active', phone: { $nin: [null, ''] } }, { fields: ['phone'] });
  let sent = 0;
  for (const u of users) if ((await whatsappSend(u.phone, text)).ok) sent++;
  return { sent, total: users.length };
}
