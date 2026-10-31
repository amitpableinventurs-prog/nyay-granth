import { Link } from 'react-router-dom';
import { useApi, PageHeader, Loader, TextCover } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

export default function LearningPath() {
  const { data, loading } = useApi('/me/learning-path');
  const next = data?.find((s) => s.percent < 100);
  return (
    <>
      <PageHeader title="Personalized Learning Path" sanskrit="अध्ययनमार्गः" icon="bi-signpost-split" subtitle="The traditional sequence of study, tracked against your reading. Want a plan tailored to your background? Ask the AI.">
        <Link to="/ai" className="btn btn-sm btn-outline-secondary align-self-center"><i className="bi bi-robot" /> {t('AI plan')}</Link>
      </PageHeader>
      {loading && <Loader />}
      <ol className="list-unstyled position-relative ps-0">
        {data?.map((s, i) => (
          <li key={s.id} className="d-flex gap-3 mb-3">
            <div className="d-flex flex-column align-items-center">
              <span className={`rounded-circle d-flex align-items-center justify-content-center fw-bold ${s.percent >= 100 ? 'bg-success text-white' : s === next ? 'bg-warning' : 'bg-light border'}`} style={{ width: 34, height: 34 }}>
                {s.percent >= 100 ? <i className="bi bi-check-lg" /> : i + 1}
              </span>
              {i < data.length - 1 && <span className="flex-grow-1 border-start border-2 my-1" />}
            </div>
            <Link to={`/text/${s.id}`} className={`ng-card flex-grow-1 d-flex gap-3 text-body ${s === next ? 'border-warning' : ''}`}>
              <TextCover text={s} size="sm" />
              <div className="flex-grow-1">
                <div className="small text-muted text-uppercase" style={{ letterSpacing: '.05em' }}>{t(s.stage)}{s === next && <span className="badge text-bg-warning ms-2">{t('Up next')}</span>}</div>
                <div className="fw-semibold text-navy">{s.title} {!!s.is_premium && <span className="ng-premium">{t('Premium')}</span>}</div>
                <div className="small">{t(s.goal)}</div>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <div className="progress flex-grow-1" style={{ height: 5, maxWidth: 240 }}><div className={`progress-bar ${s.percent >= 100 ? 'bg-success' : ''}`} style={{ width: `${s.percent}%` }} /></div>
                  <small className="text-muted">{s.percent}%</small>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
