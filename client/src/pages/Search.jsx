import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi, PageHeader, Loader, ErrorBox, Empty, TextCard } from '../components/ui.jsx';
import { SearchBar } from './Home.jsx';
import { t, sectionTranslation } from '../i18n.jsx';

const SCOPES = [['all', 'Everything'], ['text', 'Text'], ['author', 'Author'], ['topic', 'Topic'], ['sanskrit', 'Sanskrit word']];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const scope = params.get('scope') || 'all';
  const era = params.get('era') || '';
  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: k !== 'q' }); };

  const { data, error, loading } = useApi(q ? '/search' + qs({ q, scope, era }) : null);
  const trending = useApi('/search/trending');

  return (
    <>
      <PageHeader title="Advanced Search" sanskrit="अन्वेषणम्" icon="bi-search" subtitle="Search in Devanagari, IAST or plain English — “प्रमाण”, “pramāṇa” and “pramana” all match. Tap the mic for voice search." />
      <div className="mb-3"><SearchBar initial={q} autoFocus={!q} onSearch={(v) => set('q', v)} /></div>
      <div className="ng-chips mb-2">
        {SCOPES.map(([v, l]) => <button key={v} className={`ng-chip ${scope === v ? 'active' : ''}`} onClick={() => set('scope', v === 'all' ? '' : v)}>{t(l)}</button>)}
        <select className="form-select form-select-sm ms-auto" style={{ width: 'auto' }} value={era} onChange={(e) => set('era', e.target.value)} aria-label={t('Era')}>
          <option value="">{t('Any era')}</option><option value="ancient">{t('Ancient')}</option><option value="medieval">{t('Medieval')}</option><option value="contemporary">{t('Contemporary')}</option>
        </select>
      </div>

      {!q && (
        <div className="ng-card mt-3">
          <h6 className="text-navy"><i className="bi bi-graph-up-arrow me-1" />{t('Trending searches')}</h6>
          {trending.data?.length ? (
            <div className="d-flex flex-wrap gap-2">{trending.data.map((x) => <button key={x.norm} className="ng-chip" onClick={() => set('q', x.query)}>{x.query} <small className="opacity-50">{x.hits}</small></button>)}</div>
          ) : (
            <div className="d-flex flex-wrap gap-2">{['pramāṇa', 'vyāpti', 'प्रत्यक्ष', 'Gautama', 'hetvābhāsa', 'samavaya'].map((x) => <button key={x} className="ng-chip" onClick={() => set('q', x)}>{x}</button>)}</div>
          )}
        </div>
      )}

      {loading && q && <Loader label={t('Searching…')} />}
      <ErrorBox error={error} />
      {data && (
        <>
          <p className="text-muted small mt-2">{t('{n} results for “{q}”', { n: data.total, q: data.q })}</p>
          {data.total === 0 && <Empty icon="bi-search" title="No matches"><Link to="/ai">{t('Try a different spelling, another scope, or ask the AI assistant.')}</Link></Empty>}

          {data.terms.length > 0 && (
            <>
              <div className="ng-section-title"><h2>{t('Dictionary')}</h2></div>
              <div className="row g-2">
                {data.terms.map((x) => (
                  <div className="col-md-6" key={x.id}>
                    <Link to={x.slug ? `/dictionary/${x.slug}` : '/dictionary'} className="ng-card py-2 d-block text-body"><span className="sanskrit text-saffron me-2">{x.term_devanagari}</span><strong className="serif fst-italic">{x.term}</strong><div className="small mt-1">{x.meaning}</div></Link>
                  </div>
                ))}
              </div>
            </>
          )}
          {data.texts.length > 0 && (
            <>
              <div className="ng-section-title"><h2>{t('Texts & authors')}</h2></div>
              <div className="row g-3">{data.texts.map((x) => <div className="col-md-6 col-xl-4" key={x.id}><TextCard text={x} /></div>)}</div>
            </>
          )}
          {data.pdfs?.length > 0 && (
            <>
              <div className="ng-section-title"><h2>{t('In PDFs')}</h2><Link to="/pdfs">{t('PDF Library')}</Link></div>
              <div className="row g-2">
                {data.pdfs.map((x) => (
                  <div className="col-md-6" key={x.section_id}>
                    <Link to={x.locked ? `/pdfs/${x.pdf_id}` : `/pdfs/${x.pdf_id}?mode=text&s=${x.section_id}`} className="ng-card py-2 d-block text-body h-100">
                      <div className="small text-muted"><i className="bi bi-file-earmark-pdf text-danger me-1" />{x.pdf_title} · {t('p. {n}', { n: x.page })}{x.locked && <span className="ng-premium ms-2"><i className="bi bi-lock" /> {t('Premium')}</span>}</div>
                      <div className="fw-semibold text-navy">{x.title}</div>
                      {x.snippet && <div className="small mt-1">{x.snippet}</div>}
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
          {data.sections.length > 0 && (
            <>
              <div className="ng-section-title"><h2>{t('Passages')}</h2></div>
              {data.sections.map((s) => (
                <Link key={s.id} to={`/text/${s.text_id}?s=${s.id}`} className="ng-section d-block text-body">
                  <div className="ng-section-head"><span className="ng-ref">{s.ref}</span><span className="chapter">{s.text_title} · {s.chapter}</span>{s.locked && <span className="ng-premium ms-auto"><i className="bi bi-lock" /> {t('Premium')}</span>}</div>
                  {s.title && <h6 className="text-navy">{s.title}</h6>}
                  {s.content_sanskrit && <div className="ng-sanskrit-block" style={{ fontSize: '1.05rem' }}>{s.content_sanskrit}</div>}
                  {sectionTranslation(s).text && <div className="small text-muted mt-1">{sectionTranslation(s).text.slice(0, 240)}{sectionTranslation(s).text.length > 240 ? '…' : ''}</div>}
                </Link>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
