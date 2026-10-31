// Faculty articles: a faculty member uploads their own PDF papers. They stay internal (the author and the
// students of classes they are assigned in) until submitted to the Document Library and published by an editor.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, del, get } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, ErrorBox, Empty, Modal, fmtDate, toast } from '../components/ui.jsx';
import { t } from '../i18n.jsx';
import { PdfCover, fmtSize } from './Pdfs.jsx';

const STATUS = {
  draft: ['Internal', 'secondary', 'bi-lock'],
  pending: ['Awaiting review', 'warning', 'bi-hourglass-split'],
  published: ['Published', 'success', 'bi-globe'],
};
const titleFromFile = (name) => name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

export function FacultyArticles() {
  const { isFaculty } = useAuth();
  const { data, error, loading, reload } = useApi(isFaculty ? '/articles' : null);
  const [editing, setEditing] = useState(null); // {} for a new upload, or an article
  // Articles are indexed after upload; refresh while any is still being processed.
  const indexing = data?.some((a) => ['queued', 'processing'].includes(a.index_status));
  useEffect(() => {
    if (!indexing) return undefined;
    const timer = setTimeout(reload, 4000);
    return () => clearTimeout(timer);
  }, [indexing, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isFaculty) return <Empty icon="bi-file-earmark-pdf" title="Articles are for faculty accounts">{t('Set "I am a" to Faculty in your profile to upload your articles.')} <Link to="/profile">{t('Edit profile')}</Link></Empty>;

  const setStatus = async (a, status) => {
    const form = new FormData();
    form.append('status', status);
    try { const r = await api(`/articles/${a.id}`, { method: 'PUT', form }); toast(status === 'pending' ? t('Submitted for review.') : r.message); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (a) => {
    if (!window.confirm(t('Delete "{title}"? This cannot be undone.', { title: a.title }))) return;
    try { await del(`/articles/${a.id}`); toast(t('Deleted')); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <Link to="/faculty" className="small"><i className="bi bi-arrow-left" /> {t('Faculty Desk')}</Link>
      <PageHeader title="My Articles" sanskrit="मम लेखाः" icon="bi-file-earmark-pdf" subtitle="Upload your own PDF articles. They stay internal — only you and the students of classes you assign them in can open them — until you submit one to the Document Library.">
        <button className="btn btn-sm btn-saffron align-self-center text-nowrap" onClick={() => setEditing({})}><i className="bi bi-upload" /> {t('Upload article')}</button>
      </PageHeader>
      {loading && !data && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 && (
        <Empty icon="bi-file-earmark-arrow-up" title="No articles yet">
          <button className="btn btn-sm btn-saffron mt-2" onClick={() => setEditing({})}><i className="bi bi-upload" /> {t('Upload your first article')}</button>
        </Empty>
      )}
      <div className="d-flex flex-column gap-2">
        {data?.map((a) => {
          const [label, color, icon] = STATUS[a.status] || STATUS.draft;
          return (
            <div key={a.id} className="ng-card d-flex gap-3 align-items-start">
              <Link to={`/pdfs/${a.id}`} className="flex-shrink-0" style={{ width: 64 }} aria-label={a.title}><PdfCover pdf={a} /></Link>
              <div className="flex-grow-1 min-w-0">
                <Link to={`/pdfs/${a.id}`} className="fw-semibold text-navy d-block text-truncate">{a.title}</Link>
                {a.title_sanskrit && <div className="sanskrit small text-saffron text-truncate">{a.title_sanskrit}</div>}
                <div className="small text-muted">
                  {[a.author, a.pages && t('{n} pages', { n: a.pages }), fmtSize(a.size), fmtDate(a.created_at)].filter(Boolean).join(' · ')}
                </div>
                <div className="d-flex flex-wrap gap-1 mt-1 small">
                  <span className={`badge text-bg-${color}`}><i className={`bi ${icon} me-1`} />{t(label)}</span>
                  {['queued', 'processing'].includes(a.index_status) && <span className="badge text-bg-light border"><span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }} />{t('Preparing contents…')}</span>}
                  {a.index_status === 'failed' && <span className="badge text-bg-light border text-danger">{t('Contents could not be read')}</span>}
                  {a.status === 'published' && <span className="badge text-bg-light border"><i className="bi bi-eye me-1" />{a.views || 0}</span>}
                  {a.classes?.map((c) => <span key={c} className="badge text-bg-light border"><i className="bi bi-easel2 me-1" />{c}</span>)}
                </div>
              </div>
              <div className="d-flex flex-column flex-sm-row gap-1 flex-shrink-0">
                {a.status === 'draft' && <button className="btn btn-sm btn-outline-success" onClick={() => setStatus(a, 'pending')} title={t('Submit to the Document Library')}><i className="bi bi-send" /><span className="d-none d-md-inline"> {t('Submit')}</span></button>}
                {a.status !== 'draft' && <button className="btn btn-sm btn-outline-secondary" onClick={() => setStatus(a, 'draft')} title={t('Make internal again')}><i className="bi bi-lock" /><span className="d-none d-md-inline"> {t('Withdraw')}</span></button>}
                <button className="btn btn-sm btn-outline-primary" onClick={() => setEditing(a)} aria-label={t('Edit')}><i className="bi bi-pencil" /></button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => remove(a)} aria-label={t('Delete')}><i className="bi bi-trash" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {data?.length > 0 && <div className="small text-muted mt-3"><i className="bi bi-info-circle me-1" />{t('To share an internal article with a class, pick it as the PDF when you create an assignment.')}</div>}
      <ArticleForm value={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    </>
  );
}

function ArticleForm({ value, onClose, onSaved }) {
  const { user } = useAuth();
  const isNew = !value?.id;
  const [f, setF] = useState(null);
  const [file, setFile] = useState(null);
  const [cover, setCover] = useState(null);
  const [cats, setCats] = useState(null);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    setF({ title: '', title_sanskrit: '', author: user?.name || '', description: '', language: '', category_id: '', status: 'draft', ...value });
    setFile(null); setCover(null);
    if (!cats) get('/categories').then(setCats).catch(() => setCats([]));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!value || !f) return null;
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const choose = async (picked) => {
    if (!picked) return;
    if (!/\.pdf$/i.test(picked.name)) return toast(t('Please choose a PDF file.'), 'error');
    setFile(picked);
    if (!f.title) setF((s) => ({ ...s, title: titleFromFile(picked.name) }));
    // A cover rendered from page 1, as in the Document Library.
    try {
      const { inspectPdf } = await import('../components/pdfjs.js');
      const info = await inspectPdf(picked);
      if (info.cover) setCover(new File([info.cover], 'cover.jpg', { type: 'image/jpeg' }));
    } catch (e) {
      toast(t('This PDF could not be read: {error}', { error: e.message }), 'error');
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (isNew && !file) return toast(t('Please choose a PDF file.'), 'error');
    const form = new FormData();
    for (const k of ['title', 'title_sanskrit', 'author', 'description', 'language', 'category_id']) form.append(k, f[k] ?? '');
    if (isNew || f.status !== value.status) form.append('status', f.status === 'published' ? 'pending' : f.status);
    if (file) form.append('file', file);
    if (cover) form.append('cover', cover);
    setBusy(true);
    try {
      if (file) setProgress(0);
      const r = await api(isNew ? '/articles' : `/articles/${value.id}`, { method: isNew ? 'POST' : 'PUT', form, onProgress: file ? setProgress : undefined });
      toast(r.message || t('Saved'));
      onSaved();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); setProgress(null); }
  };

  const footer = (
    <>
      <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>{t('Cancel')}</button>
      <button type="submit" form="article-form" className="btn btn-saffron" disabled={busy}>{busy ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-upload" />} {t(isNew ? 'Upload' : 'Save')}</button>
    </>
  );

  return (
    <Modal show title={t(isNew ? 'Upload article' : 'Edit article')} onClose={busy ? () => {} : onClose} footer={footer}>
      <form id="article-form" onSubmit={save}>
        <label className="form-label small fw-semibold">{t('PDF file')}{isNew && ' *'}</label>
        <label className="d-block border rounded p-3 mb-2 text-center" style={{ borderStyle: 'dashed', cursor: 'pointer' }}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files?.[0]); }}>
          <input type="file" accept=".pdf,application/pdf" className="d-none" onChange={(e) => choose(e.target.files?.[0])} />
          <i className="bi bi-file-earmark-arrow-up fs-3 text-saffron d-block" />
          {file ? <span className="small"><strong>{file.name}</strong> · {fmtSize(file.size)}</span>
            : <span className="small text-muted">{t(isNew ? 'Choose or drop a PDF (up to 100 MB)' : 'Choose a PDF to replace the current file')}</span>}
        </label>
        {progress !== null && <div className="progress mb-2" style={{ height: 6 }}><div className="progress-bar progress-bar-striped progress-bar-animated" style={{ width: `${progress * 100}%` }} /></div>}

        <label className="form-label small fw-semibold">{t('Title')} *</label>
        <input className="form-control mb-2" value={f.title} onChange={set('title')} required maxLength={250} />
        <label className="form-label small">{t('Title (Devanagari)')}</label>
        <input className="form-control mb-2 sanskrit" value={f.title_sanskrit || ''} onChange={set('title_sanskrit')} maxLength={250} />
        <div className="row g-2 mb-2">
          <div className="col-sm-6"><label className="form-label small">{t('Author(s)')}</label><input className="form-control" value={f.author || ''} onChange={set('author')} maxLength={190} /></div>
          <div className="col-sm-3"><label className="form-label small">{t('Language')}</label><input className="form-control" value={f.language || ''} onChange={set('language')} maxLength={60} placeholder="Sanskrit" /></div>
          <div className="col-sm-3"><label className="form-label small">{t('Category')}</label>
            <select className="form-select" value={f.category_id || ''} onChange={set('category_id')}>
              <option value="">—</option>
              {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <label className="form-label small">{t('Abstract / description')}</label>
        <textarea className="form-control mb-3" rows={3} value={f.description || ''} onChange={set('description')} maxLength={4000} />

        <div className="small fw-semibold text-navy mb-1">{t('Who can open it')}</div>
        {[
          ['draft', 'Internal', 'Only you, and the students of classes where you set it as assignment material.'],
          [value.status === 'published' ? 'published' : 'pending', value.status === 'published' ? 'Published in the Document Library' : 'Submit to the Document Library', value.status === 'published' ? 'Everyone can read it. Uploading a new file sends it for review again.' : 'An editor reviews it; once published, every reader can find it.'],
        ].map(([v, l, help]) => (
          <div className="form-check" key={v}>
            <input className="form-check-input" type="radio" name="status" id={`st-${v}`} checked={f.status === v} onChange={() => setF((s) => ({ ...s, status: v }))} />
            <label className="form-check-label small" htmlFor={`st-${v}`}><strong>{t(l)}</strong><span className="d-block text-muted">{t(help)}</span></label>
          </div>
        ))}
      </form>
    </Modal>
  );
}
