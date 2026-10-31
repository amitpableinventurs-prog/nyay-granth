import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { PageHeader, share } from '../components/ui.jsx';
import { MENU } from '../components/menu.js';
import { t } from '../i18n.jsx';

export default function More() {
  const { isStaff, isFaculty } = useAuth();
  return (
    <>
      <PageHeader title="All Modules" sanskrit="सर्वस्वम्" icon="bi-grid" subtitle="Everything in Nyāya Grantha Sarvasvam." />
      {isStaff && <Link to="/admin" className="btn btn-navy w-100 mb-3"><i className="bi bi-speedometer2 me-1" />{t('Open Admin Panel')}</Link>}
      {isFaculty && <Link to="/faculty" className="btn btn-outline-secondary w-100 mb-3"><i className="bi bi-person-workspace me-1" />{t('Open Faculty Desk')}</Link>}
      {MENU.map((g) => (
        <section key={g.group} className="mb-4">
          <div className="ng-section-title"><h2>{t(g.group)}</h2></div>
          <div className="ng-features">
            {g.items.map((i) => (
              <Link key={i.to} to={i.to} className="ng-feature"><span className="tile" style={{ '--c': i.color }}><i className={`bi ${i.icon}`} /></span>{t(i.label)}</Link>
            ))}
            {g.group === 'Account & Help' && (
              <button className="ng-feature border-0 bg-transparent" onClick={() => share({ title: 'Nyāya Grantha Sarvasvam', text: 'A complete digital ecosystem for Nyāya knowledge, research & AI-assisted learning.', url: window.location.origin })}>
                <span className="tile" style={{ '--c': '#0ea5e9' }}><i className="bi bi-share" /></span>{t('Share App')}
              </button>
            )}
          </div>
        </section>
      ))}
      <p className="text-center sanskrit text-saffron fs-5 mt-4">विद्या ददाति विनयं विनयाद् याति पात्रताम्</p>
    </>
  );
}
