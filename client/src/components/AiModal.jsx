import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, Markdown, Loader } from './ui.jsx';

const TITLES = { explain: 'AI Explanation', summarize: 'AI Summary', translate: 'AI Translation', questions: 'Practice Questions' };
const PROMPTS = {
  explain: 'Explain this passage.',
  summarize: 'Summarize this passage.',
  translate: 'Translate this passage with a word-by-word gloss.',
  questions: 'Generate study questions on this passage.',
};

/** Runs an AI task on a reader section and shows the result. */
export default function AiModal({ request, onClose }) {
  const { user, refresh } = useAuth();
  const [state, setState] = useState({ loading: false, text: '', error: null });
  const started = useRef(null);

  useEffect(() => {
    // Guard against duplicate runs (StrictMode re-invokes effects) — each request costs AI quota.
    if (!request || !user || started.current === request) return;
    started.current = request;
    setState({ loading: true, text: '', error: null });
    post('/ai', { mode: request.mode, input: PROMPTS[request.mode], section_id: request.section.id })
      .then((r) => { setState({ loading: false, text: r.text, error: null }); refresh(); })
      .catch((e) => setState({ loading: false, text: '', error: e }));
  }, [request, user, refresh]);

  return (
    <Modal show={!!request} title={request ? `${TITLES[request.mode]} · ${request.section.ref || ''}` : ''} onClose={onClose} size="lg">
      {!user && <div className="text-center py-3"><p>Please log in to use AI Assistance.</p><Link to="/login" className="btn btn-navy">Login</Link></div>}
      {state.loading && <Loader label="Consulting the AI scholar…" />}
      {state.error && (
        <div className="alert alert-warning">
          {state.error.message} {state.error.data?.upgrade && <Link to="/plans">Upgrade membership →</Link>}
        </div>
      )}
      {state.text && <Markdown text={state.text} />}
      {state.text && <div className="small text-muted mt-3 border-top pt-2"><i className="bi bi-info-circle" /> AI output can contain mistakes — verify important points against the text and your teacher.</div>}
    </Modal>
  );
}
