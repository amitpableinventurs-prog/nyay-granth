import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { MENU, BOTTOM_NAV } from './menu.js';
import { Avatar, Toaster } from './ui.jsx';
import { t, LanguageMenu, LanguageChips } from '../i18n.jsx';

export function Logo({ size = 34 }) {
  // Scales of justice over an open book — the app emblem.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill="#e8730c" />
      <g stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 12v26M20 18h24M20 18l-6 12M20 18l6 12M44 18l-6 12M44 18l6 12" />
        <path d="M13 30a7 4 0 0 0 14 0M37 30a7 4 0 0 0 14 0" />
        <path d="M14 44c6-3 12-3 18 0 6-3 12-3 18 0v6c-6-3-12-3-18 0-6-3-12-3-18 0z" fill="#fff" fillOpacity=".18" />
      </g>
    </svg>
  );
}

export default function Layout() {
  const { user, unread, logout, isStaff, isFaculty, config } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <div className="ng-app">
      <header className="ng-appbar">
        <div className="ng-appbar-inner">
          <button className="ng-icon-btn d-lg-none" onClick={() => setDrawer(true)} aria-label={t('Open menu')}><i className="bi bi-list" /></button>
          <Link to="/" className="ng-brand">
            <Logo />
            <span><strong>Nyāya Grantha</strong><small>Sarvasvam</small></span>
          </Link>
          <nav className="ng-topnav d-none d-lg-flex">
            {BOTTOM_NAV.slice(1, 4).map((n) => <NavLink key={n.to} to={n.to}>{t(n.label === 'AI' ? 'AI Assistant' : n.label)}</NavLink>)}
            <NavLink to="/audio">{t('Audio')}</NavLink>
            <NavLink to="/forum">{t('Forum')}</NavLink>
            <button className="ng-topnav-more" onClick={() => setDrawer(true)}>{t('All modules')} <i className="bi bi-chevron-down" /></button>
          </nav>
          <div className="ms-auto d-flex align-items-center gap-1">
            <LanguageMenu />
            <button className="ng-icon-btn d-lg-none" onClick={() => navigate('/search')} aria-label={t('Search')}><i className="bi bi-search" /></button>
            <Link to={user ? '/notifications' : '/login'} className="ng-icon-btn position-relative" aria-label={t('Notifications')}>
              <i className="bi bi-bell" />
              {unread > 0 && <span className="ng-badge">{unread > 9 ? '9+' : unread}</span>}
            </Link>
            {user
              ? <Link to="/profile" className="ms-1 d-none d-lg-inline-flex" aria-label={t('Profile')}><Avatar user={user} size={34} /></Link>
              : <Link to="/login" className="btn btn-sm btn-saffron ms-2 d-none d-lg-inline-block">{t('Login')}</Link>}
          </div>
        </div>
      </header>

      {/* Navigation drawer with every module */}
      <div className={`ng-drawer-backdrop ${drawer ? 'show' : ''}`} onClick={() => setDrawer(false)} />
      <aside className={`ng-drawer ${drawer ? 'show' : ''}`} aria-hidden={!drawer}>
        <div className="ng-drawer-head">
          {user ? (
            <Link to="/profile" className="d-flex align-items-center gap-2 text-white text-decoration-none">
              <Avatar user={user} size={44} />
              <div><div className="fw-semibold">{user.name}</div><small className="opacity-75 text-capitalize">{t((user.user_type || '').replace(/^./, (c) => c.toUpperCase()))}{isStaff ? ` · ${user.role}` : ''}</small></div>
            </Link>
          ) : (
            <div>
              <div className="fw-semibold mb-2">{t('Welcome, seeker of knowledge')}</div>
              <Link to="/login" className="btn btn-sm btn-saffron me-2">{t('Login')}</Link>
              <Link to="/register" className="btn btn-sm btn-outline-light">{t('Sign up')}</Link>
            </div>
          )}
          <button className="ng-icon-btn text-white" onClick={() => setDrawer(false)} aria-label={t('Close menu')}><i className="bi bi-x-lg" /></button>
        </div>
        <div className="ng-drawer-body">
          <div className="ng-drawer-group">{t('Language')}</div>
          <div className="px-3 pb-2"><LanguageChips /></div>
          <NavLink to="/" end className="ng-drawer-link"><i className="bi bi-house-door" style={{ color: '#1e3a8a' }} />{t('Home')}</NavLink>
          {isStaff && <NavLink to="/admin" className="ng-drawer-link"><i className="bi bi-speedometer2" style={{ color: '#dc2626' }} />{t('Admin Panel')}</NavLink>}
          {isFaculty && <NavLink to="/faculty" end className="ng-drawer-link"><i className="bi bi-person-workspace" style={{ color: '#0f766e' }} />{t('Faculty Desk')}</NavLink>}
          {isFaculty && <NavLink to="/faculty/articles" className="ng-drawer-link"><i className="bi bi-file-earmark-arrow-up" style={{ color: '#b45309' }} />{t('My Articles')}</NavLink>}
          {MENU.map((g) => (
            <div key={g.group}>
              <div className="ng-drawer-group">{t(g.group)}</div>
              {g.items.map((i) => <NavLink key={i.to} to={i.to} className="ng-drawer-link"><i className={`bi ${i.icon}`} style={{ color: i.color }} />{t(i.label)}</NavLink>)}
            </div>
          ))}
          {user && <button className="ng-drawer-link w-100 text-danger" onClick={() => { logout(); navigate('/'); }}><i className="bi bi-box-arrow-right" />{t('Logout')}</button>}
          <p className="ng-drawer-motto sanskrit">न्यायः परमं बलम्</p>
        </div>
      </aside>

      <main className="ng-main">
        <Outlet />
      </main>

      <footer className="ng-footer d-none d-lg-block">
        <div className="container-xl d-flex justify-content-between flex-wrap gap-2">
          <span><span className="sanskrit">न्यायः परमं बलम्</span> · {t('Preserving classical wisdom through modern technology')}</span>
          <span><Link to="/about">{t('About')}</Link> · <Link to="/contact">{t('Contact')}</Link> · <Link to="/reviews">{t('Reviews')}</Link> · <Link to="/helpdesk">{t('Help Desk')}</Link></span>
        </div>
      </footer>

      {config.whatsappNumber && (
        <a className="ng-whatsapp" href={`https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent('Namaste! I need help with Nyāya Grantha Sarvasvam.')}`} target="_blank" rel="noreferrer" aria-label={t('WhatsApp support')}>
          <i className="bi bi-whatsapp" />
        </a>
      )}

      <nav className="ng-bottomnav d-lg-none">
        {BOTTOM_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}><i className={`bi ${n.icon}`} /><span>{t(n.label)}</span></NavLink>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
