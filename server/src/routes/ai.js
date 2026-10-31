import { Router } from 'express';
import { find, findOne } from '../db.js';
import { HttpError, fields, requireAuth } from '../middleware.js';
import { AI_MODES, aiConfigured, runAi } from '../ai.js';
import { aiQuota, hasPremium } from '../services.js';

const r = Router();

r.get('/modes', async (req, res) => {
  res.json({ modes: AI_MODES, configured: aiConfigured(), quota: req.user ? await aiQuota(req.user) : null });
});

r.post('/', requireAuth, async (req, res) => {
  const d = fields(req.body, ['input'], ['mode', 'section_id', 'history']);
  const input = String(d.input).slice(0, 6000);
  const quota = await aiQuota(req.user);
  if (quota.left === 0) throw new HttpError(429, `You have used all ${quota.quota} AI requests for today. Upgrade your membership for more.`, { upgrade: true });

  // When invoked from the reader, use the section as reference material.
  let context = '';
  if (d.section_id) {
    const s = await findOne('sections', { id: Number(d.section_id) });
    const t = s && (await findOne('texts', { id: s.text_id }, { fields: ['title', 'is_premium'] }));
    if (!s || !t) throw new HttpError(404, 'Section not found.');
    Object.assign(s, { text_title: t.title, is_premium: t.is_premium });
    if (s.is_premium && !(await hasPremium(req.user))) throw new HttpError(403, 'This passage is part of premium content.', { upgrade: true });
    context = [`${s.text_title} ${s.ref || ''} — ${s.title || ''}`, s.content_sanskrit, s.transliteration, s.translation && `Translation: ${s.translation}`, s.commentary && `Note: ${s.commentary}`].filter(Boolean).join('\n');
  }
  const result = await runAi(req.user, d.mode || 'explain', input, context, Array.isArray(d.history) ? d.history : []);
  res.json({ ...result, quota: await aiQuota(req.user) });
});

r.get('/history', requireAuth, async (req, res) => {
  res.json(await find('ai_logs', { user_id: req.user.id }, { sort: { id: -1 }, limit: 30, fields: ['id', 'mode', 'prompt', 'response', 'source', 'created_at'] }));
});

export default r;
