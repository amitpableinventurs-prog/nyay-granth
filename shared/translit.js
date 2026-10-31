// Sanskrit utilities shared by the server and the React client:
// Devanagari ⇄ IAST transliteration, diacritic-insensitive search normalisation and metre (chandas) analysis.

const VOWELS = { 'अ': 'a', 'आ': 'ā', 'इ': 'i', 'ई': 'ī', 'उ': 'u', 'ऊ': 'ū', 'ऋ': 'ṛ', 'ॠ': 'ṝ', 'ऌ': 'ḷ', 'ॡ': 'ḹ', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au' };
const MATRAS = { 'ा': 'ā', 'ि': 'i', 'ी': 'ī', 'ु': 'u', 'ू': 'ū', 'ृ': 'ṛ', 'ॄ': 'ṝ', 'ॢ': 'ḷ', 'ॣ': 'ḹ', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au' };
const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ṅ', 'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh', 'ञ': 'ñ',
  'ट': 'ṭ', 'ठ': 'ṭh', 'ड': 'ḍ', 'ढ': 'ḍh', 'ण': 'ṇ', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'ḷ', 'व': 'v',
  'श': 'ś', 'ष': 'ṣ', 'स': 's', 'ह': 'h',
};
const OTHER = {
  'ं': 'ṃ', 'ः': 'ḥ', 'ँ': 'm̐', 'ऽ': "'", '।': '|', '॥': '||', 'ॐ': 'oṃ',
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

export const hasDevanagari = (s) => /[ऀ-ॿ]/.test(s || '');

export function devaToIast(s) {
  let out = '';
  let pendingA = false;
  for (const ch of s || '') {
    if (CONSONANTS[ch]) {
      if (pendingA) out += 'a';
      out += CONSONANTS[ch];
      pendingA = true;
    } else if (MATRAS[ch]) {
      out += MATRAS[ch];
      pendingA = false;
    } else if (ch === '्') {
      pendingA = false;
    } else if (ch === '़') {
      continue; // nukta
    } else {
      if (pendingA) out += 'a';
      pendingA = false;
      out += VOWELS[ch] ?? OTHER[ch] ?? ch;
    }
  }
  if (pendingA) out += 'a';
  return out;
}

// ---- IAST → Devanagari -------------------------------------------------------
const inv = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const I_VOWELS = inv(VOWELS);
const I_MATRAS = { ...inv(MATRAS), a: '' };
const I_CONS = inv(CONSONANTS);
const I_OTHER = { 'ṃ': 'ं', 'ṁ': 'ं', 'ḥ': 'ः', "'": 'ऽ', '||': '॥', '|': '।', '0': '०', '1': '१', '2': '२', '3': '३', '4': '४', '5': '५', '6': '६', '7': '७', '8': '८', '9': '९' };
const TOKENS = [...new Set([...Object.keys(I_CONS), ...Object.keys(I_VOWELS), ...Object.keys(I_OTHER)])].sort((a, b) => b.length - a.length);

function tokenizeIast(s) {
  const src = (s || '').normalize('NFC').toLowerCase();
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const t = TOKENS.find((tok) => src.startsWith(tok, i));
    if (t) { toks.push(t); i += t.length; } else { toks.push(src[i]); i += 1; }
  }
  return toks;
}

export function iastToDeva(s) {
  const toks = tokenizeIast(s);
  let out = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (I_CONS[t]) {
      out += I_CONS[t];
      const next = toks[i + 1];
      if (next !== undefined && I_VOWELS[next] !== undefined) { out += I_MATRAS[next]; i++; } else out += '्';
    } else if (I_VOWELS[t]) out += I_VOWELS[t];
    else out += I_OTHER[t] ?? t;
  }
  return out;
}

/** Plain-ASCII normalisation so "प्रमाण", "pramāṇa" and "pramana" compare equal. */
export function searchNorm(s) {
  let t = String(s ?? '');
  if (!t) return '';
  // Gujarati mirrors the Devanagari block 0x180 code points higher, so map it across before transliterating.
  t = t.replace(/[ઁ-૿]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x180));
  if (hasDevanagari(t)) t = devaToIast(t);
  t = t.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  t = t.replace(/sh/g, 's').replace(/aa/g, 'a').replace(/ii/g, 'i').replace(/uu/g, 'u').replace(/w/g, 'v').replace(/ri/g, 'r');
  return t.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---- Metre analysis -----------------------------------------------------------
const LONG = new Set(['ā', 'ī', 'ū', 'ṝ', 'ḹ', 'e', 'ai', 'o', 'au']);
const SHORT = new Set(['a', 'i', 'u', 'ṛ', 'ḷ']);
const GANAS = { LGG: 'ya', GGG: 'ma', GGL: 'ta', GLG: 'ra', LGL: 'ja', GLL: 'bha', LLL: 'na', LLG: 'sa' };
const METRES = [
  { name: 'Indravajrā', pattern: 'GGLGGLLGLGG' },
  { name: 'Upendravajrā', pattern: 'LGLGGLLGLGG' },
  { name: 'Vaṃśastha', pattern: 'LGLGGLLGLGLG' },
  { name: 'Bhujaṅgaprayāta', pattern: 'LGGLGGLGGLGG' },
  { name: 'Vasantatilakā', pattern: 'GGLGLLLGLLGLGG' },
  { name: 'Mālinī', pattern: 'LLLLLLGGGLGGLGG' },
  { name: 'Mandākrāntā', pattern: 'GGGGLLLLLGGLGGLGG' },
  { name: 'Śikhariṇī', pattern: 'LGGGGGLLLLLGGLLLG' },
  { name: 'Śārdūlavikrīḍita', pattern: 'GGGLLGLGLLLGGGLGGLG' },
  { name: 'Sragdharā', pattern: 'GGGGLGGLLLLLLGGLGGLGG' },
];

/** Split one pāda into syllables with laghu (L) / guru (G) weights. */
export function scanPada(pada) {
  const isVowel = (t) => LONG.has(t) || SHORT.has(t);
  const isMark = (t) => t === 'ṃ' || t === 'ṁ' || t === 'ḥ';
  const toks = tokenizeIast(hasDevanagari(pada) ? devaToIast(pada) : pada).filter((t) => isVowel(t) || I_CONS[t] || isMark(t));
  const syl = [];
  let onset = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (isVowel(t)) {
      // A syllable is heavy (guru) if its vowel is long, it carries anusvāra/visarga, or a conjunct follows.
      let j = i + 1;
      let cons = 0;
      let mark = '';
      for (; j < toks.length && !isVowel(toks[j]); j++) {
        if (isMark(toks[j])) mark += toks[j]; else cons++;
      }
      syl.push({ text: onset + t + mark, weight: LONG.has(t) || mark || cons >= 2 ? 'G' : 'L' });
      onset = '';
    } else if (I_CONS[t]) onset += t;
  }
  if (onset && syl.length) syl[syl.length - 1].text += onset;
  return syl;
}

function ganaBreakdown(pattern) {
  const out = [];
  for (let i = 0; i + 3 <= pattern.length; i += 3) out.push(GANAS[pattern.slice(i, i + 3)]);
  const rest = pattern.slice(out.length * 3);
  for (const c of rest) out.push(c === 'G' ? 'ga' : 'la');
  return out;
}

/** Analyse a verse: split into pādas (by danda, line or half-line) and identify the metre. */
export function analyzeVerse(text) {
  const src = (text || '').trim();
  if (!src) return null;
  let lines = src.split(/\n|[।॥|]+/).map((l) => l.trim()).filter(Boolean);
  // Anuṣṭubh is often written as two half-verses of 16 syllables — split those in two.
  const expanded = [];
  for (const l of lines) {
    const s = scanPada(l);
    if (s.length === 16 || s.length >= 30) {
      const words = l.split(/\s+/);
      let acc = [];
      for (const w of words) {
        acc.push(w);
        if (scanPada(acc.join(' ')).length >= s.length / 2) { expanded.push(acc.join(' ')); acc = []; }
      }
      if (acc.length) expanded.push(acc.join(' '));
    } else expanded.push(l);
  }
  lines = expanded;
  const padas = lines.map((l) => {
    const syllables = scanPada(l);
    const pattern = syllables.map((x) => x.weight).join('');
    return { text: l, syllables, pattern, count: syllables.length, ganas: ganaBreakdown(pattern) };
  });
  const counts = padas.map((p) => p.count);
  let metre = 'Unidentified';
  let note = '';
  if (counts.every((c) => c === 8)) {
    metre = 'Anuṣṭubh (Śloka)';
    const ok = padas.every((p) => p.pattern[4] === 'L' && p.pattern[5] === 'G');
    note = ok ? '8 syllables per pāda; 5th syllable laghu, 6th guru in every pāda.' : '8 syllables per pāda (some pādas deviate from the 5th-laghu / 6th-guru rule — check vipulā variants).';
  } else {
    const matches = METRES.filter((m) => padas.every((p) => p.count === m.pattern.length && p.pattern.slice(0, -1) === m.pattern.slice(0, -1)));
    if (matches.length) { metre = matches[0].name; note = 'Pattern: ' + matches[0].pattern.replace(/G/g, '—').replace(/L/g, '⏑'); }
    else if (counts.every((c) => c === 11)) { metre = 'Triṣṭubh family (Upajāti?)'; note = 'Mixed Indravajrā/Upendravajrā pādas form Upajāti.'; }
    else if (counts.every((c) => c === 12)) metre = 'Jagatī family';
  }
  return { padas, metre, note, totalSyllables: counts.reduce((a, b) => a + b, 0) };
}
