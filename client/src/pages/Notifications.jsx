import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, Empty, timeAgo } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

export default function Notifications() {
  const { refresh, config } = useAuth();
  const { data, loading } = useApi('/me/notifications');

  // Opening the page marks everything as read.
  useEffect(() => {
    if (data?.some((n) => !n.is_read)) post('/me/notifications/read-all', {}).then(refresh).catch(() => {});
  }, [data, refresh]);

  return (
    <>
      <PageHeader title="Notifications" sanskrit="सूचनाः" icon="bi-bell" subtitle="Announcements, replies and account alerts." />
      {loading && <Loader />}
      {data?.length === 0 && <Empty icon="bi-bell-slash" title="You're all caught up" />}
      <div className="ng-card p-0">
        {data?.map((n) => {
          const body = (
            <div className={`d-flex gap-3 p-3 border-bottom ${n.is_read ? '' : 'bg-light'}`}>
              <span className="ng-page-icon" style={{ width: 40, height: 40, fontSize: '1rem', background: n.user_id ? '#16a34a' : '#e8730c' }}><i className={`bi ${n.user_id ? 'bi-person' : 'bi-megaphone'}`} /></span>
              <div className="flex-grow-1">
                <div className="fw-semibold">{n.title} {!n.is_read && <span className="badge text-bg-danger ms-1">{t('new')}</span>}</div>
                {n.body && <div className="small">{n.body}</div>}
                <div className="small text-muted">{timeAgo(n.created_at)}</div>
              </div>
            </div>
          );
          return n.link ? <Link key={n.id} to={n.link} className="text-body d-block">{body}</Link> : <div key={n.id}>{body}</div>;
        })}
      </div>
      {config.whatsappNumber && <p className="small text-muted mt-3"><i className="bi bi-whatsapp text-success" /> {t('Add your WhatsApp number in your profile to receive important alerts on WhatsApp.')}</p>}
    </>
  );
}
