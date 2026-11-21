// Faculty workspace: My Classes, a class page (stream, assignments, sessions, students), joining with a code,
// and the Faculty Desk dashboard.
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { get, post, put, del } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, ErrorBox, Empty, Modal, Avatar, fmtDateTime, fmtDate, timeAgo, toast, share, usePageTitle } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

const toInput = (d) => (d ? String(d).replace(' ', 'T').slice(0, 16) : '');
const isPast = (d) => !!d && new Date(String(d).replace(' ', 'T')) < new Date();
const joinUrl = (code) => `${window.location.origin}${import.meta.env.BASE_URL}classes/join/${code}`;
const plural = (n, one, many) => `${n} ${t(n === 1 ? one : many)}`;

/** Status of one student's work on an assignment: [label, bootstrap colour]. */
function workStatus(a, s) {
  if (s?.status === 'graded') return [a.max_marks > 0 ? `${t('Graded')} · ${s.marks}/${a.max_marks}` : t('Reviewed'), 'success'];
  if (s?.status === 'submitted') return [s.is_late ? t('Submitted late') : t('Submitted'), 'primary'];
  if (s?.status === 'returned') return [t('Returned — redo'), 'warning'];
  if (isPast(a.due_at)) return [t('Missing'), 'danger'];
  return [t('Not submitted'), 'secondary'];
}

const DueLabel = ({ due }) => due
  ? <span className={isPast(due) ? 'text-danger' : 'text-muted'}><i className="bi bi-clock me-1" />{t('Due')} {fmtDateTime(due)}</span>
  : <span className="text-muted">{t('No due date')}</span>;

function Material({ a }) {
  const links = [
    a.text_id && <Link key="t" to={`/text/${a.text_id}`} className="badge text-bg-light border text-decoration-none"><i className="bi bi-book me-1" />{a.text_title}</Link>,
    a.pdf_id && <Link key="p" to={`/pdfs/${a.pdf_id}`} className="badge text-bg-light border text-decoration-none"><i className="bi bi-file-earmark-pdf me-1" />{a.pdf_title}</Link>,
    a.presentation_id && <Link key="s" to={`/presentations/${a.presentation_id}`} className="badge text-bg-light border text-decoration-none"><i className="bi bi-easel me-1" />{a.presentation_title}</Link>,
  ].filter(Boolean);
  return links.length ? <div className="d-flex flex-wrap gap-1">{links}</div> : null;
}

// ---- My Classes ----
export function Classes() {
  const { data, error, loading, reload } = useApi('/classes');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const join = async (e) => {
    e.preventDefault();
    try { const r = await post('/classes/join', { code }); navigate(`/classes/${r.id}`); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="My Classes" sanskrit="कक्षाः" icon="bi-mortarboard" subtitle="Join your teacher's class with a code, see assignments and live sessions, and track your work.">
        {data?.canTeach && <Link to="/faculty" className="btn btn-sm btn-outline-secondary align-self-center text-nowrap"><i className="bi bi-person-workspace" /> {t('Faculty Desk')}</Link>}
      </PageHeader>
      <form className="ng-card d-flex flex-wrap gap-2 align-items-center mb-3" onSubmit={join}>
        <i className="bi bi-key fs-4 text-saffron" />
        <div className="flex-grow-1"><div className="fw-semibold text-navy">{t('Join a class')}</div><div className="small text-muted">{t('Enter the 6-character code from your teacher.')}</div></div>
        <input className="form-control text-uppercase" style={{ maxWidth: 160, letterSpacing: '.15em' }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="NYAYA1" maxLength={8} aria-label={t('Class code')} required />
        <button className="btn btn-navy">{t('Join')}</button>
      </form>
      {loading && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          {data.canTeach && (
            <>
              <div className="ng-section-title"><h2>{t('Classes I teach')}</h2><button className="btn btn-sm btn-saffron" onClick={() => setCreating(true)}><i className="bi bi-plus-lg" /> {t('Create class')}</button></div>
              {data.teaching.length === 0 && <Empty icon="bi-easel2" title="You have not created a class yet">{t('Create a class, share its code with your students and start assigning readings.')}</Empty>}
              <div className="row g-3">{data.teaching.map((c) => <div className="col-md-6 col-xl-4" key={c.id}><ClassCard c={c} teaching /></div>)}</div>
            </>
          )}
          <div className="ng-section-title"><h2>{t('Classes I have joined')}</h2></div>
          {data.enrolled.length === 0 && <Empty icon="bi-mortarboard" title="No classes yet">{t('Ask your teacher for the class code.')}</Empty>}
          <div className="row g-3">{data.enrolled.map((c) => <div className="col-md-6 col-xl-4" key={c.id}><ClassCard c={c} /></div>)}</div>
        </>
      )}
      <ClassForm show={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/classes/${id}`)} />
    </>
  );
}

function ClassCard({ c, teaching }) {
  return (
    <Link to={`/classes/${c.id}`} className="ng-card h-100 d-block text-body">
      <div className="d-flex justify-content-between gap-2">
        <div className="min-w-0">
          <div className="fw-semibold text-navy">{c.title}</div>
          <div className="small text-muted">{[c.subject, teaching ? null : c.faculty, c.schedule].filter(Boolean).join(' · ')}</div>
        </div>
        {c.status === 'archived' && <span className="badge text-bg-secondary align-self-start">{t('Archived')}</span>}
      </div>
      <div className="d-flex flex-wrap gap-3 small mt-2">
        {teaching ? (
          <>
            <span><i className="bi bi-people me-1" />{plural(c.students, 'student', 'students')}</span>
            {c.to_grade > 0 && <span className="text-primary fw-semibold"><i className="bi bi-inbox me-1" />{c.to_grade} {t('to grade')}</span>}
            <span className="text-muted"><i className="bi bi-key me-1" />{c.join_code}</span>
          </>
        ) : (
          <>
            <span className={c.pending ? 'text-danger fw-semibold' : 'text-success'}><i className="bi bi-list-check me-1" />{c.pending ? `${c.pending} ${t('pending')}` : t('All work done')}</span>
            {c.next_due && <span className="text-muted"><i className="bi bi-clock me-1" />{t('Next due')} {fmtDateTime(c.next_due)}</span>}
          </>
        )}
      </div>
    </Link>
  );
}

function ClassForm({ show, onClose, onSaved, initial }) {
  const blank = { title: '', subject: '', schedule: '', description: '', status: 'active' };
  const [f, setF] = useState(blank);
  useEffect(() => { if (show) setF(initial ? { ...blank, ...initial } : blank); }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (initial) { await put(`/classes/${initial.id}`, f); onSaved(initial.id); } else { const r = await post('/classes', f); onSaved(r.id); }
      toast(t('Class saved'));
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal show={show} title={t(initial ? 'Class settings' : 'Create class')} onClose={onClose} footer={<button className="btn btn-navy" onClick={save} disabled={!f.title.trim()}>{t('Save')}</button>}>
      <label className="form-label small">{t('Class name')}</label>
      <input className="form-control mb-2" value={f.title} onChange={set('title')} placeholder="Tarkasaṅgraha — Batch 2026" />
      <div className="row g-2 mb-2">
        <div className="col-sm-6"><label className="form-label small">{t('Subject / text')}</label><input className="form-control" value={f.subject} onChange={set('subject')} placeholder="Tarkasaṅgraha" /></div>
        <div className="col-sm-6"><label className="form-label small">{t('Schedule')}</label><input className="form-control" value={f.schedule} onChange={set('schedule')} placeholder="Mon & Thu, 6 pm" /></div>
      </div>
      <label className="form-label small">{t('Description')}</label>
      <textarea className="form-control mb-2" rows={3} value={f.description} onChange={set('description')} />
      {initial && (
        <>
          <label className="form-label small">{t('Status')}</label>
          <select className="form-select" value={f.status} onChange={set('status')}>
            <option value="active">{t('Active')}</option>
            <option value="archived">{t('Archived — read-only, no new students')}</option>
          </select>
        </>
      )}
    </Modal>
  );
}

// ---- Join link: /classes/join/:code ----
export function JoinClass() {
  const { code } = useParams();
  const [state, setState] = useState({ id: null, error: null });
  useEffect(() => {
    post('/classes/join', { code }).then((r) => setState({ id: r.id, error: null })).catch((e) => setState({ id: null, error: e }));
  }, [code]);
  if (state.id) return <Navigate to={`/classes/${state.id}`} replace />;
  if (state.error) return <><ErrorBox error={state.error} /><Link to="/classes">{t('My Classes')}</Link></>;
  return <Loader label={t('Joining class…')} />;
}

// ---- One class ----
const TABS = [['stream', 'Stream', 'bi-megaphone'], ['work', 'Assignments', 'bi-list-check'], ['sessions', 'Live sessions', 'bi-camera-video'], ['students', 'Students', 'bi-people']];

export function ClassView() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi(`/classes/${id}`);
  const [tab, setTab] = useState(params.get('a') ? 'work' : 'stream');
  const [settings, setSettings] = useState(false);
  const navigate = useNavigate();
  usePageTitle(data?.class.title);

  if (loading && !data) return <Loader />;
  if (error) return <><ErrorBox error={error} /><Link to="/classes">{t('My Classes')}</Link></>;
  const { class: c, isOwner } = data;
  const openAssignment = params.get('a');
  const tabs = TABS.filter(([k]) => isOwner || k !== 'students');

  const leave = async () => {
    if (!window.confirm(t('Leave this class? Your submitted work stays with the teacher.'))) return;
    try { await post(`/classes/${id}/leave`); navigate('/classes'); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async () => {
    if (!window.prompt(t('This deletes the class with all its assignments, submissions and sessions. Type DELETE to confirm.'))?.match(/^delete$/i)) return;
    try { await del(`/classes/${id}`); navigate('/classes'); } catch (e) { toast(e.message, 'error'); }
  };
  const newCode = async () => {
    if (!window.confirm(t('Make a new join code? The old code will stop working.'))) return;
    try { await post(`/classes/${id}/code`); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <Link to={isOwner ? '/faculty' : '/classes'} className="small"><i className="bi bi-arrow-left" /> {t(isOwner ? 'Faculty Desk' : 'My Classes')}</Link>
      <div className="ng-card mt-2 mb-3" style={{ background: 'linear-gradient(135deg,#1e3a8a,#0f766e)', color: '#fff' }}>
        <div className="d-flex flex-wrap gap-3 align-items-start">
          <div className="flex-grow-1 min-w-0">
            <h1 className="h4 mb-1">{c.title} {c.status === 'archived' && <span className="badge text-bg-light">{t('Archived')}</span>}</h1>
            <div className="small opacity-75">{[c.subject, c.teacher, c.teacher_institution, c.schedule].filter(Boolean).join(' · ')}</div>
            {c.description && <p className="small mb-0 mt-2" style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>}
            <div className="small mt-2"><i className="bi bi-people me-1" />{plural(c.students, 'student', 'students')}</div>
          </div>
          {isOwner ? (
            <div className="text-end">
              <div className="small opacity-75">{t('Class code')}</div>
              <div className="fs-3 fw-bold" style={{ letterSpacing: '.15em' }}>{c.join_code}</div>
              <div className="d-flex flex-wrap gap-1 justify-content-end mt-1">
                <button className="btn btn-sm btn-light" onClick={() => share({ title: c.title, text: t('Join my class "{title}" on Nyāya Grantha with code {code}', { title: c.title, code: c.join_code }), url: joinUrl(c.join_code) })}><i className="bi bi-share" /> {t('Invite')}</button>
                <button className="btn btn-sm btn-outline-light" onClick={newCode} title={t('New code')}><i className="bi bi-arrow-repeat" /></button>
                <button className="btn btn-sm btn-outline-light" onClick={() => setSettings(true)} title={t('Class settings')}><i className="bi bi-gear" /></button>
                <button className="btn btn-sm btn-outline-light" onClick={remove} title={t('Delete class')}><i className="bi bi-trash" /></button>
              </div>
            </div>
          ) : <button className="btn btn-sm btn-outline-light" onClick={leave}>{t('Leave class')}</button>}
        </div>
      </div>
      <ul className="nav nav-pills mb-3 flex-nowrap overflow-auto">
        {tabs.map(([k, l, i]) => <li className="nav-item" key={k}><button className={`nav-link text-nowrap ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}><i className={`bi ${i} me-1`} />{t(l)}</button></li>)}
      </ul>
      {tab === 'stream' && <Stream data={data} reload={reload} />}
      {tab === 'work' && <Assignments data={data} reload={reload} />}
      {tab === 'sessions' && <Sessions data={data} reload={reload} />}
      {tab === 'students' && isOwner && <Students c={c} />}
      {openAssignment && <AssignmentDetail classId={c.id} assignmentId={openAssignment} isOwner={isOwner} onClose={() => { setParams({}); reload(); }} />}
      <ClassForm show={settings} initial={c} onClose={() => setSettings(false)} onSaved={reload} />
    </>
  );
}

function Stream({ data, reload }) {
  const { user } = useAuth();
  const { class: c, isOwner, posts } = data;
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const top = posts.filter((p) => !p.parent_id);
  const replies = (pid) => posts.filter((p) => p.parent_id === pid).sort((a, b) => a.id - b.id);

  const send = async (text, parent_id) => {
    try { await post(`/classes/${c.id}/posts`, { body: text, parent_id }); setBody(''); setReply(''); setReplyTo(null); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (pid) => {
    if (!window.confirm(t('Delete this post?'))) return;
    try { await del(`/classes/${c.id}/posts/${pid}`); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const canDelete = (p) => isOwner || Number(p.user_id) === Number(user?.id);

  return (
    <>
      {c.status === 'active' && (
        <form className="ng-card mb-3" onSubmit={(e) => { e.preventDefault(); send(body); }}>
          <textarea className="form-control mb-2" rows={3} value={body} onChange={(e) => setBody(e.target.value)} required
            placeholder={t(isOwner ? 'Announce something to your class…' : 'Ask your teacher a question…')} />
          <button className="btn btn-navy btn-sm"><i className={`bi ${isOwner ? 'bi-megaphone' : 'bi-question-circle'} me-1`} />{t(isOwner ? 'Post announcement' : 'Ask question')}</button>
          {isOwner && <span className="small text-muted ms-2">{t('Every student gets a notification.')}</span>}
        </form>
      )}
      {top.length === 0 && <Empty icon="bi-megaphone" title="Nothing posted yet" />}
      {top.map((p) => (
        <div key={p.id} className="ng-card mb-2">
          <div className="d-flex gap-2 align-items-center small mb-1">
            <Avatar user={{ name: p.author, avatar: p.avatar }} size={30} />
            <strong>{p.author}</strong>
            <span className={`badge ${p.kind === 'announcement' ? 'text-bg-warning' : 'text-bg-info'}`}>{t(p.kind === 'announcement' ? 'Announcement' : 'Question')}</span>
            <span className="text-muted">{timeAgo(p.created_at)}</span>
            {canDelete(p) && <button className="btn btn-sm btn-link text-danger p-0 ms-auto" onClick={() => remove(p.id)}>{t('Delete')}</button>}
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{p.body}</div>
          {replies(p.id).map((x) => (
            <div key={x.id} className="d-flex gap-2 mt-2 ms-3 ps-2 border-start small">
              <div className="flex-grow-1"><strong>{x.author}</strong> {Number(x.user_id) === Number(c.faculty_id) && <span className="badge text-bg-primary">{t('Teacher')}</span>} <span className="text-muted">· {timeAgo(x.created_at)}</span>
                <div style={{ whiteSpace: 'pre-wrap' }}>{x.body}</div></div>
              {canDelete(x) && <button className="btn btn-sm btn-link text-danger p-0" onClick={() => remove(x.id)} aria-label={t('Delete')}><i className="bi bi-x" /></button>}
            </div>
          ))}
          {replyTo === p.id ? (
            <form className="d-flex gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); send(reply, p.id); }}>
              <input className="form-control form-control-sm" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('Write a reply…')} autoFocus required />
              <button className="btn btn-sm btn-navy">{t('Reply')}</button>
            </form>
          ) : <button className="btn btn-sm btn-link p-0 mt-1" onClick={() => { setReplyTo(p.id); setReply(''); }}>{t('Reply')}</button>}
        </div>
      ))}
    </>
  );
}

function Assignments({ data, reload }) {
  const { class: c, isOwner, assignments } = data;
  const [, setParams] = useSearchParams();
  const [editing, setEditing] = useState(null); // null | {} (new) | assignment
  return (
    <>
      {isOwner && c.status === 'active' && <button className="btn btn-saffron btn-sm mb-3" onClick={() => setEditing({})}><i className="bi bi-plus-lg" /> {t('New assignment')}</button>}
      {assignments.length === 0 && <Empty icon="bi-list-check" title="No assignments yet" />}
      <div className="ng-card p-0">
        {assignments.map((a) => {
          const [label, color] = isOwner ? [] : workStatus(a, a.submission);
          return (
            <div key={a.id} className="d-flex flex-wrap gap-2 align-items-center p-3 border-bottom">
              <i className="bi bi-journal-check fs-4 text-saffron" />
              <button className="btn btn-link p-0 text-start text-body text-decoration-none flex-grow-1 min-w-0" onClick={() => setParams({ a: a.id })}>
                <div className="fw-semibold text-navy">{a.title}</div>
                <div className="small"><DueLabel due={a.due_at} />{a.max_marks > 0 && <span className="text-muted"> · {a.max_marks} {t('marks')}</span>}</div>
              </button>
              <Material a={a} />
              {isOwner ? (
                <div className="d-flex align-items-center gap-2 small">
                  <span className="text-muted">{a.submitted}/{c.students} {t('submitted')}</span>
                  {a.to_grade > 0 && <span className="badge text-bg-primary">{a.to_grade} {t('to grade')}</span>}
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(a)} aria-label={t('Edit')}><i className="bi bi-pencil" /></button>
                </div>
              ) : <span className={`badge text-bg-${color}`}>{label}</span>}
            </div>
          );
        })}
      </div>
      <AssignmentForm classId={c.id} value={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </>
  );
}

function AssignmentForm({ classId, value, onClose, onSaved }) {
  const blank = { title: '', instructions: '', due_at: '', max_marks: 10, answer_required: true, text_id: '', pdf_id: '', presentation_id: '' };
  const [f, setF] = useState(blank);
  const [lists, setLists] = useState(null);
  const show = value !== null;
  useEffect(() => {
    if (!show) return;
    setF(value.id ? { ...blank, ...value, due_at: toInput(value.due_at), answer_required: !!value.answer_required, text_id: value.text_id || '', pdf_id: value.pdf_id || '', presentation_id: value.presentation_id || '' } : blank);
    if (!lists) {
      // The library's PDFs plus the teacher's own internal articles (picking one shares it with the class).
      Promise.all([get('/texts?sort=title'), get('/pdfs?sort=title'), get('/presentations'), get('/articles').catch(() => [])])
        .then(([texts, pdfs, slides, mine]) => setLists({ texts, slides, pdfs: [...mine.filter((a) => a.status !== 'published').map((a) => ({ id: a.id, title: `${a.title} (${t('my article')})` })), ...pdfs] }))
        .catch(() => setLists({ texts: [], pdfs: [], slides: [] }));
    }
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    try {
      if (value.id) await put(`/classes/${classId}/assignments/${value.id}`, f); else await post(`/classes/${classId}/assignments`, f);
      toast(t(value.id ? 'Assignment updated' : 'Assignment posted — students were notified'));
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async () => {
    if (!window.confirm(t('Delete this assignment and all its submissions?'))) return;
    try { await del(`/classes/${classId}/assignments/${value.id}`); onSaved(); onClose(); } catch (e) { toast(e.message, 'error'); }
  };
  const pick = (k, items, label, icon) => (
    <div className="col-sm-4">
      <label className="form-label small"><i className={`bi ${icon} me-1`} />{t(label)}</label>
      <select className="form-select form-select-sm" value={f[k]} onChange={set(k)}>
        <option value="">—</option>
        {items?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select>
    </div>
  );
  return (
    <Modal show={show} size="lg" title={t(value?.id ? 'Edit assignment' : 'New assignment')} onClose={onClose}
      footer={<>{value?.id && <button className="btn btn-outline-danger me-auto" onClick={remove}>{t('Delete')}</button>}<button className="btn btn-navy" onClick={save} disabled={!f.title.trim()}>{t(value?.id ? 'Save' : 'Assign')}</button></>}>
      <label className="form-label small">{t('Title')}</label>
      <input className="form-control mb-2" value={f.title} onChange={set('title')} placeholder="Read NS 1.1.1–1.1.5 and summarise" />
      <label className="form-label small">{t('Instructions')}</label>
      <textarea className="form-control mb-2" rows={4} value={f.instructions} onChange={set('instructions')} />
      <div className="row g-2 mb-2">
        <div className="col-sm-5"><label className="form-label small">{t('Due date')}</label><input type="datetime-local" className="form-control" value={f.due_at} onChange={set('due_at')} /></div>
        <div className="col-sm-3"><label className="form-label small">{t('Marks (0 = not marked)')}</label><input type="number" min={0} max={1000} className="form-control" value={f.max_marks} onChange={set('max_marks')} /></div>
        <div className="col-sm-4 d-flex align-items-end"><div className="form-check"><input id="ar" type="checkbox" className="form-check-input" checked={f.answer_required} onChange={set('answer_required')} /><label htmlFor="ar" className="form-check-label small">{t('Written answer required')}</label></div></div>
      </div>
      <div className="small fw-semibold text-navy mt-3 mb-1">{t('Study material (optional)')}</div>
      {!lists ? <Loader /> : (
        <div className="row g-2">
          {pick('text_id', lists.texts, 'Text', 'bi-book')}
          {pick('pdf_id', lists.pdfs, 'PDF', 'bi-file-earmark-pdf')}
          {pick('presentation_id', lists.slides, 'Presentation', 'bi-easel')}
        </div>
      )}
      <div className="small text-muted mt-2">{t('When a text is linked, you can see how far each student has read it.')}</div>
    </Modal>
  );
}

function AssignmentDetail({ classId, assignmentId, isOwner, onClose }) {
  const { data, error, loading, reload } = useApi(`/classes/${classId}/assignments/${assignmentId}`);
  const a = data?.assignment;
  return (
    <Modal show size="lg" title={a?.title || t('Assignment')} onClose={onClose}>
      {loading && !data && <Loader />}
      <ErrorBox error={error} />
      {a && (
        <>
          <div className="small mb-2"><DueLabel due={a.due_at} />{a.max_marks > 0 && <span className="text-muted"> · {a.max_marks} {t('marks')}</span>}</div>
          {a.instructions && <p style={{ whiteSpace: 'pre-wrap' }}>{a.instructions}</p>}
          <Material a={a} />
          <hr />
          {isOwner ? <Roster classId={classId} a={a} roster={data.roster} reload={reload} /> : <MyWork classId={classId} a={a} submission={data.submission} reload={reload} />}
        </>
      )}
    </Modal>
  );
}

function MyWork({ classId, a, submission: s, reload }) {
  const [answer, setAnswer] = useState(s?.answer || '');
  const [label, color] = workStatus(a, s);
  const locked = s?.status === 'graded';
  const submit = async (e) => {
    e.preventDefault();
    try { await post(`/classes/${classId}/assignments/${a.id}/submit`, { answer }); toast(t('Work submitted')); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-2"><h6 className="mb-0 text-navy">{t('Your work')}</h6><span className={`badge text-bg-${color}`}>{label}</span>{s?.submitted_at && <span className="small text-muted">{fmtDateTime(s.submitted_at)}</span>}</div>
      {s?.feedback && <div className={`alert ${s.status === 'returned' ? 'alert-warning' : 'alert-success'} small`}><strong>{t('Teacher feedback')}:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{s.feedback}</span></div>}
      {locked ? <div className="ng-card bg-light small" style={{ whiteSpace: 'pre-wrap' }}>{s.answer || t('(Marked as done)')}</div> : (
        <form onSubmit={submit}>
          <textarea className="form-control mb-2" rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} required={!!a.answer_required}
            placeholder={t(a.answer_required ? 'Write your answer…' : 'Optional note for your teacher…')} />
          <button className="btn btn-navy">{t(s ? 'Submit again' : a.answer_required ? 'Submit' : 'Mark as done')}</button>
        </form>
      )}
    </>
  );
}

function Roster({ classId, a, roster, reload }) {
  const [open, setOpen] = useState(null);
  const done = roster.filter((r) => r.submission && r.submission.status !== 'returned').length;
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="mb-0 text-navy">{t('Submissions')} · {done}/{roster.length}</h6>
        {a.text_id && <span className="small text-muted">{t('Reading progress of')} {a.text_title}</span>}
      </div>
      {roster.length === 0 && <div className="small text-muted">{t('No students have joined yet. Share the class code.')}</div>}
      {roster.map((r) => {
        const [label, color] = workStatus(a, r.submission);
        return (
          <div key={r.user_id} className="border-top py-2">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <div className="flex-grow-1 min-w-0"><div className="fw-semibold small">{r.name}</div><div className="small text-muted text-truncate">{r.email}</div></div>
              {r.reading !== null && (
                <div className="d-flex align-items-center gap-1" style={{ width: 120 }} title={t('Reading progress')}>
                  <div className="progress flex-grow-1" style={{ height: 5 }}><div className="progress-bar" style={{ width: `${r.reading}%` }} /></div><small className="text-muted">{r.reading}%</small>
                </div>
              )}
              <span className={`badge text-bg-${color}`}>{label}</span>
              {r.submission && <button className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(open === r.user_id ? null : r.user_id)}>{t(r.submission.status === 'submitted' ? 'Grade' : 'View work')}</button>}
            </div>
            {open === r.user_id && <GradeForm classId={classId} a={a} s={r.submission} onDone={() => { setOpen(null); reload(); }} />}
          </div>
        );
      })}
    </>
  );
}

function GradeForm({ classId, a, s, onDone }) {
  const [marks, setMarks] = useState(s.marks ?? '');
  const [feedback, setFeedback] = useState(s.feedback || '');
  const save = async (status) => {
    try { await put(`/classes/${classId}/submissions/${s.id}`, { status, marks, feedback }); toast(t(status === 'returned' ? 'Returned to the student' : 'Grade saved')); onDone(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="bg-light rounded p-2 mt-2">
      <div className="small text-muted mb-1">{t('Submitted')} {fmtDateTime(s.submitted_at)}{s.is_late ? ` · ${t('late')}` : ''}</div>
      <div className="small mb-2" style={{ whiteSpace: 'pre-wrap' }}>{s.answer || <em>{t('(Marked as done)')}</em>}</div>
      <div className="d-flex flex-wrap gap-2 align-items-start">
        {a.max_marks > 0 && <input type="number" className="form-control form-control-sm" style={{ width: 90 }} min={0} max={a.max_marks} step="0.5" value={marks} onChange={(e) => setMarks(e.target.value)} placeholder={`/${a.max_marks}`} aria-label={t('Marks')} />}
        <textarea className="form-control form-control-sm flex-grow-1" style={{ minWidth: 200, flexBasis: 0 }} rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t('Feedback for the student')} />
      </div>
      <div className="d-flex gap-2 mt-2">
        <button className="btn btn-sm btn-success" onClick={() => save('graded')}><i className="bi bi-check2 me-1" />{t(a.max_marks > 0 ? 'Save grade' : 'Mark reviewed')}</button>
        <button className="btn btn-sm btn-outline-warning" onClick={() => save('returned')}><i className="bi bi-arrow-return-left me-1" />{t('Return for revision')}</button>
      </div>
    </div>
  );
}

function Sessions({ data, reload }) {
  const { class: c, isOwner, sessions } = data;
  const [editing, setEditing] = useState(null);
  const upcoming = sessions.filter((e) => !isPast(e.starts_at)).reverse();
  const past = sessions.filter((e) => isPast(e.starts_at));
  const row = (e, isUpcoming) => (
    <div key={e.id} className="d-flex flex-wrap gap-2 align-items-center p-3 border-bottom">
      <i className={`bi ${isUpcoming ? 'bi-camera-video text-danger' : 'bi-collection-play text-saffron'} fs-4`} />
      <div className="flex-grow-1 min-w-0">
        <div className="fw-semibold text-navy">{e.title}</div>
        <div className="small text-muted">{fmtDateTime(e.starts_at)} · {e.duration_minutes} min</div>
        {e.description && <div className="small">{e.description}</div>}
      </div>
      {isUpcoming && e.join_link && <a href={e.join_link} target="_blank" rel="noreferrer" className="btn btn-sm btn-navy"><i className="bi bi-box-arrow-up-right me-1" />{t('Join')}</a>}
      {!isUpcoming && e.recording_link && <a href={e.recording_link} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">{t('Watch')}</a>}
      {isOwner && <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(e)} aria-label={t('Edit')}><i className="bi bi-pencil" /></button>}
    </div>
  );
  return (
    <>
      {isOwner && c.status === 'active' && <button className="btn btn-saffron btn-sm mb-3" onClick={() => setEditing({})}><i className="bi bi-calendar-plus" /> {t('Schedule live class')}</button>}
      {sessions.length === 0 && <Empty icon="bi-calendar" title="No sessions scheduled" />}
      {upcoming.length > 0 && <div className="ng-card p-0 mb-3">{upcoming.map((e) => row(e, true))}</div>}
      {past.length > 0 && <><div className="ng-section-title"><h2>{t('Past sessions')}</h2></div><div className="ng-card p-0">{past.map((e) => row(e, false))}</div></>}
      <SessionForm classId={c.id} value={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </>
  );
}

function SessionForm({ classId, value, onClose, onSaved }) {
  const blank = { title: '', starts_at: '', duration_minutes: 60, join_link: '', recording_link: '', description: '' };
  const [f, setF] = useState(blank);
  const show = value !== null;
  useEffect(() => { if (show) setF(value.id ? { ...blank, ...value, starts_at: toInput(value.starts_at), join_link: value.join_link || '', recording_link: value.recording_link || '', description: value.description || '' } : blank); }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      if (value.id) await put(`/classes/${classId}/sessions/${value.id}`, f); else await post(`/classes/${classId}/sessions`, f);
      toast(t(value.id ? 'Session updated' : 'Session scheduled — students were notified'));
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  const cancel = async () => {
    if (!window.confirm(t('Cancel this session? Students will be notified if it has not happened yet.'))) return;
    try { await del(`/classes/${classId}/sessions/${value.id}`); onSaved(); onClose(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal show={show} title={t(value?.id ? 'Edit session' : 'Schedule live class')} onClose={onClose}
      footer={<>{value?.id && <button className="btn btn-outline-danger me-auto" onClick={cancel}>{t('Cancel session')}</button>}<button className="btn btn-navy" onClick={save} disabled={!f.title.trim() || !f.starts_at}>{t('Save')}</button></>}>
      <label className="form-label small">{t('Title')}</label>
      <input className="form-control mb-2" value={f.title} onChange={set('title')} placeholder="Session 3: Anumāna" />
      <div className="row g-2 mb-2">
        <div className="col-sm-7"><label className="form-label small">{t('Starts at')}</label><input type="datetime-local" className="form-control" value={f.starts_at} onChange={set('starts_at')} /></div>
        <div className="col-sm-5"><label className="form-label small">{t('Duration (minutes)')}</label><input type="number" min={5} max={600} className="form-control" value={f.duration_minutes} onChange={set('duration_minutes')} /></div>
      </div>
      <label className="form-label small">{t('Join link (Zoom / Meet / YouTube Live)')}</label>
      <input className="form-control mb-2" value={f.join_link} onChange={set('join_link')} placeholder="https://meet.google.com/…" />
      <label className="form-label small">{t('Recording link (after the class)')}</label>
      <input className="form-control mb-2" value={f.recording_link} onChange={set('recording_link')} placeholder="https://youtube.com/…" />
      <label className="form-label small">{t('Description')}</label>
      <textarea className="form-control" rows={2} value={f.description} onChange={set('description')} />
    </Modal>
  );
}

function Students({ c }) {
  const { data, error, loading, reload } = useApi(`/classes/${c.id}/students`);
  const removeStudent = async (s) => {
    if (!window.confirm(t('Remove {name} from this class?', { name: s.name }))) return;
    try { await del(`/classes/${c.id}/students/${s.user_id}`); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const csv = () => {
    const head = ['Name', 'Email', 'Institution', 'Joined', 'Submitted', 'Graded', 'Missing', 'Average %', 'Reading %', 'Sections read (7 days)', 'Last active'];
    const rows = data.students.map((s) => [s.name, s.email, s.institution, s.joined_at, s.submitted, s.graded, s.missing, s.average, s.reading, s.sections_week, s.last_active]);
    const text = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })), download: `${c.title.replace(/[^\w\- ]+/g, '').trim() || 'class'} - report.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { students, assignments } = data;
  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <div className="small text-muted flex-grow-1">{plural(students.length, 'student', 'students')} · {plural(assignments, 'assignment', 'assignments')}</div>
        {students.length > 0 && <button className="btn btn-sm btn-outline-secondary" onClick={csv}><i className="bi bi-download me-1" />{t('Download report (CSV)')}</button>}
      </div>
      {students.length === 0 && <Empty icon="bi-people" title="No students yet">{t('Share the class code {code} or the invite link with your students.', { code: c.join_code })}</Empty>}
      {students.length > 0 && (
        <div className="ng-card p-0 table-responsive">
          <table className="table table-sm small align-middle mb-0">
            <thead><tr><th>{t('Student')}</th><th className="text-center">{t('Submitted')}</th><th className="text-center">{t('Missing')}</th><th className="text-center">{t('Average')}</th><th>{t('Reading')}</th><th className="text-center">{t('Sections · 7 days')}</th><th>{t('Last active')}</th><th /></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.user_id}>
                  <td><div className="d-flex align-items-center gap-2"><Avatar user={s} size={28} /><div><div className="fw-semibold">{s.name}</div><div className="text-muted">{s.email}</div></div></div></td>
                  <td className="text-center">{s.submitted}/{assignments}</td>
                  <td className={`text-center ${s.missing ? 'text-danger fw-semibold' : ''}`}>{s.missing}</td>
                  <td className="text-center">{s.average === null ? '—' : `${s.average}%`}</td>
                  <td style={{ minWidth: 110 }}>{s.reading === null ? '—' : <div className="d-flex align-items-center gap-1"><div className="progress flex-grow-1" style={{ height: 5 }}><div className="progress-bar" style={{ width: `${s.reading}%` }} /></div>{s.reading}%</div>}</td>
                  <td className="text-center">{s.sections_week}</td>
                  <td className="text-nowrap">{s.last_active ? timeAgo(s.last_active) : '—'}</td>
                  <td><button className="btn btn-sm btn-link text-danger p-0" onClick={() => removeStudent(s)} title={t('Remove from class')}><i className="bi bi-person-x" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---- Faculty Desk ----
export function FacultyDesk() {
  const { isFaculty } = useAuth();
  const { data, error, loading, reload } = useApi(isFaculty ? '/classes/dashboard' : null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  if (!isFaculty) return <Empty icon="bi-person-workspace" title="The Faculty Desk is for teachers">{t('Set "I am a" to Faculty in your profile to create and run classes.')} <Link to="/profile">{t('Edit profile')}</Link></Empty>;

  const tiles = data && [
    ['Active classes', data.totals.classes, 'bi-easel2'], ['Students', data.totals.students, 'bi-people'],
    ['To grade', data.totals.toGrade, 'bi-inbox'], ['Sessions this week', data.totals.sessions, 'bi-camera-video'],
  ];
  const tools = [
    ['/ai', 'Question Generator & AI', 'bi-robot', '#6d3fd1'], ['/presentations', 'Presentations', 'bi-easel', '#e0453a'],
    ['/faculty/articles', 'My Articles (upload PDFs)', 'bi-file-earmark-arrow-up', '#b45309'], ['/pdfs', 'PDF Library', 'bi-file-earmark-pdf', '#c2410c'], ['/tools/citation', 'Citation Generator', 'bi-quote', '#0369a1'],
  ];
  return (
    <>
      <PageHeader title="Faculty Desk" sanskrit="आचार्यपीठम्" icon="bi-person-workspace" subtitle="Run your classes: grade work, answer questions, schedule live sessions and follow each student's progress.">
        <div className="d-flex flex-wrap gap-1 align-self-center justify-content-end">
          <Link to="/faculty/articles" className="btn btn-sm btn-outline-secondary text-nowrap"><i className="bi bi-file-earmark-arrow-up" /> {t('My Articles')}</Link>
          <button className="btn btn-sm btn-saffron text-nowrap" onClick={() => setCreating(true)}><i className="bi bi-plus-lg" /> {t('Create class')}</button>
        </div>
      </PageHeader>
      {loading && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          <div className="row g-2 mb-3">
            {tiles.map(([l, v, i]) => <div className="col-6 col-lg-3" key={l}><div className="ng-kpi"><i className={`bi ${i} text-saffron`} /><b>{v}</b><small>{t(l)}</small></div></div>)}
          </div>
          <div className="row g-3">
            <div className="col-lg-7">
              <DeskCard title="Work to grade" icon="bi-inbox" empty="Nothing to grade. Well done!">
                {data.toGrade.map((s) => (
                  <Link key={s.id} to={`/classes/${s.class_id}?a=${s.assignment_id}`} className="d-flex gap-2 align-items-center py-2 border-top text-body">
                    <Avatar user={{ name: s.student }} size={30} />
                    <div className="flex-grow-1 min-w-0"><div className="small fw-semibold">{s.student} · {s.assignment}</div><div className="small text-muted text-truncate">{s.class_title} · {timeAgo(s.submitted_at)}{s.is_late ? ` · ${t('late')}` : ''}</div></div>
                    <span className="btn btn-sm btn-outline-primary">{t('Grade')}</span>
                  </Link>
                ))}
              </DeskCard>
              <DeskCard title="Unanswered questions" icon="bi-question-circle" empty="No open questions.">
                {data.questions.map((q) => (
                  <Link key={q.id} to={`/classes/${q.class_id}`} className="d-block py-2 border-top text-body">
                    <div className="small"><strong>{q.author}</strong> <span className="text-muted">· {q.class_title} · {timeAgo(q.created_at)}</span></div>
                    <div className="small text-truncate">{q.body}</div>
                  </Link>
                ))}
              </DeskCard>
              <DeskCard title="Due in the next 7 days" icon="bi-clock" empty="No deadlines this week.">
                {data.dueSoon.map((a) => (
                  <Link key={a.id} to={`/classes/${a.class_id}?a=${a.id}`} className="d-flex align-items-center gap-2 py-2 border-top text-body">
                    <div className="flex-grow-1 min-w-0"><div className="small fw-semibold">{a.title}</div><div className="small text-muted">{a.class_title} · {fmtDateTime(a.due_at)}</div></div>
                    <span className="small text-muted text-nowrap">{a.submitted}/{a.students} {t('submitted')}</span>
                  </Link>
                ))}
              </DeskCard>
            </div>
            <div className="col-lg-5">
              <DeskCard title="My classes" icon="bi-easel2" empty="Create your first class to get started." action={<Link to="/classes" className="small">{t('All classes')}</Link>}>
                {data.classes.map((c) => (
                  <Link key={c.id} to={`/classes/${c.id}`} className="d-flex align-items-center gap-2 py-2 border-top text-body">
                    <div className="flex-grow-1 min-w-0"><div className="small fw-semibold text-navy">{c.title}</div><div className="small text-muted">{plural(c.students, 'student', 'students')} · {t('code')} {c.join_code}</div></div>
                    {c.to_grade > 0 && <span className="badge text-bg-primary">{c.to_grade}</span>}
                  </Link>
                ))}
              </DeskCard>
              <DeskCard title="Upcoming live sessions" icon="bi-camera-video" empty="No sessions scheduled.">
                {data.sessions.map((e) => (
                  <div key={e.id} className="d-flex align-items-center gap-2 py-2 border-top">
                    <div className="flex-grow-1 min-w-0"><div className="small fw-semibold">{e.title}</div><div className="small text-muted">{e.class_title} · {fmtDateTime(e.starts_at)}</div></div>
                    {e.join_link && <a href={e.join_link} target="_blank" rel="noreferrer" className="btn btn-sm btn-navy">{t('Start')}</a>}
                  </div>
                ))}
              </DeskCard>
              <DeskCard title="Recently joined" icon="bi-person-plus" empty="No students have joined yet.">
                {data.recentJoins.map((m) => (
                  <div key={m.id} className="d-flex align-items-center gap-2 py-2 border-top small">
                    <Avatar user={{ name: m.name }} size={26} /><span className="flex-grow-1"><strong>{m.name}</strong> <span className="text-muted">→ {m.class_title}</span></span><span className="text-muted">{fmtDate(m.joined_at, { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}
              </DeskCard>
              <div className="ng-card">
                <h6 className="text-navy mb-2">{t('Teaching tools')}</h6>
                <div className="d-flex flex-column gap-1">
                  {tools.map(([to, l, i, color]) => <Link key={to} to={to} className="small"><i className={`bi ${i} me-2`} style={{ color }} />{t(l)}</Link>)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      <ClassForm show={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/classes/${id}`)} />
    </>
  );
}

function DeskCard({ title, icon, empty, action, children }) {
  const items = [children].flat().filter(Boolean);
  return (
    <div className="ng-card mb-3">
      <div className="d-flex justify-content-between align-items-center mb-1"><h6 className="text-navy mb-0"><i className={`bi ${icon} me-2 text-saffron`} />{t(title)}</h6>{action}</div>
      {items.length === 0 ? <div className="small text-muted py-2">{t(empty)}</div> : children}
    </div>
  );
}
