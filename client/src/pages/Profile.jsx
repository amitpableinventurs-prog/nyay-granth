import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, put } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, Avatar, TextCard, fmtDate, money, toast } from '../components/ui.jsx';
import { ColumnChart, BarList } from '../components/charts.jsx';
import { t } from '../i18n.jsx';

const TABS = [['analytics', 'Reading analytics'], ['edit', 'Edit profile'], ['membership', 'Membership'], ['security', 'Password']];

export default function Profile() {
  const { user, subscription, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('analytics');
  return (
    <>
      <PageHeader title="My Profile" icon="bi-person-circle" />
      <div className="ng-card d-flex align-items-center gap-3 mb-3">
        <Avatar user={user} size={64} />
        <div className="flex-grow-1 min-w-0">
          <h2 className="h5 mb-0 text-navy">{user.name}</h2>
          <div className="small text-muted text-capitalize">{t((user.user_type || '').replace(/^./, (c) => c.toUpperCase()))}{user.institution ? ` · ${user.institution}` : ''}</div>
          <div className="small text-muted">{user.email}</div>
        </div>
        <div className="d-flex flex-column align-items-end gap-2">
          {subscription ? <span className="ng-premium fs-6"><i className="bi bi-gem" /> {subscription.plan_name}</span> : <Link to="/plans" className="btn btn-sm btn-saffron">{t('Upgrade')}</Link>}
          <button className="btn btn-sm btn-outline-danger text-nowrap" onClick={() => { logout(); navigate('/'); }}><i className="bi bi-box-arrow-right" /> {t('Logout')}</button>
        </div>
      </div>
      <ul className="nav nav-pills mb-3 flex-nowrap overflow-auto">
        {TABS.map(([k, l]) => <li className="nav-item" key={k}><button className={`nav-link text-nowrap ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{t(l)}</button></li>)}
      </ul>
      {tab === 'analytics' && <Analytics />}
      {tab === 'edit' && <EditProfile user={user} onSaved={refresh} />}
      {tab === 'membership' && <Membership />}
      {tab === 'security' && <PasswordForm />}
    </>
  );
}

function Analytics() {
  const a = useApi('/me/analytics');
  const cont = useApi('/continue');
  if (a.loading) return <Loader />;
  if (!a.data) return null;
  const d = a.data;
  const tiles = [
    ['Day streak', d.streak, 'bi-fire'], ['Texts started', d.textsStarted, 'bi-book'], ['Texts completed', d.textsCompleted, 'bi-check2-circle'],
    ['Sections read', d.sectionsRead, 'bi-journal-text'], ['Notes', d.notes, 'bi-pencil'], ['Bookmarks', d.bookmarks, 'bi-bookmark'],
  ];
  return (
    <>
      <div className="row g-2 mb-3">
        {tiles.map(([l, v, i]) => (
          <div className="col-4 col-lg-2" key={l}>
            <div className="ng-kpi text-center"><i className={`bi ${i} text-saffron`} /><b>{v}</b><small>{t(l)}</small></div>
          </div>
        ))}
      </div>
      <div className="row g-3">
        <div className="col-lg-8">
          <div className="ng-card h-100">
            <h6 className="text-navy mb-3">{t('Sections read per day · last 14 days')}</h6>
            <ColumnChart data={d.days} unit="sections" />
          </div>
        </div>
        <div className="col-lg-4">
          <div className="ng-card h-100">
            <h6 className="text-navy">{t('AI assistance used')}</h6>
            <div className="small text-muted mb-2">{d.ai.left === null ? t('Unlimited requests') : t('{left} of {quota} requests left today', { left: d.ai.left, quota: d.ai.quota })}</div>
            <BarList items={d.aiByMode.map((m) => ({ label: m.mode, value: Number(m.n) }))} color="#6d3fd1" />
          </div>
        </div>
      </div>
      <div className="ng-section-title"><h2>{t('My reading')}</h2><Link to="/learning-path">{t('Learning path')}</Link></div>
      {cont.data?.length === 0 && <div className="text-muted small"><Link to="/library">{t('Open a text in the library to start tracking your progress.')}</Link></div>}
      <div className="row g-3">{cont.data?.map((t) => <div className="col-md-6 col-xl-4" key={t.id}><TextCard text={t} progress={t.percent} /></div>)}</div>
    </>
  );
}

function EditProfile({ user, onSaved }) {
  const [f, setF] = useState({ name: user.name, phone: user.phone || '', user_type: user.user_type, institution: user.institution || '', bio: user.bio || '', is_public: user.is_public });
  const [avatar, setAvatar] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const form = new FormData();
    Object.entries(f).forEach(([k, v]) => form.append(k, k === 'is_public' ? (v ? '1' : '0') : v));
    if (avatar) form.append('avatar', avatar);
    try { await api('/auth/profile', { method: 'PUT', form }); toast(t('Profile saved')); onSaved(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <form className="ng-card" onSubmit={save}>
      <div className="row g-3">
        <div className="col-md-6"><label className="form-label small">{t('Full name')}</label><input className="form-control" value={f.name} onChange={set('name')} required /></div>
        <div className="col-md-6"><label className="form-label small">{t('Phone / WhatsApp')}</label><input className="form-control" value={f.phone} onChange={set('phone')} placeholder="+91…" /></div>
        <div className="col-md-6"><label className="form-label small">{t('I am a')}</label>
          <select className="form-select" value={f.user_type} onChange={set('user_type')}>{['student', 'researcher', 'faculty', 'practitioner', 'enthusiast'].map((x) => <option key={x} value={x} className="text-capitalize">{t(x[0].toUpperCase() + x.slice(1))}</option>)}</select>
        </div>
        <div className="col-md-6"><label className="form-label small">{t('Institution')}</label><input className="form-control" value={f.institution} onChange={set('institution')} /></div>
        <div className="col-12"><label className="form-label small">{t('Bio / research interests')}</label><textarea className="form-control" rows={3} value={f.bio} onChange={set('bio')} /></div>
        <div className="col-md-6"><label className="form-label small">{t('Profile photo')}</label><input className="form-control" type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files[0])} /></div>
        <div className="col-md-6 d-flex align-items-end"><div className="form-check form-switch"><input id="pub" className="form-check-input" type="checkbox" checked={f.is_public} onChange={set('is_public')} /><label htmlFor="pub" className="form-check-label">{t('Show my scholar profile publicly')}</label></div></div>
      </div>
      <button className="btn btn-navy mt-3" disabled={busy}>{t(busy ? 'Saving…' : 'Save profile')}</button>
    </form>
  );
}

function Membership() {
  const { data, loading } = useApi('/payments/mine');
  if (loading) return <Loader />;
  return (
    <div className="row g-3">
      <div className="col-lg-6">
        <div className="ng-card h-100">
          <h6 className="text-navy">{t('Subscriptions')}</h6>
          {data.subscriptions.length === 0 && <div className="small text-muted mb-2">{t('You are on the Free plan.')}</div>}
          {data.subscriptions.map((s) => (
            <div key={s.id} className="d-flex justify-content-between border-top py-2 small">
              <span><strong>{s.plan_name}</strong><br /><span className="text-muted">{fmtDate(s.starts_at)} → {fmtDate(s.ends_at)}</span></span>
              <span className={`badge align-self-center ${new Date(s.ends_at.replace(' ', 'T')) > new Date() && s.status === 'active' ? 'text-bg-success' : 'text-bg-secondary'}`}>{new Date(s.ends_at.replace(' ', 'T')) > new Date() && s.status === 'active' ? t('Active') : t('Expired')}</span>
            </div>
          ))}
          <Link to="/plans" className="btn btn-sm btn-saffron mt-2">{t('View plans')}</Link>
        </div>
      </div>
      <div className="col-lg-6">
        <div className="ng-card h-100">
          <h6 className="text-navy">{t('Payment history')}</h6>
          {data.payments.length === 0 && <div className="small text-muted">{t('No payments yet.')}</div>}
          {data.payments.map((p) => (
            <div key={p.id} className="d-flex justify-content-between border-top py-2 small">
              <span>{p.plan_name}<br /><span className="text-muted">{fmtDate(p.created_at)} · {p.gateway}{p.gateway_payment_id ? ` · ${p.gateway_payment_id}` : ''}</span></span>
              <span className="text-end">{money(p.amount)}<br /><span className={`badge ${p.status === 'paid' ? 'text-bg-success' : p.status === 'failed' ? 'text-bg-danger' : 'text-bg-light'}`}>{p.status}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PasswordForm() {
  const [f, setF] = useState({ current_password: '', new_password: '', confirm: '' });
  const save = async (e) => {
    e.preventDefault();
    if (f.new_password !== f.confirm) return toast(t('New passwords do not match.'), 'error');
    try { await put('/auth/password', f); toast(t('Password changed')); setF({ current_password: '', new_password: '', confirm: '' }); } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <form className="ng-card" style={{ maxWidth: 460 }} onSubmit={save}>
      <input className="form-control mb-2" type="password" placeholder={t('Current password')} autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} />
      <input className="form-control mb-2" type="password" placeholder={t('New password (min 6 characters)')} autoComplete="new-password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} required minLength={6} />
      <input className="form-control mb-3" type="password" placeholder={t('Confirm new password')} autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required />
      <button className="btn btn-navy">{t('Change password')}</button>
    </form>
  );
}
