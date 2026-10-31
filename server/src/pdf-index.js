// PDF indexing: turns an uploaded PDF's raw text into clean, chapter-wise and lesson-wise content.
//
// 1. Extract   every page's text and rebuild lines in reading order (pdf.js).
// 2. Clean     drop running headers/footers and page numbers, fix ligatures, Devanagari vowel-sign order,
//              hyphenated line breaks, and join wrapped lines into paragraphs.
// 3. Structure from (in order of preference) the index an editor typed in, the PDF's own bookmarks,
//              detected headings (font size, "Chapter"/"Lesson"/"अध्याय"/"पाठ" keywords, numbering), or
//              finally page ranges.
// 4. Store     pdf_sections (chapters → lessons, each with its text and page range) and pdf_pages (text of
//              every page, for search). The pdfs document gets index_status / index_stats.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { config } from './config.js';
import { find, findOne, insert, remove, update, now } from './db.js';
import { searchNorm } from '../../shared/translit.js';

const require = createRequire(import.meta.url);
const PDFJS_DIR = path.dirname(require.resolve('pdfjs-dist/package.json'));
let pdfjsLib = null;
const loadPdfjs = async () => (pdfjsLib ||= await import('pdfjs-dist/legacy/build/pdf.mjs'));

const MAX_BYTES = 100 * 1024 * 1024;
const DIGITS = '०१२३४५६७८९';
const NUM = `(?:[0-9]+|[${DIGITS}]+|[ivxlcdm]+|[IVXLCDM]+)`;

// Headings that open a chapter-level or lesson-level unit (English, Sanskrit and Hindi).
const CHAPTER_WORDS = ['chapter', 'chap\\.', 'part', 'book', 'unit', 'module', 'adhyāya', 'adhyaya', 'prakaraṇa', 'prakarana', 'khaṇḍa', 'khanda', 'āhnika', 'ahnika',
  'अध्यायः', 'अध्याय', 'प्रकरणम्', 'प्रकरण', 'खण्डः', 'खण्ड', 'खंड', 'भागः', 'भाग', 'काण्डम्', 'काण्ड', 'परिच्छेदः', 'परिच्छेद', 'आह्निकम्', 'आह्निक', 'इकाई'];
const LESSON_WORDS = ['lesson', 'lecture', 'topic', 'section', 'sub-?section', 'pāṭha', 'patha', 'पाठः', 'पाठ', 'अनुच्छेदः', 'अनुच्छेद', 'विषयः', 'व्याख्यानम्', 'व्याख्यान'];
const wordRx = (words) => new RegExp(`^(?:${words.join('|')})(?=$|[\\s.:\\-–—(]|${NUM})\\s*(${NUM}(?:[.\\-]${NUM})*)?`, 'i');
export const CHAPTER_RX = wordRx(CHAPTER_WORDS);
export const LESSON_RX = wordRx(LESSON_WORDS);
// "1.2 Title", "३. Title", "IV. Title" — Roman numerals only in capitals and followed by a stop, so "Civil law" is prose.
export const NUMBERED_RX = new RegExp(`^((?:[0-9]+|[${DIGITS}]+)(?:\\.(?:[0-9]+|[${DIGITS}]+))*\\.?|[IVXLC]{1,6}[.)])\\s+\\S`);
const TOC_LINE_RX = /(\.{4,}|…{2,}|(\. ){4,}|_{4,})\s*\S{1,6}\s*$/;
const PAGE_NO_RX = new RegExp(`^[\\s\\-–—(\\[|]*(?:page|p\\.|पृष्ठ|पृ\\.)?\\s*${NUM}\\s*(?:of\\s+\\d+)?[\\s\\-–—)\\]|]*$`, 'i');
const LIGATURES = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'ft', 'ﬆ': 'st' };

// ---------------- 1. Extract ----------------

async function readPdfBytes(file) {
  if (String(file).startsWith('/uploads/')) {
    const abs = path.resolve(config.uploadsDir, file.slice('/uploads/'.length));
    if (!abs.startsWith(path.resolve(config.uploadsDir) + path.sep)) throw new Error('Invalid file path.');
    return new Uint8Array(await fs.promises.readFile(abs));
  }
  if (/^https?:\/\//i.test(file)) {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`Could not download the PDF (HTTP ${res.status}).`);
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('The PDF is larger than 100 MB.');
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error('The file must be an uploaded PDF or an http(s) URL.');
}

/**
 * Lines of one page, top to bottom: { text, size, y, x, top } (top: 0 = top edge … 1 = bottom edge).
 * `tally` counts characters and the unmapped glyphs (private-use codes) that cleaning removes.
 */
async function pageLines(page, tally = { chars: 0, unmapped: 0 }) {
  const [, y0, , y1] = page.view;
  const height = Math.max(1, y1 - y0);
  const items = (await page.getTextContent()).items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, size: Math.hypot(i.transform[2], i.transform[3]) || i.height || 10 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, Math.min(l.size, it.size) * 0.45));
    if (line) line.items.push(it), (line.size = Math.max(line.size, it.size));
    else lines.push({ y: it.y, size: it.size, items: [it] });
  }
  return lines.sort((a, b) => b.y - a.y).map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    let text = '';
    let end = null;
    for (const it of l.items) {
      if (end !== null && it.x - end > it.size * 0.2 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
      text += it.str;
      end = it.x + it.w;
    }
    tally.chars += text.replace(/\s/g, '').length;
    tally.unmapped += (text.match(/[-�]|[\u{F0000}-\u{10FFFF}]/gu) || []).length;
    return { text: cleanLine(text), size: Math.round(l.size * 2) / 2, y: l.y, x: l.items[0].x, top: (y1 - l.y) / height };
  }).filter((l) => l.text);
}

// ---------------- 2. Clean ----------------

/** Unicode clean-up of one line: ligatures, soft hyphens, spacing and Devanagari short-i order. */
export function cleanLine(s) {
  return String(s)
    .normalize('NFC')
    // Private-use codes are glyphs the PDF's font never mapped to Unicode (often conjuncts); they render as boxes.
    .replace(/[-�\u0000-\u0008\u000B\u000C\u000E-\u001F]|[\u{F0000}-\u{10FFFF}]/gu, '')
    // Vedic accents stored before a vowel sign belong after it.
    .replace(/([॑-॔᳐-᳿]+)([ऺ-ऻा-ॏॕ-ॗॢॣ]+)/g, '$2$1')
    .replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] || c)
    .replace(/­/g, '')
    .replace(/[  -   　\t]/g, ' ')
    // Some PDFs store ि (short i) in visual order, before its consonant. A genuine ि always follows a
    // consonant, so one that follows a space, a vowel sign or nothing at all is moved after the cluster.
    .replace(/(^|[^क-हक़-य़़])ि((?:[क-हक़-य़]़?्)*[क-हक़-य़]़?)/g, '$1$2ि')
    // Two-part vowels some fonts store as separate glyphs: अ+ा+े → ओ, अ+ा → आ, ा+े → ो, ा+ै → ौ.
    .replace(/अाे/g, 'ओ').replace(/अाै/g, 'औ').replace(/अा/g, 'आ')
    .replace(/ाे/g, 'ो').replace(/ाै/g, 'ौ')
    .replace(/ {2,}/g, ' ')
    .replace(/[ऀ-ॿ᳐-᳿]+/g, dropOrphanMarks)
    // Latin combining marks cannot sit on Devanagari (or on nothing); the font shows them as dotted circles.
    .replace(/([ऀ-ॿ᳐-᳿\s]|^)[̀-ͯ]+/g, '$1')
    .trim();
}

/**
 * Removes Devanagari signs that have no letter to sit on — a vowel sign or virama not after a consonant, or ं ँ ः
 * and accents not after a letter. They appear when the letter itself was an unreadable glyph, and would render as
 * dotted circles. Correct text passes through unchanged.
 */
function dropOrphanMarks(word) {
  let out = '';
  let prev = 'start';
  for (const ch of word) {
    const c = ch.codePointAt(0);
    const consonant = (c >= 0x0915 && c <= 0x0939) || (c >= 0x0958 && c <= 0x095F) || (c >= 0x0978 && c <= 0x097F);
    const vowel = (c >= 0x0904 && c <= 0x0914) || c === 0x0960 || c === 0x0961 || (c >= 0x0972 && c <= 0x0977);
    const sign = (c >= 0x093A && c <= 0x094F && c !== 0x093C && c !== 0x093D) || (c >= 0x0955 && c <= 0x0957) || c === 0x0962 || c === 0x0963;
    const bindu = c >= 0x0900 && c <= 0x0903;
    const accent = (c >= 0x0951 && c <= 0x0954) || (c >= 0x1CD0 && c <= 0x1CFF);
    if (consonant) { out += ch; prev = 'consonant'; }
    else if (c === 0x093C) { if (prev === 'consonant') out += ch; }
    else if (sign) { if (prev === 'consonant') { out += ch; prev = c === 0x094D ? 'virama' : 'sign'; } }
    else if (bindu || accent) { if (['consonant', 'sign', 'vowel', 'mark'].includes(prev)) { out += ch; prev = 'mark'; } }
    else if (vowel) { out += ch; prev = 'vowel'; }
    else { out += ch; prev = 'other'; }
  }
  return out;
}

const furnitureKey = (text) => text.toLowerCase().replace(/[0-9०-९]+/g, '#').replace(/\s+/g, ' ').trim();

/** Removes running headers/footers (text repeated in the top or bottom margin of many pages) and page numbers. */
export function stripFurniture(pages) {
  const inMargin = (l) => l.top < 0.09 || l.top > 0.91;
  const counts = new Map();
  for (const lines of pages) {
    for (const key of new Set(lines.filter(inMargin).map((l) => furnitureKey(l.text)))) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3));
  let removed = 0;
  const out = pages.map((lines) => lines.filter((l) => {
    const drop = inMargin(l) && (PAGE_NO_RX.test(l.text) || (counts.get(furnitureKey(l.text)) || 0) >= threshold);
    if (drop) removed++;
    return !drop;
  }));
  return { pages: out, removed };
}

const SENTENCE_END = /[.!?।॥:;"'”’)\]]$/;

/** Joins lines into paragraphs: re-joins hyphenated words, keeps short closing lines as paragraph ends. */
export function toParagraphs(lines) {
  const paras = [];
  let cur = '';
  let prev = null;
  const width = median(lines.map((l) => l.text.length)) || 60;
  for (const l of lines) {
    if (l.heading) {
      if (cur) paras.push(cur);
      paras.push(`### ${l.text}`);
      cur = '';
      prev = null;
      continue;
    }
    const gap = prev && prev.page === l.page ? prev.y - l.y : 0;
    const newPara = !cur
      || (gap > Math.max(prev.size, l.size) * 1.9)
      || (SENTENCE_END.test(cur) && prev.text.length < width * 0.72)
      || /^([-•–*▪◦]|\(?\d+[.)]|[a-z][.)])\s/.test(l.text);
    if (newPara) {
      if (cur) paras.push(cur);
      cur = l.text;
    } else if (/[A-Za-z]-$/.test(cur) && /^[a-z]/.test(l.text)) {
      cur = cur.slice(0, -1) + l.text; // hyphenated across the line break
    } else {
      cur += ' ' + l.text;
    }
    prev = l;
  }
  if (cur) paras.push(cur);
  return paras.join('\n\n');
}

function median(nums) {
  const s = nums.filter((n) => n > 0).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/** Body text size: the size carrying the most characters. */
function bodySize(pages) {
  const weight = new Map();
  for (const lines of pages) for (const l of lines) weight.set(l.size, (weight.get(l.size) || 0) + l.text.length);
  return [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 11;
}

// ---------------- 3. Structure ----------------

const normTitle = (s) => searchNorm(String(s)).replace(/[^a-z0-9]/g, '');

/**
 * Where a bookmark's or manual entry's title starts on its page: { line, lines, found }. When the title is not
 * printed there, the section starts at the bookmark's position (or the top of the page) and no line is skipped.
 */
function findTitleLine(lines, title, fromY = null) {
  const want = normTitle(title);
  const start = fromY === null ? 0 : Math.max(0, lines.findIndex((l) => l.y <= fromY + 2));
  if (want) {
    for (let i = start; i < lines.length; i++) {
      const one = normTitle(lines[i].text);
      if (one.length < 3) continue;
      // A heading line: the title itself, the title with a short label ("Chapter 1: …", "Lesson 1.1 …"),
      // or the first half of a title broken over two lines — never a prose line that merely starts with it.
      if (one === want || (one.startsWith(want) && one.length <= want.length + 12) || (one.endsWith(want) && one.length <= want.length + 20)) {
        return { line: i, lines: 1, found: true };
      }
      if (one.length >= 6 && want.startsWith(one) && i + 1 < lines.length && want.startsWith(one + normTitle(lines[i + 1].text).slice(0, 4))) {
        return { line: i, lines: 2, found: true };
      }
    }
  }
  return { line: start, lines: 0, found: false };
}

/** Bookmarks and typed-in entries keep their given order: a position found earlier on the same page is not trusted. */
function keepOrder(list) {
  for (let k = 1; k < list.length; k++) {
    const a = list[k - 1], b = list[k];
    if (b.page === a.page && b.line < a.line + (a.found ? a.lines : 0)) Object.assign(b, { line: a.line + (a.found ? a.lines : 0), lines: 0, found: false });
  }
  return list;
}

function classify(text) {
  const c = text.match(CHAPTER_RX);
  if (c) return { kind: 'chapter', number: c[1] || null };
  const l = text.match(LESSON_RX);
  if (l) return { kind: 'lesson', number: l[1] || null };
  const n = text.match(NUMBERED_RX);
  if (n) return { kind: null, number: n[1], depth: n[1].split('.').length };
  return { kind: null, number: null };
}

/** Heading candidates from layout and wording. Returns [{ page, line, lines, title, level, kind, number }]. */
export function detectHeadings(pages) {
  const body = bodySize(pages);
  const maxSize = Math.max(...pages.flat().map((l) => l.size), body);
  const words = (lines) => lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  // A first page holding the largest type in the document and little prose is a title page.
  const titlePage = pages.length > 2 && pages[0].some((l) => l.size >= maxSize) && words(pages[0]) < 80;

  const cands = [];
  pages.forEach((lines, p) => {
    if (p === 0 && titlePage) return;
    // A contents page ("Chapter 1 ........ 5") lists headings but is not one.
    if (lines.filter((l) => TOC_LINE_RX.test(l.text)).length >= 2) return;
    lines.forEach((l, i) => {
      const t = l.text;
      if (TOC_LINE_RX.test(t)) return;
      const wc = t.split(/\s+/).length;
      if (t.length < 2 || t.length > 140 || wc > 16 || /,$/.test(t)) return;
      const big = l.size >= body * 1.15;
      const info = classify(t);
      const shortStandalone = wc <= 10 && !/[.;,]$/.test(t);
      // "Part of the argument…" is prose; "Part 2" on its own line, or set in larger type, is a heading.
      const isHeading = (info.kind && (big || (shortStandalone && info.number))) || (big && shortStandalone) || (info.depth && big);
      if (isHeading) cands.push({ page: p, line: i, lines: 1, found: true, title: t, size: l.size, y: l.y, ...info });
    });
  });

  // Headings broken over two lines ("Chapter 1" / "The Means of Knowledge") become one.
  const merged = [];
  for (const c of cands) {
    const last = merged.at(-1);
    if (last && last.page === c.page && last.line + last.lines === c.line && last.size === c.size && last.y - c.y < c.size * 1.9 && !(c.kind && last.kind)) {
      last.title += (/[:\-–—]$/.test(last.title) || !last.kind ? ' ' : ': ') + c.title;
      last.lines++;
    } else merged.push({ ...c });
  }

  // Too many "headings" means the layout signals are weak: keep only keyword or clearly larger ones.
  let heads = merged;
  if (heads.length > pages.length * 3) heads = heads.filter((h) => h.kind || h.size >= body * 1.4);

  // Levels: keyword chapters are level 1 and lessons level 2; other headings by size relative to them.
  const chapterSizes = heads.filter((h) => h.kind === 'chapter').map((h) => h.size);
  const lessonSizes = heads.filter((h) => h.kind === 'lesson').map((h) => h.size);
  const sizes = [...new Set(heads.filter((h) => !h.kind).map((h) => h.size))].sort((a, b) => b - a);
  const c1 = chapterSizes.length ? Math.min(...chapterSizes) : sizes[0];
  const l1 = lessonSizes.length ? Math.min(...lessonSizes) : sizes.find((s) => s < (c1 ?? Infinity)) ?? sizes[1];
  for (const h of heads) {
    if (h.kind === 'chapter') h.level = 1;
    else if (h.kind === 'lesson') h.level = chapterSizes.length ? 2 : 1;
    else if (h.depth) h.level = Math.min(3, h.depth);
    else if (c1 !== undefined && h.size >= c1 - 0.5) h.level = 1;
    else if (l1 !== undefined && h.size >= l1 - 0.5) h.level = 2;
    else h.level = 3;
    if (!h.kind) h.kind = h.level === 1 ? 'chapter' : h.level === 2 ? 'lesson' : 'heading';
  }
  if (heads.length && !heads.some((h) => h.level === 1)) heads.forEach((h) => { h.level = Math.max(1, h.level - 1); });
  return heads;
}

/** Bookmarks of the PDF as headings, with the line where each starts. */
async function outlineHeadings(doc, pages) {
  const outline = await doc.getOutline();
  if (!outline?.length) return [];
  const out = [];
  const walk = async (items, level) => {
    for (const it of items) {
      let dest = it.dest;
      try {
        if (typeof dest === 'string') dest = await doc.getDestination(dest);
        if (Array.isArray(dest)) {
          const ref = dest[0];
          const pageIndex = typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
          const top = dest[1]?.name === 'XYZ' && typeof dest[3] === 'number' ? dest[3] : null;
          const title = cleanLine(it.title || '');
          if (title && pages[pageIndex]) {
            const info = classify(title);
            out.push({ page: pageIndex, ...findTitleLine(pages[pageIndex], title, top), title, level, kind: info.kind || (level === 1 ? 'chapter' : level === 2 ? 'lesson' : 'heading'), number: info.number });
          }
        }
      } catch { /* a broken bookmark is skipped */ }
      if (it.items?.length) await walk(it.items, level + 1);
    }
  };
  await walk(outline, 1);
  return out.length >= 2 ? keepOrder(out) : [];
}

/**
 * An index typed in by an editor, one entry per line, with the PDF page number after "|":
 *   # Chapter 1: Pramāṇa | 5
 *   ## Lesson 1.1: Perception | 7
 */
export function parseManualIndex(text, pages) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.trim().match(/^(#{1,3})\s*(.+?)\s*(?:\||\.{3,}|…)\s*(\d+)\s*$/);
    if (!m) continue;
    const page = Math.min(Math.max(1, Number(m[3])), pages.length) - 1;
    const title = cleanLine(m[2]);
    const info = classify(title);
    const level = m[1].length;
    out.push({ page, ...findTitleLine(pages[page] || [], title), title, level, kind: info.kind || (level === 1 ? 'chapter' : level === 2 ? 'lesson' : 'heading'), number: info.number });
  }
  return keepOrder(out);
}

/** Splits the document at its level-1/2 headings; deeper headings stay in the text as "### …". */
export function buildSections(pages, headings) {
  const flat = [];
  pages.forEach((lines, p) => lines.forEach((l, i) => flat.push({ ...l, page: p, idx: i })));
  const pos = (h) => flat.findIndex((l) => l.page === h.page && l.idx >= h.line);
  const marks = headings
    .map((h) => ({ ...h, at: pos(h) < 0 ? flat.length : pos(h) }))
    .sort((a, b) => a.page - b.page || a.at - b.at);
  const top = marks.filter((h) => h.level <= 2);
  const sub = new Map(marks.filter((h) => h.level > 2).map((h) => [h.at, h]));
  const sliceText = (from, to) => {
    const lines = [];
    for (let k = from; k < to; k++) {
      const h = sub.get(k);
      if (h) { lines.push({ ...flat[k], text: h.title, heading: true }); k += h.lines - 1; continue; }
      lines.push(flat[k]);
    }
    return toParagraphs(lines);
  };

  const sections = [];
  const firstAt = top.length ? top[0].at : flat.length;
  const front = sliceText(0, firstAt);
  if (front.split(/\s+/).length > 30) sections.push({ level: 1, kind: 'front', title: 'Front matter', number: null, page_start: 1, page_end: (flat[firstAt - 1]?.page ?? 0) + 1, text: front });

  top.forEach((h, k) => {
    const next = top[k + 1];
    const end = next ? next.at : flat.length;
    const text = sliceText(Math.min(h.at + (h.found ? h.lines : 0), end), end);
    const lastPage = end > h.at ? flat[end - 1]?.page ?? h.page : h.page;
    sections.push({ level: h.level, kind: h.kind, title: h.title, number: h.number || null, page_start: h.page + 1, page_end: Math.max(h.page, lastPage) + 1, text });
  });
  return sections;
}

// Verse numbers closing a verse, as in scriptures and śāstra texts: "॥ १.००१.०१ ॥", "|| 2.47 ||", "॥२-४७॥".
const VERSE_REF_RX = new RegExp(`(?:॥|\\|\\|)\\s*((?:[0-9]+|[${DIGITS}]+)(?:[.\\-–](?:[0-9]+|[${DIGITS}]+)){1,2})\\s*(?:॥|\\|\\|)?`, 'g');

/**
 * Structure from verse numbers: with three-part numbers (mandala.sūkta.ṛc, adhyāya.pāda.sūtra …) the first part makes
 * the chapters and the first two the lessons; with two-part numbers (chapter.verse) the first part makes the chapters.
 * Each lesson is named by its number and opening words — the traditional way to cite a hymn or section.
 * Returns null when the text does not number its verses this way.
 */
export function verseRefSections(pageTexts) {
  let text = '';
  const starts = [];
  for (const t of pageTexts) { starts.push(text.length); text += t + '\n\n'; }
  const pageAt = (pos) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  const refs = [...text.matchAll(VERSE_REF_RX)].map((m) => ({ parts: m[1].split(/[.\-–]/), start: m.index, end: m.index + m[0].length }));
  if (refs.length < 20) return null;
  const depthCount = {};
  for (const r of refs) depthCount[r.parts.length] = (depthCount[r.parts.length] || 0) + 1;
  const depth = Number(Object.entries(depthCount).sort((a, b) => b[1] - a[1])[0][0]);
  const use = refs.filter((r) => r.parts.length === depth);
  if (use.length < 20) return null;

  const groupKey = (r) => (depth === 3 ? r.parts.slice(0, 2).join('.') : r.parts[0]);
  const groups = [];
  for (const r of use) {
    if (groups.at(-1)?.key === groupKey(r)) groups.at(-1).refs.push(r);
    else groups.push({ key: groupKey(r), chapter: r.parts[0], refs: [r] });
  }
  if (groups.length < 2) return null;

  // One verse per paragraph, ending with its number.
  const verses = (s) => s.replace(VERSE_REF_RX, (m) => `${m.trim()}\n\n`).replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const opening = (s) => s.replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
  const sections = [];
  const firstFrom = Math.max(0, text.lastIndexOf('\n\n', use[0].start) + 2);
  const front = text.slice(0, firstFrom).trim();
  if (front.split(/\s+/).length > 30) sections.push({ level: 1, kind: 'front', title: 'Front matter', number: null, page_start: 1, page_end: pageAt(firstFrom - 1), text: front });

  let from = firstFrom;
  let chapter = null;
  for (const g of groups) {
    const to = g.refs.at(-1).end;
    const body = text.slice(from, to);
    if (depth === 3 && g.chapter !== chapter) {
      chapter = g.chapter;
      const last = groups.filter((x) => x.chapter === chapter).at(-1).key;
      sections.push({ level: 1, kind: 'chapter', number: chapter, title: `${chapter} (${g.key} – ${last})`, page_start: pageAt(from), page_end: pageAt(to), text: '' });
    }
    sections.push({ level: depth === 3 ? 2 : 1, kind: depth === 3 ? 'lesson' : 'chapter', number: g.key, title: `${g.key} — ${opening(body)}…`, page_start: pageAt(from), page_end: pageAt(to), text: verses(body) });
    from = to;
  }
  return sections;
}

/** Fallback when nothing marks the structure: one section per block of pages. */
function pageSections(pages) {
  const per = pages.length <= 20 ? 5 : pages.length <= 200 ? 10 : 20;
  const out = [];
  for (let s = 0; s < pages.length; s += per) {
    const e = Math.min(pages.length, s + per);
    const lines = pages.slice(s, e).flatMap((ls, k) => ls.map((l) => ({ ...l, page: s + k })));
    out.push({ level: 1, kind: 'pages', title: `Pages ${s + 1}–${e}`, number: null, page_start: s + 1, page_end: e, text: toParagraphs(lines) });
  }
  return out;
}

// ---------------- 4. Process & store ----------------

/** Extracts, cleans and structures one PDF. Pure apart from reading the file; used by processPdf and tests. */
export async function analysePdf(bytes, { manualIndex = '' } = {}) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: bytes, isEvalSupported: false, disableFontFace: true, verbosity: 0,
    standardFontDataUrl: path.join(PDFJS_DIR, 'standard_fonts') + path.sep, cMapUrl: path.join(PDFJS_DIR, 'cmaps') + path.sep, cMapPacked: true,
  }).promise;
  try {
    const raw = [];
    const tally = { chars: 0, unmapped: 0 };
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      raw.push(await pageLines(page, tally));
      page.cleanup();
    }
    const { pages, removed } = stripFurniture(raw);
    const words = pages.flat().reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    const textPages = pages.filter((ls) => ls.length).length;
    const hasText = words >= Math.max(20, doc.numPages * 5);

    // Page text cleaned like the sections (hyphenated words re-joined, lines joined into paragraphs).
    const pageTexts = pages.map((ls, i) => toParagraphs(ls.map((l) => ({ ...l, page: i }))));
    const usable = (hs) => hs.some((h) => h.level <= 2);
    // Bookmarks like "Document Text" that cover half the book or more say nothing about its chapters.
    const coarse = (secs) => doc.numPages >= 20 && secs.some((s) => s.page_end - s.page_start + 1 >= doc.numPages * 0.5);
    // Headings worth trusting over verse numbers: several of them, with "Chapter"/"Lesson"-type words or numbers.
    const strong = (hs) => hs.filter((h) => h.level <= 2).length >= 3
      && hs.filter((h) => h.level <= 2 && (h.number || CHAPTER_RX.test(h.title) || LESSON_RX.test(h.title))).length >= 2;

    // Sources in order of preference: typed-in index, bookmarks, clear headings, verse numbers,
    // coarse bookmarks, other headings, page ranges.
    let method = null;
    let sections = null;
    const manual = parseManualIndex(manualIndex, pages);
    if (usable(manual)) { method = 'manual'; sections = buildSections(pages, manual); }
    let outlineSections = null;
    if (!sections) {
      const outline = await outlineHeadings(doc, pages);
      if (usable(outline)) {
        outlineSections = buildSections(pages, outline);
        if (!coarse(outlineSections)) { method = 'outline'; sections = outlineSections; }
      }
    }
    let detected = [];
    if (!sections && hasText) {
      detected = detectHeadings(pages);
      if (strong(detected)) { method = 'headings'; sections = buildSections(pages, detected); }
    }
    if (!sections && hasText) {
      const verses = verseRefSections(pageTexts);
      if (verses) { method = 'verses'; sections = verses; }
    }
    if (!sections && outlineSections) { method = 'outline'; sections = outlineSections; }
    if (!sections && usable(detected)) { method = 'headings'; sections = buildSections(pages, detected); }
    if (!sections && hasText) { method = 'pages'; sections = pageSections(pages); }
    if (!sections) { method = 'none'; sections = []; }

    // Chapters span their lessons' pages.
    sections.forEach((s, i) => {
      if (s.level !== 1) return;
      for (let j = i + 1; j < sections.length && sections[j].level > 1; j++) s.page_end = Math.max(s.page_end, sections[j].page_end);
    });
    return {
      numPages: doc.numPages, method, hasText, removedFurniture: removed, words, textPages, unmapped: tally.unmapped, chars: tally.chars,
      pages: pageTexts.map((text, i) => ({ page: i + 1, text })),
      sections,
    };
  } finally {
    await doc.destroy();
  }
}

const wordCount = (s) => (String(s).match(/\S+/g) || []).length;

function removeUploadFile(p) {
  if (!String(p).startsWith('/uploads/')) return;
  const abs = path.resolve(config.uploadsDir, String(p).slice('/uploads/'.length));
  if (abs.startsWith(path.resolve(config.uploadsDir) + path.sep)) fs.promises.unlink(abs).catch(() => {});
}
const WORKER_TIMEOUT = 10 * 60 * 1000;

const DOC_EXTS = ['docx', 'doc', 'odt', 'rtf', 'txt', 'md'];
/** 'pdf', or the document format (docx, doc, odt, rtf, txt, md) from the file name. */
export const formatOf = (file) => {
  const ext = String(file || '').split(/[?#]/)[0].split('.').pop().toLowerCase();
  return DOC_EXTS.includes(ext) ? ext : 'pdf';
};

/** Analysis in a worker thread, so the API keeps answering while a large file is parsed. */
function analyseInWorker(bytes, manualIndex, format = 'pdf') {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdf-index-worker.js', import.meta.url), { workerData: { bytes, manualIndex, format } });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Indexing took longer than 10 minutes and was stopped.')); }, WORKER_TIMEOUT);
    worker.once('message', (m) => { clearTimeout(timer); worker.terminate(); m.ok ? resolve(m.result) : reject(new Error(m.error)); });
    worker.once('error', (e) => { clearTimeout(timer); reject(e); });
    worker.once('exit', (code) => { clearTimeout(timer); if (code !== 0 && code !== 1) reject(new Error(`Indexing stopped unexpectedly (code ${code}).`)); });
  });
}

export async function processPdf(id) {
  const pdf = await findOne('pdfs', { id });
  if (!pdf?.file) return;
  await update('pdfs', { index_status: 'processing', index_error: null }, { id });
  try {
    const format = formatOf(pdf.file);
    const result = await analyseInWorker(await readPdfBytes(pdf.file), pdf.toc || '', format);
    // Images extracted from a previous version of a Word file are replaced by this run's.
    for (const a of pdf.assets || []) removeUploadFile(a);
    await remove('pdf_sections', { pdf_id: id });
    await remove('pdf_pages', { pdf_id: id });
    for (const p of result.pages) {
      if (p.text) await insert('pdf_pages', { pdf_id: id, page: p.page, text: p.text, search_norm: searchNorm(p.text) });
    }
    let parent = null;
    for (const [i, s] of result.sections.entries()) {
      const sid = await insert('pdf_sections', {
        pdf_id: id, parent_id: s.level === 1 ? null : parent, level: s.level, kind: s.kind, number: s.number, title: s.title,
        page_start: s.page_start, page_end: s.page_end, sort_order: i + 1, text: s.text, html: s.html || null, word_count: wordCount(s.text),
        search_norm: searchNorm(`${s.title} ${s.text}`),
      });
      if (s.level === 1) parent = sid;
    }
    const top = result.sections.filter((s) => s.level === 1 && s.kind !== 'front');
    const stats = {
      pages: result.numPages, text_pages: result.textPages, words: result.words, removed_lines: result.removedFurniture,
      // Share of letters the PDF's font never mapped to Unicode; above 1% the clean text visibly misses letters.
      unreadable_chars: result.unmapped, text_quality: result.chars && result.unmapped / result.chars > 0.01 ? 'partial' : 'good',
      chapters: top.length, lessons: result.sections.filter((s) => s.level === 2).length,
    };
    await update('pdfs', {
      index_status: result.hasText || result.sections.length ? 'ready' : 'no_text', index_method: result.method, index_stats: stats,
      index_error: null, indexed_at: now(), format, assets: result.assets || [], ...(pdf.pages || !result.numPages ? {} : { pages: result.numPages }),
    }, { id });
  } catch (e) {
    await update('pdfs', { index_status: 'failed', index_error: String(e.message || e).slice(0, 300) }, { id });
  }
}

// One PDF at a time, so a large upload never competes with another for memory.
let queue = Promise.resolve();
export function queuePdfIndex(id) {
  update('pdfs', { index_status: 'queued' }, { id }).catch(() => {});
  queue = queue.then(() => processPdf(id)).catch((e) => console.error(`PDF ${id} indexing failed:`, e));
  return queue;
}

/** Re-queues PDFs whose indexing was interrupted by a restart. */
export async function resumePdfIndexing() {
  for (const p of await find('pdfs', { index_status: { $in: ['queued', 'processing'] } }, { fields: ['id'] })) queuePdfIndex(p.id);
}
