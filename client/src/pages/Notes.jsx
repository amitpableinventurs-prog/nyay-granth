import { useState } from 'react';
import { Link } from 'react-router-dom';
import { del } from '../api.js';
import { useApi, PageHeader, Loader, ErrorBox, Empty, timeAgo, toast } from '../components/ui.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import { t } from '../i18n.jsx';

export default function Notes() {
  const { data, error, loading, reload } = useApi('/me/notes');
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');

  const remove = async (id) => {
    if (!window.confirm(t('Delete this note?'))) return;
    try { await del(`/me/notes/${id}`); toast(t('Note deleted')); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  const exportNotes = () => {
    const body = data.map((n) => [
      `## ${n.title || 'Note'}${n.text_title ? ` — ${n.text_title}${n.ref ? ' ' + n.ref : ''}` : ''}`,
      n.highlight ? `> ${n.highlight}` : '', n.content, `(${n.updated_at})`, '',
    ].filter(Boolean).join('\n')).join('\n');
    const url = URL.createObjectURL(new Blob([`# My Nyāya Notes\n\n${body}`], { type: 'text/markdown' }));
    Object.assign(document.createElement('a'), { href: url, download: 'nyaya-notes.md' }).click();
    URL.revokeObjectURL(url);
  };

  const shown = (data || []).filter((n) => !filter || `${n.title} ${n.content} ${n.text_title}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <PageHeader title="Notes & Annotations" sanskrit="टिप्पण्यः" icon="bi-journal-richtext" subtitle="Your personal notes, highlights and reflections.">
        <button className="btn btn-saffron btn-sm align-self-center" onClick={() => setEditing({})}><i className="bi bi-plus-lg" /> {t('New')}</button>
      </PageHeader>
      {data?.length > 0 && (
        <div className="d-flex gap-2 mb-3">
          <input className="form-control" placeholder={t('Search notes…')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="btn btn-outline-secondary text-nowrap" onClick={exportNotes}><i className="bi bi-download" /> {t('Export')}</button>
        </div>
      )}
      {loading && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 && <Empty icon="bi-journal" title="No notes yet">{t('Write a free-form note, or tap “Note” under a passage in the reader.')}</Empty>}
      <div className="row g-3">
        {shown.map((n) => (
          <div className="col-md-6 col-xl-4" key={n.id}>
            <div className={`ng-note ng-note-${n.color} h-100 d-flex flex-column`} style={{ marginTop: 0, padding: 14 }}>
              <div className="d-flex align-items-start gap-2">
                <strong className="flex-grow-1">{n.title || t('Untitled note')}</strong>
                <button className="btn btn-sm p-0 text-secondary" onClick={() => setEditing(n)} aria-label={t('Edit')}><i className="bi bi-pencil" /></button>
                <button className="btn btn-sm p-0 text-secondary" onClick={() => remove(n.id)} aria-label={t('Delete')}><i className="bi bi-trash" /></button>
              </div>
              {n.text_title && <Link to={`/text/${n.text_id}${n.section_id ? `?s=${n.section_id}` : ''}`} className="small"><i className="bi bi-link-45deg" />{n.text_title} {n.ref}</Link>}
              {n.highlight && <blockquote className="sanskrit small border-start border-3 ps-2 my-2 opacity-75">{n.highlight}</blockquote>}
              <div className="small flex-grow-1" style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
              <div className="text-muted mt-2" style={{ fontSize: '.72rem' }}>{t('Updated {when}', { when: timeAgo(n.updated_at) })}</div>
            </div>
          </div>
        ))}
      </div>
      <NoteEditor show={!!editing} note={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </>
  );
}
