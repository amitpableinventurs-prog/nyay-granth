// Nyāya Terminology Dictionary: slugs, library matching and syncing the starter entries into the database.
import { find, findOne, insert, update } from './db.js';
import { searchNorm } from '../../shared/translit.js';
import { DICTIONARY } from './dictionary-data.js';

export const GLOSSARY_LIST_FIELDS = ['id', 'slug', 'term', 'term_devanagari', 'category', 'gender', 'meaning', 'meaning_hi', 'meaning_mr', 'meaning_gu', 'definition'];

// URL-safe ASCII that keeps long vowels distinct, so kāraṇa (cause) and karaṇa (instrument) get different slugs.
const ASCII = { ā: 'aa', ī: 'ii', ū: 'uu', ṝ: 'rr', ṛ: 'r', ḷ: 'l', ṅ: 'n', ñ: 'n', ṭ: 't', ḍ: 'd', ṇ: 'n', ś: 'sh', ṣ: 'sh', ṃ: 'm', ṁ: 'm', ḥ: 'h' };
export const baseSlug = (term) => String(term || '').toLowerCase().replace(/[āīūṝṛḷṅñṭḍṇśṣṃṁḥ]/g, (c) => ASCII[c]).normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'term';

export async function uniqueSlug(term, id = null) {
  const base = baseSlug(term);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await findOne('glossary', { slug, ...(id ? { id: { $ne: id } } : {}) }, { fields: ['id'] }))) return slug;
  }
}

/**
 * Regex finding a term in a section's normalised Sanskrit (sanskrit_norm). Consonant stems drop their final
 * consonant (ātman → ātmā, manas → manaḥ). Long stems match at the start of any word, so inflections and compounds
 * count (pramāṇa → pramāṇāni, pratyakṣānumāna…); short stems must be a whole word with at most a case ending,
 * so pada does not match padārtha. Returns null for stems too short to match reliably.
 */
export function termMatcher(term) {
  let stem = searchNorm(term).split(' ')[0] || '';
  if (/[nst]$/.test(stem) && stem.length > 4) stem = stem.slice(0, -1);
  if (stem.length < 4) return null;
  const s = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(stem.length >= 6 ? `(^| )${s}` : `(^| )${s}[a-z]{0,4}( |$)`);
}

export const relatedList = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** Turns a compact entry from dictionary-data.js into a glossary document. */
const toDoc = (e) => ({
  term: e.t, term_devanagari: e.d, category: e.c, gender: e.g || null, meaning: e.m, meaning_hi: e.h || null,
  definition: e.def || null, definition_source: e.src || null, explanation: e.x || null, example: e.ex || null,
  etymology: e.ety || null, related: (e.rel || []).join(', ') || null, search_norm: searchNorm(e.t),
});

/**
 * Adds missing starter terms and fills fields that are still empty on existing ones.
 * Never overwrites a value an editor has set in the admin panel. Safe to run repeatedly.
 */
export async function syncDictionary() {
  let added = 0, enriched = 0;
  for (const e of DICTIONARY) {
    const doc = toDoc(e);
    const existing = await findOne('glossary', { term: e.t });
    if (!existing) {
      await insert('glossary', { ...doc, slug: await uniqueSlug(e.t) });
      added++;
      continue;
    }
    const fill = Object.fromEntries(Object.entries(doc).filter(([k, v]) => v !== null && (existing[k] === undefined || existing[k] === null || existing[k] === '')));
    if (!existing.slug) fill.slug = await uniqueSlug(existing.term, existing.id);
    if (Object.keys(fill).length) { await update('glossary', fill, { id: existing.id }); enriched++; }
  }
  // Terms an editor added before slugs existed.
  for (const g of await find('glossary', { $or: [{ slug: null }, { slug: { $exists: false } }] }, { fields: ['id', 'term'] })) {
    await update('glossary', { slug: await uniqueSlug(g.term, g.id), search_norm: searchNorm(g.term) }, { id: g.id });
  }
  return { added, enriched };
}
