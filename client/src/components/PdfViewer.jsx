import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n.jsx';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const GAP = 12; // px between pages
const PAD = 16; // px around the page column

/**
 * In-app PDF reader built on pdf.js: continuous scroll, page jump, zoom (fit width / fit page / %),
 * full screen and download. Works where the browser has no built-in PDF viewer (Android Chrome).
 * Pages are drawn only while near the viewport, so books with hundreds of pages stay light.
 */
/** `jumpTo` ({ page, n }) moves to a page whenever `n` changes; `onPageChange(page)` reports the page in view. */
export default function PdfViewer({ url, title = 'document', download = true, onDownload, height = 'calc(100vh - 190px)', jumpTo = null, onPageChange }) {
  const root = useRef(null);
  const scroller = useRef(null);
  const [doc, setDoc] = useState(null);
  const [base, setBase] = useState(null); // page 1 size at 100%
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(0);
  const [width, setWidth] = useState(0);
  const [boxHeight, setBoxHeight] = useState(0);
  const [mode, setMode] = useState('width'); // 'width' | 'page' | 'custom'
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [full, setFull] = useState(false);
  const scrollRatio = useRef(0);

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    let task = null;
    setDoc(null); setBase(null); setError(null); setLoaded(0); setPage(1); setPageInput('1');
    import('./pdfjs.js')
      .then(async ({ openPdf }) => {
        task = openPdf(url, (p) => !cancelled && setLoaded(p));
        const d = await task.promise;
        const v = (await d.getPage(1)).getViewport({ scale: 1 });
        if (cancelled) return;
        setBase({ w: v.width, h: v.height });
        setDoc(d);
      })
      .catch((e) => { if (!cancelled && e?.name !== 'AbortException') setError(e); });
    return () => { cancelled = true; task?.destroy(); };
  }, [url]);

  // Track the scroll box size for "fit" zoom modes.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => { setWidth(e.contentRect.width); setBoxHeight(e.contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Fit width, but no wider than a comfortable reading column on large screens.
  const fitWidth = base && width ? Math.min(width - PAD * 2, 1000) / base.w : 1;
  const fitPage = base && boxHeight ? Math.min(fitWidth, (boxHeight - PAD * 2) / base.h) : fitWidth;
  const scale = Math.max(0.25, Math.min(4, mode === 'width' ? fitWidth : mode === 'page' ? fitPage : zoom));

  // Keep the reading position when the zoom changes.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = scrollRatio.current * el.scrollHeight;
  }, [scale]);

  const pageEls = () => scroller.current?.querySelectorAll('[data-page]') ?? [];

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    scrollRatio.current = el.scrollHeight ? el.scrollTop / el.scrollHeight : 0;
    // The current page is the last one whose top is above the upper third of the view (binary search).
    const els = pageEls();
    const mark = el.scrollTop + el.clientHeight / 3;
    let lo = 0, hi = els.length - 1, cur = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (els[mid].offsetTop <= mark) { cur = mid; lo = mid + 1; } else hi = mid - 1;
    }
    setPage(cur + 1);
  }, []);
  useEffect(() => { setPageInput(String(page)); onPageChange?.(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (n) => {
    if (!doc) return;
    const p = Math.max(1, Math.min(doc.numPages, Number(n) || 1));
    const el = pageEls()[p - 1];
    if (el) scroller.current.scrollTop = el.offsetTop - PAD;
    setPage(p);
  };

  // Jumps requested from outside (e.g. the PDF's contents), once the document and its pages exist.
  useEffect(() => {
    if (doc && base && jumpTo?.page) requestAnimationFrame(() => goTo(jumpTo.page));
  }, [jumpTo?.n, doc, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = (dir) => {
    setZoom(dir > 0 ? ZOOMS.find((z) => z > scale + 0.01) ?? ZOOMS.at(-1) : [...ZOOMS].reverse().find((z) => z < scale - 0.01) ?? ZOOMS[0]);
    setMode('custom');
  };

  // Ctrl + mouse wheel / trackpad pinch zooms the document instead of the page.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(Math.max(0.25, Math.min(4, +(scale * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2))));
      setMode('custom');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale]);

  const onKey = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (['ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); goTo(page + 1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); goTo(page - 1); }
    if (e.key === 'Home') { e.preventDefault(); goTo(1); }
    if (e.key === 'End') { e.preventDefault(); goTo(doc?.numPages); }
    if (e.key === '+' || e.key === '=') zoomBy(1);
    if (e.key === '-') zoomBy(-1);
  };

  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen?.());
  const fileName = `${String(title).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'document'}.pdf`;
  const zoomValue = mode === 'custom' ? String(zoom) : mode;

  return (
    <div ref={root} className={`ng-pdfv ${full ? 'is-full' : ''}`} tabIndex={-1} onKeyDown={onKey}>
      <div className="ng-pdfv-bar" role="toolbar" aria-label={t('PDF controls')}>
        <div className="ng-pdfv-group">
          <button type="button" onClick={() => goTo(page - 1)} disabled={!doc || page <= 1} aria-label={t('Previous page')}><i className="bi bi-chevron-up" /></button>
          <button type="button" onClick={() => goTo(page + 1)} disabled={!doc || page >= (doc?.numPages || 1)} aria-label={t('Next page')}><i className="bi bi-chevron-down" /></button>
          <form className="ng-pdfv-page" onSubmit={(e) => { e.preventDefault(); goTo(pageInput); }}>
            <input value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))} onBlur={() => goTo(pageInput)} inputMode="numeric" aria-label={t('Page number')} disabled={!doc} />
            <span>/ {doc?.numPages ?? '–'}</span>
          </form>
        </div>
        <div className="ng-pdfv-group">
          <button type="button" onClick={() => zoomBy(-1)} disabled={!doc} aria-label={t('Zoom out')}><i className="bi bi-dash-lg" /></button>
          <select value={zoomValue} onChange={(e) => { const v = e.target.value; if (v === 'width' || v === 'page') setMode(v); else { setZoom(Number(v)); setMode('custom'); } }} disabled={!doc} aria-label={t('Zoom')}>
            <option value="width">{t('Fit width')}</option>
            <option value="page">{t('Fit page')}</option>
            {mode === 'custom' && !ZOOMS.includes(zoom) && <option value={String(zoom)}>{Math.round(zoom * 100)}%</option>}
            {ZOOMS.map((z) => <option key={z} value={String(z)}>{z * 100}%</option>)}
          </select>
          <button type="button" onClick={() => zoomBy(1)} disabled={!doc} aria-label={t('Zoom in')}><i className="bi bi-plus-lg" /></button>
        </div>
        <div className="ng-pdfv-group ms-auto">
          {download && <a href={url} download={fileName} onClick={onDownload} aria-label={t('Download')} title={t('Download')}><i className="bi bi-download" /></a>}
          <button type="button" onClick={toggleFull} aria-label={t(full ? 'Exit full screen' : 'Full screen')} title={t(full ? 'Exit full screen' : 'Full screen')}><i className={`bi ${full ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}`} /></button>
        </div>
      </div>

      <div ref={scroller} className="ng-pdfv-scroll" style={{ height: full ? undefined : height }} onScroll={onScroll}>
        {error && (
          <div className="ng-pdfv-msg">
            <i className="bi bi-file-earmark-x" />
            <div>{t('This PDF could not be opened.')}</div>
            <small>{error.message}</small>
            {download && <a href={url} className="btn btn-sm btn-light mt-2" target="_blank" rel="noreferrer">{t('Open the file directly')}</a>}
          </div>
        )}
        {!doc && !error && (
          <div className="ng-pdfv-msg">
            <div className="spinner-border text-light mb-2" role="status" />
            <div>{t('Opening PDF…')} {loaded > 0 && `${Math.round(loaded * 100)}%`}</div>
            {loaded > 0 && <div className="ng-pdfv-progress"><span style={{ width: `${loaded * 100}%` }} /></div>}
          </div>
        )}
        {doc && base && Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage key={i} doc={doc} n={i + 1} scale={scale} base={base} scroller={scroller} />
        ))}
      </div>
    </div>
  );
}

function PdfPage({ doc, n, scale, base, scroller }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState(null); // this page's own size at 100% (pages can differ)
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: scroller.current, rootMargin: '150% 0px' });
    io.observe(box.current);
    return () => io.disconnect();
  }, [scroller]);

  useEffect(() => {
    if (!near) {
      // Free the bitmap of pages far off screen.
      if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; }
      setDrawn(false);
      return undefined;
    }
    let task = null;
    let cancelled = false;
    doc.getPage(n).then((p) => {
      if (cancelled) return;
      const one = p.getViewport({ scale: 1 });
      setSize({ w: one.width, h: one.height });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: scale * dpr });
      // Draw off screen, then copy, so a zoom change swaps in the sharper page without a blank flash.
      const off = document.createElement('canvas');
      off.width = Math.floor(vp.width);
      off.height = Math.floor(vp.height);
      task = p.render({ canvasContext: off.getContext('2d'), viewport: vp });
      task.promise.then(() => {
        const c = canvas.current;
        if (cancelled || !c) return;
        c.width = off.width;
        c.height = off.height;
        c.getContext('2d').drawImage(off, 0, 0);
        off.width = 0;
        setDrawn(true);
      }).catch(() => {});
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [near, scale, doc, n]);

  const s = size || base;
  return (
    <div ref={box} data-page={n} className="ng-pdfv-page-box" style={{ width: s.w * scale, height: s.h * scale, marginBottom: GAP }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', opacity: drawn ? 1 : 0 }} />
      {!drawn && <span className="ng-pdfv-pnum">{n}</span>}
    </div>
  );
}
