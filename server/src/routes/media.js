// Audio support (recitations, lectures, audiobooks) and the PPT / presentation viewer.
import { Router } from 'express';
import { attach, find, inc } from '../db.js';
import { HttpError } from '../middleware.js';
import { hasPremium } from '../services.js';

const r = Router();

r.get('/audio', async (req, res) => {
  const kind = ['recitation', 'lecture', 'audiobook'].includes(req.query.kind) ? req.query.kind : null;
  const premium = await hasPremium(req.user);
  const rows = await attach(await find('audio', kind ? { kind } : {}, { sort: { id: -1 } }), 'texts', 'text_id', { title: 'text_title' });
  // Locked items are listed but their file URL is withheld.
  res.json(rows.map((a) => (a.is_premium && !premium ? { ...a, file: null, locked: true } : a)));
});

r.post('/audio/:id/play', async (req, res) => {
  await inc('audio', { id: Number(req.params.id) }, { plays: 1 });
  res.json({ ok: true });
});

r.get('/presentations', async (_req, res) => {
  const rows = await find('presentations', {}, { sort: { id: 1 }, fields: ['id', 'title', 'description', 'is_premium', 'views', 'file', 'slides', 'text_id'] });
  await attach(rows, 'texts', 'text_id', { title: 'text_title' });
  res.json(rows.map(({ text_id, ...p }) => p));
});

r.get('/presentations/:id', async (req, res) => {
  const [p] = await attach(await find('presentations', { id: Number(req.params.id) }), 'texts', 'text_id', { title: 'text_title' });
  if (!p) throw new HttpError(404, 'Presentation not found.');
  if (p.is_premium && !(await hasPremium(req.user))) {
    return res.json({ ...p, slides: (p.slides || '').split(/\n-{3,}\n/)[0], file: null, locked: true });
  }
  await inc('presentations', { id: p.id }, { views: 1 });
  res.json(p);
});

export default r;
