// Text Library, reader, reading progress, home feed, archives and the Nyāya terminology dictionary.
import { Router } from 'express';
import { attach, count, countBy, find, findOne, inc, insert, update, now, like } from '../db.js';
import { HttpError, requireAuth } from '../middleware.js';
import { eventScope, hasPremium, isStaff } from '../services.js';
import { searchNorm } from '../../../shared/translit.js';
import { GLOSSARY_LIST_FIELDS, relatedList, termMatcher } from '../dictionary.js';
import { shopHighlights } from './shop.js';

const r = Router();
const PREVIEW_SECTIONS = 2;

const TEXT_FIELDS = ['id', 'title', 'title_sanskrit', 'author', 'author_sanskrit', 'era', 'period', 'description', 'cover', 'cover_color',
  'is_premium', 'is_featured', 'views', 'category_id'];

/** Adds the category name and section count that every text listing shows. */
async function withTextExtras(texts) {
  await attach(texts, 'categories', 'category_id', { name: 'category' });
  const sections = await countBy('sections', 'text_id', { text_id: { $in: texts.map((t) => t.id) } });
  for (const t of texts) t.section_count = sections.get(t.id) ?? 0;
  return texts;
}

const listTexts = async (filter, opts = {}) => withTextExtras(await find('texts', filter, { ...opts, fields: TEXT_FIELDS }));

async function continueReading(userId, limit = 5) {
  const progress = await find('reading_progress', { user_id: userId }, { sort: { updated_at: -1 }, limit });
  const texts = new Map((await listTexts({ id: { $in: progress.map((p) => p.text_id) } })).map((t) => [t.id, t]));
  return progress
    .filter((p) => texts.has(p.text_id))
    .map((p) => ({ ...texts.get(p.text_id), percent: p.percent, last_section_id: p.section_id, last_read_at: p.updated_at }));
}

r.get('/home', async (req, res) => {
  // Independent queries run in parallel.
  const wordOfDay = async (glossaryCount) => {
    const dayIndex = Math.floor(Date.now() / 86400000) % Math.max(1, glossaryCount);
    return (await find('glossary', {}, { sort: { id: 1 }, skip: dayIndex, limit: 1 }))[0] ?? null;
  };
  const glossaryCount = count('glossary');
  const [quotes, featured, continueRows, events, word, products, texts, sections, terms] = await Promise.all([
    find('quotes', {}, { sort: { id: 1 } }),
    listTexts({ status: 'published' }, { sort: { is_featured: -1, views: -1, id: 1 }, limit: 8 }),
    req.user ? continueReading(req.user.id) : [],
    eventScope(req.user).then((scope) => find('events', { ...scope, starts_at: { $gte: now() } }, { sort: { starts_at: 1 }, limit: 3 })),
    glossaryCount.then(wordOfDay),
    shopHighlights(6),
    count('texts', { status: 'published' }),
    count('sections'),
    glossaryCount,
  ]);
  res.json({ quotes, featured, continueReading: continueRows, events, wordOfDay: word, products, stats: { texts, sections, terms } });
});

r.get('/categories', async (_req, res) => {
  const counts = await countBy('texts', 'category_id', { status: 'published' });
  const cats = await find('categories', {}, { sort: { sort_order: 1, name: 1 } });
  res.json(cats.map((c) => ({ ...c, text_count: counts.get(c.id) ?? 0 })));
});

r.get('/texts', async (req, res) => {
  const filter = { status: 'published' };
  if (['ancient', 'medieval', 'contemporary'].includes(req.query.era)) filter.era = req.query.era;
  if (req.query.category) filter.category_id = Number(req.query.category);
  if (req.query.access === 'free') filter.is_premium = 0;
  if (req.query.access === 'premium') filter.is_premium = 1;
  if (req.query.q) filter.search_norm = like(searchNorm(req.query.q));
  const sort = { popular: { views: -1 }, title: { title: 1 }, newest: { id: -1 } }[req.query.sort] || { is_featured: -1, title: 1 };
  res.json(await listTexts(filter, { sort }));
});

r.get('/texts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [text] = await listTexts({ id, ...(isStaff(req.user) ? {} : { status: 'published' }) });
  if (!text) throw new HttpError(404, 'Text not found.');
  const uid = req.user?.id;
  // Independent queries run in parallel.
  const sectionList = hasPremium(req.user).then((premium) => {
    const locked = !!text.is_premium && !premium;
    return find('sections', { text_id: id }, {
      sort: { sort_order: 1, id: 1 },
      limit: locked ? PREVIEW_SECTIONS : 0,
      fields: ['id', 'chapter', 'ref', 'title', 'content_sanskrit', 'transliteration', 'translation', 'translation_hi', 'translation_sa', 'translation_mr', 'translation_gu', 'commentary', 'sort_order'],
    }).then((sections) => ({ locked, sections }));
  });
  const [{ locked, sections }, bookmarks, notes, progress, audio, presentations, pdfs, terms] = await Promise.all([
    sectionList,
    uid ? find('bookmarks', { user_id: uid, text_id: id }, { fields: ['id', 'section_id'] }) : [],
    uid ? find('notes', { user_id: uid, text_id: id }, { sort: { updated_at: -1 } }) : [],
    uid ? findOne('reading_progress', { user_id: uid, text_id: id }, { fields: ['section_id', 'percent'] }) : null,
    find('audio', { text_id: id }, { sort: { id: 1 }, fields: ['id', 'title', 'speaker', 'kind', 'duration', 'is_premium'] }),
    find('presentations', { text_id: id }, { sort: { id: 1 }, fields: ['id', 'title', 'is_premium'] }),
    find('pdfs', { text_id: id, status: 'published' }, { sort: { id: 1 }, fields: ['id', 'title', 'pages', 'is_premium'] }),
    keyTerms(id),
    inc('texts', { id }, { views: 1 }),
  ]);
  res.json({ text, sections, locked, bookmarks, notes, progress, audio, presentations, pdfs, terms });
});

/** Dictionary terms that occur in a text, in dictionary order (for the reader's "Key terms"). */
async function keyTerms(textId) {
  const norms = (await find('sections', { text_id: textId }, { fields: ['sanskrit_norm'] })).map((s) => s.sanskrit_norm || '').filter(Boolean);
  if (!norms.length) return [];
  const terms = await find('glossary', { slug: { $exists: true, $ne: null } }, { fields: ['slug', 'term', 'term_devanagari', 'meaning'] });
  return terms.filter((g) => { const m = termMatcher(g.term); return m && norms.some((n) => m.test(n)); }).sort(byDevanagari).slice(0, 24);
}

r.post('/texts/:id/progress', requireAuth, async (req, res) => {
  const textId = Number(req.params.id);
  const sectionId = Number(req.body.section_id);
  const list = await find('sections', { text_id: textId }, { sort: { sort_order: 1, id: 1 }, fields: ['id'] });
  const idx = list.findIndex((s) => s.id === sectionId);
  if (idx < 0) throw new HttpError(404, 'Section not found.');
  const percent = Math.round(((idx + 1) / list.length) * 100);
  const existing = await findOne('reading_progress', { user_id: req.user.id, text_id: textId });
  if (existing) {
    // Never move progress backwards when re-reading earlier sections.
    await update('reading_progress', { section_id: sectionId, percent: Math.max(percent, Number(existing.percent)), updated_at: now() }, { id: existing.id });
  } else {
    await insert('reading_progress', { user_id: req.user.id, text_id: textId, section_id: sectionId, percent, updated_at: now() });
  }
  await insert('reading_events', { user_id: req.user.id, text_id: textId, section_id: sectionId, created_at: now() });
  res.json({ percent: Math.max(percent, Number(existing?.percent || 0)) });
});

r.get('/continue', requireAuth, async (req, res) => res.json(await continueReading(req.user.id, 20)));

r.get('/archives', async (_req, res) => {
  res.json({
    texts: await listTexts({ status: 'published' }, { sort: { era: 1, title: 1 } }),
    pastEvents: await find('events', { class_id: null, starts_at: { $lt: now() } }, { sort: { starts_at: -1 }, limit: 50 }),
  });
});

// ---- Nyāya Terminology Dictionary ----
// Sanskrit dictionary order (अ आ इ … क ख …), which the Hindi collation follows.
const devaOrder = new Intl.Collator('hi').compare;
const byDevanagari = (a, b) => devaOrder(a.term_devanagari || a.term, b.term_devanagari || b.term);

r.get('/glossary', async (req, res) => {
  const all = await find('glossary', {}, { fields: [...GLOSSARY_LIST_FIELDS, 'search_norm'] });
  const counts = {};
  for (const g of all) if (g.category) counts[g.category] = (counts[g.category] || 0) + 1;

  let terms = all;
  if (req.query.category) terms = terms.filter((g) => g.category === req.query.category);
  const q = String(req.query.q || '').trim();
  if (q) {
    // Devanagari, IAST and plain spellings match the term; English and Indian-language text matches the meaning.
    const n = searchNorm(q);
    const plain = q.toLowerCase();
    const meanings = (g) => [g.meaning, g.meaning_hi, g.meaning_mr, g.meaning_gu].map((m) => String(m || '').toLowerCase());
    const rank = (g) => {
      const s = g.search_norm || '';
      if (n) {
        if (s === n) return 0;
        if (s.startsWith(n)) return 1;
        if (s.includes(n)) return 2;
      }
      if ((g.term_devanagari || '').includes(q)) return 2;
      const ms = meanings(g);
      if (ms.some((m) => m.startsWith(plain))) return 3;
      if (ms.some((m) => m.includes(plain))) return 4;
      return 9;
    };
    terms = terms.map((g) => [rank(g), g]).filter(([k]) => k < 9).sort((a, b) => a[0] - b[0] || byDevanagari(a[1], b[1])).map(([, g]) => g);
  } else {
    terms = terms.sort(byDevanagari);
  }
  res.json({
    terms: terms.map(({ search_norm, ...g }) => g),
    total: all.length,
    categories: Object.keys(counts).sort(),
    categoryCounts: counts,
  });
});

r.get('/glossary/:slug', async (req, res) => {
  const term = await findOne('glossary', { slug: req.params.slug });
  if (!term) throw new HttpError(404, 'Term not found.');

  // Related terms: those this entry lists plus those that list it.
  const own = relatedList(term.related);
  const others = await find('glossary', { id: { $ne: term.id }, related: { $exists: true, $ne: null } }, { fields: ['term', 'related'] });
  const names = new Set([...own, ...others.filter((o) => relatedList(o.related).includes(term.term)).map((o) => o.term)]);
  const related = (await find('glossary', { term: { $in: [...names] } }, { fields: ['slug', 'term', 'term_devanagari', 'meaning', 'category'] }))
    .sort((a, b) => (own.includes(a.term) ? own.indexOf(a.term) : 99) - (own.includes(b.term) ? own.indexOf(b.term) : 99));

  // Where the term occurs in the library (published texts only).
  const matcher = termMatcher(term.term);
  let usedIn = [];
  let usedInCount = 0;
  if (matcher) {
    const published = await find('texts', { status: 'published' }, { fields: ['id', 'title'] });
    const titles = new Map(published.map((t) => [t.id, t.title]));
    const hits = await find('sections', { text_id: { $in: [...titles.keys()] }, sanskrit_norm: matcher }, { sort: { text_id: 1, sort_order: 1 }, fields: ['id', 'text_id', 'ref', 'title', 'content_sanskrit'] });
    usedInCount = hits.length;
    usedIn = hits.slice(0, 8).map((s) => ({ section_id: s.id, text_id: s.text_id, text_title: titles.get(s.text_id), ref: s.ref, title: s.title, sanskrit: String(s.content_sanskrit || '').slice(0, 140) }));
  }

  // "Nyāya Sūtra 1.1.4" links to that sūtra in the library; "Tarkasaṅgraha" links to the text.
  let source = null;
  if (term.definition_source) {
    const m = String(term.definition_source).match(/^(.*?)\s+([\d.]+)$/);
    const text = await findOne('texts', { title: m ? m[1] : term.definition_source, status: 'published' }, { fields: ['id', 'title'] });
    if (text) {
      const section = m ? await findOne('sections', { text_id: text.id, ref: m[2] }, { fields: ['id'] }) : null;
      source = { text_id: text.id, section_id: section?.id ?? null };
    }
  }

  // Neighbours in dictionary order, for previous / next navigation.
  const list = (await find('glossary', {}, { fields: ['slug', 'term', 'term_devanagari'] })).sort(byDevanagari);
  const i = list.findIndex((g) => g.slug === term.slug);
  const { search_norm, ...entry } = term;
  res.json({ term: entry, related, usedIn, usedInCount, source, prev: list[i - 1] ?? null, next: list[i + 1] ?? null, position: i + 1, total: list.length });
});

export default r;
