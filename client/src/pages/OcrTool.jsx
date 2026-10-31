import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { devaToIast } from '@shared/translit.js';
import { PageHeader, toast } from '../components/ui.jsx';

const LANGS = [['san', 'Sanskrit (Devanagari)'], ['hin', 'Hindi'], ['san+eng', 'Sanskrit + English'], ['eng', 'English / IAST']];

export default function OcrTool() {
  const [image, setImage] = useState(null);
  const [lang, setLang] = useState('san');
  const [progress, setProgress] = useState(null);
  const [text, setText] = useState('');
  const navigate = useNavigate();

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Please choose an image (photo or scan).', 'error');
    setImage({ file: f, url: URL.createObjectURL(f) });
    setText('');
  };

  // OCR runs entirely in the browser with Tesseract.js; language data is downloaded on first use.
  const run = async () => {
    setProgress({ status: 'Loading OCR engine…', p: 0 });
    try {
      const { default: Tesseract } = await import('tesseract.js');
      const { data } = await Tesseract.recognize(image.file, lang, {
        logger: (m) => setProgress({ status: m.status, p: Math.round((m.progress || 0) * 100) }),
      });
      setText(data.text.trim());
      if (!data.text.trim()) toast('No text recognised — try a clearer, well-lit image.', 'error');
    } catch (e) {
      toast('OCR failed: ' + e.message, 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <PageHeader title="Sanskrit OCR Scanner" sanskrit="अक्षराभिज्ञानम्" icon="bi-camera" subtitle="Photograph or upload a page of a printed text or manuscript to digitise it. Processing happens on your device." />
      <div className="row g-3">
        <div className="col-lg-5">
          <div className="ng-card">
            <label className="btn btn-saffron w-100 mb-2">
              <i className="bi bi-camera me-1" />Take photo / choose image
              <input type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
            </label>
            <select className="form-select mb-2" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {image && <img src={image.url} alt="Selected page" className="img-fluid rounded border mb-2" />}
            <button className="btn btn-navy w-100" disabled={!image || !!progress} onClick={run}><i className="bi bi-magic me-1" />Recognise text</button>
            {progress && (
              <div className="mt-2">
                <div className="small text-muted text-capitalize">{progress.status}</div>
                <div className="progress" style={{ height: 6 }}><div className="progress-bar" style={{ width: `${progress.p}%` }} /></div>
              </div>
            )}
            <p className="small text-muted mt-2 mb-0">Tips: flat page, even light, fill the frame with the text. Printed Devanagari works best; handwritten manuscripts need manual correction.</p>
          </div>
        </div>
        <div className="col-lg-7">
          <div className="ng-card">
            <h6 className="text-navy">Recognised text (editable)</h6>
            <textarea className="form-control sanskrit mb-2" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="The recognised text will appear here." />
            {text && (
              <>
                <div className="small text-muted mb-1">IAST transliteration</div>
                <div className="ng-iast mb-3">{devaToIast(text)}</div>
                <div className="d-flex flex-wrap gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => { navigator.clipboard?.writeText(text); toast('Copied'); }}><i className="bi bi-clipboard" /> Copy</button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate(`/search?q=${encodeURIComponent(text.split(/\s+/).slice(0, 4).join(' '))}`)}><i className="bi bi-search" /> Find in library</button>
                  <Link className="btn btn-sm btn-outline-secondary" to="/tools/sloka" state={{ text }}><i className="bi bi-soundwave" /> Analyse metre</Link>
                  <Link className="btn btn-sm btn-outline-secondary" to="/ai" onClick={() => sessionStorage.setItem('ng_ai_prefill', text)}><i className="bi bi-robot" /> Ask AI</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
