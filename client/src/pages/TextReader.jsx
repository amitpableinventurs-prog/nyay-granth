import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, usePageTitle, Loader, ErrorBox, TextCover, LockCard, eraLabel, share, speak, stopSpeaking, toast } from '../components/ui.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import AiModal from '../components/AiModal.jsx';
import { t, getLang, langInfo, sectionTranslation } from '../i18n.jsx';

const LAYERS = [['sanskrit', 'Sanskrit'], ['iast', 'IAST'], ['translation', 'Translation'], ['commentary', 'Commentary']];
// Speech voices for each interface language (no browser ships a Sanskrit voice; Hindi reads Devanagari well).
const VOICE = { en: 'en-IN', hi: 'hi-IN', sa: 'hi-IN', mr: 'mr-IN', gu: 'gu-IN' };

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('ng_reader')) || {}; } catch { return {}; }
}

export default function TextReader() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useApi(`/texts/${id}`, [user?.id]);
  const [prefs, setPrefs] = useState(() => ({ sanskrit: true, iast: true, translation: true, commentary: true, fs: 1, ...loadPrefs() }));
  const [noteFor, setNoteFor] = useState(null);
  const [ai, setAi] = useState(null);
  const [speaking, setSpeaking] = useState(null);
  const seen = useRef(new Set());
  usePageTitle(data?.text.title);

  useEffect(() => { try { localStorage.setItem('ng_reader', JSON.stringify(prefs)); } catch { /* ignore */ } }, [prefs]);
  useEffect(() => () => stopSpeaking(), []);

  // Jump to a section from search results / bookmarks (?s=<id>).
  useEffect(() => {
    const target = params.get('s');
    if (data && target) setTimeout(() => document.getElementById(`s-${target}`)?.scrollIntoView({ behavior: 'smooth' }), 150);
  }, [data, params]);

  // Reading progress: record a section once it has been on screen for a moment.
  useEffect(() => {
    if (!data || !user) return undefined;
    const timers = new Map();
    const obs = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const sid = en.target.dataset.sid;
        if (en.isIntersecting && !seen.current.has(sid)) {
          timers.set(sid, setTimeout(() => {
            seen.current.add(sid);
            post(`/texts/${id}/progress`, { section_id: sid }).then((r) => setData((d) => ({ ...d, progress: { section_id: sid, percent: r.percent } }))).catch(() => {});
          }, 1500));
        } else if (!en.isIntersecting) clearTimeout(timers.get(sid));
      }
    }, { threshold: 0.5 });
    document.querySelectorAll('.ng-section[data-sid]').forEach((el) => obs.observe(el));
    return () => { obs.disconnect(); timers.forEach(clearTimeout); };
  }, [data?.sections, user, id, setData]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const { text, sections, locked, bookmarks, notes, progress } = data;

  const isMarked = (sid) => bookmarks.some((b) => (sid ? Number(b.section_id) === Number(sid) : !b.section_id));
  const requireUser = () => { if (!user) { toast(t('Please log in first.'), 'error'); return false; } return true; };

  const toggleBookmark = async (sectionId = null) => {
    if (!requireUser()) return;
    try {
      const r = await post('/me/bookmarks/toggle', { text_id: text.id, section_id: sectionId });
      setData((d) => ({ ...d, bookmarks: r.bookmarked ? [...d.bookmarks, { id: r.id, section_id: sectionId }] : d.bookmarks.filter((b) => (sectionId ? Number(b.section_id) !== Number(sectionId) : !!b.section_id)) }));
      toast(t(r.bookmarked ? 'Bookmarked' : 'Bookmark removed'));
    } catch (e) { toast(e.message, 'error'); }
  };

  // Read aloud: the Sanskrit (Hindi voice) followed by the translation (English voice).
  const listen = (s) => {
    stopSpeaking();
    if (speaking === s.id) { setSpeaking(null); return; }
    const tr = sectionTranslation(s);
    const parts = [[s.content_sanskrit, 'hi-IN'], [tr.text, tr.fallback ? 'en-IN' : VOICE[getLang()]]].filter(([x]) => x);
    if (!parts.length) return;
    setSpeaking(s.id);
    parts.forEach(([x, lang], i) => speak(x, lang, { queue: i > 0, onEnd: i === parts.length - 1 ? () => setSpeaking(null) : undefined }));
  };

  const resumeId = progress?.section_id;
  const sectionText = (s) => [s.content_sanskrit, s.transliteration, sectionTranslation(s).text].filter(Boolean).join('\n');

  return (
    <div style={{ '--fs': prefs.fs }}>
      <div className="ng-text-hero mb-3">
        <TextCover text={text} size="lg" />
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex gap-1 mb-2 flex-wrap">
            <span className={`ng-era ng-era-${text.era}`}>{eraLabel(text.era)}</span>
            {text.category && <span className="badge text-bg-light">{text.category}</span>}
            {!!text.is_premium && <span className="ng-premium"><i className="bi bi-gem" /> {t('Premium')}</span>}
          </div>
          <h1>{text.title}</h1>
          {text.title_sanskrit && <div className="sanskrit fs-5 text-saffron">{text.title_sanskrit}</div>}
          <div className="text-muted">{t('by {author}', { author: text.author })}{text.period ? ` · ${text.period}` : ''}</div>
          <p className="mt-2 mb-2 d-none d-md-block">{text.description}</p>
          {progress && (
            <div className="d-flex align-items-center gap-2 mb-2" style={{ maxWidth: 320 }}>
              <div className="progress flex-grow-1" style={{ height: 6 }}><div className="progress-bar" style={{ width: `${progress.percent}%` }} /></div>
              <small className="text-muted">{t('{n}% read', { n: progress.percent })}</small>
            </div>
          )}
          <div className="d-flex gap-2 flex-wrap no-print">
            {resumeId && <a href={`#s-${resumeId}`} className="btn btn-sm btn-saffron"><i className="bi bi-play-fill" /> {t('Continue')}</a>}
            <button className={`btn btn-sm ${isMarked(null) ? 'btn-navy' : 'btn-outline-secondary'}`} onClick={() => toggleBookmark(null)}>
              <i className={`bi ${isMarked(null) ? 'bi-bookmark-fill' : 'bi-bookmark'}`} /> {t(isMarked(null) ? 'Saved' : 'Save')}
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => share({ title: text.title, text: `${text.title} by ${text.author}` })}><i className="bi bi-share" /> {t('Share')}</button>
            <Link to={`/text/${text.id}/pdf`} className="btn btn-sm btn-outline-secondary"><i className="bi bi-file-earmark-pdf" /> {t('Download PDF')}</Link>
          </div>
        </div>
      </div>
      <p className="d-md-none">{text.description}</p>

      <div className="ng-reader-toolbar">
        {LAYERS.map(([k, l]) => (
          <button key={k} className={`ng-chip ${prefs[k] ? 'active' : ''}`} onClick={() => setPrefs({ ...prefs, [k]: !prefs[k] })} aria-pressed={prefs[k]}>{t(l)}</button>
        ))}
        <div className="ms-auto d-flex gap-1 align-items-center">
          <button className="ng-chip" onClick={() => setPrefs({ ...prefs, fs: Math.max(0.8, +(prefs.fs - 0.1).toFixed(1)) })} aria-label={t('Smaller text')}>A−</button>
          <button className="ng-chip" onClick={() => setPrefs({ ...prefs, fs: Math.min(1.8, +(prefs.fs + 0.1).toFixed(1)) })} aria-label={t('Larger text')}>A+</button>
          {sections.length > 3 && (
            <select className="form-select form-select-sm" style={{ width: 'auto' }} onChange={(e) => document.getElementById(`s-${e.target.value}`)?.scrollIntoView({ behavior: 'smooth' })} aria-label={t('Jump to section')} defaultValue="">
              <option value="" disabled>{t('Contents')}</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.ref} {s.title}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          {sections.map((s) => {
            const sNotes = notes.filter((n) => Number(n.section_id) === Number(s.id));
            const tr = sectionTranslation(s);
            return (
              <article key={s.id} id={`s-${s.id}`} data-sid={s.id} className="ng-section">
                <div className="ng-section-head">
                  {s.ref && <span className="ng-ref">{s.ref}</span>}
                  <span className="chapter">{s.chapter}</span>
                  {s.title && <h3>{s.title}</h3>}
                </div>
                {prefs.sanskrit && s.content_sanskrit && <div className="ng-sanskrit-block">{s.content_sanskrit}</div>}
                {prefs.iast && s.transliteration && <div className="ng-iast">{s.transliteration}</div>}
                {prefs.translation && tr.text && <div className="ng-translation">{tr.fallback && <div className="ng-fallback-note no-print"><i className="bi bi-info-circle me-1" />{t('Not yet translated into {lang} — showing English.', { lang: langInfo().name })}</div>}{tr.text}</div>}
                {prefs.commentary && s.commentary && <div className="ng-commentary"><i className="bi bi-chat-quote me-1" />{s.commentary}</div>}
                {sNotes.map((n) => (
                  <div key={n.id} className={`ng-note ng-note-${n.color}`} role="button" onClick={() => setNoteFor({ ...n, contextLabel: `${text.title} ${s.ref || ''}` })}>
                    <i className="bi bi-sticky me-1" />{n.title && <strong>{n.title}: </strong>}{n.content}
                  </div>
                ))}
                <div className="ng-section-actions">
                  <button className={isMarked(s.id) ? 'on' : ''} onClick={() => toggleBookmark(s.id)}><i className={`bi ${isMarked(s.id) ? 'bi-bookmark-fill' : 'bi-bookmark'}`} />{t('Bookmark')}</button>
                  <button onClick={() => requireUser() && setNoteFor({ text_id: text.id, section_id: s.id, highlight: s.content_sanskrit || s.translation, contextLabel: `${text.title} ${s.ref || ''}` })}><i className="bi bi-pencil-square" />{t('Note')}</button>
                  <button onClick={() => setAi({ mode: 'explain', section: s })}><i className="bi bi-stars" />{t('Explain')}</button>
                  <button onClick={() => setAi({ mode: 'summarize', section: s })}><i className="bi bi-card-text" />{t('Summary')}</button>
                  <button onClick={() => setAi({ mode: 'translate', section: s })}><i className="bi bi-translate" />{t('Translate')}</button>
                  <button className={speaking === s.id ? 'on' : ''} onClick={() => listen(s)}><i className={`bi ${speaking === s.id ? 'bi-stop-circle' : 'bi-volume-up'}`} />{t('Listen')}</button>
                  <button onClick={() => share({ title: `${text.title} ${s.ref || ''}`, text: sectionText(s), url: `${window.location.origin}/text/${text.id}?s=${s.id}` })}><i className="bi bi-share" />{t('Share')}</button>
                </div>
              </article>
            );
          })}
          {locked && <LockCard what={t('The full text of {title}', { title: text.title })} />}
          {sections.length === 0 && !locked && <div className="text-muted">{t('No sections have been added to this text yet.')}</div>}
        </div>

        <aside className="col-lg-4 no-print">
          {user && (
            <div className="ng-card mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0 text-navy">{t('My notes on this text')}</h6>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setNoteFor({ text_id: text.id, contextLabel: text.title })}><i className="bi bi-plus" /></button>
              </div>
              {notes.length === 0 && <div className="small text-muted">{t('Use “Note” under any section to annotate it.')}</div>}
              {notes.slice(0, 6).map((n) => <div key={n.id} className={`ng-note ng-note-${n.color} small`}>{n.title && <strong>{n.title}: </strong>}{n.content}</div>)}
              {notes.length > 6 && <Link to="/notes" className="small">{t('All notes →')}</Link>}
            </div>
          )}
          {data.audio.length > 0 && (
            <div className="ng-card mb-3">
              <h6 className="text-navy">{t('Audio')}</h6>
              {data.audio.map((a) => <Link key={a.id} to={`/audio?play=${a.id}`} className="d-block small py-1"><i className="bi bi-play-circle me-1" />{a.title} <span className="text-muted">· {a.kind}</span></Link>)}
            </div>
          )}
          {data.pdfs?.length > 0 && (
            <div className="ng-card mb-3">
              <h6 className="text-navy">{t('PDF editions')}</h6>
              {data.pdfs.map((p) => <Link key={p.id} to={`/pdfs/${p.id}`} className="d-block small py-1"><i className="bi bi-file-earmark-pdf me-1" />{p.title}{p.pages ? <span className="text-muted"> · {t('{n} pages', { n: p.pages })}</span> : null} {!!p.is_premium && <span className="ng-premium">{t('Premium')}</span>}</Link>)}
            </div>
          )}
          {data.presentations.length > 0 && (
            <div className="ng-card mb-3">
              <h6 className="text-navy">{t('Presentations')}</h6>
              {data.presentations.map((p) => <Link key={p.id} to={`/presentations/${p.id}`} className="d-block small py-1"><i className="bi bi-easel me-1" />{p.title} {!!p.is_premium && <span className="ng-premium">{t('Premium')}</span>}</Link>)}
            </div>
          )}
          {data.terms?.length > 0 && (
            <div className="ng-card mb-3">
              <h6 className="text-navy">{t('Key terms')}</h6>
              <div className="ng-keyterms">
                {data.terms.map((k) => <Link key={k.slug} to={`/dictionary/${k.slug}`} title={k.meaning}><span className="sanskrit">{k.term_devanagari}</span> <em>{k.term}</em></Link>)}
              </div>
            </div>
          )}
          <div className="ng-card">
            <h6 className="text-navy">{t('Study tools')}</h6>
            <Link to="/tools/sloka" className="d-block small py-1"><i className="bi bi-soundwave me-1" />{t("Analyse a verse's metre")}</Link>
            <Link to="/dictionary" className="d-block small py-1"><i className="bi bi-translate me-1" />{t('Nyāya terminology dictionary')}</Link>
            <Link to="/tools/citation" className="d-block small py-1"><i className="bi bi-quote me-1" />{t('Cite this text')}</Link>
            <Link to="/ai" className="d-block small py-1"><i className="bi bi-mortarboard me-1" />{t('Ask the AI tutor')}</Link>
          </div>
        </aside>
      </div>

      <NoteEditor show={!!noteFor} note={noteFor} onClose={() => setNoteFor(null)} onSaved={(n) => setData((d) => ({ ...d, notes: [n, ...d.notes.filter((x) => x.id !== n.id)] }))} />
      <AiModal request={ai} onClose={() => setAi(null)} />
    </div>
  );
}
