// Admin Panel: analytics dashboard + generic CRUD for every entity in admin-entities.js.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { aggregate, attach, count, countBy, find, findOne, insert, remove, update, now, daysFromNow, toSqlDate, like, resolveAll } from '../db.js';
import { HttpError, removeUpload, requireStaff, upload, uploadedPath } from '../middleware.js';
import { ENTITIES } from '../admin-entities.js';
import { aiConfigured } from '../ai.js';
import { aiUsageByMode, searchTrends, whatsappConfigured } from '../services.js';
import { config } from '../config.js';
import { queuePdfIndex } from '../pdf-index.js';
import { searchNorm } from '../../../shared/translit.js';

const r = Router();
r.use(requireStaff);

const PER_PAGE = 25;
const TABLES_WITH_CREATED_AT = new Set(['texts', 'sections', 'audio', 'presentations', 'pdfs', 'events', 'notifications', 'forum_threads', 'reviews', 'feedback', 'users', 'plans', 'subscriptions']);

function entityFor(req) {
  const ent = ENTITIES[req.params.entity];
  if (!ent) throw new HttpError(404, 'Unknown section.');
  if (ent.adminOnly && req.user.role !== 'admin') throw new HttpError(403, 'Administrator access required.');
  return ent;
}

// Fields holding another record's numeric id (select boxes filled from a collection, and *_id filters).
const isRefField = (ent, name) => name.endsWith('_id') || !!ent.fields.find((f) => f.name === name)?.optionsFrom;

// ---- Dashboard / analytics ----
r.get('/dashboard', async (_req, res) => {
  // 28 days per series: the dashboard plots the last 14 and compares them with the 14 before.
  const DAYS = 28;
  const since = daysFromNow(-(DAYS - 1)).slice(0, 10) + ' 00:00:00';
  const perDay = async (table) => {
    const rows = await find(table, { created_at: { $gte: since } }, { fields: ['created_at'] });
    return Array.from({ length: DAYS }, (_, i) => {
      const day = toSqlDate(new Date(Date.now() - (DAYS - 1 - i) * 86400000)).slice(0, 10);
      return { day, count: rows.filter((x) => String(x.created_at).startsWith(day)).length };
    });
  };
  const paidTotal = async (gateway) => (await aggregate('payments', [{ $match: { status: 'paid', gateway } }, { $group: { _id: null, s: { $sum: '$amount' } } }]))[0]?.s ?? 0;
  const activeSubs = { status: 'active', ends_at: { $gt: now() } };
  const [subsPerPlan, plans, payments] = await Promise.all([
    countBy('subscriptions', 'plan_id', activeSubs),
    find('plans', {}, { sort: { sort_order: 1 }, fields: ['id', 'name'] }),
    find('payments', {}, { sort: { created_at: -1, id: -1 }, limit: 6, fields: ['id', 'amount', 'status', 'gateway', 'created_at', 'user_id', 'plan_id'] }),
  ]);
  const recentPayments = await attach(await attach(payments, 'users', 'user_id', { name: 'name' }, { inner: true }), 'plans', 'plan_id', { name: 'plan_name' }, { inner: true });

  res.json(await resolveAll({
    totals: {
      users: count('users'),
      texts: count('texts'),
      sections: count('sections'),
      activeSubscriptions: count('subscriptions', activeSubs),
      revenue: paidTotal({ $ne: 'demo' }),
      demoRevenue: paidTotal('demo'),
      aiRequests: count('ai_logs'),
      openTickets: count('feedback', { status: { $ne: 'closed' } }),
    },
    library: {
      texts: count('texts'),
      sections: count('sections'),
      pdfs: count('pdfs'),
      audio: count('audio'),
      presentations: count('presentations'),
      glossary: count('glossary'),
      categories: count('categories'),
      events: count('events', { starts_at: { $gte: now() } }),
    },
    signups: perDay('users'),
    reading: perDay('reading_events'),
    aiUsage: perDay('ai_logs'),
    subsByPlan: plans.map((p) => ({ name: p.name, n: subsPerPlan.get(p.id) ?? 0 })),
    topTexts: find('texts', {}, { sort: { views: -1 }, limit: 6, fields: ['id', 'title', 'views'] }),
    topPdfs: find('pdfs', { views: { $gt: 0 } }, { sort: { views: -1 }, limit: 6, fields: ['id', 'title', 'views'] }),
    recentPdfs: find('pdfs', {}, { sort: { id: -1 }, limit: 5, fields: ['id', 'title', 'author', 'pages', 'size', 'cover', 'status', 'created_at'] }),
    aiByMode: aiUsageByMode(),
    trends: searchTrends(daysFromNow(-30)),
    recentPayments: recentPayments.map(({ user_id, plan_id, ...p }) => p),
    payments: perDay('payments'),
    recentTickets: find('feedback', { status: { $ne: 'closed' } }, { sort: { id: -1 }, limit: 6, fields: ['id', 'kind', 'name', 'subject', 'created_at'] }),
    integrations: {
      database: config.db.driver,
      ai: aiConfigured(),
      razorpay: !!(config.razorpay.keyId && config.razorpay.keySecret),
      stripe: !!config.stripe.secretKey,
      whatsapp: whatsappConfigured(),
      google: !!config.google.clientId,
    },
  }));
});

// ---- Entity metadata (with select options resolved) ----
r.get('/entities', async (req, res) => {
  const out = {};
  for (const [key, ent] of Object.entries(ENTITIES)) {
    if (ent.adminOnly && req.user.role !== 'admin') continue;
    // Select options for all fields load in parallel.
    const fields = Promise.all(ent.fields.map(async (f) => {
      const { optionsFrom, ...rest } = f;
      if (optionsFrom) {
        const [table, value, label, sort] = optionsFrom;
        rest.options = (await find(table, {}, { sort, fields: [value, label] })).map((o) => [String(o[value]), o[label]]);
      }
      return rest;
    }));
    out[key] = { group: ent.group || 'Other', label: ent.label, icon: ent.icon, list: ent.list, filters: ent.filters || [], readonly: !!ent.readonly, noCreate: !!ent.noCreate, hidden: !!ent.hidden, child: ent.child || null, fields };
  }
  res.json(await resolveAll(out));
});

r.get('/:entity', async (req, res) => {
  const ent = entityFor(req);
  const filter = {};
  if (req.query.q && ent.search?.length) {
    // Diacritic-insensitive match on the normalised field where the collection has one ("nyaya" finds "Nyāya").
    const conds = ent.search.map((c) => ({ [c]: like(req.query.q) }));
    if (ent.normSearch) conds.push({ [ent.normSearch]: like(searchNorm(req.query.q)) });
    filter.$or = conds;
  }
  for (const f of ent.filters || []) {
    const v = req.query[f];
    if (v !== undefined && v !== '') filter[f] = isRefField(ent, f) ? Number(v) : String(v);
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const total = await count(ent.table, filter);
  const rows = await find(ent.table, filter, { sort: ent.order, skip: (page - 1) * PER_PAGE, limit: PER_PAGE, exclude: ['password_hash'] });
  res.json({ rows, total, page, perPage: PER_PAGE });
});

r.get('/:entity/:id', async (req, res) => {
  const ent = entityFor(req);
  const row = await findOne(ent.table, { id: Number(req.params.id) }, { exclude: ['password_hash'] });
  if (!row) throw new HttpError(404, 'Record not found.');
  res.json(row);
});

/** Build a document from the request using only declared fields. */
function collect(ent, req, isNew) {
  const data = {};
  const files = Object.fromEntries((req.files || []).map((f) => [f.fieldname, f]));
  for (const f of ent.fields) {
    if (f.virtual || f.readonly) continue;
    if (f.type === 'image' || f.type === 'file') {
      if (files[f.name]) {
        // `accept: '.pdf'` style lists are enforced here; MIME patterns such as audio/* are only a hint to the browser.
        const exts = (f.accept || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x.startsWith('.'));
        if (exts.length && !exts.includes(path.extname(files[f.name].originalname).toLowerCase())) {
          throw new HttpError(422, `${f.label}: please choose a ${exts.join(' / ')} file.`);
        }
        data[f.name] = uploadedPath(files[f.name]);
      }
      else if (req.body[f.name] !== undefined) data[f.name] = String(req.body[f.name]).trim() || null; // URL or cleared
      continue;
    }
    let v = req.body[f.name];
    if (f.type === 'checkbox') v = ['1', 'true', 'on', true, 1].includes(v) ? 1 : 0;
    else if (v === undefined) { if (!isNew) continue; v = null; }
    else if (typeof v === 'string') v = v.trim();
    if (f.type === 'number') v = v === '' || v === null ? null : Number(v);
    if (f.type === 'datetime' && v) v = String(v).replace('T', ' ').slice(0, 19) + (String(v).length === 16 ? ':00' : '');
    if (f.type === 'select' && v === '') v = null;
    if (f.optionsFrom && v !== null) v = Number(v);
    if (f.required && (v === null || v === '')) throw new HttpError(422, `${f.label} is required.`);
    data[f.name] = v;
  }
  return data;
}

const fileFields = (ent) => ent.fields.filter((f) => f.type === 'file' || f.type === 'image').map((f) => f.name);

async function save(req, res, isNew) {
  try {
    await saveRecord(req, res, isNew);
  } catch (e) {
    // A rejected save must not leave its uploads behind.
    for (const f of req.files || []) removeUpload(uploadedPath(f));
    throw e;
  }
}

async function saveRecord(req, res, isNew) {
  const ent = entityFor(req);
  if (ent.readonly || (isNew && ent.noCreate)) throw new HttpError(403, 'This section is read-only.');
  const id = isNew ? null : Number(req.params.id);
  const old = isNew ? null : await findOne(ent.table, { id });
  if (!isNew && !old) throw new HttpError(404, 'Record not found.');
  if (ent.table === 'users' && !isNew && id === req.user.id && req.body.role && req.body.role !== 'admin') {
    throw new HttpError(422, 'You cannot remove your own administrator role.');
  }
  const data = collect(ent, req, isNew);
  if (ent.beforeSave) await ent.beforeSave(data, old, req.body);
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  if (ent.table === 'users' && data.email && (await findOne('users', { email: data.email, id: { $ne: id } }))) {
    throw new HttpError(409, 'Another account already uses this email.');
  }
  let newId = id;
  if (isNew) {
    if (TABLES_WITH_CREATED_AT.has(ent.table)) data.created_at = now();
    newId = await insert(ent.table, data);
  } else {
    await update(ent.table, data, { id });
    if (ent.ownsFiles) for (const k of fileFields(ent)) if (k in data && data[k] !== old[k]) removeUpload(old[k]);
  }
  const message = ent.afterSave ? await ent.afterSave(newId, data, isNew, req.body, old) : null;
  res.json({ id: newId, message });
}

// PDF Library: the detected index of a PDF (for review), and rebuilding it on demand.
r.get('/pdfs/:id/index', async (req, res) => {
  const pdf = await findOne('pdfs', { id: Number(req.params.id) }, { fields: ['id', 'title', 'format', 'index_status', 'index_method', 'index_stats', 'index_error', 'indexed_at', 'toc'] });
  if (!pdf) throw new HttpError(404, 'PDF not found.');
  const sections = await find('pdf_sections', { pdf_id: pdf.id }, { sort: { sort_order: 1 }, fields: ['id', 'parent_id', 'level', 'kind', 'number', 'title', 'page_start', 'page_end', 'word_count', 'text'] });
  res.json({ ...pdf, sections: sections.map(({ text, ...s }) => ({ ...s, preview: String(text || '').slice(0, 220) })) });
});
r.post('/pdfs/:id/reindex', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findOne('pdfs', { id }, { fields: ['id'] }))) throw new HttpError(404, 'PDF not found.');
  queuePdfIndex(id);
  res.json({ ok: true, message: 'Indexing started.' });
});

r.post('/:entity', upload.any(), (req, res) => save(req, res, true));
r.put('/:entity/:id', upload.any(), (req, res) => save(req, res, false));

r.delete('/:entity/:id', async (req, res) => {
  const ent = entityFor(req);
  if (ent.readonly) throw new HttpError(403, 'This section is read-only.');
  const id = Number(req.params.id);
  if (ent.table === 'users' && id === req.user.id) throw new HttpError(422, 'You cannot delete your own account.');
  const row = ent.ownsFiles ? await findOne(ent.table, { id }) : null;
  for (const [table, field] of ent.cascade || []) await remove(table, { [field]: id });
  await remove(ent.table, { id });
  // Also the images extracted from a Word document.
  if (row) for (const p of [...fileFields(ent).map((k) => row[k]), ...(row.assets || [])]) removeUpload(p);
  res.json({ ok: true });
});

export default r;
