// PDF Library: uploaded books, manuscripts and papers, read in the in-app PDF viewer.
import { Router } from 'express';
import { attach, find, findOne, inc, like } from '../db.js';
import { HttpError } from '../middleware.js';
import { canSeePdf, hasPremium } from '../services.js';
import { searchNorm } from '../../../shared/translit.js';

const r = Router();

const LIST_FIELDS = ['id', 'title', 'title_sanskrit', 'author', 'description', 'language', 'cover', 'pages', 'size', 'is_premium',
  'is_downloadable', 'views', 'downloads', 'category_id', 'text_id', 'file', 'created_at', 'index_status', 'index_stats', 'format'];
const INDEX_FIELDS = ['id', 'parent_id', 'level', 'kind', 'number', 'title', 'page_start', 'page_end', 'word_count'];

/** A short excerpt of `text` around the first match of the query (or its first word), with ellipses. */
export function snippet(text, q, radius = 90) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const lower = t.toLowerCase();
  let at = -1;
  for (const needle of [q, ...String(q).split(/\s+/)].map((x) => String(x).toLowerCase()).filter((x) => x.length > 1)) {
    at = lower.indexOf(needle);
    if (at >= 0) break;
  }
  if (at < 0) return t.slice(0, radius * 2) + (t.length > radius * 2 ? '…' : '');
  const from = Math.max(0, at - radius);
  const to = Math.min(t.length, at + radius);
  return (from > 0 ? '…' : '') + t.slice(from, to).trim() + (to < t.length ? '…' : '');
}

/** The PDF if the viewer may see it (see canSeePdf); throws 404 otherwise. */
async function visiblePdf(req) {
  const pdf = await findOne('pdfs', { id: Number(req.params.id) }, { fields: [...LIST_FIELDS, 'status', 'uploaded_by'] });
  if (!pdf || !(await canSeePdf(req.user, pdf))) throw new HttpError(404, 'PDF not found.');
  return pdf;
}

/** Category and related-text names; the file URL is withheld from members-only PDFs for non-members. */
async function present(rows, premium) {
  await attach(rows, 'categories', 'category_id', { name: 'category' });
  await attach(rows, 'texts', 'text_id', { title: 'text_title' });
  return rows.map((p) => (p.is_premium && !premium ? { ...p, file: null, locked: true } : p));
}

r.get('/pdfs', async (req, res) => {
  const filter = { status: 'published' };
  if (req.query.category) filter.category_id = Number(req.query.category);
  if (req.query.text) filter.text_id = Number(req.query.text);
  if (req.query.access === 'free') filter.is_premium = 0;
  if (req.query.access === 'premium') filter.is_premium = 1;
  if (req.query.q) filter.$or = [{ search_norm: like(searchNorm(req.query.q)) }, { title_sanskrit: like(req.query.q) }];
  const sort = { popular: { views: -1 }, title: { title: 1 } }[req.query.sort] || { id: -1 };
  const rows = await find('pdfs', filter, { sort, fields: LIST_FIELDS });
  res.json(await present(rows, await hasPremium(req.user)));
});

r.get('/pdfs/:id', async (req, res) => {
  const pdf = await visiblePdf(req);
  await inc('pdfs', { id: pdf.id }, { views: 1 });
  const [out] = await present([pdf], await hasPremium(req.user));
  // The index (chapters → lessons with page ranges) is shown to everyone; the text only to those who may read the PDF.
  out.index = await find('pdf_sections', { pdf_id: pdf.id }, { sort: { sort_order: 1 }, fields: INDEX_FIELDS });
  res.json(out);
});

// One chapter or lesson as clean text, with its neighbours for previous / next navigation.
r.get('/pdfs/:id/sections/:sid', async (req, res) => {
  const pdf = await visiblePdf(req);
  const all = await find('pdf_sections', { pdf_id: pdf.id }, { sort: { sort_order: 1 }, fields: INDEX_FIELDS });
  const i = all.findIndex((s) => s.id === Number(req.params.sid));
  if (i < 0) throw new HttpError(404, 'Section not found.');
  const locked = !!pdf.is_premium && !(await hasPremium(req.user));
  const section = await findOne('pdf_sections', { id: all[i].id }, { fields: [...INDEX_FIELDS, 'text', 'html'] });
  const parent = section.parent_id ? all.find((s) => s.id === section.parent_id) : null;
  res.json({
    pdf: { id: pdf.id, title: pdf.title },
    section: locked ? { ...section, text: '', html: null, locked: true } : section,
    parent: parent ? { id: parent.id, title: parent.title } : null,
    lessons: all.filter((s) => s.parent_id === section.id),
    prev: all[i - 1] ?? null,
    next: all[i + 1] ?? null,
  });
});

// Full-text search inside one PDF: matching pages with an excerpt and the chapter/lesson they belong to.
r.get('/pdfs/:id/search', async (req, res) => {
  const pdf = await visiblePdf(req);
  const q = String(req.query.q || '').trim().slice(0, 120);
  const norm = searchNorm(q);
  if (!norm) return res.json({ q, hits: [], total: 0 });
  if (pdf.is_premium && !(await hasPremium(req.user))) return res.json({ q, hits: [], total: 0, locked: true });
  if (pdf.format && pdf.format !== 'pdf') {
    // Documents have no pages: matching chapters and lessons instead.
    const rows = await find('pdf_sections', { pdf_id: pdf.id, search_norm: like(norm) }, { sort: { sort_order: 1 }, fields: ['id', 'title', 'text'] });
    return res.json({ q, total: rows.length, unit: 'sections', hits: rows.slice(0, 60).map((r) => ({ page: null, snippet: snippet(r.text, q), section: { id: r.id, title: r.title } })) });
  }
  const pages = await find('pdf_pages', { pdf_id: pdf.id, search_norm: like(norm) }, { sort: { page: 1 }, fields: ['page', 'text'] });
  const sections = await find('pdf_sections', { pdf_id: pdf.id, level: { $lte: 2 } }, { sort: { sort_order: 1 }, fields: ['id', 'title', 'page_start', 'level'] });
  const sectionFor = (page) => [...sections].reverse().find((s) => s.page_start <= page) ?? null;
  res.json({
    q,
    unit: 'pages',
    total: pages.length,
    hits: pages.slice(0, 60).map((p) => ({ page: p.page, snippet: snippet(p.text, q), section: sectionFor(p.page) && { id: sectionFor(p.page).id, title: sectionFor(p.page).title } })),
  });
});

r.post('/pdfs/:id/download', async (req, res) => {
  await inc('pdfs', { id: Number(req.params.id), status: 'published' }, { downloads: 1 });
  res.json({ ok: true });
});

export default r;
