// Print-ready edition of a text: cover, contents (index) and one chapter per page, in the chosen language.
// The browser's print dialog saves it as a PDF, which keeps Devanagari and Gujarati conjuncts shaped correctly.
import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi, Loader, ErrorBox } from '../components/ui.jsx';
import { Logo } from '../components/Layout.jsx';
import { t, useLang, LanguageChips, sectionTranslation } from '../i18n.jsx';

/** Consecutive sections with the same `chapter` form one chapter. */
function chaptersOf(sections) {
  const out = [];
  for (const s of sections) {
    const last = out[out.length - 1];
    if (last && last.name === (s.chapter || '')) last.sections.push(s);
    else out.push({ name: s.chapter || '', sections: [s], index: out.length + 1 });
  }
  return out;
}

export default function TextPdf() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { lang } = useLang();
  const { data, error, loading, reload } = useApi(`/texts/${id}`, [user?.id]);
  const chapters = useMemo(() => (data ? chaptersOf(data.sections) : []), [data]);
  const only = chapters[Number(params.get('chapter')) - 1] || null;
  const chapterTitle = (c) => c.name || t('Chapter {n}', { n: c.index });

  // The browser uses the page title as the PDF file name.
  useEffect(() => {
    if (data) document.title = only ? `${data.text.title} — ${chapterTitle(only)}` : data.text.title;
  }, [data, only]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loader />;
  if (error) return <div className="container py-4"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return null;
  const { text, locked } = data;
  const shown = only ? [only] : chapters;
  const pickChapter = (v) => setParams(v ? { chapter: v } : {}, { replace: true });

  return (
    <div className="ng-pdf">
      <div className="ng-pdf-toolbar no-print">
        <Link to={`/text/${id}`} className="btn btn-sm btn-light"><i className="bi bi-arrow-left" /> {t('Back to reader')}</Link>
        <LanguageChips />
        <select className="form-select form-select-sm" style={{ width: 'auto', maxWidth: '100%' }} value={only ? only.index : ''} onChange={(e) => pickChapter(e.target.value)} aria-label={t('Chapter')}>
          <option value="">{t('All chapters')}</option>
          {chapters.map((c) => <option key={c.index} value={c.index}>{t('Chapter {n}', { n: c.index })}{c.name ? ` · ${c.name}` : ''}</option>)}
        </select>
        <button className="btn btn-sm btn-saffron" onClick={() => window.print()}><i className="bi bi-file-earmark-pdf" /> {t('Download PDF')}</button>
        <small className="text-muted w-100">{t('In the print window, choose “Save as PDF” as the destination.')}</small>
      </div>

      <article className="ng-pdf-doc" lang={lang}>
        {!only && (
          <section className="ng-pdf-cover">
            <Logo size={72} />
            {text.title_sanskrit && <div className="ng-pdf-cover-sk">{text.title_sanskrit}</div>}
            <h1>{text.title}</h1>
            {text.author && <div className="ng-pdf-cover-author">{text.author_sanskrit ? `${text.author_sanskrit} · ` : ''}{text.author}</div>}
            {text.period && <div className="text-muted">{text.period}</div>}
            {text.description && <p className="ng-pdf-cover-desc">{text.description}</p>}
            <div className="ng-pdf-cover-foot">{t('Generated from Nyāya Grantha Sarvasvam')} · {window.location.host}</div>
          </section>
        )}

        {!only && chapters.length > 0 && (
          <nav className="ng-pdf-index">
            <h2>{t('Contents')}</h2>
            <ol>
              {chapters.map((c) => (
                <li key={c.index}>
                  <a href={`#ch-${c.index}`} className="ng-pdf-index-ch"><span>{c.index}.</span> {chapterTitle(c)}</a>
                  <ul>
                    {c.sections.map((s) => <li key={s.id}><a href={`#sec-${s.id}`}>{s.ref && <span className="ref">{s.ref}</span>}{s.title}</a></li>)}
                  </ul>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {shown.map((c) => (
          <section key={c.index} id={`ch-${c.index}`} className="ng-pdf-chapter">
            {only && <div className="ng-pdf-running">{text.title}{text.title_sanskrit ? ` · ${text.title_sanskrit}` : ''}</div>}
            <div className="ng-pdf-chapter-label">{t('Chapter {n}', { n: c.index })}</div>
            <h2>{chapterTitle(c)}</h2>
            {c.sections.map((s) => {
              const tr = sectionTranslation(s, lang);
              return (
                <div key={s.id} id={`sec-${s.id}`} className="ng-pdf-section">
                  <h3>{s.ref && <span className="ref">{s.ref}</span>}{s.title}</h3>
                  {s.content_sanskrit && <p className="sk">{s.content_sanskrit}</p>}
                  {s.transliteration && <p className="iast">{s.transliteration}</p>}
                  {tr.text && <p className="tr">{tr.text}</p>}
                  {s.commentary && <p className="cm">{s.commentary}</p>}
                </div>
              );
            })}
          </section>
        ))}

        {locked && <p className="ng-pdf-locked"><i className="bi bi-lock-fill me-1" />{t('This PDF contains the free preview only. Become a member to download the full text.')}</p>}
      </article>
    </div>
  );
}
