// Advanced search across texts, authors, Sanskrit words (Devanagari / IAST / plain ASCII) and topics.
import { Router } from 'express';
import { find, insert, now, daysFromNow, like } from '../db.js';
import { hasPremium, searchTrends } from '../services.js';
import { searchNorm } from '../../../shared/translit.js';
import { snippet } from './pdfs.js';

const r = Router();
const SCOPES = ['all', 'text', 'author', 'sanskrit', 'topic'];

r.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 190);
  const scope = SCOPES.includes(req.query.scope) ? req.query.scope : 'all';
  const era = ['ancient', 'medieval', 'contemporary'].includes(req.query.era) ? req.query.era : null;
  const norm = searchNorm(q);
  if (!norm) return res.json({ q, scope, texts: [], sections: [], terms: [], pdfs: [], total: 0 });

  const textFilter = { status: 'published', ...(era && { era }) };
  let texts = [];
  let sections = [];
  let terms = [];
  let pdfs = [];

  if (['all', 'text', 'author'].includes(scope)) {
    texts = await find('texts', { ...textFilter, [scope === 'author' ? 'author_norm' : 'search_norm']: like(norm) }, {
      sort: { views: -1 },
      limit: 20,
      fields: ['id', 'title', 'title_sanskrit', 'author', 'era', 'period', 'description', 'cover', 'cover_color', 'is_premium'],
    });
  }
  if (['all', 'sanskrit', 'topic'].includes(scope)) {
    const published = new Map((await find('texts', textFilter, { fields: ['id', 'title', 'is_premium', 'views'] })).map((t) => [t.id, t]));
    const compact = like(norm.replace(/ /g, ''));
    const match = scope === 'sanskrit' ? [{ sanskrit_norm: like(norm) }, { sanskrit_norm: compact }] : [{ search_norm: like(norm) }, { sanskrit_norm: compact }];
    const rows = await find('sections', { text_id: { $in: [...published.keys()] }, $or: match }, {
      fields: ['id', 'text_id', 'ref', 'chapter', 'title', 'content_sanskrit', 'transliteration', 'translation', 'translation_hi', 'translation_sa', 'translation_mr', 'translation_gu', 'sort_order'],
    });
    // Most-read texts first, then in reading order within a text.
    rows.sort((a, b) => (published.get(b.text_id).views ?? 0) - (published.get(a.text_id).views ?? 0) || a.sort_order - b.sort_order);
    const premium = await hasPremium(req.user);
    sections = rows.slice(0, 40).map(({ sort_order, ...s }) => {
      const t = published.get(s.text_id);
      const row = { ...s, text_title: t.title, is_premium: t.is_premium };
      return row.is_premium && !premium ? { ...row, content_sanskrit: '', transliteration: '', translation: '', translation_hi: '', translation_sa: '', translation_mr: '', translation_gu: '', locked: true } : row;
    });
  }
  if (['all', 'topic', 'sanskrit'].includes(scope)) {
    terms = await find('glossary', { $or: [{ search_norm: like(norm) }, { meaning: like(q) }, { meaning_hi: like(q) }, { term_devanagari: like(q) }] }, { sort: { term: 1 }, limit: 10 });
  }
  if (['all', 'topic', 'text', 'sanskrit'].includes(scope)) {
    // Chapters and lessons of uploaded PDFs (their text is indexed when the PDF is uploaded).
    const published = new Map((await find('pdfs', { status: 'published' }, { fields: ['id', 'title', 'is_premium'] })).map((p) => [p.id, p]));
    const rows = await find('pdf_sections', { pdf_id: { $in: [...published.keys()] }, search_norm: like(norm) }, { limit: 30, sort: { pdf_id: 1, sort_order: 1 }, fields: ['id', 'pdf_id', 'title', 'kind', 'page_start', 'text'] });
    const premium = await hasPremium(req.user);
    pdfs = rows.slice(0, 12).map((s) => {
      const p = published.get(s.pdf_id);
      const locked = !!p.is_premium && !premium;
      return { section_id: s.id, pdf_id: s.pdf_id, pdf_title: p.title, title: s.title, kind: s.kind, page: s.page_start, snippet: locked ? '' : snippet(s.text, q), locked };
    });
  }
  const total = texts.length + sections.length + terms.length + pdfs.length;
  await insert('search_logs', { user_id: req.user?.id ?? null, query: q, norm: norm.slice(0, 190), results: total, created_at: now() });
  res.json({ q, scope, norm, texts, sections, terms, pdfs, total });
});

// Research trend analysis: most searched terms of the last 30 days.
r.get('/trending', async (_req, res) => {
  res.json(await searchTrends(daysFromNow(-30), { withResults: true }));
});

export default r;
