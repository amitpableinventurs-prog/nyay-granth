import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { post, del, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, ErrorBox, Empty, Modal, Avatar, timeAgo, toast, usePageTitle } from '../components/ui.jsx';

export function Forum() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const { data, error, loading, reload } = useApi('/forum' + qs({ category }));
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', category: 'General' });
  const navigate = useNavigate();

  const create = async () => {
    try {
      const r = await post('/forum', form);
      setShow(false);
      navigate(`/forum/${r.id}`);
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="Discussion Forum" sanskrit="वादसभा" icon="bi-chat-square-text" subtitle="Ask questions, discuss texts and debate in the spirit of vāda — honest inquiry for the truth.">
        {user ? <button className="btn btn-saffron btn-sm align-self-center" onClick={() => setShow(true)}><i className="bi bi-plus-lg" /> New topic</button>
          : <Link to="/login" className="btn btn-outline-secondary btn-sm align-self-center">Log in to post</Link>}
      </PageHeader>
      <div className="ng-chips mb-3">
        <button className={`ng-chip ${!category ? 'active' : ''}`} onClick={() => setParams({})}>All</button>
        {data?.categories.map((c) => <button key={c} className={`ng-chip ${category === c ? 'active' : ''}`} onClick={() => setParams({ category: c })}>{c}</button>)}
      </div>
      {loading && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.threads.length === 0 && <Empty icon="bi-chat" title="No discussions yet">Start the first one!</Empty>}
      <div className="ng-card p-0">
        {data?.threads.map((t) => (
          <Link key={t.id} to={`/forum/${t.id}`} className="d-flex gap-3 p-3 border-bottom text-body">
            <Avatar user={{ name: t.author }} size={40} />
            <div className="flex-grow-1 min-w-0">
              <div className="fw-semibold text-navy">{!!t.is_locked && <i className="bi bi-lock me-1" />}{t.title}</div>
              <div className="small text-muted text-truncate">{t.body}</div>
              <div className="small text-muted">{t.author} · <span className="badge text-bg-light">{t.category}</span> · active {timeAgo(t.last_post_at)}</div>
            </div>
            <div className="text-center small text-muted"><div className="fw-bold fs-6 text-body">{t.replies}</div>replies</div>
          </Link>
        ))}
      </div>
      <Modal show={show} title="Start a discussion" onClose={() => setShow(false)} footer={<button className="btn btn-navy" onClick={create} disabled={!form.title || !form.body}>Post</button>}>
        <input className="form-control mb-2" placeholder="Title — a clear question or topic" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className="form-select mb-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Category">
          {data?.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <textarea className="form-control" rows={6} placeholder="Details, references (e.g. NS 1.1.5), your own view…" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </Modal>
    </>
  );
}

export function ForumThread() {
  const { id } = useParams();
  const { user, isStaff } = useAuth();
  const { data, error, loading, reload } = useApi(`/forum/${id}`);
  const [reply, setReply] = useState('');
  usePageTitle(data?.thread.title);

  const send = async (e) => {
    e.preventDefault();
    try { await post(`/forum/${id}/reply`, { body: reply }); setReply(''); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async (pid) => {
    if (!window.confirm('Delete this reply?')) return;
    try { await del(`/forum/posts/${pid}`); reload(); } catch (err) { toast(err.message, 'error'); }
  };

  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const { thread, posts } = data;
  return (
    <>
      <Link to="/forum" className="small"><i className="bi bi-arrow-left" /> Forum</Link>
      <div className="ng-card mt-2">
        <span className="badge text-bg-light">{thread.category}</span>
        <h1 className="h4 text-navy mt-2">{thread.title}</h1>
        <div className="d-flex align-items-center gap-2 small text-muted mb-2"><Avatar user={{ name: thread.author }} size={28} />{thread.author} · <span className="text-capitalize">{thread.user_type}</span> · {timeAgo(thread.created_at)}</div>
        <p style={{ whiteSpace: 'pre-wrap' }} className="mb-0">{thread.body}</p>
      </div>
      <h6 className="mt-4 mb-2">{posts.length} {posts.length === 1 ? 'reply' : 'replies'}</h6>
      {posts.map((p) => (
        <div key={p.id} className="ng-card mb-2 d-flex gap-3">
          <Avatar user={{ name: p.author }} size={36} />
          <div className="flex-grow-1">
            <div className="small"><strong>{p.author}</strong> {['admin', 'editor'].includes(p.role) && <span className="badge text-bg-primary">Team</span>} <span className="text-muted">· {timeAgo(p.created_at)}</span>
              {(isStaff || Number(p.user_id) === Number(user?.id)) && <button className="btn btn-sm btn-link text-danger p-0 ms-2" onClick={() => remove(p.id)}>Delete</button>}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{p.body}</div>
          </div>
        </div>
      ))}
      {thread.is_locked && !isStaff ? <div className="alert alert-secondary">This discussion is locked.</div> : user ? (
        <form onSubmit={send} className="mt-3">
          <textarea className="form-control mb-2" rows={4} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} required />
          <button className="btn btn-navy">Reply</button>
        </form>
      ) : <p className="mt-3"><Link to="/login">Log in</Link> to reply.</p>}
    </>
  );
}
