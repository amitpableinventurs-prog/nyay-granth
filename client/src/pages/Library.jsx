import { useSearchParams } from 'react-router-dom';
import { qs } from '../api.js';
import { useApi, PageHeader, TextCard, Loader, ErrorBox, Empty } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

const ERAS = [['', 'All eras'], ['ancient', 'Ancient'], ['medieval', 'Medieval'], ['contemporary', 'Contemporary']];

export default function Library() {
  const [params, setParams] = useSearchParams();
  const era = params.get('era') || '';
  const category = params.get('category') || '';
  const access = params.get('access') || '';
  const sort = params.get('sort') || '';
  const q = params.get('q') || '';
  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: true }); };

  const cats = useApi('/categories');
  const { data, error, loading, reload } = useApi('/texts' + qs({ era, category, access, sort, q }));

  return (
    <>
      <PageHeader title="Text Library" sanskrit="ग्रन्थालयः" icon="bi-book" subtitle="Ancient, medieval and contemporary Nyāya texts with Sanskrit, transliteration, translation and commentary." />
      <div className="ng-chips mb-2">
        {ERAS.map(([v, l]) => <button key={v} className={`ng-chip ${era === v ? 'active' : ''}`} onClick={() => set('era', v)}>{t(l)}</button>)}
      </div>
      <div className="row g-2 mb-3">
        <div className="col-12 col-md-4">
          <input className="form-control" placeholder={t('Filter by title or author…')} defaultValue={q} onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value)} onBlur={(e) => set('q', e.target.value)} />
        </div>
        <div className="col-6 col-md-3">
          <select className="form-select" value={category} onChange={(e) => set('category', e.target.value)} aria-label={t('Category')}>
            <option value="">{t('All categories')}</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.text_count})</option>)}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <select className="form-select" value={access} onChange={(e) => set('access', e.target.value)} aria-label={t('Access')}>
            <option value="">{t('Free & premium')}</option><option value="free">{t('Free')}</option><option value="premium">{t('Premium')}</option>
          </select>
        </div>
        <div className="col-12 col-md-3">
          <select className="form-select" value={sort} onChange={(e) => set('sort', e.target.value)} aria-label={t('Sort')}>
            <option value="">{t('Featured first')}</option><option value="popular">{t('Most read')}</option><option value="title">{t('Title A–Z')}</option><option value="newest">{t('Newest')}</option>
          </select>
        </div>
      </div>
      {loading && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data && data.length === 0 && <Empty icon="bi-book" title="No texts match these filters" />}
      <div className="row g-3">
        {data?.map((t) => (
          <div className="col-md-6 col-xl-4" key={t.id}>
            <TextCard text={t} />
          </div>
        ))}
      </div>
    </>
  );
}
