import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi, PageHeader, Loader, ErrorBox, Empty, Markdown, speak, share, toast, usePageTitle, useVoiceInput } from '../components/ui.jsx';
import { t, getLang, langInfo } from '../i18n.jsx';
import { devaToIast } from '@shared/translit.js';

// Sanskrit alphabet order (varṇamālā) for the letter index.
const LETTERS = [...'अआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह'];
const GENDER = { 'm.': 'masculine', 'f.': 'feminine', 'n.': 'neuter' };
const firstLetter = (deva) => (deva || '').charAt(0);
const KNOWN_KEY = 'ng_dict_known';

/** A meaning without a leading "term — " (the Hindi meanings start that way), for the compact list. */
const shortMeaning = (g) => meaningOf(g).text.replace(new RegExp(`^${g.term_devanagari}\s*—\s*`), '');

/** The meaning in the interface language, falling back to English. */
function meaningOf(g) {
  const lang = getLang();
  const own = ['hi', 'mr', 'gu'].includes(lang) ? g[`meaning_${lang}`] : null;
  return own ? { text: own, fallback: false } : { text: g.meaning, fallback: lang !== 'en' };
}

export default function Dictionary() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const category = params.get('c') || '';
  const letter = params.get('l') || '';
  const mode = params.get('mode') === 'cards' ? 'cards' : 'browse';
  const [q, setQ] = useState(params.get('q') || '');
  const dq = useDeferredValue(q.trim());
  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };
  useEffect(() => { if ((params.get('q') || '') !== dq) setParam('q', dq); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, reload } = useApi('/glossary' + qs({ q: dq, category }));
  const terms = useMemo(() => (data?.terms || []).filter((g) => !letter || firstLetter(g.term_devanagari) === letter), [data, letter]);
  const present = useMemo(() => new Set((data?.terms || []).map((g) => firstLetter(g.term_devanagari))), [data]);
  const voice = useVoiceInput((text) => setQ(text), 'hi-IN');
  const keep = params.toString() ? `?${params}` : '';
  // Keep the open term visible in the list (desktop, where the list scrolls on its own).
  const listRef = useRef(null);
  useEffect(() => { listRef.current?.querySelector('.ng-dict-row.active')?.scrollIntoView({ block: 'nearest' }); }, [slug, terms]);

  return (
    <div className={`ng-dict ${slug && mode === 'browse' ? 'has-detail' : ''}`}>
      <div className="ng-dict-head">
        <PageHeader title="Nyāya Terminology Dictionary" sanskrit="पारिभाषिकशब्दकोशः" icon="bi-translate" subtitle="Technical terms of Nyāya, Vaiśeṣika and Navya-Nyāya. Search in Devanagari, IAST or English." />
        <div className="ng-dict-search">
          <i className="bi bi-search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search a term — e.g. व्याप्ति, vyapti, pervasion…')} aria-label={t('Search the dictionary')} />
          {q && <button type="button" onClick={() => setQ('')} aria-label={t('Clear')}><i className="bi bi-x-lg" /></button>}
          {voice && <button type="button" className={voice.listening ? 'listening' : ''} onClick={() => voice.start()} aria-label={t('Voice search')}><i className="bi bi-mic" /></button>}
        </div>
        <div className="ng-dict-tools">
          <div className="ng-seg-pill" role="tablist">
            <button role="tab" aria-selected={mode === 'browse'} className={mode === 'browse' ? 'on' : ''} onClick={() => setParam('mode', '')}><i className="bi bi-list-ul" /> {t('Browse')}</button>
            <button role="tab" aria-selected={mode === 'cards'} className={mode === 'cards' ? 'on' : ''} onClick={() => setParam('mode', 'cards')}><i className="bi bi-card-heading" /> {t('Flashcards')}</button>
          </div>
          <div className="ng-chips flex-grow-1">
            <button className={`ng-chip ${!category ? 'active' : ''}`} onClick={() => setParam('c', '')}>{t('All')} <span className="ng-chip-n">{data?.total ?? ''}</span></button>
            {data?.categories.map((c) => (
              <button key={c} className={`ng-chip ${category === c ? 'active' : ''}`} onClick={() => setParam('c', category === c ? '' : c)}>{t(c)} <span className="ng-chip-n">{data.categoryCounts[c]}</span></button>
            ))}
          </div>
        </div>
        <div className="ng-letters" role="group" aria-label={t('Browse by letter')}>
          <button className={!letter ? 'on' : ''} onClick={() => setParam('l', '')}>{t('All')}</button>
          {LETTERS.map((l) => (
            <button key={l} className={`sanskrit ${letter === l ? 'on' : ''}`} disabled={!present.has(l)} onClick={() => setParam('l', letter === l ? '' : l)}>{l}</button>
          ))}
        </div>
      </div>

      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Loader />}
      {data && mode === 'cards' && <Flashcards terms={terms} keep={keep} />}
      {data && mode === 'browse' && (
        <div className="ng-dict-body">
          <div className="ng-dict-list" ref={listRef}>
            <div className="ng-dict-count">{t('{n} terms', { n: terms.length })}{dq && ` · “${dq}”`}</div>
            {terms.length === 0 && <Empty icon="bi-translate" title="No matching terms">{t('Try another spelling, or search the meaning in English.')}</Empty>}
            {terms.map((g, i) => {
              const head = !dq && firstLetter(g.term_devanagari) !== firstLetter(terms[i - 1]?.term_devanagari);
              return (
                <div key={g.slug}>
                  {head && <div className="ng-dict-letter sanskrit">{firstLetter(g.term_devanagari)}</div>}
                  <Link to={`/dictionary/${g.slug}${keep}`} className={`ng-dict-row ${g.slug === slug ? 'active' : ''}`} aria-current={g.slug === slug ? 'true' : undefined}>
                    <span className="ng-dict-deva sanskrit">{g.term_devanagari}</span>
                    <span className="min-w-0 flex-grow-1">
                      <span className="ng-dict-iast">{g.term}{g.gender && <small> {g.gender}</small>}</span>
                      <span className="ng-dict-mean">{shortMeaning(g)}</span>
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
          <div className="ng-dict-detail">
            {slug ? <TermDetail slug={slug} keep={keep} /> : <Welcome terms={data.terms} total={data.total} keep={keep} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Desktop placeholder beside the list: term of the day and how to use the dictionary. */
function Welcome({ terms, total, keep }) {
  const navigate = useNavigate();
  const today = terms.length ? terms[Math.floor(Date.now() / 86400000) % terms.length] : null;
  return (
    <div className="ng-term ng-term-welcome">
      {today && (
        <>
          <div className="ng-term-kicker"><i className="bi bi-stars" /> {t('Term of the Day')}</div>
          <Link to={`/dictionary/${today.slug}${keep}`} className="ng-term-today">
            <span className="sanskrit">{today.term_devanagari}</span>
            <em>{today.term}</em>
            <p>{meaningOf(today).text}</p>
            <span className="small fw-semibold">{t('Open entry')} <i className="bi bi-arrow-right" /></span>
          </Link>
        </>
      )}
      <ul className="ng-term-tips">
        <li><i className="bi bi-search" />{t('Search in Devanagari, IAST, plain spelling or English — प्रमाण, pramāṇa, pramana and "valid knowledge" all work.')}</li>
        <li><i className="bi bi-sort-alpha-down" />{t('Terms follow the Sanskrit alphabet. Use the letter bar to jump.')}</li>
        <li><i className="bi bi-card-heading" />{t('Learning the vocabulary? Switch to Flashcards.')}</li>
      </ul>
      <button className="btn btn-outline-secondary btn-sm" onClick={() => terms.length && navigate(`/dictionary/${terms[Math.floor(Math.random() * terms.length)].slug}${keep}`)}>
        <i className="bi bi-shuffle me-1" />{t('Surprise me')}
      </button>
      <div className="small text-muted mt-3">{t('{n} terms', { n: total })}</div>
    </div>
  );
}

function TermDetail({ slug, keep }) {
  const { data, error, loading } = useApi(`/glossary/${slug}`);
  const navigate = useNavigate();
  usePageTitle(data ? `${data.term.term} — ${t('Dictionary')}` : null);
  useEffect(() => { if (window.innerWidth < 992) window.scrollTo(0, 0); }, [slug]);
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;

  const g = data.term;
  const m = meaningOf(g);
  const url = `${window.location.origin}/dictionary/${g.slug}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${g.term_devanagari} (${g.term}) — ${g.meaning}\n${url}`); toast(t('Copied')); } catch { toast(t('Could not copy'), 'error'); }
  };
  const askAi = () => {
    try { sessionStorage.setItem('ng_ai_prefill', `Explain the Nyāya term ${g.term} (${g.term_devanagari}): its definition, how it is used in arguments, and a simple example.`); } catch { /* storage unavailable */ }
    navigate('/ai');
  };
  const sourceLink = data.source && `/text/${data.source.text_id}${data.source.section_id ? `?s=${data.source.section_id}` : ''}`;

  return (
    <article className="ng-term" style={{ opacity: loading ? 0.6 : 1 }}>
      <Link to={`/dictionary${keep}`} className="ng-term-back d-lg-none"><i className="bi bi-arrow-left" /> {t('All terms')}</Link>
      <header className="ng-term-head">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Link to={`/dictionary?c=${encodeURIComponent(g.category)}`} className="ng-cat-chip">{t(g.category)}</Link>
          <span className="small text-muted">{t('{n} of {total}', { n: data.position, total: data.total })}</span>
        </div>
        <h1 className="sanskrit ng-term-deva">{g.term_devanagari}</h1>
        <div className="ng-term-iast">
          <em>{g.term}</em>
          {g.gender && <span className="ng-term-gender" title={t(GENDER[g.gender])}>{g.gender} {t(GENDER[g.gender])}</span>}
        </div>
        <div className="ng-term-actions">
          <button onClick={() => speak(g.term_devanagari, 'hi-IN')}><i className="bi bi-volume-up" />{t('Listen')}</button>
          <button onClick={copy}><i className="bi bi-clipboard" />{t('Copy')}</button>
          <button onClick={() => share({ title: `${g.term} — ${t('Nyāya Terminology Dictionary')}`, text: `${g.term_devanagari} (${g.term}): ${g.meaning}`, url })}><i className="bi bi-share" />{t('Share')}</button>
          <button onClick={askAi}><i className="bi bi-stars" />{t('Ask AI')}</button>
        </div>
      </header>

      <section className="ng-term-meaning">
        {m.fallback && <div className="ng-fallback-note"><i className="bi bi-info-circle me-1" />{t('Not yet translated into {lang} — showing English.', { lang: langInfo().name })}</div>}
        <p>{m.text}</p>
        {!m.fallback && getLang() !== 'en' && <p className="ng-term-en">{g.meaning}</p>}
      </section>

      {g.definition && (
        <section>
          <h2>{t('Classical definition')}</h2>
          <blockquote className="ng-term-def">
            <p className="sanskrit">{g.definition}</p>
            <p className="ng-iast mb-0">{devaToIast(g.definition)}</p>
            {g.definition_source && (
              <footer>— {sourceLink ? <Link to={sourceLink}>{g.definition_source} <i className="bi bi-box-arrow-up-right" /></Link> : g.definition_source}</footer>
            )}
          </blockquote>
        </section>
      )}
      {g.explanation && <section><h2>{t('Explanation')}</h2><Markdown text={g.explanation} /></section>}
      {g.example && <section><h2>{t('Example')}</h2><p className="ng-term-example"><i className="bi bi-lightbulb" />{g.example}</p></section>}
      {g.etymology && <section><h2>{t('Etymology')}</h2><p className="ng-term-ety">{g.etymology}</p></section>}

      {data.related.length > 0 && (
        <section>
          <h2>{t('Related terms')}</h2>
          <div className="ng-term-related">
            {data.related.map((r) => (
              <Link key={r.slug} to={`/dictionary/${r.slug}${keep}`} title={r.meaning}>
                <span className="sanskrit">{r.term_devanagari}</span><em>{r.term}</em>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.usedInCount > 0 && (
        <section>
          <h2>{t('In the library')} <span className="ng-count">{data.usedInCount}</span></h2>
          <div className="ng-term-uses">
            {data.usedIn.map((u) => (
              <Link key={u.section_id} to={`/text/${u.text_id}?s=${u.section_id}`}>
                <span className="ng-ref">{u.ref}</span>
                <span className="min-w-0">
                  <strong>{u.text_title}</strong>{u.title && <span className="text-muted"> · {u.title}</span>}
                  {u.sanskrit && <span className="sanskrit d-block text-truncate">{u.sanskrit}</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <nav className="ng-term-nav" aria-label={t('Neighbouring terms')}>
        {data.prev ? <Link to={`/dictionary/${data.prev.slug}${keep}`}><i className="bi bi-chevron-left" /><span><small>{t('Previous')}</small><span className="sanskrit">{data.prev.term_devanagari}</span></span></Link> : <span />}
        {data.next ? <Link to={`/dictionary/${data.next.slug}${keep}`} className="text-end"><span><small>{t('Next')}</small><span className="sanskrit">{data.next.term_devanagari}</span></span><i className="bi bi-chevron-right" /></Link> : <span />}
      </nav>
    </article>
  );
}

function loadKnown() {
  try { return new Set(JSON.parse(localStorage.getItem(KNOWN_KEY)) || []); } catch { return new Set(); }
}

/** Study mode: flip cards for the terms in the current filter; "known" terms are remembered on this device. */
function Flashcards({ terms, keep }) {
  const [known, setKnown] = useState(loadKnown);
  const [hideKnown, setHideKnown] = useState(true);
  const [order, setOrder] = useState(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => { try { localStorage.setItem(KNOWN_KEY, JSON.stringify([...known])); } catch { /* storage unavailable */ } }, [known]);
  useEffect(() => { setI(0); setFlipped(false); }, [terms, order, hideKnown]);

  const deck = useMemo(() => {
    let d = terms;
    if (order) {
      const pos = new Map(order.map((s, k) => [s, k]));
      d = [...d].sort((a, b) => (pos.get(a.slug) ?? 0) - (pos.get(b.slug) ?? 0));
    }
    return hideKnown ? d.filter((g) => !known.has(g.slug)) : d;
  }, [terms, order, hideKnown, known]);
  const card = deck[Math.min(i, deck.length - 1)];
  const knownCount = terms.filter((g) => known.has(g.slug)).length;

  const go = (step) => { setFlipped(false); setI((x) => (deck.length ? (x + step + deck.length) % deck.length : 0)); };
  const markKnown = () => {
    if (!card) return;
    setKnown((s) => new Set(s).add(card.slug));
    setFlipped(false);
    if (!hideKnown) go(1);
  };
  const markLearning = () => {
    if (!card) return;
    setKnown((s) => { const n = new Set(s); n.delete(card.slug); return n; });
    go(1);
  };
  const shuffle = () => setOrder([...terms.map((g) => g.slug)].sort(() => Math.random() - 0.5));

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key.toLowerCase() === 'k') markKnown();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="ng-flashcards">
      <div className="ng-flash-progress">
        <div className="d-flex justify-content-between small mb-1">
          <span><strong>{knownCount}</strong> {t('of {total} known', { total: terms.length })}</span>
          <span className="text-muted">{deck.length ? `${Math.min(i, deck.length - 1) + 1} / ${deck.length}` : ''}</span>
        </div>
        <div className="progress" style={{ height: 6 }}><div className="progress-bar bg-success" style={{ width: `${terms.length ? (knownCount / terms.length) * 100 : 0}%` }} /></div>
      </div>
      <div className="d-flex gap-2 flex-wrap my-3">
        <button className="btn btn-sm btn-light" onClick={shuffle}><i className="bi bi-shuffle me-1" />{t('Shuffle')}</button>
        <div className="form-check form-switch ms-1 my-auto">
          <input className="form-check-input" type="checkbox" id="hide-known" checked={hideKnown} onChange={(e) => setHideKnown(e.target.checked)} />
          <label className="form-check-label small" htmlFor="hide-known">{t('Hide known cards')}</label>
        </div>
        {knownCount > 0 && <button className="btn btn-sm btn-link text-decoration-none ms-auto" onClick={() => { if (window.confirm(t('Start over and mark every card as not known?'))) setKnown(new Set()); }}>{t('Reset progress')}</button>}
      </div>

      {!card ? (
        <Empty icon="bi-trophy" title={terms.length ? 'You know every card in this set!' : 'No matching terms'}>
          {terms.length > 0 && <button className="btn btn-sm btn-saffron mt-2" onClick={() => setHideKnown(false)}>{t('Review all cards')}</button>}
        </Empty>
      ) : (
        <>
          <button type="button" className={`ng-flash ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)} aria-label={t(flipped ? 'Show the term' : 'Show the meaning')}>
            <span className="ng-flash-inner">
              <span className="ng-flash-face ng-flash-front">
                <span className="ng-cat-chip">{t(card.category)}</span>
                <span className="sanskrit ng-flash-deva">{card.term_devanagari}</span>
                <em className="ng-flash-iast">{card.term}</em>
                {known.has(card.slug) && <span className="ng-flash-known"><i className="bi bi-check-circle-fill" /> {t('Known')}</span>}
                <small className="ng-flash-hint">{t('Tap to see the meaning')}</small>
              </span>
              <span className="ng-flash-face ng-flash-back">
                <span className="sanskrit ng-flash-small">{card.term_devanagari} · <em>{card.term}</em></span>
                <span className="ng-flash-meaning">{meaningOf(card).text}</span>
                {card.definition && <span className="sanskrit ng-flash-def">{card.definition}</span>}
              </span>
            </span>
          </button>
          <div className="ng-flash-controls">
            <button className="btn btn-light" onClick={() => go(-1)} aria-label={t('Previous')}><i className="bi bi-chevron-left" /></button>
            <button className="btn btn-outline-secondary flex-grow-1" onClick={markLearning}><i className="bi bi-arrow-repeat me-1" />{t('Still learning')}</button>
            <button className="btn btn-success flex-grow-1" onClick={markKnown}><i className="bi bi-check2 me-1" />{t('I know this')}</button>
            <button className="btn btn-light" onClick={() => go(1)} aria-label={t('Next')}><i className="bi bi-chevron-right" /></button>
          </div>
          <div className="text-center mt-2">
            <Link to={`/dictionary/${card.slug}${keep.replace(/([?&])mode=cards&?/, '$1').replace(/[?&]$/, '')}`} className="small">{t('Open full entry')} <i className="bi bi-arrow-right" /></Link>
            <div className="small text-muted d-none d-md-block mt-1">{t('Keys: Space to flip · ← → to move · K to mark as known')}</div>
          </div>
        </>
      )}
    </div>
  );
}
