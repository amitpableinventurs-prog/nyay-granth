import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, ErrorBox, Empty, fmtDateTime, fmtDate } from '../components/ui.jsx';

function calendarLink(e) {
  const start = new Date(e.starts_at.replace(' ', 'T'));
  const end = new Date(start.getTime() + (e.duration_minutes || 60) * 60000);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${f(start)}/${f(end)}&details=${encodeURIComponent(`${e.description || ''}\n${e.join_link || ''}`)}`;
}

export default function Events() {
  const { user } = useAuth();
  const { data, error, loading } = useApi('/events', [user?.id]);
  return (
    <>
      <PageHeader title="Live Classes & Webinars" sanskrit="कक्षाः" icon="bi-camera-video" subtitle="Learn live with teachers and scholars, and watch recordings of past sessions." />
      {loading && <Loader />}
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="ng-section-title"><h2>Upcoming</h2></div>
          {data.upcoming.length === 0 && <Empty icon="bi-calendar" title="No upcoming sessions scheduled" />}
          <div className="row g-3">
            {data.upcoming.map((e) => (
              <div className="col-md-6" key={e.id}>
                <div className="ng-card h-100">
                  <div className="d-flex gap-2 mb-1">
                    <span className={`badge ${e.kind === 'class' ? 'text-bg-danger' : 'text-bg-primary'} text-capitalize`}>{e.kind === 'class' ? 'Live class' : 'Webinar'}</span>
                    {!!e.is_premium && <span className="ng-premium"><i className="bi bi-gem" /> Members</span>}
                    {e.class_id && <Link to={`/classes/${e.class_id}`} className="badge text-bg-success text-decoration-none"><i className="bi bi-mortarboard me-1" />{e.class_title}</Link>}
                  </div>
                  <h5 className="h6 text-navy mb-1">{e.title}</h5>
                  <div className="small text-muted mb-2"><i className="bi bi-calendar-event me-1" />{fmtDateTime(e.starts_at)} · {e.duration_minutes} min · {e.speaker}</div>
                  <p className="small">{e.description}</p>
                  <div className="d-flex gap-2">
                    {e.locked ? <Link to="/plans" className="btn btn-sm btn-saffron">Become a member to join</Link>
                      : e.join_link && <a href={e.join_link} target="_blank" rel="noreferrer" className="btn btn-sm btn-navy"><i className="bi bi-box-arrow-up-right me-1" />Join</a>}
                    <a href={calendarLink(e)} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary"><i className="bi bi-calendar-plus me-1" />Add to calendar</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {data.past.length > 0 && (
            <>
              <div className="ng-section-title"><h2>Recordings</h2></div>
              <div className="ng-card">
                {data.past.map((e) => (
                  <div key={e.id} className="d-flex align-items-center gap-3 py-2 border-bottom">
                    <i className="bi bi-collection-play fs-4 text-saffron" />
                    <div className="flex-grow-1"><div className="fw-semibold small">{e.title}</div><div className="small text-muted">{fmtDate(e.starts_at)} · {e.speaker}</div></div>
                    {e.locked ? <Link to="/plans" className="small">Members</Link> : e.recording_link && <a href={e.recording_link} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">Watch</a>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
