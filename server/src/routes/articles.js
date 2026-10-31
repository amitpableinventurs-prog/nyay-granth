// Faculty articles: a faculty member's own PDF papers, kept in the Document Library collection (`pdfs`) with
// `uploaded_by` set. An article stays internal (status 'draft': visible to its author and to the students of
// classes it is assigned in) until the author submits it ('pending') and an editor publishes it.
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { find, findOne, insert, remove, update, now } from '../db.js';
import { HttpError, removeUpload, requireAuth, upload, uploadedPath } from '../middleware.js';
import { queuePdfIndex } from '../pdf-index.js';
import { isFaculty, notifyAdmins } from '../services.js';
import { searchNorm } from '../../../shared/translit.js';

const r = Router();
r.use(requireAuth, (req, _res, next) => {
  if (!isFaculty(req.user)) throw new HttpError(403, 'Only faculty accounts can upload articles. Set "I am a" to Faculty in your profile.');
  next();
});

const FIELDS = ['id', 'title', 'title_sanskrit', 'author', 'description', 'language', 'category_id', 'cover', 'file', 'pages', 'size',
  'status', 'index_status', 'views', 'downloads', 'created_at', 'updated_at'];
// What the author may set: keep it internal, or submit it to the public library for review.
const AUTHOR_STATUSES = ['draft', 'pending'];

const sizeOf = (file) => { try { return fs.statSync(file.path).size; } catch { return null; } };

async function ownArticle(req) {
  const a = await findOne('pdfs', { id: Number(req.params.id), uploaded_by: req.user.id }, { fields: FIELDS });
  if (!a) throw new HttpError(404, 'Article not found.');
  return a;
}

/** Validated fields from a multipart form; `file` and `cover` are the uploaded files (if any). */
async function articleData(req, old) {
  const b = req.body || {};
  const str = (k, max) => (typeof b[k] === 'string' ? b[k].trim().slice(0, max) || null : undefined);
  const d = {
    title: str('title', 250), title_sanskrit: str('title_sanskrit', 250), author: str('author', 190),
    description: str('description', 4000), language: str('language', 60),
  };
  if (b.category_id !== undefined) {
    d.category_id = b.category_id ? Number(b.category_id) : null;
    if (d.category_id && !(await findOne('categories', { id: d.category_id }))) throw new HttpError(422, 'Category not found.');
  }
  if (b.status !== undefined) {
    if (!AUTHOR_STATUSES.includes(b.status)) throw new HttpError(422, 'Choose whether to keep the article internal or submit it to the library.');
    d.status = b.status;
  }
  if (!(d.title ?? old?.title)) throw new HttpError(422, 'Please give the article a title.');
  const file = req.files?.file?.[0];
  const cover = req.files?.cover?.[0];
  if (!old && !file) throw new HttpError(422, 'Please choose a PDF file.');
  if (file) {
    if (path.extname(file.originalname).toLowerCase() !== '.pdf') throw new HttpError(422, 'The article must be a PDF file.');
    Object.assign(d, { file: uploadedPath(file), size: sizeOf(file), format: 'pdf', pages: null });
  }
  if (cover) {
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(cover.originalname).toLowerCase())) throw new HttpError(422, 'The cover must be a JPG, PNG or WebP image.');
    d.cover = uploadedPath(cover);
  }
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
  const merged = { ...old, ...d };
  d.search_norm = searchNorm([merged.title, merged.author, merged.title_sanskrit].filter(Boolean).join(' '));
  return d;
}

/** Runs a handler that stores uploads, deleting them again if it fails. */
const withUploads = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    for (const f of Object.values(req.files || {}).flat()) removeUpload(uploadedPath(f));
    throw e;
  }
};
const files = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);

r.get('/', async (req, res) => {
  const rows = await find('pdfs', { uploaded_by: req.user.id }, { sort: { id: -1 }, fields: FIELDS });
  // Classes each article is assigned in, so the author can see where students read it.
  const used = rows.length ? await find('assignments', { pdf_id: { $in: rows.map((a) => a.id) } }, { fields: ['pdf_id', 'class_id'] }) : [];
  const classes = used.length ? await find('classes', { id: { $in: [...new Set(used.map((u) => u.class_id))] } }, { fields: ['id', 'title'] }) : [];
  const title = new Map(classes.map((c) => [c.id, c.title]));
  res.json(rows.map((a) => ({ ...a, classes: [...new Set(used.filter((u) => u.pdf_id === a.id).map((u) => title.get(u.class_id)).filter(Boolean))] })));
});

r.post('/', files, withUploads(async (req, res) => {
  const d = await articleData(req, null);
  const t = now();
  const id = await insert('pdfs', {
    title_sanskrit: null, author: req.user.name, description: null, language: null, category_id: null, text_id: null, cover: null, toc: null,
    ...d, status: d.status || 'draft', uploaded_by: req.user.id, is_premium: 0, is_downloadable: 1, views: 0, downloads: 0,
    index_status: 'queued', created_at: t, updated_at: t,
  });
  queuePdfIndex(id);
  if (d.status === 'pending') await notifyAdmins('Article submitted for the library', `${req.user.name} submitted "${d.title}".`, `/admin/pdfs/${id}`);
  res.status(201).json({ id, message: d.status === 'pending' ? 'Uploaded and submitted for review.' : 'Uploaded. The article is internal: only you and your class students can open it.' });
}));

r.put('/:id', files, withUploads(async (req, res) => {
  const old = await ownArticle(req);
  const d = await articleData(req, old);
  // A published article that gets a new file goes back for review.
  if (old.status === 'published' && d.file && d.status !== 'draft') d.status = 'pending';
  // Published articles stay published unless the author withdraws them.
  if (old.status === 'published' && d.status === 'pending' && !d.file) delete d.status;
  await update('pdfs', { ...d, updated_at: now() }, { id: old.id });
  if (d.file) { removeUpload(old.file); queuePdfIndex(old.id); }
  if (d.cover && old.cover !== d.cover) removeUpload(old.cover);
  if (d.status === 'pending' && old.status !== 'pending') {
    await notifyAdmins('Article submitted for the library', `${req.user.name} submitted "${d.title ?? old.title}".`, `/admin/pdfs/${old.id}`);
  }
  res.json({ id: old.id, message: 'Saved.' });
}));

r.delete('/:id', async (req, res) => {
  const a = await ownArticle(req);
  await update('assignments', { pdf_id: null }, { pdf_id: a.id });
  await remove('pdf_sections', { pdf_id: a.id });
  await remove('pdf_pages', { pdf_id: a.id });
  const assets = (await findOne('pdfs', { id: a.id }, { fields: ['assets'] }))?.assets || [];
  await remove('pdfs', { id: a.id });
  for (const p of [a.file, a.cover, ...assets]) removeUpload(p);
  res.json({ ok: true });
});

export default r;
