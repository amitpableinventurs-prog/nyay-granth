// AI Assistance: explanations, summaries, translations, Q&A, question generation, tutoring and learning paths.
// Uses any OpenAI-compatible Chat Completions endpoint; falls back to offline dictionary/library help.
import { config } from './config.js';
import { attach, find, insert, now, like } from './db.js';
import { searchNorm } from '../../shared/translit.js';

export const AI_MODES = {
  tutor: { label: 'AI Chat Tutor', icon: 'bi-mortarboard', hint: 'Ask anything about Nyāya — the tutor remembers the conversation.' },
  explain: { label: 'Explain', icon: 'bi-lightbulb', hint: 'Paste a sūtra, verse or concept for a clear explanation.' },
  summarize: { label: 'Summary Generator', icon: 'bi-card-text', hint: 'Paste a passage to get a structured summary.' },
  translate: { label: 'Translate', icon: 'bi-translate', hint: 'Sanskrit ↔ English/Hindi with a word-by-word gloss.' },
  qa: { label: 'Q&A', icon: 'bi-question-circle', hint: 'Ask a specific question; answers refer to the classical sources.' },
  questions: { label: 'Question Generator', icon: 'bi-list-check', hint: 'Paste study material to generate practice and exam questions.' },
  path: { label: 'Learning Path', icon: 'bi-signpost-split', hint: 'Describe your background and goals to get a personalised reading plan.' },
};

const TASK = {
  explain: 'Explain the given text or concept for a serious student: literal meaning, technical terms, philosophical significance and a simple example.',
  summarize: 'Summarize the given passage: a one-line gist, then the key points, then the technical terms introduced.',
  translate: 'Translate the given text. If it is Sanskrit, give a word-by-word gloss (padaccheda with meanings), then a fluent English translation, then Hindi. If it is English or Hindi, translate into Sanskrit with IAST.',
  qa: 'Answer the question precisely, referring to the relevant texts (Nyāya Sūtra, Bhāṣya, Tarkasaṅgraha, Tattvacintāmaṇi etc.) where appropriate.',
  questions: 'Generate study questions from the given material: 5 multiple-choice questions with answers, 3 short-answer questions and 2 essay questions.',
  path: 'Design a personalised learning path: ordered stages with recommended texts (prefer those available in the app library), goals for each stage and approximate durations.',
  tutor: 'Act as a patient tutor. Answer conversationally, check understanding, and suggest what to study next.',
};

const systemPrompt = (mode) =>
  'You are Nyāya Sahāyaka, a scholarly assistant inside the Nyāya Grantha Sarvasvam app, expert in Nyāya and Vaiśeṣika philosophy, ' +
  'Navya-Nyāya technical language, Sanskrit grammar and Indian logic. Use IAST for transliteration and give Devanagari where helpful. ' +
  'Be accurate; if a point is debated or you are unsure, say so rather than inventing citations. Format with short headings and bullet lists in markdown. ' +
  TASK[mode];

export const aiConfigured = () => !!config.ai.apiKey;

async function chat(messages) {
  if (!aiConfigured()) return { ok: false, error: 'not_configured' };
  try {
    const res = await fetch(config.ai.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.apiKey}` },
      body: JSON.stringify({ model: config.ai.model, messages, max_tokens: 900, temperature: 0.4 }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json().catch(() => ({}));
    const text = data?.choices?.[0]?.message?.content;
    if (!res.ok || !text) return { ok: false, error: data?.error?.message || `AI service returned HTTP ${res.status}` };
    return { ok: true, text: text.trim() };
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'request timed out' : e.message };
  }
}

/** Offline fallback: dictionary look-ups and matching passages from the library. */
async function offline(mode, text) {
  const compact = searchNorm(text).replace(/ /g, '');
  const out = [];
  const terms = (await find('glossary', {}, { fields: ['term', 'term_devanagari', 'meaning', 'search_norm'] }))
    .filter((g) => g.search_norm && compact.includes(g.search_norm.replace(/ /g, '')))
    .slice(0, 8)
    .map((g) => `- **${g.term}** (${g.term_devanagari}): ${g.meaning}`);
  if (terms.length) out.push('### Key Nyāya terms found\n' + terms.join('\n'));

  const words = [...new Set(searchNorm(text).split(' ').filter((w) => w.length >= 5))].slice(0, 4);
  const passages = new Map();
  for (const w of words) {
    const rows = await attach(await find('sections', { search_norm: like(w) }, { limit: 2, fields: ['ref', 'translation', 'text_id'] }), 'texts', 'text_id', { title: 'title' }, { inner: true });
    for (const p of rows) passages.set(p.title + p.ref, `- *${p.title} ${p.ref}* — ${String(p.translation || '').slice(0, 220)}`);
  }
  if (passages.size) out.push('### Related passages in the library\n' + [...passages.values()].slice(0, 5).join('\n'));
  if (mode === 'path') {
    out.push('### Suggested classical learning path\n1. **Tarkasaṅgraha** — the seven categories and four pramāṇas (4–6 weeks)\n2. **Nyāya Sūtra, Book 1** — the sixteen topics (6–8 weeks)\n3. **Nyāya Bhāṣya** — Vātsyāyana\'s commentary (8–10 weeks)\n4. **Vaiśeṣika Sūtra** — Kaṇāda\'s ontology (4–6 weeks)\n5. **Nyāyamañjarī** — Jayanta\'s debates (ongoing)\n6. **Tattvacintāmaṇi** — Navya-Nyāya method, beginning with the Vyāptipañcaka');
  }
  if (!out.length) out.push('No matching terms were found in the offline dictionary. Try the **Nyāya Terminology Dictionary** or **Search** for related passages.');
  return out.join('\n\n');
}

/** Runs an AI task for a user and logs it. Returns { text, source: 'ai' | 'offline' }. */
export async function runAi(user, mode, input, context = '', history = []) {
  if (!AI_MODES[mode]) mode = 'explain';
  let prompt = context ? `Reference material:\n"""\n${context}\n"""\n\n${input}` : input;
  if (mode === 'path') prompt += '\n\nTexts available in the app library: ' + (await find('texts', { status: 'published' }, { sort: { title: 1 }, fields: ['title'] })).map((t) => t.title).join('; ');

  const messages = [
    { role: 'system', content: systemPrompt(mode) },
    ...history.slice(-10).filter((h) => ['user', 'assistant'].includes(h.role) && typeof h.content === 'string').map((h) => ({ role: h.role, content: h.content.slice(0, 4000) })),
    { role: 'user', content: prompt },
  ];
  const res = await chat(messages);
  let text = res.text;
  let source = 'ai';
  if (!res.ok) {
    source = 'offline';
    const note = res.error === 'not_configured'
      ? '_AI service is not configured yet (set OPENAI_API_KEY in server/.env). Showing offline reference help instead._'
      : `_AI service unavailable (${res.error}). Showing offline reference help instead._`;
    text = note + '\n\n' + (await offline(mode, `${input} ${context}`));
  }
  await insert('ai_logs', { user_id: user.id, mode, prompt: input.slice(0, 4000), response: text, source, created_at: now() });
  return { text, source };
}
