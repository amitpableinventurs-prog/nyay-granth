import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { post, get } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Markdown, Loader, timeAgo, useVoiceInput } from '../components/ui.jsx';

const STORE = 'ng_ai_chat';
const loadChat = () => { try { return JSON.parse(sessionStorage.getItem(STORE)) || []; } catch { return []; } };

export default function AIAssistant() {
  const { user, refresh } = useAuth();
  const meta = useApi('/ai/modes', [user?.id]);
  // Text handed over from another tool (e.g. OCR) arrives via sessionStorage.
  const [input, setInput] = useState(() => { try { return sessionStorage.getItem('ng_ai_prefill') || ''; } catch { return ''; } });
  const [mode, setMode] = useState(input ? 'explain' : 'tutor');
  useEffect(() => { try { sessionStorage.removeItem('ng_ai_prefill'); } catch { /* ignore */ } }, []);
  const [chat, setChat] = useState(loadChat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(null);
  const endRef = useRef(null);
  const voice = useVoiceInput((t) => setInput((v) => (v ? v + ' ' : '') + t));

  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(chat.slice(-30))); } catch { /* ignore */ } endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat]);

  const modes = meta.data?.modes || {};
  const quota = meta.data?.quota;

  const send = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    const userMsg = { role: 'user', content: text, mode };
    setChat((c) => [...c, userMsg]);
    setInput('');
    try {
      // The tutor gets the running conversation; other modes are one-shot.
      const hist = mode === 'tutor' ? chat.filter((m) => m.mode === 'tutor').map(({ role, content }) => ({ role, content })) : [];
      const r = await post('/ai', { mode, input: text, history: hist });
      setChat((c) => [...c, { role: 'assistant', content: r.text, mode, source: r.source }]);
      meta.setData((d) => ({ ...d, quota: r.quota }));
      refresh();
    } catch (err) {
      setError(err);
      setChat((c) => c.slice(0, -1));
      setInput(text);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <>
        <PageHeader title="AI Assistance" sanskrit="सहायकः" icon="bi-robot" subtitle="Explanations, summaries, translations, Q&A, practice questions and a personal tutor for Nyāya studies." />
        <div className="ng-card text-center py-5">
          <i className="bi bi-robot display-4 text-navy" />
          <h5 className="mt-3">Log in to use the AI scholar</h5>
          <p className="text-muted">Free accounts get {5} AI requests per day.</p>
          <Link to="/login" className="btn btn-navy me-2">Login</Link><Link to="/register" className="btn btn-outline-secondary">Create account</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="AI Assistance" sanskrit="सहायकः" icon="bi-robot" subtitle={modes[mode]?.hint}>
        {quota && <span className="badge text-bg-light border align-self-center">{quota.left === null ? 'Unlimited' : `${quota.left}/${quota.quota} left today`}</span>}
      </PageHeader>
      {meta.data && !meta.data.configured && (
        <div className="alert alert-info small py-2"><i className="bi bi-info-circle me-1" />The AI service key is not configured yet, so answers come from the offline dictionary and library. Add <code>OPENAI_API_KEY</code> in <code>server/.env</code> to enable full AI responses.</div>
      )}
      <div className="row g-3">
        <div className="col-lg-3">
          <div className="d-grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {Object.entries(modes).map(([k, m]) => (
              <button key={k} className={`ng-mode ${mode === k ? 'active' : ''}`} onClick={() => setMode(k)}><i className={`bi ${m.icon}`} />{m.label}</button>
            ))}
          </div>
          <button className="btn btn-sm btn-link mt-2 px-0" onClick={async () => setHistory(await get('/ai/history'))}><i className="bi bi-clock-history" /> My recent AI history</button>
        </div>
        <div className="col-lg-9">
          <div className="ng-card" style={{ minHeight: 360 }}>
            {chat.length === 0 && (
              <div className="text-center text-muted py-4">
                <i className="bi bi-stars fs-1 text-saffron" />
                <p className="mt-2 mb-3">Try one of these:</p>
                <div className="d-flex flex-wrap justify-content-center gap-2">
                  {['What is the difference between vyāpti and parāmarśa?', 'Explain प्रत्यक्षानुमानोपमानशब्दाः प्रमाणानि', 'I am a beginner with basic Sanskrit. Plan my Nyāya studies.', 'Why does Nyāya accept abhāva as a category?'].map((s) => (
                    <button key={s} className="ng-chip" style={{ whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setInput(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="ng-chat">
              {chat.map((m, i) => (
                <div key={i} className={`ng-msg ${m.role === 'user' ? 'ng-msg-user' : 'ng-msg-ai'}`}>
                  {m.role === 'user' ? m.content : <><Markdown text={m.content} /><div className="small text-muted mt-1"><i className={`bi ${modes[m.mode]?.icon || 'bi-robot'}`} /> {modes[m.mode]?.label}{m.source === 'offline' ? ' · offline' : ''}</div></>}
                </div>
              ))}
              {busy && <div className="ng-msg ng-msg-ai"><Loader label="Thinking…" /></div>}
              <div ref={endRef} />
            </div>
          </div>
          {error && <div className="alert alert-warning mt-2 small">{error.message} {error.data?.upgrade && <Link to="/plans">Upgrade →</Link>}</div>}
          <form onSubmit={send} className="mt-2 d-flex gap-2 align-items-end">
            <textarea className="form-control" rows={2} placeholder={`${modes[mode]?.label || 'Ask'}: type or paste text…`} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} aria-label="Message" />
            {voice && <button type="button" className={`btn btn-outline-secondary ${voice.listening ? 'text-danger' : ''}`} onClick={() => voice.start()} aria-label="Voice input"><i className="bi bi-mic" /></button>}
            <button className="btn btn-navy" disabled={busy || !input.trim()} aria-label="Send"><i className="bi bi-send" /></button>
          </form>
          {chat.length > 0 && <button className="btn btn-sm btn-link px-0 mt-1 text-muted" onClick={() => setChat([])}>Clear conversation</button>}
          <div className="small text-muted mt-1">AI output can contain mistakes — verify important points against the texts.</div>
        </div>
      </div>

      {history && (
        <div className="ng-card mt-3">
          <div className="d-flex justify-content-between"><h6 className="text-navy">Recent AI history</h6><button className="btn-close" onClick={() => setHistory(null)} aria-label="Close" /></div>
          {history.length === 0 && <div className="small text-muted">No history yet.</div>}
          {history.map((h) => (
            <details key={h.id} className="border-top py-2">
              <summary className="small"><strong>{modes[h.mode]?.label || h.mode}</strong> · {h.prompt.slice(0, 90)} <span className="text-muted">· {timeAgo(h.created_at)}</span></summary>
              <Markdown text={h.response} className="small mt-2" />
            </details>
          ))}
        </div>
      )}
    </>
  );
}
