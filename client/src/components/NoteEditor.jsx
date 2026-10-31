import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast } from './ui.jsx';

export const NOTE_COLORS = { yellow: '#fde047', green: '#86efac', blue: '#93c5fd', pink: '#f9a8d4', purple: '#c4b5fd' };

/** Create or edit a note. `note` may carry text_id / section_id / highlight for annotations. */
export default function NoteEditor({ show, note, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', content: '', highlight: '', color: 'yellow' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (show) setForm({ title: note?.title || '', content: note?.content || '', highlight: note?.highlight || '', color: note?.color || 'yellow' });
  }, [show, note]);

  const save = async () => {
    if (!form.content.trim()) return toast('Please write something in the note.', 'error');
    setSaving(true);
    try {
      const body = { ...form, text_id: note?.text_id, section_id: note?.section_id };
      const saved = note?.id ? await api(`/me/notes/${note.id}`, { method: 'PUT', body }) : await api('/me/notes', { method: 'POST', body });
      toast(note?.id ? 'Note updated' : 'Note saved');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} title={note?.id ? 'Edit note' : 'Add note'} onClose={onClose}
      footer={<><button className="btn btn-light" onClick={onClose}>Cancel</button><button className="btn btn-navy" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save note'}</button></>}>
      {note?.contextLabel && <div className="small text-muted mb-2"><i className="bi bi-link-45deg" /> {note.contextLabel}</div>}
      <input className="form-control mb-2" placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <textarea className="form-control mb-2" rows={3} placeholder="Highlighted passage (optional)" value={form.highlight} onChange={(e) => setForm({ ...form, highlight: e.target.value })} />
      <textarea className="form-control mb-3" rows={6} placeholder="Your note, annotation or reflection…" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} autoFocus />
      <div className="d-flex gap-2 align-items-center">
        <small className="text-muted me-1">Colour</small>
        {Object.entries(NOTE_COLORS).map(([k, c]) => (
          <button key={k} type="button" className={`ng-color-dot ${form.color === k ? 'active' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, color: k })} aria-label={k} />
        ))}
      </div>
    </Modal>
  );
}
