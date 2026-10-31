// Document indexing for non-PDF uploads: Word (.docx, .doc), OpenDocument (.odt), RTF, plain text and Markdown.
// Every format becomes one list of blocks — headings and paragraphs, with safe HTML for display — and is then split
// chapter-wise and lesson-wise like a PDF (see pdf-index.js). Documents have no pages, so page numbers are null.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'node-html-parser';
import { config } from './config.js';
import { searchNorm } from '../../shared/translit.js';
import { cleanLine, verseRefSections, CHAPTER_RX, LESSON_RX, NUMBERED_RX } from './pdf-index.js';

export const DOC_FORMATS = ['docx', 'doc', 'odt', 'rtf', 'txt', 'md'];
const PART_WORDS = 1200;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const words = (s) => (String(s).match(/\S+/g) || []).length;
const para = (text) => ({ kind: 'para', text, html: `<p>${escapeHtml(text)}</p>` });

// ---------------- Safe HTML ----------------

const ALLOWED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'br', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'a', 'img', 'span']);

/** Keeps only formatting tags and safe attributes (links to http/https/mailto, images from our uploads). */
export function sanitizeHtml(node) {
  if (node.nodeType === 3) return escapeHtml(node.text);
  if (node.nodeType !== 1) return '';
  const tag = node.rawTagName?.toLowerCase();
  const inner = node.childNodes.map(sanitizeHtml).join('');
  if (!tag || !ALLOWED.has(tag)) return inner;
  if (tag === 'br') return '<br>';
  if (tag === 'img') {
    const src = node.getAttribute('src') || '';
    return src.startsWith('/uploads/') ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(node.getAttribute('alt') || '')}" loading="lazy">` : '';
  }
  let attrs = '';
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    if (!/^(https?:|mailto:)/i.test(href)) return inner;
    attrs = ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"`;
  }
  if (tag === 'td' || tag === 'th') {
    for (const a of ['colspan', 'rowspan']) if (/^\d{1,2}$/.test(node.getAttribute(a) || '')) attrs += ` ${a}="${node.getAttribute(a)}"`;
  }
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

const textOf = (node) => cleanLine(node.text.replace(/\s+/g, ' '));

// ---------------- Readers: bytes → blocks ----------------

/** Word .docx via mammoth: Word's heading styles become headings; images are saved to uploads/. */
async function docxBlocks(bytes, assets) {
  const mammoth = (await import('mammoth')).default;
  const imageDir = path.join(config.uploadsDir, 'image');
  fs.mkdirSync(imageDir, { recursive: true });
  const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }, {
    styleMap: [
      "p[style-name='Title'] => h1.doc-title:fresh",
      "p[style-name='Subtitle'] => p:fresh",
      "p[style-name='Chapter'] => h1:fresh", "p[style-name='Chapter Title'] => h1:fresh",
      "p[style-name='Lesson'] => h2:fresh", "p[style-name='Lesson Title'] => h2:fresh",
    ],
    convertImage: mammoth.images.imgElement(async (image) => {
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[image.contentType];
      if (!ext) return { src: '' };
      const buf = await image.read();
      if (buf.length > 10 * 1024 * 1024) return { src: '' };
      const name = `doc-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(imageDir, name), buf);
      assets.push(`/uploads/image/${name}`);
      return { src: `/uploads/image/${name}` };
    }),
  });
  const root = parse(value);
  const blocks = [];
  for (const el of root.childNodes) {
    if (el.nodeType !== 1) continue;
    const tag = el.rawTagName.toLowerCase();
    const text = textOf(el);
    const html = sanitizeHtml(el);
    if (/^h[1-6]$/.test(tag)) {
      if (text) blocks.push({ kind: 'heading', level: Number(tag[1]), text, html, docTitle: el.classList?.contains('doc-title') });
    } else if (tag === 'ul' || tag === 'ol') {
      blocks.push({ kind: 'para', text: el.querySelectorAll('li').map((li) => `- ${textOf(li)}`).join('\n'), html });
    } else if (tag === 'table') {
      blocks.push({ kind: 'para', text: el.querySelectorAll('tr').map((tr) => tr.querySelectorAll('td,th').map(textOf).join(' | ')).join('\n'), html });
    } else if (text || html.includes('<img')) {
      // A short paragraph set entirely in bold is often a heading typed without a heading style.
      const strong = el.querySelectorAll('strong').map((s) => s.text).join('').trim();
      blocks.push({ kind: 'para', text, html, bold: !!text && strong.length >= text.replace(/\s/g, '').length * 0.9 });
    }
  }
  return blocks;
}

/** OpenDocument .odt: text:h (with its outline level) and text:p / lists from content.xml. */
async function odtBlocks(bytes) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('content.xml')?.async('string');
  if (!xml) throw new Error('This ODT file has no content.');
  const root = parse(xml, { lowerCaseTagName: false });
  const body = root.querySelector('office\\:text') || root;
  const textOfOdt = (node) => {
    if (node.nodeType === 3) return node.text;
    const tag = node.rawTagName;
    if (tag === 'text:s') return ' '.repeat(Number(node.getAttribute('text:c')) || 1);
    if (tag === 'text:tab') return '\t';
    if (tag === 'text:line-break') return '\n';
    if (tag === 'text:note') return '';
    return (node.childNodes || []).map(textOfOdt).join('');
  };
  const blocks = [];
  const walk = (node) => {
    for (const el of node.childNodes || []) {
      if (el.nodeType !== 1) continue;
      if (el.rawTagName === 'text:h') {
        const text = cleanLine(textOfOdt(el));
        const level = Number(el.getAttribute('text:outline-level')) || 1;
        if (text) blocks.push({ kind: 'heading', level, text, html: `<h${Math.min(6, level)}>${escapeHtml(text)}</h${Math.min(6, level)}>` });
      } else if (el.rawTagName === 'text:p') {
        const text = cleanLine(textOfOdt(el));
        if (text) blocks.push(para(text));
      } else if (el.rawTagName === 'text:list-item') {
        const text = cleanLine(textOfOdt(el));
        if (text) blocks.push({ kind: 'para', text: `- ${text}`, html: `<ul><li>${escapeHtml(text)}</li></ul>` });
      } else walk(el);
    }
  };
  walk(body);
  return blocks;
}

/** Old Word .doc (text only). */
async function docBlocks(bytes) {
  const WordExtractor = (await import('word-extractor')).default;
  const doc = await new WordExtractor().extract(Buffer.from(bytes));
  return textBlocks(doc.getBody());
}

const RTF_SYMBOLS = { emdash: '—', endash: '–', bullet: '•', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', emspace: ' ', enspace: ' ', qmspace: ' ' };

/** RTF: control words removed, \uN and \'hh escapes decoded, \par as paragraph breaks. */
export function rtfToText(rtf) {
  let out = '';
  let depth = 0;
  const skipAt = [];
  let uc = 1;
  let fallback = 0; // characters still to skip after a \uN escape (an \'hh escape counts as one)
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i];
    if (fallback > 0) {
      if (ch === '\\' && rtf[i + 1] === "'") { i += 3; fallback--; continue; }
      if (ch !== '\\' && ch !== '{' && ch !== '}') { fallback--; continue; }
      fallback = 0;
    }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { depth--; if (skipAt.length && depth < skipAt.at(-1)) skipAt.pop(); continue; }
    if (ch === '\\') {
      const m = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\([^a-z])/i.exec(rtf.slice(i, i + 40));
      if (!m) continue;
      i += m[0].length - 1;
      if (skipAt.length) continue;
      if (m[3]) { out += String.fromCharCode(parseInt(m[3], 16)); continue; }
      if (m[4]) { if (m[4] === '*') skipAt.push(depth); else if ('\\{}'.includes(m[4])) out += m[4]; else if (m[4] === '~') out += ' '; continue; }
      const word = m[1].toLowerCase();
      if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'footnote', 'listtable', 'listoverridetable', 'generator', 'themedata', 'datastore', 'latentstyles'].includes(word)) skipAt.push(depth);
      else if (word === 'uc') uc = Number(m[2]) || 1;
      else if (word === 'u') {
        let code = Number(m[2]);
        if (code < 0) code += 65536;
        out += String.fromCharCode(code);
        fallback = uc; // the next uc characters are a fallback for readers without Unicode
      } else if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out += '\n';
      else if (word === 'tab') out += '\t';
      else if (RTF_SYMBOLS[word]) out += RTF_SYMBOLS[word];
      continue;
    }
    if (skipAt.length || ch === '\r' || ch === '\n') continue;
    out += ch;
  }
  return out;
}

/**
 * Plain text: hard-wrapped text (short lines, blank lines between paragraphs) is re-joined into paragraphs;
 * text from word processors (one long line per paragraph) keeps each line as a paragraph.
 */
export function textBlocks(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const filled = lines.filter((l) => l.trim());
  const blank = lines.length - filled.length;
  const avg = filled.reduce((n, l) => n + l.trim().length, 0) / Math.max(1, filled.length);
  const blocks = [];
  if (blank >= lines.length * 0.08 && avg < 100) {
    let cur = [];
    const flush = () => { const t = cleanLine(cur.join(' ')); if (t) blocks.push(para(t)); cur = []; };
    for (const l of lines) { if (l.trim()) cur.push(l.trim()); else flush(); }
    flush();
  } else {
    for (const l of lines) { const t = cleanLine(l); if (t) blocks.push(para(t)); }
  }
  return blocks;
}

/** Markdown: "#" headings, the rest as paragraphs (with **bold** and *italic*). */
function markdownBlocks(text) {
  const blocks = [];
  const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
  for (const b of String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const h = lines[0].match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const t = cleanLine(h[2].replace(/#+\s*$/, ''));
      blocks.push({ kind: 'heading', level: h[1].length, text: t, html: `<h${h[1].length}>${inline(t)}</h${h[1].length}>` });
      if (lines.length > 1) blocks.push(...markdownBlocks(lines.slice(1).join('\n')));
    } else if (lines.every((l) => /^[-*+]\s/.test(l))) {
      const items = lines.map((l) => cleanLine(l.slice(2)));
      blocks.push({ kind: 'para', text: items.map((t) => `- ${t}`).join('\n'), html: `<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>` });
    } else {
      const t = cleanLine(lines.join(' '));
      blocks.push({ kind: 'para', text: t, html: `<p>${inline(t)}</p>` });
    }
  }
  return blocks;
}

/** Text files may be UTF-8 or UTF-16 (Windows Notepad's "Unicode"). */
function decodeText(bytes) {
  const b = Buffer.from(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return b.slice(2).toString('utf16le');
  if (b[0] === 0xfe && b[1] === 0xff) return Buffer.from(b.slice(2)).swap16().toString('utf16le');
  return b.toString('utf8').replace(/^﻿/, '');
}

// ---------------- Structure ----------------

const norm = (s) => searchNorm(String(s)).replace(/[^a-z0-9]/g, '');
const headingLike = (block, title) => {
  const one = norm(block.text);
  const want = norm(title);
  return !!want && (one === want || (one.startsWith(want) && one.length <= want.length + 12) || (one.endsWith(want) && one.length <= want.length + 20));
};

function classify(text) {
  const c = text.match(CHAPTER_RX);
  if (c) return { kind: 'chapter', number: c[1] || null };
  const l = text.match(LESSON_RX);
  if (l) return { kind: 'lesson', number: l[1] || null };
  const n = text.match(NUMBERED_RX);
  return n ? { kind: null, number: n[1], depth: n[1].split('.').length } : { kind: null, number: null };
}

/** Typed-in index ("# Title", "## Title"; a "| page" part is ignored for documents): matched to blocks in order. */
function manualMarks(blocks, manualIndex) {
  const marks = [];
  let from = 0;
  for (const raw of String(manualIndex || '').split(/\r?\n/)) {
    const m = raw.trim().match(/^(#{1,3})\s*(.+?)\s*(?:(?:\||\.{3,}|…)\s*\d+)?\s*$/);
    if (!m) continue;
    const i = blocks.findIndex((b, k) => k >= from && headingLike(b, m[2]));
    if (i < 0) continue;
    const info = classify(m[2]);
    marks.push({ at: i, level: m[1].length, title: cleanLine(m[2]), kind: info.kind, number: info.number });
    from = i + 1;
  }
  return marks;
}

/** Word/ODT/Markdown heading styles. A single top heading followed by several smaller ones is the document's title. */
function styledMarks(blocks) {
  const heads = blocks.map((b, at) => ({ b, at })).filter(({ b }) => b.kind === 'heading');
  if (!heads.length) return [];
  let list = heads;
  const levels = [...new Set(list.map(({ b }) => b.level))].sort((a, b) => a - b);
  const top = list.filter(({ b }) => b.level === levels[0]);
  if (list[0].b.docTitle || (top.length === 1 && list[0] === top[0] && levels.length > 1 && list.filter(({ b }) => b.level === levels[1]).length >= 2)) {
    list = list.slice(1); // the title goes to the front matter
  }
  const remaining = [...new Set(list.map(({ b }) => b.level))].sort((a, b) => a - b);
  return list.map(({ b, at }) => {
    const info = classify(b.text);
    return { at, level: Math.min(3, remaining.indexOf(b.level) + 1), title: b.text, kind: info.kind, number: info.number };
  });
}

/** Headings typed as plain paragraphs: short and bold, or "Chapter 2" / "अध्याय २" / "पाठ ३" style lines. */
function guessedMarks(blocks) {
  const marks = [];
  blocks.forEach((b, at) => {
    if (b.kind !== 'para' || !b.text || b.text.includes('\n')) return;
    const wc = words(b.text);
    if (wc > 14 || b.text.length > 110 || /[.,;]$/.test(b.text)) return;
    const info = classify(b.text);
    if ((info.kind && (info.number || b.bold)) || b.bold || (info.depth && wc <= 10 && b.bold !== false && /^\S+\s+\S/.test(b.text) && b.text.length < 70)) {
      marks.push({ at, title: b.text, ...info, bold: b.bold });
    }
  });
  const hasChapters = marks.some((m) => m.kind === 'chapter');
  for (const m of marks) {
    m.level = m.kind === 'chapter' ? 1 : m.kind === 'lesson' ? (hasChapters ? 2 : 1) : m.depth ? Math.min(3, m.depth) : hasChapters ? 2 : 1;
  }
  return marks;
}

function sectionsFromMarks(blocks, marks) {
  const top = marks.filter((m) => m.level <= 2);
  const sub = new Map(marks.filter((m) => m.level > 2).map((m) => [m.at, m]));
  const slice = (from, to) => {
    const part = blocks.slice(from, to).map((b, k) => {
      const m = sub.get(from + k);
      return m ? { ...b, text: `### ${m.title}`, html: `<h4>${escapeHtml(m.title)}</h4>` } : b;
    });
    return { text: part.map((b) => (b.kind === 'heading' ? `### ${b.text}` : b.text)).join('\n\n'), html: part.map((b) => b.html).join('\n') };
  };
  const sections = [];
  const firstAt = top.length ? top[0].at : blocks.length;
  const front = slice(0, firstAt);
  if (words(front.text) > 30 || front.html.includes('<img')) sections.push({ level: 1, kind: 'front', title: 'Front matter', number: null, ...front });
  top.forEach((m, k) => {
    const end = top[k + 1]?.at ?? blocks.length;
    sections.push({ level: m.level, kind: m.kind || (m.level === 1 ? 'chapter' : 'lesson'), title: m.title, number: m.number || null, ...slice(m.at + 1, end) });
  });
  return sections;
}

/** No structure at all: parts of about PART_WORDS words, cut at paragraph ends. */
function partSections(blocks) {
  const out = [];
  let cur = [];
  let n = 0;
  const flush = () => {
    if (!cur.length) return;
    const first = cur.find((b) => b.text)?.text || '';
    out.push({ level: 1, kind: 'part', title: `Part ${out.length + 1} — ${first.split(/\s+/).slice(0, 6).join(' ')}…`, number: String(out.length + 1),
      text: cur.map((b) => b.text).join('\n\n'), html: cur.map((b) => b.html).join('\n') });
    cur = []; n = 0;
  };
  for (const b of blocks) { cur.push(b); n += words(b.text); if (n >= PART_WORDS) flush(); }
  flush();
  return out;
}

/** Reads a document and splits it chapter-wise and lesson-wise. Same result shape as analysePdf (pages are null). */
export async function analyseDocument(bytes, format, { manualIndex = '' } = {}) {
  const assets = [];
  let blocks;
  if (format === 'docx') blocks = await docxBlocks(bytes, assets);
  else if (format === 'odt') blocks = await odtBlocks(bytes);
  else if (format === 'doc') blocks = await docBlocks(bytes);
  else if (format === 'rtf') blocks = textBlocks(rtfToText(decodeText(bytes)));
  else if (format === 'md') blocks = markdownBlocks(decodeText(bytes));
  else blocks = textBlocks(decodeText(bytes));

  const total = blocks.reduce((n, b) => n + words(b.text), 0);
  const strong = (ms) => ms.filter((m) => m.level <= 2).length >= 2;
  let method = 'none';
  let sections = [];
  const manual = manualMarks(blocks, manualIndex);
  const styled = styledMarks(blocks);
  const guessed = guessedMarks(blocks);
  if (manual.some((m) => m.level <= 2)) { method = 'manual'; sections = sectionsFromMarks(blocks, manual); }
  else if (strong(styled)) { method = 'styles'; sections = sectionsFromMarks(blocks, styled); }
  else if (strong(guessed) && guessed.filter((m) => m.number || m.kind).length >= 2) { method = 'headings'; sections = sectionsFromMarks(blocks, guessed); }
  else {
    const verses = total ? verseRefSections([blocks.map((b) => b.text).join('\n\n')]) : null;
    if (verses) { method = 'verses'; sections = verses.map((s) => ({ ...s, html: null })); }
    else if (strong(guessed)) { method = 'headings'; sections = sectionsFromMarks(blocks, guessed); }
    else if (styled.length) { method = 'styles'; sections = sectionsFromMarks(blocks, styled); }
    else if (total) { method = 'parts'; sections = partSections(blocks); }
  }
  for (const s of sections) { s.page_start = null; s.page_end = null; }
  return { numPages: null, method, hasText: total > 0, removedFurniture: 0, words: total, textPages: null, unmapped: 0, chars: 0, pages: [], sections, assets };
}
