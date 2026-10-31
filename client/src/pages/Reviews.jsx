import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, Empty, timeAgo, toast, Avatar } from '../components/ui.jsx';

const Stars = ({ value, onChange }) => (
  <span className="ng-stars fs-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <i key={i} className={`bi ${value >= i ? 'bi-star-fill' : 'bi-star'}`} role={onChange ? 'button' : undefined} onClick={() => onChange?.(i)} aria-label={onChange ? `${i} stars` : undefined} />
    ))}
  </span>
);

export default function Reviews() {
  const { user } = useAuth();
  const { data, loading, reload } = useApi('/reviews');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try { await post('/reviews', { rating, comment }); toast('Thank you for your review!'); setComment(''); reload(); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="Reviews" sanskrit="समीक्षाः" icon="bi-star" subtitle="What learners say about Nyāya Grantha Sarvasvam." />
      {loading && <Loader />}
      {data && (
        <div className="ng-card mb-3 d-flex align-items-center gap-3">
          <div className="display-5 serif text-navy">{data.average || '–'}</div>
          <div><Stars value={Math.round(data.average)} /><div className="small text-muted">{data.count} review{data.count === 1 ? '' : 's'}</div></div>
        </div>
      )}
      {user ? (
        <form className="ng-card mb-3" onSubmit={submit}>
          <h6 className="text-navy">Rate the app</h6>
          <Stars value={rating} onChange={setRating} />
          <textarea className="form-control mt-2" rows={3} placeholder="Share your experience (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn btn-navy mt-2">Submit review</button>
        </form>
      ) : <p><Link to="/login">Log in</Link> to write a review.</p>}
      {data?.reviews.length === 0 && <Empty icon="bi-star" title="No reviews yet" />}
      {data?.reviews.map((r) => (
        <div key={r.id} className="ng-card mb-2 d-flex gap-3">
          <Avatar user={r} size={40} />
          <div>
            <div className="fw-semibold">{r.name} <span className="small text-muted text-capitalize">· {r.user_type}</span></div>
            <span className="ng-stars small">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={`bi ${r.rating >= i ? 'bi-star-fill' : 'bi-star'}`} />)}</span>
            {r.comment && <p className="mb-0 mt-1">{r.comment}</p>}
            <div className="small text-muted">{timeAgo(r.created_at)}</div>
          </div>
        </div>
      ))}
    </>
  );
}
