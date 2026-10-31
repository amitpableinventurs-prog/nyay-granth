import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { analyzeVerse, devaToIast, iastToDeva, hasDevanagari } from '@shared/translit.js';
import { TEMPLATES, citations } from '@shared/research.js';
import { PageHeader, toast, useVoiceInput, speak } from '../components/ui.jsx';

const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copied'));

// ---------------- Śloka Analyzer ----------------
export function SlokaTool() {
  const location = useLocation();
  const [verse, setVerse] = useState(location.state?.text || 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।\nमामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥');
  const result = useMemo(() => analyzeVerse(verse), [verse]);
  return (
    <>
      <PageHeader title="Śloka Analyzer" sanskrit="छन्दोविश्लेषकः" icon="bi-soundwave" subtitle="Scan a verse into laghu (⏑) and guru (—) syllables, see the gaṇas, and identify the metre." />
      <div className="row g-3">
        <div className="col-lg-5">
          <div className="ng-card">
            <textarea className="form-control sanskrit" rows={6} value={verse} onChange={(e) => setVerse(e.target.value)} placeholder="Paste a verse in Devanagari or IAST; separate pādas with lines or dandas (। ॥)" />
            <div className="small text-muted mt-2">Rules: a syllable is guru if its vowel is long (ā ī ū ṝ e ai o au), it ends in anusvāra/visarga, or it is followed by a conjunct consonant. The final syllable of a pāda is free (anceps).</div>
            <div className="d-flex flex-wrap gap-2 mt-2">
              {[
                ['Anuṣṭubh', 'निधाय हृदि विश्वेशं विधाय गुरुवन्दनम् ।\nबालानां सुखबोधाय क्रियते तर्कसंग्रहः ॥'],
                ['Mandākrāntā', 'कश्चित्कान्ताविरहगुरुणा स्वाधिकारात्प्रमत्तः'],
                ['Vasantatilakā', 'वन्दे मुकुन्दमरविन्ददलायताक्षम्'],
              ].map(([n, v]) => <button key={n} className="ng-chip" onClick={() => setVerse(v)}>{n} example</button>)}
            </div>
          </div>
        </div>
        <div className="col-lg-7">
          {result && (
            <div className="ng-card">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <h5 className="mb-0 text-navy">{result.metre}</h5>
                <span className="badge text-bg-light">{result.padas.length} pāda{result.padas.length === 1 ? '' : 's'} · {result.totalSyllables} syllables</span>
              </div>
              {result.note && <div className="small text-muted mt-1">{result.note}</div>}
              {result.padas.map((p, i) => (
                <div key={i} className="border-top mt-3 pt-2">
                  <div className="small text-muted mb-1">Pāda {i + 1} · {p.count} syllables · gaṇas: <strong>{p.ganas.join(' ')}</strong></div>
                  <div>
                    {p.syllables.map((s, k) => (
                      <span key={k} className={`ng-syl ${s.weight}`}><b>{s.weight === 'G' ? '—' : '⏑'}</b><span>{s.text}</span></span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------- Transliterator & Voice-to-Text Sanskrit input ----------------
export function TranslitTool() {
  const [deva, setDeva] = useState('प्रत्यक्षानुमानोपमानशब्दाः प्रमाणानि');
  const [iast, setIast] = useState(devaToIast('प्रत्यक्षानुमानोपमानशब्दाः प्रमाणानि'));
  const voice = useVoiceInput((t) => {
    const d = hasDevanagari(t) ? t : iastToDeva(t);
    setDeva((v) => (v ? v + ' ' : '') + d);
    setIast((v) => (v ? v + ' ' : '') + devaToIast(d));
  }, 'hi-IN');
  return (
    <>
      <PageHeader title="Voice & Script Input" sanskrit="लिप्यन्तरणम्" icon="bi-mic" subtitle="Convert between Devanagari and IAST as you type, or dictate Sanskrit with your voice." />
      <div className="row g-3">
        <div className="col-md-6">
          <div className="ng-card">
            <div className="d-flex align-items-center mb-2"><h6 className="mb-0 text-navy flex-grow-1">Devanagari</h6>
              <button className="btn btn-sm btn-light" onClick={() => speak(deva)} aria-label="Listen"><i className="bi bi-volume-up" /></button>
              <button className="btn btn-sm btn-light" onClick={() => copy(deva)} aria-label="Copy"><i className="bi bi-clipboard" /></button>
            </div>
            <textarea className="form-control sanskrit fs-5" rows={6} value={deva} onChange={(e) => { setDeva(e.target.value); setIast(devaToIast(e.target.value)); }} />
          </div>
        </div>
        <div className="col-md-6">
          <div className="ng-card">
            <div className="d-flex align-items-center mb-2"><h6 className="mb-0 text-navy flex-grow-1">IAST (type ā ī ū ṛ ṃ ḥ ś ṣ ṇ ṭ ḍ ñ ṅ)</h6>
              <button className="btn btn-sm btn-light" onClick={() => copy(iast)} aria-label="Copy"><i className="bi bi-clipboard" /></button>
            </div>
            <textarea className="form-control serif fs-5" rows={6} value={iast} onChange={(e) => { setIast(e.target.value); setDeva(iastToDeva(e.target.value)); }} />
            <div className="d-flex flex-wrap gap-1 mt-2">
              {['ā', 'ī', 'ū', 'ṛ', 'ṝ', 'ḷ', 'ṃ', 'ḥ', 'ṅ', 'ñ', 'ṭ', 'ḍ', 'ṇ', 'ś', 'ṣ'].map((c) => (
                <button key={c} className="btn btn-sm btn-light border" onClick={() => { const v = iast + c; setIast(v); setDeva(iastToDeva(v)); }}>{c}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="ng-card mt-3 d-flex align-items-center gap-3 flex-wrap">
        {voice ? (
          <>
            <button className={`btn ${voice.listening ? 'btn-danger' : 'btn-saffron'}`} onClick={() => voice.start('hi-IN')}><i className="bi bi-mic-fill me-1" />{voice.listening ? 'Listening…' : 'Dictate Sanskrit'}</button>
            <span className="small text-muted">Speak clearly; the browser's Hindi recogniser produces Devanagari which is converted to IAST automatically. Review the result — speech recognition is not trained on classical Sanskrit.</span>
          </>
        ) : <span className="small text-muted">Voice input is not supported in this browser — try Chrome or Edge.</span>}
      </div>
    </>
  );
}

// ---------------- Citation Generator ----------------
export function CitationTool() {
  const [f, setF] = useState({ author: 'Gautama', title: 'Nyāya Sūtra', translator: '', editor: '', publisher: 'Nyāya Grantha Sarvasvam', city: '', year: String(new Date().getFullYear()), edition: '', pages: '', url: window.location.origin, accessed: new Date().toISOString().slice(0, 10) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cites = citations(f);
  const render = (s) => s.split('*').map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part));
  const fields = [['author', 'Author'], ['title', 'Title'], ['translator', 'Translator'], ['editor', 'Editor'], ['publisher', 'Publisher'], ['city', 'City'], ['year', 'Year'], ['edition', 'Edition'], ['pages', 'Pages'], ['url', 'URL'], ['accessed', 'Accessed']];
  return (
    <>
      <PageHeader title="Citation Generator" sanskrit="उद्धरणम्" icon="bi-quote" subtitle="Generate MLA, APA and Chicago citations for texts and translations." />
      <div className="row g-3">
        <div className="col-lg-5">
          <div className="ng-card">
            <div className="row g-2">
              {fields.map(([k, l]) => (
                <div className={['author', 'title', 'url'].includes(k) ? 'col-12' : 'col-6'} key={k}>
                  <label className="form-label small mb-0">{l}</label>
                  <input className="form-control form-control-sm" type={k === 'accessed' ? 'date' : 'text'} value={f[k]} onChange={set(k)} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="col-lg-7">
          {Object.entries(cites).map(([style, c]) => (
            <div className="ng-card mb-3" key={style}>
              <div className="d-flex align-items-center mb-1"><h6 className="mb-0 text-navy flex-grow-1">{style}</h6><button className="btn btn-sm btn-light" onClick={() => copy(c.replace(/\*/g, ''))}><i className="bi bi-clipboard" /> Copy</button></div>
              <p className="mb-0 serif" style={{ paddingLeft: '2em', textIndent: '-2em' }}>{render(c)}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------- Research Paper Templates ----------------

export function TemplatesTool() {
  const download = (t) => {
    const url = URL.createObjectURL(new Blob([t.body], { type: 'text/markdown' }));
    Object.assign(document.createElement('a'), { href: url, download: t.name.toLowerCase().replace(/[^a-z]+/g, '-') + '.md' }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageHeader title="Research Paper Templates" sanskrit="शोधपत्रप्रारूपाणि" icon="bi-file-earmark-text" subtitle="Structured starting points for articles, translations and theses on Nyāya." />
      <div className="row g-3">
        {TEMPLATES.map((t) => (
          <div className="col-md-6" key={t.name}>
            <div className="ng-card h-100 d-flex flex-column">
              <div className="d-flex align-items-center gap-2 mb-2"><i className={`bi ${t.icon} fs-4 text-saffron`} /><h6 className="mb-0 text-navy">{t.name}</h6></div>
              <pre className="small bg-light p-2 rounded flex-grow-1" style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{t.body}</pre>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-navy" onClick={() => download(t)}><i className="bi bi-download" /> Download</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => copy(t.body)}><i className="bi bi-clipboard" /> Copy</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
