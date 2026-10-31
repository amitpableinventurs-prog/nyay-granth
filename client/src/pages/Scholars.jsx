import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, ErrorBox, Empty, Avatar, fmtDate, timeAgo, usePageTitle } from '../components/ui.jsx';

export function Scholars() {
  const { user } = useAuth();
  const { data, error, loading } = useApi('/scholars');
  return (
    <>
      <PageHeader title="Scholar Profiles" sanskrit="विद्वांसः" icon="bi-person-badge" subtitle="Students, researchers and teachers who share their profiles with the community." />
      {user && !user.is_public && <div className="alert alert-light border small">Your profile is private. <Link to="/profile">Make it public</Link> to appear here.</div>}
      {loading && <Loader />}
      <ErrorBox error={error} />
      {data?.length === 0 && <Empty icon="bi-people" title="No public profiles yet" />}
      <div className="row g-3">
        {data?.map((s) => (
          <div className="col-md-6 col-xl-4" key={s.id}>
            <Link to={`/scholars/${s.id}`} className="ng-card d-flex gap-3 text-body h-100">
              <Avatar user={s} size={52} />
              <div className="min-w-0">
                <div className="fw-semibold text-navy">{s.name}</div>
                <div className="small text-muted text-capitalize">{s.user_type}{s.institution ? ` · ${s.institution}` : ''}</div>
                {s.bio && <div className="small mt-1 text-truncate">{s.bio}</div>}
                <div className="small text-muted mt-1"><i className="bi bi-chat-dots" /> {s.contributions} contributions</div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}

export function ScholarProfile() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`/scholars/${id}`);
  usePageTitle(data?.scholar.name);
  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const { scholar, threads, reading, posts } = data;
  return (
    <>
      <Link to="/scholars" className="small"><i className="bi bi-arrow-left" /> Scholars</Link>
      <div className="ng-card mt-2 d-flex gap-3 align-items-center">
        <Avatar user={scholar} size={72} />
        <div>
          <h1 className="h4 text-navy mb-0">{scholar.name}</h1>
          <div className="text-muted text-capitalize">{scholar.user_type}{scholar.institution ? ` · ${scholar.institution}` : ''}</div>
          <div className="small text-muted">Member since {fmtDate(scholar.created_at)} · {threads.length} topics · {posts} replies</div>
        </div>
      </div>
      {scholar.bio && <div className="ng-card mt-3">{scholar.bio}</div>}
      <div className="row g-3 mt-1">
        <div className="col-md-6">
          <div className="ng-card h-100">
            <h6 className="text-navy">Currently reading</h6>
            {reading.length === 0 && <div className="small text-muted">Nothing yet.</div>}
            {reading.map((r) => (
              <Link key={r.id} to={`/text/${r.id}`} className="d-flex align-items-center gap-2 py-1 small">
                <span className="flex-grow-1">{r.title}</span>
                <div className="progress" style={{ width: 80, height: 5 }}><div className="progress-bar" style={{ width: `${r.percent}%` }} /></div>
              </Link>
            ))}
          </div>
        </div>
        <div className="col-md-6">
          <div className="ng-card h-100">
            <h6 className="text-navy">Discussions started</h6>
            {threads.length === 0 && <div className="small text-muted">None yet.</div>}
            {threads.map((t) => <Link key={t.id} to={`/forum/${t.id}`} className="d-block small py-1">{t.title} <span className="text-muted">· {t.replies} replies · {timeAgo(t.created_at)}</span></Link>)}
          </div>
        </div>
      </div>
    </>
  );
}
