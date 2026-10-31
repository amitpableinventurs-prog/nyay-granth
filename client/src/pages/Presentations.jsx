import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, ErrorBox, Empty, Markdown, LockCard, usePageTitle, share } from '../components/ui.jsx';

const PdfViewer = lazy(() => import('../components/PdfViewer.jsx'));

export const splitSlides = (s) => String(s || '').split(/\r?\n-{3,}\r?\n/).map((x) => x.trim()).filter(Boolean);

export function Presentations() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi('/presentations', [user?.id]);
  return (
    <>
      <PageHeader title="PPT Viewer" sanskrit="प्रस्तुतिः" icon="bi-easel" subtitle="Presentations, charts and study slides." />
      {loading && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 && <Empty icon="bi-easel" title="No presentations yet" />}
      <div className="row g-3">
        {data?.map((p) => {
          const first = splitSlides(p.slides)[0] || '';
          return (
            <div className="col-md-6 col-xl-4" key={p.id}>
              <Link to={`/presentations/${p.id}`} className="d-block text-body">
                <div className="ng-slide mb-2" style={{ padding: 18 }}>
                  <h4 style={{ fontSize: '1.15rem' }}>{first.split('\n')[0].replace(/^#\s*/, '') || p.title}</h4>
                  <div className="small opacity-75">{splitSlides(p.slides).length} slides{p.file ? ' · attachment' : ''}</div>
                  {!!p.is_premium && <span className="ng-premium position-absolute" style={{ top: 12, right: 12 }}><i className="bi bi-gem" /> Premium</span>}
                </div>
                <div className="fw-semibold">{p.title}</div>
                <div className="small text-muted">{p.description}</div>
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function PresentationView() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading } = useApi(`/presentations/${id}`, [user?.id]);
  const [i, setI] = useState(0);
  const stage = useRef(null);
  usePageTitle(data?.title);
  const slides = splitSlides(data?.slides);

  useEffect(() => {
    const onKey = (e) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) setI((x) => Math.min(slides.length - 1, x + 1));
      if (['ArrowLeft', 'PageUp'].includes(e.key)) setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length]);

  // Swipe between slides on touch screens.
  const touchX = useRef(null);
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) setI((x) => Math.max(0, Math.min(slides.length - 1, x + (dx < 0 ? 1 : -1))));
    touchX.current = null;
  };

  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const isPdf = data.file && /\.pdf$/i.test(data.file);

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3">
        <Link to="/presentations" className="btn btn-sm btn-light"><i className="bi bi-arrow-left" /></Link>
        <div className="flex-grow-1"><h1 className="h5 mb-0 text-navy">{data.title}</h1>{data.text_title && <small className="text-muted">{data.text_title}</small>}</div>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => share({ title: data.title })}><i className="bi bi-share" /></button>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => stage.current?.requestFullscreen?.()} title="Full screen"><i className="bi bi-fullscreen" /></button>
      </div>
      {slides.length > 0 && (
        <>
          <div ref={stage} className="ng-slide" onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd} onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))}>
            <Markdown text={slides[i]} />
            <span className="ng-slide-num">{i + 1} / {slides.length}</span>
          </div>
          <div className="d-flex justify-content-between align-items-center mt-2">
            <button className="btn btn-light" disabled={i === 0} onClick={() => setI(i - 1)}><i className="bi bi-chevron-left" /> Prev</button>
            <div className="d-flex gap-1">{slides.map((_, k) => <button key={k} className={`btn btn-sm p-0 rounded-circle ${k === i ? 'btn-navy' : 'btn-light border'}`} style={{ width: 10, height: 10 }} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} />)}</div>
            <button className="btn btn-light" disabled={i >= slides.length - 1} onClick={() => setI(i + 1)}>Next <i className="bi bi-chevron-right" /></button>
          </div>
        </>
      )}
      {data.locked && <div className="mt-3"><LockCard what="The full presentation" /></div>}
      {data.file && !data.locked && (
        <div className="ng-card mt-3">
          <h6 className="text-navy">Attachment</h6>
          {isPdf
            ? <Suspense fallback={<Loader />}><PdfViewer url={data.file} title={data.title} height="70vh" /></Suspense>
            : <a href={data.file} className="btn btn-sm btn-outline-secondary" download><i className="bi bi-download" /> Download file</a>}
        </div>
      )}
      {data.description && <p className="mt-3 text-muted">{data.description}</p>}
    </>
  );
}
