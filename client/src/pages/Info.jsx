import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHeader, useApi, timeAgo, toast } from '../components/ui.jsx';

function MessageForm({ kind, subjects, submitLabel = 'Send message', placeholder }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: subjects?.[0] || '', message: '' });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/feedback', { ...form, kind });
      setSent(true);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <div className="ng-card text-center py-4">
        <i className="bi bi-check-circle-fill text-success fs-1" />
        <h5 className="mt-2">Thank you! Your message has been received.</h5>
        <p className="text-muted small mb-3">Our team usually responds within 2 working days{user ? ' — replies appear under Help Desk and in your notifications' : ''}.</p>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => { setSent(false); setForm({ ...form, message: '' }); }}>Send another</button>
      </div>
    );
  }
  return (
    <form className="ng-card" onSubmit={submit}>
      {!user && (
        <div className="row g-2 mb-2">
          <div className="col-md-6"><input className="form-control" placeholder="Your name" value={form.name} onChange={set('name')} required /></div>
          <div className="col-md-6"><input className="form-control" type="email" placeholder="Email" value={form.email} onChange={set('email')} required /></div>
        </div>
      )}
      <div className="row g-2 mb-2">
        <div className="col-md-6"><input className="form-control" placeholder="Phone / WhatsApp (optional)" value={form.phone} onChange={set('phone')} /></div>
        <div className="col-md-6">
          {subjects ? (
            <select className="form-select" value={form.subject} onChange={set('subject')} aria-label="Subject">{subjects.map((s) => <option key={s}>{s}</option>)}</select>
          ) : <input className="form-control" placeholder="Subject" value={form.subject} onChange={set('subject')} />}
        </div>
      </div>
      <textarea className="form-control mb-3" rows={5} placeholder={placeholder || 'Your message'} value={form.message} onChange={set('message')} required />
      <button className="btn btn-navy" disabled={busy}>{busy ? 'Sending…' : submitLabel}</button>
    </form>
  );
}

export function About() {
  const modules = [
    ['bi-book', 'Text Library', 'Ancient, medieval and contemporary Nyāya texts with Sanskrit, IAST, translation and commentary.'],
    ['bi-robot', 'AI Assistance', 'Explanations, summaries, translations, Q&A, question generation and a personal tutor.'],
    ['bi-search', 'Advanced Search', 'By text, author, topic or Sanskrit word — Devanagari, IAST, plain spelling or voice.'],
    ['bi-volume-up', 'Audio Support', 'Recitations, lectures and audiobooks, plus read-aloud for every passage.'],
    ['bi-easel', 'PPT Viewer', 'Presentations, charts and study slides.'],
    ['bi-printer', 'Print & Share', 'Print or save as PDF; share passages to WhatsApp and social apps.'],
    ['bi-bookmark-star', 'Bookmarks & Notes', 'Save, annotate and organise your study materials.'],
    ['bi-camera', 'Research Tools', 'Sanskrit OCR, śloka metre analyzer, citation generator and paper templates.'],
  ];
  const users = [
    ['bi-mortarboard', 'Students', 'Learners studying Nyāya, Sanskrit, philosophy, or law'],
    ['bi-search-heart', 'Researchers', 'Scholars working on Nyāya texts, manuscripts, and comparative studies'],
    ['bi-person-workspace', 'Faculty', 'Teachers and professors using the app for teaching and course material'],
    ['bi-briefcase', 'Practitioners', 'Legal and scriptural professionals applying Nyāya principles'],
    ['bi-heart', 'Enthusiasts', 'General readers interested in Indian philosophy and classical wisdom'],
  ];
  const security = [['bi-person-lock', 'Role-based access'], ['bi-shield-lock', 'Encrypted passwords & tokens'], ['bi-credit-card-2-front', 'Secure payments'], ['bi-cloud-check', 'Backup & recovery'], ['bi-funnel', 'Content moderation']];
  return (
    <>
      <PageHeader title="About Us" sanskrit="अस्माकं विषये" icon="bi-info-circle" />
      <div className="ng-card mb-3" style={{ background: 'linear-gradient(135deg,#14245c,#1e3a8a)', color: '#fff' }}>
        <div className="sanskrit fs-4" style={{ color: '#ffd8a8' }}>न्यायः परमं बलम्</div>
        <h2 className="h4 mt-2">Nyāya Grantha Sarvasvam</h2>
        <p className="mb-0 opacity-75">A complete digital ecosystem for Nyāya knowledge, research and AI-assisted learning — a cross-platform application offering a comprehensive platform for legal and scriptural texts, knowledge tools, subscriptions and AI-based assistance for researchers, students and practitioners. <em>Preserving classical wisdom through modern technology.</em></p>
      </div>
      <div className="ng-section-title"><h2>What you can do</h2></div>
      <div className="row g-3">
        {modules.map(([i, t, d]) => (
          <div className="col-md-6 col-xl-3" key={t}><div className="ng-card h-100"><i className={`bi ${i} fs-3 text-saffron`} /><h6 className="mt-2 text-navy">{t}</h6><p className="small text-muted mb-0">{d}</p></div></div>
        ))}
      </div>
      <div className="ng-section-title"><h2>Who it is for</h2></div>
      <div className="row g-3">
        {users.map(([i, t, d]) => (
          <div className="col-sm-6 col-xl" key={t}><div className="ng-card h-100"><i className={`bi ${i} fs-3 text-navy`} /><h6 className="mt-2 text-navy">{t}</h6><p className="small text-muted mb-0">{d}</p></div></div>
        ))}
      </div>
      <div className="row g-3 mt-1">
        <div className="col-12">
          <div className="ng-section-title"><h2>Security & management</h2></div>
          <div className="ng-card d-flex justify-content-around flex-wrap gap-3">{security.map(([i, t]) => <div key={t} className="text-center small" style={{ width: 90 }}><i className={`bi ${i} fs-3 text-navy d-block`} />{t}</div>)}</div>
        </div>
      </div>
      <div className="ng-section-title"><h2>Coming next</h2></div>
      <div className="ng-card">
        <ul className="mb-0 small" style={{ columns: 2 }}>
          {['Native Android & iOS apps (same REST API)', 'Offline reading packs', 'AI Sanskrit translator', 'Digital Manuscript Preservation Center', 'Online certification courses', 'International scholar collaboration', 'Collaborative research workspace', 'Blockchain copyright protection'].map((x) => <li key={x}>{x}</li>)}
        </ul>
      </div>
    </>
  );
}

export function Contact() {
  const { config } = useAuth();
  return (
    <>
      <PageHeader title="Contact Us" sanskrit="सम्पर्कः" icon="bi-envelope" subtitle="We would love to hear from you." />
      <div className="row g-3">
        <div className="col-lg-4">
          <div className="ng-card mb-3">
            {config.whatsappNumber && (
              <a className="btn btn-success w-100 mb-2" href={`https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent('Namaste! I have a question about Nyāya Grantha Sarvasvam.')}`} target="_blank" rel="noreferrer"><i className="bi bi-whatsapp me-1" />Chat on WhatsApp</a>
            )}
            <a className="btn btn-outline-secondary w-100" href={`mailto:${config.supportEmail}`}><i className="bi bi-envelope me-1" />{config.supportEmail}</a>
            <hr />
            <div className="small text-muted"><i className="bi bi-geo-alt me-1" />{config.address}</div>
            <div className="small text-muted mt-1"><i className="bi bi-clock me-1" />Mon–Sat, 10:00–18:00 IST</div>
          </div>
        </div>
        <div className="col-lg-8"><MessageForm kind="contact" /></div>
      </div>
    </>
  );
}

export function Feedback() {
  return (
    <>
      <PageHeader title="Feedback" sanskrit="प्रतिक्रिया" icon="bi-chat-heart" subtitle="Help us improve — report an error in a text, suggest a feature or tell us what you like." />
      <MessageForm kind="feedback" subjects={['General feedback', 'Error in a text or translation', 'Feature request', 'Bug report', 'Content request']} submitLabel="Send feedback" />
      <p className="small text-muted mt-3">Enjoying the app? <Link to="/reviews">Leave a review</Link>.</p>
    </>
  );
}

export function HelpDesk() {
  const { user } = useAuth();
  const mine = useApi(user ? '/feedback/mine' : null, [user?.id]);
  const faqs = [
    ['Can you help me publish my research on Nyāya?', 'Yes. Our editorial team can review manuscripts, advise on journals and publishers, help with Sanskrit typesetting and diacritics, and guide you through ISBN registration.'],
    ['Do you digitise manuscripts?', 'We accept digitisation requests for Nyāya manuscripts. Use the Sanskrit OCR tool for a quick first pass and send us details below for professional digitisation.'],
    ['How do I cite texts from the app?', 'Use the Citation Generator under Research Tools — it produces MLA, APA and Chicago formats.'],
    ['How do I get my membership invoice?', 'Your payment history is on your Profile page. Write to us for a GST invoice.'],
  ];
  return (
    <>
      <PageHeader title="Publication Help Desk" sanskrit="प्रकाशनसहायता" icon="bi-headset" subtitle="Support for publishing, editing, digitisation and anything else you need." />
      <div className="row g-3">
        <div className="col-lg-7">
          <MessageForm kind="helpdesk" subjects={['Publishing guidance', 'Editing & proofreading', 'Manuscript digitisation', 'ISBN / copyright', 'Account or payment', 'Other']} submitLabel="Raise request" placeholder="Describe your work or question…" />
          {user && mine.data?.length > 0 && (
            <div className="ng-card mt-3">
              <h6 className="text-navy">My requests</h6>
              {mine.data.map((t) => (
                <div key={t.id} className="border-top py-2 small">
                  <div className="d-flex"><strong className="flex-grow-1">{t.subject || t.kind}</strong><span className={`badge ${t.status === 'closed' ? 'text-bg-secondary' : 'text-bg-warning'}`}>{t.status.replace('_', ' ')}</span></div>
                  <div className="text-muted">{t.message.slice(0, 140)} · {timeAgo(t.created_at)}</div>
                  {t.admin_reply && <div className="ng-note ng-note-blue"><strong>Reply:</strong> {t.admin_reply}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="col-lg-5">
          <div className="ng-card">
            <h6 className="text-navy">Frequently asked</h6>
            {faqs.map(([q, a]) => <details key={q} className="border-top py-2"><summary className="small fw-semibold">{q}</summary><p className="small text-muted mt-2 mb-0">{a}</p></details>)}
          </div>
        </div>
      </div>
    </>
  );
}
