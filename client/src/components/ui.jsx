import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, getToken } from '../api.js';
import { t, locale } from '../i18n.jsx';

/** Fetch JSON from the API on mount / when deps change. */
// Last response per path and login. A page opened again shows it at once while a fresh copy loads in the background.
const apiCache = new Map();
const CACHE_SIZE = 80;
const cacheKey = (path) => `${getToken() || ''} ${path}`;
const remember = (key, data) => {
  apiCache.delete(key);
  apiCache.set(key, data);
  if (apiCache.size > CACHE_SIZE) apiCache.delete(apiCache.keys().next().value);
};

export function useApi(path, deps = []) {
  const [state, setState] = useState(() => {
    const hit = path ? apiCache.get(cacheKey(path)) : undefined;
    return hit !== undefined ? { data: hit, error: null, loading: false } : { data: null, error: null, loading: true };
  });
  const load = useCallback(async () => {
    if (!path) return setState({ data: null, error: null, loading: false });
    const key = cacheKey(path);
    const hit = apiCache.get(key);
    setState((s) => (hit !== undefined ? { data: hit, error: null, loading: false } : { ...s, loading: true, error: null }));
    try {
      const data = await get(path);
      remember(key, data);
      setState({ data, error: null, loading: false });
    } catch (e) {
      apiCache.delete(key);
      setState({ data: null, error: e, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  const setData = (d) => setState((s) => {
    const data = typeof d === 'function' ? d(s.data) : d;
    if (path) remember(cacheKey(path), data);
    return { ...s, data };
  });
  return { ...state, reload: load, setData };
}

export function usePageTitle(title) {
  useEffect(() => { document.title = title ? `${title} · Nyāya Grantha Sarvasvam` : 'Nyāya Grantha Sarvasvam'; }, [title]);
}

export const Loader = ({ label = t('Loading…') }) => (
  <div className="ng-loader" role="status"><span className="spinner-border spinner-border-sm me-2" />{label}</div>
);

export const ErrorBox = ({ error, onRetry }) => error ? (
  <div className="alert alert-danger d-flex align-items-center gap-2">
    <i className="bi bi-exclamation-triangle" /> <span className="flex-grow-1">{error.message || String(error)}</span>
    {onRetry && <button className="btn btn-sm btn-outline-danger" onClick={onRetry}>{t('Retry')}</button>}
  </div>
) : null;

export const Empty = ({ icon = 'bi-inbox', title, children }) => (
  <div className="ng-empty"><i className={`bi ${icon}`} /><h6>{t(title)}</h6>{children && <div className="text-muted small">{children}</div>}</div>
);

export function PageHeader({ title: englishTitle, sanskrit, subtitle, icon, children }) {
  const title = t(englishTitle);
  usePageTitle(title);
  return (
    <div className="ng-page-header">
      <div className="d-flex align-items-start gap-3">
        {icon && <span className="ng-page-icon"><i className={`bi ${icon}`} /></span>}
        <div className="flex-grow-1">
          <h1>{title} {sanskrit && <span className="sanskrit ng-page-sanskrit">{sanskrit}</span>}</h1>
          {subtitle && <p>{t(subtitle)}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Safe markdown subset (input is escaped first): headings, bold, italic, code, lists, paragraphs. */
export function mdToHtml(text) {
  const inline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])[*_](?!\s)(.+?)(?<!\s)[*_](?![*\w])/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  let html = '';
  let list = null;
  let para = [];
  const flush = () => { if (para.length) html += `<p>${inline(para.join('<br>'))}</p>`; para = []; };
  const close = () => { if (list) html += `</${list}>`; list = null; };
  for (const raw of escapeHtml(text).split(/\r?\n/)) {
    const t = raw.trim();
    let m;
    if (!t) { flush(); close(); } else if ((m = t.match(/^(#{1,4})\s+(.*)$/))) {
      flush(); close();
      const lvl = Math.min(6, m[1].length + 3);
      html += `<h${lvl}>${inline(m[2])}</h${lvl}>`;
    } else if ((m = t.match(/^(?:[-*•]|(\d+)[.)])\s+(.*)$/))) {
      flush();
      const type = m[1] ? 'ol' : 'ul';
      if (list !== type) { close(); html += `<${type}>`; list = type; }
      html += `<li>${inline(m[2])}</li>`;
    } else { close(); para.push(t); }
  }
  flush(); close();
  return html;
}

export const Markdown = ({ text, className = '' }) => <div className={`ng-md ${className}`} dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />;

export function TextCover({ text, size = 'md' }) {
  if (text.cover) return <img className={`ng-cover ng-cover-${size}`} src={text.cover} alt="" loading="lazy" />;
  return (
    <div className={`ng-cover ng-cover-${size} ng-cover-generated`} style={{ '--cover': text.cover_color || '#7a2e12' }} aria-hidden="true">
      <span className="sanskrit">{text.title_sanskrit || text.title}</span>
      <small>{(text.author || '').split('(')[0]}</small>
    </div>
  );
}

export function TextCard({ text, progress }) {
  return (
    <Link to={`/text/${text.id}`} className="ng-text-card">
      <TextCover text={text} />
      <div className="ng-text-card-body">
        <div className="d-flex align-items-center gap-1 mb-1">
          <span className={`ng-era ng-era-${text.era}`}>{eraLabel(text.era)}</span>
          {!!text.is_premium && <span className="ng-premium"><i className="bi bi-gem" /> {t('Premium')}</span>}
        </div>
        <h6>{text.title}</h6>
        <div className="small text-muted">{text.author}</div>
        {progress !== undefined && (
          <div className="d-flex align-items-center gap-2 mt-2">
            <div className="progress flex-grow-1" style={{ height: 5 }}><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
            <small className="text-muted">{progress}%</small>
          </div>
        )}
      </div>
    </Link>
  );
}

export const eraLabel = (e) => t({ ancient: 'Ancient', medieval: 'Medieval', contemporary: 'Contemporary' }[e] || e);

export function LockCard({ what = t('This content') }) {
  return (
    <div className="ng-lock">
      <i className="bi bi-lock-fill" />
      <div>
        <h6 className="mb-1">{t('{what} is for members', { what })}</h6>
        <p className="mb-2 small">{t('Upgrade to a Scholar membership to unlock premium texts, audio, presentations and extended AI assistance.')}</p>
        <Link to="/plans" className="btn btn-sm btn-saffron"><i className="bi bi-gem me-1" />{t('View membership plans')}</Link>
      </div>
    </div>
  );
}

export function Modal({ show, title, onClose, children, size = '', footer }) {
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [show, onClose]);
  if (!show) return null;
  return (
    <div className="ng-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`ng-modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ng-modal-head"><h5>{title}</h5><button className="btn-close" onClick={onClose} aria-label="Close" /></div>
        <div className="ng-modal-body">{children}</div>
        {footer && <div className="ng-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Toasts ----
let pushToast = () => {};
export const toast = (msg, type = 'success') => pushToast({ msg, type, id: Math.random() });

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    pushToast = (t) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 3500);
    };
  }, []);
  return (
    <div className="ng-toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`ng-toast ng-toast-${t.type}`}>{t.msg}</div>)}
    </div>
  );
}

// ---- Share, speech, formatting ----
export async function share({ title, text, url }) {
  const shareUrl = url || window.location.href;
  if (navigator.share) {
    try { await navigator.share({ title, text, url: shareUrl }); return; } catch { return; }
  }
  try {
    await navigator.clipboard.writeText(`${text ? text + '\n' : ''}${shareUrl}`);
    toast(t('Link copied to clipboard'));
  } catch {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n${shareUrl}`)}`, '_blank');
  }
}

export function speak(text, lang = 'hi-IN', { queue = false, onEnd } = {}) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return toast('Text-to-speech is not supported in this browser.', 'error'); }
  if (!queue) window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.85;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === lang) || window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}
export const stopSpeaking = () => window.speechSynthesis?.cancel();

export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => d ? new Date(String(d).replace(' ', 'T')).toLocaleDateString(locale(), opts) : '';
export const fmtDateTime = (d) => {
  if (!d) return '';
  const date = new Date(String(d).replace(' ', 'T'));
  // The year is shown only when it is not the current one (e.g. an annual membership's end date).
  return date.toLocaleString(locale(), { day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }), hour: 'numeric', minute: '2-digit' });
};
export const money = (n, currency = 'INR') => (currency === 'INR' ? '₹' : currency + ' ') + Number(n).toLocaleString('en-IN');

export function timeAgo(d) {
  if (!d) return '';
  const s = (Date.now() - new Date(String(d).replace(' ', 'T')).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (s < 60) return rtf.format(0, 'second');
  for (const [sec, unit] of [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]) {
    if (s >= sec) return rtf.format(-Math.floor(s / sec), unit);
  }
  return '';
}

export const initials = (name = '?') => name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function Avatar({ user, size = 40 }) {
  return user?.avatar
    ? <img src={user.avatar} alt="" className="ng-avatar" style={{ width: size, height: size }} />
    : <span className="ng-avatar ng-avatar-initials" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(user?.name)}</span>;
}

/** Voice input via the Web Speech API. Returns null when unsupported. */
export function useVoiceInput(onText, lang = 'en-IN') {
  const [listening, setListening] = useState(false);
  const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!Rec) return null;
  const start = (langOverride) => {
    const rec = new Rec();
    rec.lang = langOverride || lang;
    rec.interimResults = false;
    rec.onresult = (e) => onText(e.results[0][0].transcript);
    rec.onerror = (e) => { if (e.error !== 'aborted') toast(`Voice input: ${e.error}`, 'error'); };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };
  return { listening, start };
}
