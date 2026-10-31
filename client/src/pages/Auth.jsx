import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { usePageTitle } from '../components/ui.jsx';
import { Logo } from '../components/Layout.jsx';
import { t, t as tr } from '../i18n.jsx';

/** "Sign in with Google" via Google Identity Services — rendered only when a client ID is configured. */
function GoogleButton({ onError }) {
  const { config, googleLogin } = useAuth();
  const ref = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!config.googleClientId) return;
    const init = () => {
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: async ({ credential }) => {
          try { await googleLogin(credential); navigate(location.state?.from || '/'); } catch (e) { onError(e.message); }
        },
      });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 300, text: 'continue_with' });
    };
    if (window.google?.accounts) return init();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    document.body.appendChild(s);
  }, [config.googleClientId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!config.googleClientId) return null;
  return (
    <>
      <div className="text-center text-muted small my-3">{t('or')}</div>
      <div ref={ref} className="d-flex justify-content-center" />
    </>
  );
}

function AuthShell({ title: englishTitle, children }) {
  const title = t(englishTitle);
  usePageTitle(title);
  return (
    <div className="mx-auto" style={{ maxWidth: 440 }}>
      <div className="text-center mb-3">
        <Logo size={64} />
        <h1 className="h4 text-navy mt-2 mb-0">{title}</h1>
        <div className="sanskrit text-saffron">न्यायः परमं बलम्</div>
      </div>
      <div className="ng-card p-4">{children}</div>
    </div>
  );
}

export function Login() {
  const { login, user } = useAuth();
  const [f, setF] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await login(f.email, f.password); navigate(location.state?.from || '/', { replace: true }); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Welcome back">
      {error && <div className="alert alert-danger small py-2">{error}</div>}
      <form onSubmit={submit}>
        <input className="form-control mb-2" type="email" placeholder={t('Email')} autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <input className="form-control mb-3" type="password" placeholder={t('Password')} autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        <button className="btn btn-navy w-100" disabled={busy}>{t(busy ? 'Logging in…' : 'Login')}</button>
      </form>
      <GoogleButton onError={setError} />
      <p className="text-center small mt-3 mb-0">{t('New here?')} <Link to="/register" state={location.state}>{t('Create a free account')}</Link></p>
      <p className="text-center small text-muted mt-2 mb-0">{t('Forgot your password?')} <Link to="/helpdesk">{t('Contact the help desk')}</Link>.</p>
    </AuthShell>
  );
}

export function Register() {
  const { register, user } = useAuth();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', user_type: 'student', institution: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await register(f); navigate(location.state?.from || '/', { replace: true }); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Create your account">
      {error && <div className="alert alert-danger small py-2">{error}</div>}
      <form onSubmit={submit}>
        <input className="form-control mb-2" placeholder={t('Full name')} autoComplete="name" value={f.name} onChange={set('name')} required />
        <input className="form-control mb-2" type="email" placeholder={t('Email')} autoComplete="email" value={f.email} onChange={set('email')} required />
        <input className="form-control mb-2" placeholder={t('Phone / WhatsApp (optional)')} autoComplete="tel" value={f.phone} onChange={set('phone')} />
        <input className="form-control mb-2" type="password" placeholder={t('Password (min 6 characters)')} autoComplete="new-password" value={f.password} onChange={set('password')} required minLength={6} />
        <div className="row g-2 mb-3">
          <div className="col-6">
            <select className="form-select" value={f.user_type} onChange={set('user_type')} aria-label={t('I am a')}>
              {['student', 'researcher', 'faculty', 'practitioner', 'enthusiast'].map((t) => <option key={t} value={t}>{tr(t[0].toUpperCase() + t.slice(1))}</option>)}
            </select>
          </div>
          <div className="col-6"><input className="form-control" placeholder={t('Institution')} value={f.institution} onChange={set('institution')} /></div>
        </div>
        <button className="btn btn-saffron w-100" disabled={busy}>{t(busy ? 'Creating account…' : 'Sign up free')}</button>
      </form>
      <GoogleButton onError={setError} />
      <p className="text-center small mt-3 mb-0">{t('Already registered?')} <Link to="/login" state={location.state}>{t('Login')}</Link></p>
    </AuthShell>
  );
}
