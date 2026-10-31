import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { post, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, ErrorBox, Empty } from '../components/ui.jsx';

const KINDS = [['', 'All'], ['recitation', 'Recitations'], ['lecture', 'Lectures'], ['audiobook', 'Audiobooks']];

export default function Audio() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') || '';
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi('/audio' + qs({ kind }), [user?.id]);
  const [current, setCurrent] = useState(null);
  const player = useRef(null);

  useEffect(() => {
    const id = Number(params.get('play'));
    if (id && data) setCurrent(data.find((a) => a.id === id && !a.locked) || null);
  }, [data, params]);

  useEffect(() => {
    if (current && player.current) {
      player.current.load();
      player.current.play().catch(() => {});
      post(`/audio/${current.id}/play`, {}).catch(() => {});
    }
  }, [current]);

  return (
    <>
      <PageHeader title="Audio Support" sanskrit="श्रव्यम्" icon="bi-volume-up" subtitle="Listen to recitations, lectures and audiobooks. Every passage in the reader can also be read aloud with the Listen button." />
      <div className="ng-chips mb-3">
        {KINDS.map(([v, l]) => <button key={v} className={`ng-chip ${kind === v ? 'active' : ''}`} onClick={() => setParams(v ? { kind: v } : {})}>{l}</button>)}
      </div>
      {loading && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 && (
        <Empty icon="bi-music-note-list" title="No audio uploaded yet">
          Administrators can upload recitations and lectures from the Admin Panel → Audio.<br />
          Meanwhile, open any text in the <Link to="/library">library</Link> and tap <strong>Listen</strong> to hear it read aloud.
        </Empty>
      )}
      <div className="row g-3" style={{ paddingBottom: current ? 90 : 0 }}>
        {data?.map((a) => (
          <div className="col-md-6" key={a.id}>
            <div className={`ng-card d-flex gap-3 align-items-center ${current?.id === a.id ? 'border-primary' : ''}`}>
              <button className="btn btn-saffron rounded-circle" style={{ width: 48, height: 48 }} disabled={a.locked} onClick={() => setCurrent(a)} aria-label={`Play ${a.title}`}>
                <i className={`bi ${a.locked ? 'bi-lock-fill' : current?.id === a.id ? 'bi-soundwave' : 'bi-play-fill'} fs-5`} />
              </button>
              <div className="flex-grow-1 min-w-0">
                <div className="fw-semibold">{a.title}</div>
                <div className="small text-muted text-capitalize">{a.kind}{a.speaker ? ` · ${a.speaker}` : ''}{a.duration ? ` · ${a.duration}` : ''}</div>
                {a.text_title && <div className="small"><Link to={`/text/${a.text_id}`}>{a.text_title}</Link></div>}
                {a.locked && <Link to="/plans" className="small">Members only — upgrade</Link>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {current && (
        <div className="ng-player">
          <div className="container-xl d-flex align-items-center gap-3">
            <div className="small fw-semibold text-truncate" style={{ maxWidth: '30%' }}>{current.title}</div>
            <audio ref={player} controls className="flex-grow-1" style={{ height: 40 }}><source src={current.file} /></audio>
            <button className="btn-close" onClick={() => setCurrent(null)} aria-label="Close player" />
          </div>
        </div>
      )}
    </>
  );
}
