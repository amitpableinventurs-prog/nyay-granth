import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { get, post, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, ErrorBox, Empty, LockCard, usePageTitle, share, fmtDate } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

const PdfViewer = lazy(() => import('../components/PdfViewer.jsx'));

export const fmtSize = (b) => {
  if (!b) return '';
  const n = Number(b);
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

/** A book-shaped cover: the uploaded image (page 1 by default), or a generated PDF jacket. */
export function PdfCover({ pdf, className = '' }) {
  if (pdf.cover) return <img className={`ng-book-cover ${className}`} src={pdf.cover} alt="" loading="lazy" />;
  return (
    <div className={`ng-book-cover ng-book-cover-gen ${className}`} aria-hidden="true">
      <i className="bi bi-file-earmark-pdf" />
      <span>{pdf.title_sanskrit || pdf.title}</span>
    </div>
  );
}

export function PdfLibrary() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || '';
  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: true }); };
  const cats = useApi('/categories');
  const { data, error, loading, reload } = useApi('/pdfs' + qs({ q, category, sort }), [user?.id]);

  return (
    <>
      <PageHeader title="PDF Library" sanskrit="ग्रन्थसङ्ग्रहः" icon="bi-file-earmark-pdf" subtitle="Books, manuscripts and research papers to read online or download." />
      <div className="row g-2 mb-3">
        <div className="col-12 col-md-5">
          <div className="input-group">
            <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
            <input className="form-control" placeholder={t('Search by title or author…')} defaultValue={q} onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value)} onBlur={(e) => set('q', e.target.value)} />
          </div>
        </div>
        <div className="col-6 col-md-4">
          <select className="form-select" value={category} onChange={(e) => set('category', e.target.value)} aria-label={t('Category')}>
            <option value="">{t('All categories')}</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-3">
          <select className="form-select" value={sort} onChange={(e) => set('sort', e.target.value)} aria-label={t('Sort')}>
            <option value="">{t('Newest')}</option><option value="popular">{t('Most read')}</option><option value="title">{t('Title A–Z')}</option>
          </select>
        </div>
      </div>
      {loading && !data && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 && <Empty icon="bi-file-earmark-pdf" title={q || category ? 'No PDFs match these filters' : 'No PDFs yet'} />}
      <div className="ng-pdf-grid">
        {data?.map((p) => (
          <Link to={`/pdfs/${p.id}`} key={p.id} className="ng-pdf-card">
            <div className="ng-pdf-card-cover">
              <PdfCover pdf={p} />
              {!!p.is_premium && <span className="ng-premium ng-pdf-badge"><i className="bi bi-gem" /> {t('Premium')}</span>}
            </div>
            <div className="ng-pdf-card-body">
              <h6>{p.title}</h6>
              {p.author && <div className="small text-muted text-truncate">{p.author}</div>}
              <div className="ng-pdf-meta">
                {p.pages ? <span>{t('{n} pages', { n: p.pages })}</span> : null}
                {p.size ? <span>{fmtSize(p.size)}</span> : null}
                {p.category && <span>{p.category}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

export function PdfView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, error, loading } = useApi(`/pdfs/${id}`, [user?.id]);
  const [jump, setJump] = useState(() => ({ page: Number(params.get('page')) || null, n: 0 }));
  const [page, setPage] = useState(1);
  const [side, setSide] = useState(false); // contents panel on small screens
  usePageTitle(data?.title);

  const mode = params.get('mode') === 'text' ? 'text' : 'pdf';
  const sectionId = Number(params.get('s')) || null;
  const setQuery = (patch) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, String(v)) : p.delete(k));
    setParams(p, { replace: true });
  };

  const index = data?.index || [];
  const hasText = index.some((s) => s.word_count > 0);
  // The chapter/lesson the reader is in: the last entry starting on or before the current page.
  const current = useMemo(() => {
    if (mode === 'text') return index.find((s) => s.id === sectionId) || null;
    let cur = null;
    for (const s of index) if (s.page_start <= page) cur = s;
    return cur;
  }, [index, page, mode, sectionId]);

  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const p = data;
  const countDownload = () => post(`/pdfs/${p.id}/download`).catch(() => {});
  const goPage = (n) => { setQuery({ mode: null, s: null, page: n }); setJump((j) => ({ page: n, n: j.n + 1 })); setSide(false); };
  const openText = (sid) => { setQuery({ mode: 'text', s: sid, page: null }); setSide(false); window.scrollTo({ top: 0 }); };

  return (
    <>
      <div className="d-flex align-items-start gap-2 mb-3">
        <Link to="/pdfs" className="btn btn-sm btn-light mt-1" aria-label={t('Back')}><i className="bi bi-arrow-left" /></Link>
        <div className="flex-grow-1 min-w-0">
          <h1 className="h5 mb-0 text-navy">{p.title} {!!p.is_premium && <span className="ng-premium align-middle"><i className="bi bi-gem" /> {t('Premium')}</span>} {p.status && p.status !== 'published' && <span className="badge text-bg-secondary align-middle fw-normal"><i className="bi bi-lock me-1" />{t(p.status === 'pending' ? 'Awaiting review' : 'Internal')}</span>}</h1>
          {p.title_sanskrit && <div className="sanskrit text-saffron">{p.title_sanskrit}</div>}
          <div className="small text-muted">
            {[p.author, p.pages && t('{n} pages', { n: p.pages }), fmtSize(p.size), p.language].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => share({ title: p.title })} aria-label={t('Share')}><i className="bi bi-share" /></button>
      </div>

      <div className="ng-pdfread">
        <aside className={`ng-pdfread-side ${side ? 'open' : ''}`}>
          <PdfSidebar pdf={p} index={index} current={current} mode={mode} hasText={hasText} onPage={goPage} onText={openText} />
        </aside>
        <div className="ng-pdfread-main">
          <div className="ng-pdfread-bar">
            <button className="btn btn-sm btn-light d-lg-none" onClick={() => setSide((v) => !v)} aria-expanded={side}>
              <i className={`bi ${side ? 'bi-x-lg' : 'bi-list-nested'}`} /> {t('Contents & search')}
            </button>
            {current && <span className="ng-pdfread-where text-truncate"><i className="bi bi-bookmark" /> {current.title}</span>}
            {hasText && !p.locked && (
              <div className="ng-seg-pill ms-auto" role="tablist" aria-label={t('View')}>
                <button role="tab" aria-selected={mode === 'pdf'} className={mode === 'pdf' ? 'on' : ''} onClick={() => goPage(current?.page_start || page)}><i className="bi bi-file-earmark-pdf" /> PDF</button>
                <button role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'on' : ''} onClick={() => openText(current?.id || index.find((s) => s.word_count > 0)?.id)}><i className="bi bi-text-paragraph" /> {t('Text')}</button>
              </div>
            )}
          </div>

          {p.locked ? (
            <div className="row g-3 align-items-center">
              <div className="col-4 col-md-3"><PdfCover pdf={p} /></div>
              <div className="col-12 col-md-9"><LockCard what={t('This PDF')} /></div>
            </div>
          ) : mode === 'text' && sectionId ? (
            <SectionReader pdfId={p.id} sectionId={sectionId} onOpen={openText} onPage={goPage} partial={p.index_stats?.text_quality === 'partial'} />
          ) : (
            <Suspense fallback={<Loader />}>
              <PdfViewer url={p.file} title={p.title} download={!!p.is_downloadable} onDownload={countDownload} jumpTo={jump} onPageChange={setPage} />
            </Suspense>
          )}
        </div>
      </div>

      <div className="row g-3 mt-1">
        {p.description && <div className="col-lg-8"><div className="ng-card"><h6 className="text-navy">{t('About this PDF')}</h6><p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p></div></div>}
        <div className="col-lg-4">
          <div className="ng-card small">
            {p.category && <div className="mb-1"><i className="bi bi-tag me-1 text-muted" />{p.category}</div>}
            {p.text_title && <div className="mb-1"><i className="bi bi-book me-1 text-muted" /><Link to={`/text/${p.text_id}`}>{t('Read {title} in the library', { title: p.text_title })}</Link></div>}
            <div className="mb-1"><i className="bi bi-eye me-1 text-muted" />{t('{n} views', { n: p.views || 0 })}</div>
            {p.created_at && <div><i className="bi bi-calendar3 me-1 text-muted" />{t('Added {date}', { date: fmtDate(p.created_at) })}</div>}
          </div>
        </div>
      </div>
    </>
  );
}

/** Contents (chapters → lessons) and search inside the PDF. */
function PdfSidebar({ pdf, index, current, mode, hasText, onPage, onText }) {
  const [tab, setTab] = useState('contents');
  const chapters = index.filter((s) => !s.parent_id);
  // Short contents are shown in full; long ones open only the chapter being read.
  const [open, setOpen] = useState(() => new Set(index.length <= 40 ? chapters.map((c) => c.id) : []));
  const lessonsOf = (cid) => index.filter((s) => s.parent_id === cid);
  const currentChapter = current ? (current.parent_id || current.id) : null;
  useEffect(() => { if (currentChapter) setOpen((o) => (o.has(currentChapter) ? o : new Set(o).add(currentChapter))); }, [currentChapter]);
  const toggle = (cid) => setOpen((o) => { const n = new Set(o); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  const pick = (s) => (mode === 'text' && hasText ? onText(s.id) : onPage(s.page_start));
  const status = pdf.index_status;

  return (
    <div className="ng-pdfside">
      <div className="ng-pdfside-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'contents'} className={tab === 'contents' ? 'on' : ''} onClick={() => setTab('contents')}><i className="bi bi-list-nested" /> {t('Contents')}</button>
        <button role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')} disabled={!!pdf.locked}><i className="bi bi-search" /> {t('Search')}</button>
      </div>
      {tab === 'contents' ? (
        <div className="ng-pdfside-body">
          {['queued', 'processing'].includes(status) && <div className="ng-pdfside-note"><span className="spinner-border spinner-border-sm me-2" />{t('The contents are being prepared…')}</div>}
          {status === 'no_text' && <div className="ng-pdfside-note">{t('This PDF is a scan without a text layer, so it has no contents yet.')}</div>}
          {!index.length && !['queued', 'processing', 'no_text'].includes(status) && <div className="ng-pdfside-note">{t('No contents for this PDF.')}</div>}
          <ol className="ng-toc">
            {chapters.map((c) => {
              const lessons = lessonsOf(c.id);
              const isOpen = open.has(c.id);
              return (
                <li key={c.id}>
                  <div className={`ng-toc-row ch ${current?.id === c.id ? 'on' : ''}`}>
                    {lessons.length > 0
                      ? <button className="ng-toc-toggle" onClick={() => toggle(c.id)} aria-expanded={isOpen} aria-label={t(isOpen ? 'Collapse' : 'Expand')}><i className={`bi ${isOpen ? 'bi-chevron-down' : 'bi-chevron-right'}`} /></button>
                      : <span className="ng-toc-toggle" />}
                    <button className="ng-toc-title" onClick={() => pick(c)}>
                      <span className="text-start">{c.kind === 'front' ? t('Front matter') : c.title}</span>
                      <small>{c.page_start}</small>
                    </button>
                  </div>
                  {isOpen && lessons.length > 0 && (
                    <ol>
                      {lessons.map((l) => (
                        <li key={l.id}>
                          <button className={`ng-toc-row ng-toc-title ls ${current?.id === l.id ? 'on' : ''}`} onClick={() => pick(l)}>
                            <span className="text-start">{l.title}</span><small>{l.page_start}</small>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <PdfSearch pdfId={pdf.id} onPage={onPage} />
      )}
    </div>
  );
}

function PdfSearch({ pdfId, onPage }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try { setRes(await get(`/pdfs/${pdfId}/search?q=${encodeURIComponent(q.trim())}`)); } catch (err) { setRes({ error: err.message }); } finally { setBusy(false); }
  };
  return (
    <div className="ng-pdfside-body">
      <form onSubmit={run} className="input-group input-group-sm mb-2">
        <input className="form-control" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search inside this PDF…')} aria-label={t('Search inside this PDF…')} />
        <button className="btn btn-navy" disabled={busy}>{busy ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-search" />}</button>
      </form>
      {res?.error && <div className="small text-danger">{res.error}</div>}
      {res && !res.error && <div className="small text-muted mb-2">{t('{n} pages match', { n: res.total })}</div>}
      <div className="ng-pdfhits">
        {res?.hits?.map((h) => (
          <button key={h.page} onClick={() => onPage(h.page)}>
            <span className="ng-pdfhit-p">{t('p. {n}', { n: h.page })}</span>
            {h.section && <span className="ng-pdfhit-s">{h.section.title}</span>}
            <span className="ng-pdfhit-t">{h.snippet}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** One chapter or lesson as clean, readable text. */
function SectionReader({ pdfId, sectionId, onOpen, onPage, partial }) {
  const { data, error, loading } = useApi(`/pdfs/${pdfId}/sections/${sectionId}`);
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;
  const s = data.section;
  const paras = String(s.text || '').split(/\n{2,}/).filter(Boolean);
  return (
    <article className="ng-pdftext" style={{ opacity: loading ? 0.6 : 1 }}>
      {data.parent && <button className="ng-pdftext-crumb" onClick={() => onOpen(data.parent.id)}><i className="bi bi-arrow-up-short" />{data.parent.title}</button>}
      <h2>{s.kind === 'front' ? t('Front matter') : s.title}</h2>
      <div className="ng-pdftext-meta">
        {s.page_start === s.page_end ? t('p. {n}', { n: s.page_start }) : t('pp. {a}–{b}', { a: s.page_start, b: s.page_end })} · {t('{n} words', { n: s.word_count })}
        <button className="btn btn-link btn-sm p-0 ms-2" onClick={() => onPage(s.page_start)}><i className="bi bi-file-earmark-pdf" /> {t('View in PDF')}</button>
      </div>
      {partial && (
        <div className="ng-pdftext-note"><i className="bi bi-exclamation-triangle" /><span>{t("This PDF's font stores some letters without standard Unicode, so a few letters are missing from the text view. Use the PDF view for the exact text.")}</span></div>
      )}
      {data.lessons.length > 0 && (
        <div className="ng-pdftext-lessons">
          {data.lessons.map((l) => <button key={l.id} onClick={() => onOpen(l.id)}><i className="bi bi-journal-text" />{l.title}<small>{t('p. {n}', { n: l.page_start })}</small></button>)}
        </div>
      )}
      {paras.length === 0 && <p className="text-muted">{data.lessons.length ? t('This chapter continues in its lessons.') : t('No text was found in this part of the PDF.')}</p>}
      {paras.map((para, i) => (para.startsWith('### ') ? <h4 key={i}>{para.slice(4)}</h4> : <p key={i}>{para}</p>))}
      <nav className="ng-term-nav">
        {data.prev ? <button onClick={() => onOpen(data.prev.id)}><i className="bi bi-chevron-left" /><span><small>{t('Previous')}</small>{data.prev.title}</span></button> : <span />}
        {data.next ? <button className="text-end" onClick={() => onOpen(data.next.id)}><span><small>{t('Next')}</small>{data.next.title}</span><i className="bi bi-chevron-right" /></button> : <span />}
      </nav>
    </article>
  );
}
