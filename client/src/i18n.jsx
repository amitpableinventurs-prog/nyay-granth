// Interface language: English, Hindi, Sanskrit, Marathi, Gujarati.
// t('English text') looks the text up in i18n-dict.js and falls back to English when a translation is missing.
import { createContext, Fragment, useContext, useEffect, useRef, useState } from 'react';
import DICT from './i18n-dict.js';

export const LANGS = [
  { code: 'en', name: 'English', short: 'EN', locale: 'en-IN' },
  { code: 'hi', name: 'हिन्दी', short: 'हि', locale: 'hi-IN' },
  // Browsers ship no Sanskrit locale data, so dates and numbers use the Hindi locale.
  { code: 'sa', name: 'संस्कृतम्', short: 'सं', locale: 'hi-IN' },
  { code: 'mr', name: 'मराठी', short: 'म', locale: 'mr-IN' },
  { code: 'gu', name: 'ગુજરાતી', short: 'ગુ', locale: 'gu-IN' },
];
const COLUMN = { hi: 0, sa: 1, mr: 2, gu: 3 };
const STORE = 'ng_lang';

function initialLang() {
  try {
    const saved = localStorage.getItem(STORE);
    if (LANGS.some((l) => l.code === saved)) return saved;
  } catch { /* storage blocked */ }
  return 'en';
}

let current = initialLang();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLang = () => current;
export const langInfo = (code = current) => LANGS.find((l) => l.code === code);
export const locale = () => langInfo().locale;

export function t(text, vars) {
  let out = (current !== 'en' && DICT[text]?.[COLUMN[current]]) || text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return out;
}

/** A section's translation in the current language; `fallback` is true when English is shown instead. */
export function sectionTranslation(s, lang = current) {
  const own = lang === 'en' ? s.translation : s[`translation_${lang}`];
  return own ? { text: own, fallback: false } : { text: s.translation || '', fallback: !!s.translation };
}

const LangContext = createContext({ lang: current, setLang: () => {} });
export const useLang = () => useContext(LangContext);

/** Remounts the app below it when the language changes, so every t() call re-renders. */
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(current);
  const setLang = (code) => {
    current = code;
    document.documentElement.lang = code;
    try { localStorage.setItem(STORE, code); } catch { /* storage blocked */ }
    setLangState(code);
  };
  return <LangContext.Provider value={{ lang, setLang }}><Fragment key={lang}>{children}</Fragment></LangContext.Provider>;
}

/** Compact language picker for the app bar. */
export function LanguageMenu() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="ng-lang" ref={ref}>
      <button className="ng-icon-btn ng-lang-btn" onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open} aria-label={t('Language')} title={t('Language')}>
        <i className="bi bi-translate" /><span>{langInfo(lang).short}</span>
      </button>
      {open && (
        <div className="ng-lang-menu" role="menu">
          {LANGS.map((l) => (
            <button key={l.code} role="menuitemradio" aria-checked={l.code === lang} className={l.code === lang ? 'active' : ''} onClick={() => { setOpen(false); if (l.code !== lang) setLang(l.code); }}>
              {l.name}{l.code === lang && <i className="bi bi-check2 ms-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Row of language chips, used in the navigation drawer and the PDF toolbar. */
export function LanguageChips({ value, onChange }) {
  const ctx = useLang();
  const lang = value ?? ctx.lang;
  return (
    <div className="ng-chips" role="radiogroup" aria-label={t('Language')}>
      {LANGS.map((l) => (
        <button key={l.code} role="radio" aria-checked={l.code === lang} className={`ng-chip ${l.code === lang ? 'active' : ''}`} onClick={() => (onChange ? onChange(l.code) : l.code !== lang && ctx.setLang(l.code))}>{l.name}</button>
      ))}
    </div>
  );
}
