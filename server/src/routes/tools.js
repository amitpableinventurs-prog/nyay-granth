// Tools and Techniques: Devanagari ⇄ IAST transliteration, śloka metre analysis, citations and paper templates.
// The web app runs these in the browser with the same shared code; the API serves the mobile apps.
// OCR is not here: the web uses Tesseract.js in the browser, and apps should use on-device text recognition.
import { Router } from 'express';
import { config } from '../config.js';
import { HttpError, fields } from '../middleware.js';
import { analyzeVerse, devaToIast, hasDevanagari, iastToDeva } from '../../../shared/translit.js';
import { TEMPLATES, citations } from '../../../shared/research.js';

const r = Router();
const MAX_TEXT = 20000;

const TOOLS = [
  { key: 'transliterate', name: 'Voice & Script Input', description: 'Convert between Devanagari and IAST.', endpoint: 'POST /tools/transliterate' },
  { key: 'sloka', name: 'Śloka Analyzer', description: 'Scan a verse into laghu and guru syllables, gaṇas and metre.', endpoint: 'POST /tools/sloka' },
  { key: 'citation', name: 'Citation Generator', description: 'MLA, APA and Chicago citations for texts and translations.', endpoint: 'POST /tools/citation' },
  { key: 'templates', name: 'Research Paper Templates', description: 'Starting points for articles, translations and theses on Nyāya.', endpoint: 'GET /tools/templates' },
  { key: 'ocr', name: 'Sanskrit OCR', description: 'Read text from a photo or scan (runs on the device).', endpoint: null },
];

const text = (body, key) => {
  const v = fields(body, [key])[key];
  if (typeof v !== 'string') throw new HttpError(422, `${key} must be text.`);
  if (v.length > MAX_TEXT) throw new HttpError(422, `${key} is too long (max ${MAX_TEXT} characters).`);
  return v;
};

r.get('/', (_req, res) => res.json(TOOLS));

// `to` is 'iast' or 'devanagari'; by default the script is detected and converted to the other one.
r.post('/transliterate', (req, res) => {
  const t = text(req.body, 'text');
  const to = req.body.to || (hasDevanagari(t) ? 'iast' : 'devanagari');
  if (!['iast', 'devanagari'].includes(to)) throw new HttpError(422, "to must be 'iast' or 'devanagari'.");
  const devanagari = to === 'iast' ? t : iastToDeva(t);
  res.json({ devanagari, iast: to === 'iast' ? devaToIast(t) : t, to });
});

r.post('/sloka', (req, res) => {
  const result = analyzeVerse(text(req.body, 'verse'));
  if (!result) throw new HttpError(422, 'Please enter a verse.');
  res.json(result);
});

// Each style comes as `text` (plain) and `marked` (title in *asterisks* for italics).
r.post('/citation', (req, res) => {
  const f = fields(req.body, ['author', 'title'], ['translator', 'editor', 'publisher', 'city', 'year', 'edition', 'pages', 'url', 'accessed']);
  const cites = citations({
    ...f, publisher: f.publisher || config.appName, year: f.year || String(new Date().getFullYear()), accessed: f.accessed || new Date().toISOString().slice(0, 10),
    translator: f.translator || '', editor: f.editor || '', city: f.city || '', edition: f.edition || '', pages: f.pages || '', url: f.url || '',
  });
  res.json(Object.fromEntries(Object.entries(cites).map(([style, marked]) => [style, { text: marked.replace(/\*/g, ''), marked }])));
});

r.get('/templates', (_req, res) => {
  res.json(TEMPLATES.map(({ slug, name, body }) => ({ slug, name, format: 'markdown', body })));
});

r.get('/templates/:slug', (req, res) => {
  const t = TEMPLATES.find((x) => x.slug === req.params.slug);
  if (!t) throw new HttpError(404, 'Template not found.');
  if (req.query.download) {
    res.attachment(`${t.slug}.md`).type('text/markdown').send(t.body);
  } else res.json({ slug: t.slug, name: t.name, format: 'markdown', body: t.body });
});

export default r;
