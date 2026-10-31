import { Link } from 'react-router-dom';
import { del } from '../api.js';
import { useApi, PageHeader, Loader, ErrorBox, Empty, TextCover, timeAgo, toast } from '../components/ui.jsx';
import { t } from '../i18n.jsx';

export default function Bookmarks() {
  const { data, error, loading, reload, setData } = useApi('/me/bookmarks');
  const remove = async (id) => {
    try {
      await del(`/me/bookmarks/${id}`);
      setData((d) => d.filter((b) => b.id !== id));
      toast(t('Bookmark removed'));
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <>
      <PageHeader title="Bookmarks & Favourites" sanskrit="चिह्नानि" icon="bi-bookmark-star" subtitle="Texts and passages you have saved." />
      {loading && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 && <Empty icon="bi-bookmark" title="No bookmarks yet">{t('Tap “Bookmark” under any passage in the library.')} <Link to="/library">{t('Open library')}</Link></Empty>}
      <div className="row g-3">
        {data?.map((b) => (
          <div className="col-md-6" key={b.id}>
            <div className="ng-card d-flex gap-3 h-100">
              <TextCover text={{ title: b.text_title, title_sanskrit: b.title_sanskrit, cover: b.cover, cover_color: b.cover_color }} size="sm" />
              <Link to={`/text/${b.text_id}${b.section_id ? `?s=${b.section_id}` : ''}`} className="flex-grow-1 min-w-0 text-body">
                <div className="fw-semibold text-navy">{b.text_title}{b.ref && <span className="ng-ref ms-2">{b.ref}</span>}</div>
                {b.section_title && <div className="small">{b.section_title}</div>}
                {b.content_sanskrit && <div className="sanskrit small text-truncate" style={{ color: '#7a2e12' }}>{b.content_sanskrit}</div>}
                <div className="small text-muted">{t(b.section_id ? 'Passage' : 'Whole text')} · {t('saved {when}', { when: timeAgo(b.created_at) })}</div>
              </Link>
              <button className="btn btn-sm btn-light align-self-start" onClick={() => remove(b.id)} aria-label={t('Remove bookmark')}><i className="bi bi-trash" /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
