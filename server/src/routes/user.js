// Personal study tools: bookmarks, notes & annotations, notifications, reading analytics, learning path.
import { Router } from 'express';
import { attach, col, count, find, findOne, insert, remove, update, now, toSqlDate, daysFromNow } from '../db.js';
import { HttpError, fields, requireAuth } from '../middleware.js';
import { aiQuota, aiUsageByMode, unreadNotificationIds } from '../services.js';

const r = Router();
r.use(requireAuth);

// ---- Bookmarks / favourites ----
r.get('/bookmarks', async (req, res) => {
  const rows = await find('bookmarks', { user_id: req.user.id }, { sort: { created_at: -1 }, fields: ['id', 'text_id', 'section_id', 'created_at'] });
  const withText = await attach(rows, 'texts', 'text_id', { title: 'text_title', title_sanskrit: 'title_sanskrit', author: 'author', cover: 'cover', cover_color: 'cover_color' }, { inner: true });
  res.json(await attach(withText, 'sections', 'section_id', { ref: 'ref', title: 'section_title', content_sanskrit: 'content_sanskrit', translation: 'translation' }));
});

r.post('/bookmarks/toggle', async (req, res) => {
  const textId = Number(req.body.text_id);
  const sectionId = req.body.section_id ? Number(req.body.section_id) : null;
  if (!(await findOne('texts', { id: textId }))) throw new HttpError(404, 'Text not found.');
  const existing = await findOne('bookmarks', { user_id: req.user.id, text_id: textId, section_id: sectionId });
  if (existing) {
    await remove('bookmarks', { id: existing.id });
    return res.json({ bookmarked: false });
  }
  const id = await insert('bookmarks', { user_id: req.user.id, text_id: textId, section_id: sectionId, created_at: now() });
  res.json({ bookmarked: true, id });
});

r.delete('/bookmarks/:id', async (req, res) => {
  await remove('bookmarks', { id: Number(req.params.id), user_id: req.user.id });
  res.json({ ok: true });
});

// ---- Notes & annotations ----
r.get('/notes', async (req, res) => {
  const rows = await find('notes', { user_id: req.user.id }, { sort: { updated_at: -1 } });
  await attach(rows, 'texts', 'text_id', { title: 'text_title' });
  res.json(await attach(rows, 'sections', 'section_id', { ref: 'ref' }));
});

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
function noteData(body) {
  const d = fields(body, ['content'], ['title', 'highlight', 'color', 'text_id', 'section_id']);
  return {
    title: (d.title || '').slice(0, 190) || null, content: d.content, highlight: d.highlight || null,
    color: COLORS.includes(d.color) ? d.color : 'yellow',
    text_id: d.text_id ? Number(d.text_id) : null, section_id: d.section_id ? Number(d.section_id) : null,
  };
}

r.post('/notes', async (req, res) => {
  const id = await insert('notes', { ...noteData(req.body), user_id: req.user.id, created_at: now(), updated_at: now() });
  res.status(201).json(await findOne('notes', { id }));
});

r.put('/notes/:id', async (req, res) => {
  const { text_id, section_id, ...data } = noteData(req.body);
  const id = Number(req.params.id);
  const n = await update('notes', { ...data, updated_at: now() }, { id, user_id: req.user.id });
  if (!n) throw new HttpError(404, 'Note not found.');
  res.json(await findOne('notes', { id }));
});

r.delete('/notes/:id', async (req, res) => {
  await remove('notes', { id: Number(req.params.id), user_id: req.user.id });
  res.json({ ok: true });
});

// ---- Notifications ----
r.get('/notifications', async (req, res) => {
  const list = await find('notifications', { $or: [{ user_id: req.user.id }, { user_id: null }], created_at: { $gte: req.user.created_at } }, {
    sort: { created_at: -1, id: -1 },
    limit: 100,
  });
  const read = new Set((await find('notification_reads', { user_id: req.user.id }, { fields: ['notification_id'] })).map((x) => x.notification_id));
  res.json(list.map((n) => ({ ...n, is_read: read.has(n.id) })));
});

r.post('/notifications/:id/read', async (req, res) => {
  const id = Number(req.params.id);
  const n = await findOne('notifications', { id, $or: [{ user_id: req.user.id }, { user_id: null }] });
  if (!n) throw new HttpError(404, 'Notification not found.');
  if (!(await findOne('notification_reads', { user_id: req.user.id, notification_id: id }))) {
    await insert('notification_reads', { notification_id: id, user_id: req.user.id, created_at: now() });
  }
  res.json({ ok: true });
});

r.post('/notifications/read-all', async (req, res) => {
  const unread = await unreadNotificationIds(req.user);
  for (const id of unread) await insert('notification_reads', { notification_id: id, user_id: req.user.id, created_at: now() });
  res.json({ ok: true, marked: unread.length });
});

// ---- Reading analytics ----
r.get('/analytics', async (req, res) => {
  const uid = req.user.id;
  const events = await find('reading_events', { user_id: uid, created_at: { $gte: daysFromNow(-30) } }, { fields: ['created_at'] });
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const day = toSqlDate(new Date(Date.now() - i * 86400000)).slice(0, 10);
    days.push({ day, count: events.filter((e) => String(e.created_at).startsWith(day)).length });
  }
  const activeDays = new Set(events.map((e) => String(e.created_at).slice(0, 10)));
  let streak = 0;
  for (let i = 0; ; i++) {
    const day = toSqlDate(new Date(Date.now() - i * 86400000)).slice(0, 10);
    if (activeDays.has(day)) streak++;
    else if (i > 0) break;
    if (i > 365) break;
  }
  const sectionsRead = (await (await col('reading_events')).distinct('section_id', { user_id: uid })).filter((id) => id !== null).length;
  res.json({
    days,
    streak,
    textsStarted: await count('reading_progress', { user_id: uid }),
    textsCompleted: await count('reading_progress', { user_id: uid, percent: { $gte: 100 } }),
    sectionsRead,
    notes: await count('notes', { user_id: uid }),
    bookmarks: await count('bookmarks', { user_id: uid }),
    aiByMode: await aiUsageByMode({ user_id: uid }),
    ai: await aiQuota(req.user),
  });
});

// ---- Personalized learning path (curated order, tracked against the user's progress) ----
const PATH = [
  ['Tarkasaṅgraha', 'Foundations', 'Learn the seven categories, the qualities and the four pramāṇas.'],
  ['Introduction to Indian Logic', 'Foundations', 'The five-membered argument, pervasion and fallacies.'],
  ['Nyāya Sūtra', 'Root text', 'Read Book 1 on the sixteen topics with the definitions of the pramāṇas.'],
  ['Nyāya Bhāṣya', 'Commentary', 'Study Vātsyāyana\'s explanations alongside the sūtras.'],
  ['Vaiśeṣika Sūtra', 'Sister system', 'Kaṇāda\'s ontology that Nyāya adopts.'],
  ['Nyāyamañjarī', 'Debates', 'Jayanta\'s defence of Nyāya realism.'],
  ['Tattvacintāmaṇi', 'Navya-Nyāya', 'Gaṅgeśa\'s new logic, starting with the Vyāptipañcaka.'],
];

r.get('/learning-path', async (req, res) => {
  const texts = await find('texts', { status: 'published' }, { fields: ['id', 'title', 'title_sanskrit', 'cover_color', 'is_premium'] });
  const progress = new Map((await find('reading_progress', { user_id: req.user.id }, { fields: ['text_id', 'percent'] })).map((p) => [p.text_id, p.percent]));
  const steps = PATH.map(([title, stage, goal]) => {
    const t = texts.find((x) => x.title === title);
    return t ? { ...t, stage, goal, percent: Number(progress.get(t.id) || 0) } : null;
  }).filter(Boolean);
  res.json(steps);
});

export default r;
