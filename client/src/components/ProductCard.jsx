// Product cover and card, shared by the shop pages and the home page.
// Kept out of pages/Shop.jsx so the home page does not pull the whole shop (and Vendor Panel) into the main bundle.
import { Link } from 'react-router-dom';
import { money } from './ui.jsx';
import { t } from '../i18n.jsx';

export const CATEGORY_ICONS = { books: 'bi-book', ebooks: 'bi-tablet', manuscripts: 'bi-scroll', courses: 'bi-mortarboard', audio: 'bi-music-note-beamed', 'study-aids': 'bi-pencil', other: 'bi-box' };
export const off = (p) => (p.mrp && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0);

/** Product image, or a coloured cover with the title when the vendor added none. */
export function ProductCover({ p, className = '', compact = false }) {
  const img = p.images?.[0];
  return (
    <div className={`ng-product-cover ${className}`} style={img ? undefined : { background: p.cover_color || '#7a2e12' }}>
      {img ? <img src={img} alt="" loading="lazy" /> : <div className="ng-product-cover-text"><i className={`bi ${CATEGORY_ICONS[p.category] || 'bi-box'}`} />{!compact && <span>{p.title}</span>}</div>}
    </div>
  );
}

export function ProductCard({ p }) {
  return (
    <Link to={`/shop/${p.id}`} className="ng-card p-0 h-100 d-flex flex-column text-body overflow-hidden">
      <ProductCover p={p} />
      <div className="p-2 d-flex flex-column flex-grow-1">
        <div className="small fw-semibold text-navy ng-clamp-2">{p.title}</div>
        {p.author && <div className="small text-muted text-truncate">{p.author}</div>}
        <div className="mt-auto pt-1">
          <span className="fw-bold">{money(p.price)}</span>
          {off(p) > 0 && <><s className="small text-muted ms-1">{money(p.mrp)}</s> <span className="small text-success">{off(p)}% {t('off')}</span></>}
          {p.vendor_name && <div className="text-muted text-truncate" style={{ fontSize: '.75rem' }}><i className="bi bi-shop me-1" />{p.vendor_name}</div>}
        </div>
      </div>
    </Link>
  );
}
