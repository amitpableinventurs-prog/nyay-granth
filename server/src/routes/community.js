// Discussion forum, live classes & webinars, reviews, feedback / contact / publication help desk, scholar profiles.
import { Router } from 'express';
import { attach, col, count, countBy, find, findOne, insert, remove, update, now } from '../db.js';
import { HttpError, fields, requireAuth } from '../middleware.js';
import { eventScope, hasPremium, isStaff } from '../services.js';

const r = Router();
const AUTHOR = { name: 'author', user_type: 'user_type' };

// ---- Forum ----
r.get('/forum', async (req, res) => {
  const cat = req.query.category;
  const threads = await find('forum_threads', cat ? { category: cat } : {}, { sort: { last_post_at: -1 }, limit: 100 });
  res.json({
    threads: await attach(threads, 'users', 'user_id', AUTHOR, { inner: true }),
    categories: ['General', 'Pramāṇa', 'Prameya', 'Navya-Nyāya', 'Sanskrit', 'Research'],
  });
});

r.post('/forum', requireAuth, async (req, res) => {
  const d = fields(req.body, ['title', 'body'], ['category']);
  const id = await insert('forum_threads', { user_id: req.user.id, title: d.title.slice(0, 190), body: d.body, category: d.category || 'General', replies: 0, is_locked: 0, last_post_at: now(), created_at: now() });
  res.status(201).json({ id });
});

r.get('/forum/:id', async (req, res) => {
  const [thread] = await attach(await find('forum_threads', { id: Number(req.params.id) }), 'users', 'user_id', AUTHOR, { inner: true });
  if (!thread) throw new HttpError(404, 'Thread not found.');
  const posts = await attach(await find('forum_posts', { thread_id: thread.id }, { sort: { id: 1 } }), 'users', 'user_id', { ...AUTHOR, role: 'role' }, { inner: true });
  res.json({ thread, posts });
});

r.post('/forum/:id/reply', requireAuth, async (req, res) => {
  const thread = await findOne('forum_threads', { id: Number(req.params.id) });
  if (!thread) throw new HttpError(404, 'Thread not found.');
  if (thread.is_locked && !isStaff(req.user)) throw new HttpError(403, 'This thread is locked.');
  const { body } = fields(req.body, ['body']);
  await insert('forum_posts', { thread_id: thread.id, user_id: req.user.id, body, created_at: now() });
  await (await col('forum_threads')).updateOne({ id: thread.id }, { $inc: { replies: 1 }, $set: { last_post_at: now() } });
  if (thread.user_id !== req.user.id) {
    await insert('notifications', { user_id: thread.user_id, title: 'New reply in your discussion', body: `${req.user.name} replied to "${thread.title}".`, link: `/forum/${thread.id}`, created_at: now() });
  }
  res.status(201).json({ ok: true });
});

r.delete('/forum/posts/:id', requireAuth, async (req, res) => {
  const p = await findOne('forum_posts', { id: Number(req.params.id) });
  if (!p) throw new HttpError(404, 'Post not found.');
  if (p.user_id !== req.user.id && !isStaff(req.user)) throw new HttpError(403, 'You can only delete your own posts.');
  await remove('forum_posts', { id: p.id });
  await (await col('forum_threads')).updateOne({ id: p.thread_id, replies: { $gt: 0 } }, { $inc: { replies: -1 } });
  res.json({ ok: true });
});

// ---- Live classes & webinars ----
r.get('/events', async (req, res) => {
  const premium = await hasPremium(req.user);
  const hide = (e) => (e.is_premium && !premium ? { ...e, join_link: null, recording_link: null, locked: true } : e);
  const scope = await eventScope(req.user);
  const list = async (filter, opts) => (await attach(await find('events', { ...scope, ...filter }, opts), 'classes', 'class_id', { title: 'class_title' })).map(hide);
  res.json({
    upcoming: await list({ starts_at: { $gte: now() } }, { sort: { starts_at: 1 } }),
    past: await list({ starts_at: { $lt: now() } }, { sort: { starts_at: -1 }, limit: 30 }),
  });
});

// ---- Reviews ----
r.get('/reviews', async (_req, res) => {
  const rows = await find('reviews', { is_approved: 1 }, { sort: { id: -1 }, limit: 100, fields: ['id', 'rating', 'comment', 'created_at', 'user_id'] });
  const list = (await attach(rows, 'users', 'user_id', { name: 'name', user_type: 'user_type' }, { inner: true })).map(({ user_id, ...x }) => x);
  const avg = list.length ? list.reduce((a, x) => a + Number(x.rating), 0) / list.length : 0;
  res.json({ reviews: list, average: Math.round(avg * 10) / 10, count: list.length });
});

r.post('/reviews', requireAuth, async (req, res) => {
  const d = fields(req.body, ['rating'], ['comment']);
  const rating = Math.min(5, Math.max(1, Number(d.rating) || 0));
  const existing = await findOne('reviews', { user_id: req.user.id });
  if (existing) await update('reviews', { rating, comment: d.comment || '', created_at: now() }, { id: existing.id });
  else await insert('reviews', { user_id: req.user.id, rating, comment: d.comment || '', is_approved: 1, created_at: now() });
  res.json({ ok: true });
});

// ---- Feedback, Contact Us and Publication Help Desk share one inbox ----
r.post('/feedback', async (req, res) => {
  const d = fields(req.body, ['message'], ['kind', 'name', 'email', 'phone', 'subject']);
  const kind = ['feedback', 'contact', 'helpdesk'].includes(d.kind) ? d.kind : 'feedback';
  const name = d.name || req.user?.name;
  const email = d.email || req.user?.email;
  if (!name || !email) throw new HttpError(422, 'Please provide your name and email.');
  await insert('feedback', { user_id: req.user?.id ?? null, kind, name, email, phone: d.phone || null, subject: (d.subject || '').slice(0, 190), message: d.message, status: 'open', created_at: now() });
  res.status(201).json({ ok: true });
});

r.get('/feedback/mine', requireAuth, async (req, res) => {
  res.json(await find('feedback', { user_id: req.user.id }, { sort: { id: -1 }, fields: ['id', 'kind', 'subject', 'message', 'status', 'admin_reply', 'created_at'] }));
});

// ---- Scholar profiles ----
r.get('/scholars', async (_req, res) => {
  const users = await find('users', { is_public: 1, status: 'active' }, { fields: ['id', 'name', 'user_type', 'institution', 'bio', 'avatar'] });
  const ids = { user_id: { $in: users.map((u) => u.id) } };
  const [threads, posts] = await Promise.all([countBy('forum_threads', 'user_id', ids), countBy('forum_posts', 'user_id', ids)]);
  const list = users.map((u) => ({ ...u, contributions: (threads.get(u.id) ?? 0) + (posts.get(u.id) ?? 0) }));
  list.sort((a, b) => b.contributions - a.contributions || a.name.localeCompare(b.name));
  res.json(list);
});

r.get('/scholars/:id', async (req, res) => {
  const u = await findOne('users', { id: Number(req.params.id), is_public: 1, status: 'active' }, { fields: ['id', 'name', 'user_type', 'institution', 'bio', 'avatar', 'created_at'] });
  if (!u) throw new HttpError(404, 'Profile not found or private.');
  const progress = await find('reading_progress', { user_id: u.id }, { sort: { updated_at: -1 }, limit: 10, fields: ['text_id', 'percent'] });
  const reading = (await attach(progress, 'texts', 'text_id', { title: 'title' }, { inner: true })).map((p) => ({ id: p.text_id, title: p.title, percent: p.percent }));
  res.json({
    scholar: u,
    threads: await find('forum_threads', { user_id: u.id }, { sort: { id: -1 }, limit: 20, fields: ['id', 'title', 'replies', 'created_at'] }),
    reading,
    posts: await count('forum_posts', { user_id: u.id }),
  });
});

export default r;
