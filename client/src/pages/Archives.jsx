import { useApi, PageHeader, Loader, ErrorBox, TextCard, eraLabel, fmtDate } from '../components/ui.jsx';

export default function Archives() {
  const { data, error, loading } = useApi('/archives');
  const eras = ['ancient', 'medieval', 'contemporary'];
  return (
    <>
      <PageHeader title="Archives" sanskrit="सङ्ग्रहः" icon="bi-archive" subtitle="The complete collection arranged by era, and recordings of past classes and webinars." />
      {loading && <Loader />}
      <ErrorBox error={error} />
      {data && eras.map((era) => {
        const list = data.texts.filter((t) => t.era === era);
        if (!list.length) return null;
        return (
          <section key={era}>
            <div className="ng-section-title"><h2>{eraLabel(era)} <span className="text-muted fw-normal small">({list.length})</span></h2></div>
            <div className="row g-3">{list.map((t) => <div className="col-md-6 col-xl-4" key={t.id}><TextCard text={t} /></div>)}</div>
          </section>
        );
      })}
      {data?.pastEvents.length > 0 && (
        <>
          <div className="ng-section-title"><h2>Past classes & webinars</h2></div>
          <div className="ng-card">
            {data.pastEvents.map((e) => (
              <div key={e.id} className="d-flex align-items-center gap-3 py-2 border-bottom">
                <i className="bi bi-collection-play fs-4 text-saffron" />
                <div className="flex-grow-1"><div className="fw-semibold small">{e.title}</div><div className="small text-muted">{fmtDate(e.starts_at)} · {e.speaker}</div></div>
                {e.recording_link && <a href={e.recording_link} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">Watch</a>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
