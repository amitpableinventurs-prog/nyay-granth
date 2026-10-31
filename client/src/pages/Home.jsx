import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi, usePageTitle, TextCard, Loader, ErrorBox, fmtDateTime, useVoiceInput } from '../components/ui.jsx';
import { t, getLang } from '../i18n.jsx';
import { ProductCard } from '../components/ProductCard.jsx';

const FEATURES = [
  { to: '/library', label: 'Text Library', icon: 'bi-book', c: '#1e5bd8' },
  { to: '/ai', label: 'AI Assistance', icon: 'bi-robot', c: '#6d3fd1' },
  { to: '/audio', label: 'Audio', icon: 'bi-volume-up-fill', c: '#f07a1a' },
  { to: '/presentations', label: 'PPT', icon: 'bi-easel-fill', c: '#e0453a' },
  { to: '/search', label: 'Search', icon: 'bi-search', c: '#1a9a5b' },
  { to: '/bookmarks', label: 'Bookmarks', icon: 'bi-bookmark-fill', c: '#13858f' },
  { to: '/pdfs', label: 'PDF Library', icon: 'bi-file-earmark-pdf-fill', c: '#c2410c' },
  { to: '/more', label: 'More', icon: 'bi-three-dots', c: '#2563eb' },
];

export function SearchBar({ initial = '', autoFocus = false, onSearch }) {
  const [q, setQ] = useState(initial);
  const navigate = useNavigate();
  useEffect(() => setQ(initial), [initial]);
  const go = (text) => {
    const v = (text ?? q).trim();
    if (!v) return;
    onSearch ? onSearch(v) : navigate(`/search?q=${encodeURIComponent(v)}`);
  };
  const voice = useVoiceInput((t) => { setQ(t); go(t); });
  return (
    <form className="ng-searchbar" onSubmit={(e) => { e.preventDefault(); go(); }} role="search">
      <i className="bi bi-search text-muted me-1" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search text, author, topic, Sanskrit word…')} aria-label={t('Search')} autoFocus={autoFocus} />
      {voice && (
        <button type="button" className={`ng-mic ${voice.listening ? 'listening' : ''}`} onClick={() => voice.start()} title={t('Voice search')} aria-label={t('Voice search')}>
          <i className="bi bi-mic-fill" />
        </button>
      )}
    </form>
  );
}

function ScalesArt() {
  return (
    <svg className="ng-hero-art" viewBox="0 0 160 150" aria-hidden="true">
      <g stroke="#e9b25f" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M80 20v92M38 34h84M38 34 22 72M38 34l16 38M122 34l-16 38M122 34l16 38" />
        <path d="M18 72a20 9 0 0 0 40 0zM102 72a20 9 0 0 0 40 0z" fill="#e9b25f" fillOpacity=".25" />
        <circle cx="80" cy="18" r="5" fill="#e9b25f" />
      </g>
      <g fill="#6b3d12" stroke="#2b1806" strokeWidth="1.5">
        <rect x="30" y="112" width="100" height="12" rx="2" fill="#7a2e12" />
        <rect x="36" y="124" width="88" height="11" rx="2" fill="#5b3a12" />
        <rect x="26" y="135" width="108" height="12" rx="2" fill="#8a1c1c" />
      </g>
    </svg>
  );
}

function QuoteCarousel({ quotes }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (quotes.length < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % quotes.length), 5000);
    return () => clearInterval(t);
  }, [quotes.length]);
  const q = quotes[i];
  if (!q) return null;
  return (
    <section className="ng-hero" aria-roledescription="carousel">
      <ScalesArt />
      <div className="ng-hero-text" key={q.id}>
        <div className="sanskrit">“{q.sanskrit}”</div>
        <p>{q.translation}</p>
        {q.source && <small>— {q.source}</small>}
      </div>
      <div className="ng-dots">
        {quotes.map((x, k) => <button key={x.id} className={k === i ? 'active' : ''} onClick={() => setI(k)} aria-label={`Quote ${k + 1}`} />)}
      </div>
    </section>
  );
}

export default function Home() {
  usePageTitle('');
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi('/home', [user?.id]);

  return (
    <>
      <div className="mb-3"><SearchBar /></div>
      {loading && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          <QuoteCarousel quotes={data.quotes} />

          <div className="ng-features my-4">
            {FEATURES.map((f) => (
              <Link key={f.to} to={f.to} className="ng-feature"><span className="tile" style={{ '--c': f.c }}><i className={`bi ${f.icon}`} /></span>{t(f.label)}</Link>
            ))}
          </div>

          {data.continueReading.length > 0 && (
            <>
              <div className="ng-section-title"><h2>{t('Continue Reading')}</h2><Link to="/profile">{t('View All')}</Link></div>
              <div className="row g-3">
                {data.continueReading.map((t) => <div className="col-md-6 col-xl-4" key={t.id}><TextCard text={t} progress={t.percent} /></div>)}
              </div>
            </>
          )}

          {!user && (
            <div className="ng-card mt-3 d-flex flex-wrap align-items-center gap-3" style={{ background: 'linear-gradient(135deg,#eef2ff,#fff7ed)' }}>
              <div className="flex-grow-1">
                <h6 className="mb-1 text-navy">{t('Create your free account')}</h6>
                <div className="small text-muted">{t('Track your reading, save bookmarks and notes, and ask the AI tutor.')}</div>
              </div>
              <Link to="/register" className="btn btn-saffron">{t('Sign up free')}</Link>
            </div>
          )}

          <div className="ng-section-title"><h2>{t('Featured Texts')}</h2><Link to="/library">{t('View All')}</Link></div>
          <div className="ng-hscroll">
            {data.featured.map((t) => <TextCard key={t.id} text={t} />)}
          </div>

          <div className="row g-3 mt-1">
            {data.wordOfDay && (
              <div className="col-md-6 d-flex flex-column">
                <div className="ng-section-title"><h2>{t('Term of the Day')}</h2><Link to="/dictionary">{t('Dictionary')}</Link></div>
                <div className="ng-card flex-grow-1">
                  <div className="d-flex align-items-baseline gap-2 flex-wrap">
                    <span className="sanskrit fs-3 text-saffron">{data.wordOfDay.term_devanagari}</span>
                    <span className="serif fst-italic fs-5">{data.wordOfDay.term}</span>
                    <span className="badge text-bg-light ms-auto">{data.wordOfDay.category}</span>
                  </div>
                  <p className="mb-2 mt-2">{data.wordOfDay[`meaning_${getLang()}`] || data.wordOfDay.meaning}</p>
                  {data.wordOfDay.definition && <p className="sanskrit small text-muted mb-2">{data.wordOfDay.definition}</p>}
                  {data.wordOfDay.slug && <Link to={`/dictionary/${data.wordOfDay.slug}`} className="small fw-semibold">{t('Open entry')} <i className="bi bi-arrow-right" /></Link>}
                </div>
              </div>
            )}
            <div className="col-md-6 d-flex flex-column">
              <div className="ng-section-title"><h2>{t('Live Classes & Webinars')}</h2><Link to="/events">{t('All events')}</Link></div>
              <div className="ng-card flex-grow-1">
                {data.events.length === 0 && <div className="text-muted small">{t('No upcoming events right now.')}</div>}
                {data.events.map((e) => (
                  <Link to="/events" key={e.id} className="d-flex gap-3 align-items-center py-2 border-bottom text-body">
                    <span className="ng-page-icon" style={{ width: 40, height: 40, fontSize: '1.1rem', background: e.kind === 'class' ? '#dc2626' : '#7c3aed' }}><i className="bi bi-camera-video" /></span>
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-semibold small">{e.title}</div>
                      <div className="text-muted" style={{ fontSize: '.78rem' }}>{fmtDateTime(e.starts_at)} · {e.speaker}</div>
                    </div>
                    {!!e.is_premium && <span className="ng-premium">{t('Members')}</span>}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {data.products?.length > 0 && (
            <>
              <div className="ng-section-title"><h2>{t('From the shop')}</h2><Link to="/shop">{t('View All')}</Link></div>
              <div className="row g-3">{data.products.map((p) => <div className="col-6 col-md-4 col-xl-2" key={p.id}><ProductCard p={p} /></div>)}</div>
            </>
          )}

          <div className="ng-card mt-4 d-flex justify-content-around">
            <div className="ng-stat"><b>{data.stats.texts}</b><span>{t('Texts')}</span></div>
            <div className="ng-stat"><b>{data.stats.sections}</b><span>{t('Sūtras & sections')}</span></div>
            <div className="ng-stat"><b>{data.stats.terms}</b><span>{t('Dictionary terms')}</span></div>
          </div>
        </>
      )}
    </>
  );
}
