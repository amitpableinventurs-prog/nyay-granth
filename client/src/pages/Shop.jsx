// Marketplace: the shop (products from approved vendors), a product page, a vendor storefront and the Vendor Panel.
// The same API (/products, /vendors/:id, /vendor/*) serves the mobile apps.
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, post, del, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, ErrorBox, Empty, Modal, money, fmtDate, toast, share, usePageTitle } from '../components/ui.jsx';
import { t } from '../i18n.jsx';
import { CATEGORY_ICONS, off, ProductCard, ProductCover } from '../components/ProductCard.jsx';

const waNumber = (phone) => String(phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1');

// ---- Shop ----
export function Shop() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || '';
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(q);
  const { data, error, loading, reload } = useApi('/products' + qs({ q, category, sort, page }));
  const set = (k, v) => { const next = Object.fromEntries(params); if (v) next[k] = v; else delete next[k]; if (k !== 'page') delete next.page; setParams(next); };
  const pages = data ? Math.ceil(data.total / data.perPage) : 1;

  return (
    <>
      <PageHeader title="Shop" sanskrit="ग्रन्थापणः" icon="bi-bag" subtitle="Books, study editions, prints and courses from verified sellers.">
        <Link to="/vendor" className="btn btn-sm btn-outline-secondary align-self-center text-nowrap"><i className="bi bi-shop" /> {t('Sell with us')}</Link>
      </PageHeader>
      <form className="d-flex gap-2 mb-2" onSubmit={(e) => { e.preventDefault(); set('q', search.trim()); }} role="search">
        <input className="form-control flex-grow-1" style={{ minWidth: 0 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search books, authors, courses…')} aria-label={t('Search')} />
        <select className="form-select" style={{ width: 'auto', maxWidth: '42%' }} value={sort} onChange={(e) => set('sort', e.target.value)} aria-label={t('Sort')}>
          <option value="">{t('Featured')}</option><option value="newest">{t('Newest')}</option><option value="price_low">{t('Price: low to high')}</option><option value="price_high">{t('Price: high to low')}</option><option value="popular">{t('Most viewed')}</option>
        </select>
      </form>
      <div className="ng-chips mb-3">
        <button className={`ng-chip ${!category ? 'active' : ''}`} onClick={() => set('category', '')}>{t('All')}</button>
        {data?.categories.map((c) => <button key={c.slug} className={`ng-chip ${category === c.slug ? 'active' : ''}`} onClick={() => set('category', c.slug)}><i className={`bi ${CATEGORY_ICONS[c.slug]}`} /> {t(c.name)}</button>)}
      </div>
      {loading && !data && <Loader />}
      <ErrorBox error={error} onRetry={reload} />
      {data?.products.length === 0 && <Empty icon="bi-bag" title="No products found">{q && t('Try another search.')}</Empty>}
      <div className="row g-3">{data?.products.map((p) => <div className="col-6 col-md-4 col-lg-3 col-xl-2" key={p.id}><ProductCard p={p} /></div>)}</div>
      {pages > 1 && (
        <div className="d-flex justify-content-center align-items-center gap-2 mt-3">
          <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => set('page', String(page - 1))}><i className="bi bi-chevron-left" /></button>
          <span className="small">{page} / {pages}</span>
          <button className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => set('page', String(page + 1))}><i className="bi bi-chevron-right" /></button>
        </div>
      )}
    </>
  );
}

// ---- Product page ----
export function ProductView() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`/products/${id}`);
  const [img, setImg] = useState(0);
  usePageTitle(data?.product.title);
  useEffect(() => setImg(0), [id]);
  if (loading && !data) return <Loader />;
  if (error) return <><ErrorBox error={error} /><Link to="/shop">{t('Shop')}</Link></>;
  const { product: p, vendor: v, more, preview } = data;
  const lead = () => post(`/products/${p.id}/contact`).catch(() => {});
  const message = t('Namaste! I am interested in "{title}" listed on Nyāya Grantha.', { title: p.title });
  const details = [['Author', p.author], ['Publisher', p.publisher], ['Language', p.language], ['Pages', p.pages], ['ISBN', p.isbn]].filter(([, x]) => x);

  return (
    <>
      <Link to="/shop" className="small"><i className="bi bi-arrow-left" /> {t('Shop')}</Link>
      {preview && <div className="alert alert-warning small mt-2 mb-0"><i className="bi bi-eye-slash me-1" />{t('Preview: this product is not visible to buyers right now.')}</div>}
      <div className="row g-3 mt-1">
        <div className="col-md-5">
          <div className="ng-card p-2">
            <ProductCover p={{ ...p, images: p.images?.length ? [p.images[img]] : [] }} className="ng-product-cover-lg" />
            {p.images?.length > 1 && (
              <div className="d-flex gap-2 mt-2 overflow-auto">
                {p.images.map((src, i) => <button key={src} className={`ng-thumb ${i === img ? 'active' : ''}`} onClick={() => setImg(i)} aria-label={t('Image {n}', { n: i + 1 })}><img src={src} alt="" /></button>)}
              </div>
            )}
          </div>
        </div>
        <div className="col-md-7">
          <span className="badge text-bg-light border"><i className={`bi ${CATEGORY_ICONS[p.category]} me-1`} />{t(CATEGORIES.find(([k]) => k === p.category)?.[1] || 'Other')}</span>
          <h1 className="h4 text-navy mt-2">{p.title}</h1>
          {p.author && <div className="text-muted mb-2">{p.author}</div>}
          <div className="d-flex align-items-baseline gap-2 mb-1">
            <span className="fs-3 fw-bold">{money(p.price)}</span>
            {off(p) > 0 && <><s className="text-muted">{money(p.mrp)}</s><span className="text-success fw-semibold">{off(p)}% {t('off')}</span></>}
          </div>
          {p.stock !== null && p.stock !== undefined && <div className={`small mb-2 ${p.stock > 0 ? 'text-success' : 'text-danger'}`}>{p.stock > 0 ? (p.stock <= 5 ? t('Only {n} left', { n: p.stock }) : t('In stock')) : t('Out of stock')}</div>}
          <div className="d-flex flex-wrap gap-2 my-3">
            {p.buy_link && <a href={p.buy_link} target="_blank" rel="noreferrer nofollow" className="btn btn-saffron" onClick={lead}><i className="bi bi-cart me-1" />{t('Buy from seller')}</a>}
            {v.phone && <a href={`https://wa.me/${waNumber(v.phone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="btn btn-success" onClick={lead}><i className="bi bi-whatsapp me-1" />{t('WhatsApp seller')}</a>}
            {v.phone && <a href={`tel:${v.phone.replace(/\s/g, '')}`} className="btn btn-outline-secondary" onClick={lead}><i className="bi bi-telephone me-1" />{t('Call')}</a>}
            {v.email && <a href={`mailto:${v.email}?subject=${encodeURIComponent(p.title)}&body=${encodeURIComponent(message)}`} className="btn btn-outline-secondary" onClick={lead}><i className="bi bi-envelope me-1" />{t('Email')}</a>}
            <button className="btn btn-outline-secondary" onClick={() => share({ title: p.title, text: `${p.title} — ${money(p.price)}` })} aria-label={t('Share')}><i className="bi bi-share" /></button>
          </div>
          {p.description && <p style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p>}
          {details.length > 0 && (
            <table className="table table-sm small" style={{ maxWidth: 420 }}><tbody>{details.map(([k, x]) => <tr key={k}><th className="text-muted fw-normal" style={{ width: 120 }}>{t(k)}</th><td>{x}</td></tr>)}</tbody></table>
          )}
          <Link to={`/shop/vendor/${v.id}`} className="ng-card d-flex align-items-center gap-3 text-body">
            <VendorLogo v={v} />
            <div className="flex-grow-1 min-w-0"><div className="small text-muted">{t('Sold by')}</div><div className="fw-semibold text-navy">{v.name}</div><div className="small text-muted">{[v.city, t('Seller since {date}', { date: fmtDate(v.created_at, { month: 'short', year: 'numeric' }) })].filter(Boolean).join(' · ')}</div></div>
            <i className="bi bi-chevron-right text-muted" />
          </Link>
        </div>
      </div>
      {more.length > 0 && (
        <>
          <div className="ng-section-title"><h2>{t('More from {shop}', { shop: v.name })}</h2><Link to={`/shop/vendor/${v.id}`}>{t('View All')}</Link></div>
          <div className="row g-3">{more.map((x) => <div className="col-6 col-md-4 col-xl-2" key={x.id}><ProductCard p={x} /></div>)}</div>
        </>
      )}
    </>
  );
}

const VendorLogo = ({ v, size = 52 }) => v.logo
  ? <img src={v.logo} alt="" className="rounded" style={{ width: size, height: size, objectFit: 'cover' }} />
  : <span className="rounded d-inline-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0" style={{ width: size, height: size, background: '#0f766e', fontSize: size * 0.4 }}>{(v.name || '?')[0]}</span>;

// ---- Vendor storefront ----
export function VendorStore() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`/vendors/${id}`);
  usePageTitle(data?.vendor.name);
  if (loading && !data) return <Loader />;
  if (error) return <><ErrorBox error={error} /><Link to="/shop">{t('Shop')}</Link></>;
  const { vendor: v, products } = data;
  return (
    <>
      <Link to="/shop" className="small"><i className="bi bi-arrow-left" /> {t('Shop')}</Link>
      <div className="ng-card d-flex flex-wrap gap-3 align-items-center mt-2 mb-3">
        <VendorLogo v={v} size={72} />
        <div className="flex-grow-1 min-w-0">
          <h1 className="h4 text-navy mb-1">{v.name}</h1>
          <div className="small text-muted">{[v.city, t('Seller since {date}', { date: fmtDate(v.created_at, { month: 'short', year: 'numeric' }) })].filter(Boolean).join(' · ')}</div>
          {v.description && <p className="small mb-0 mt-1" style={{ whiteSpace: 'pre-wrap' }}>{v.description}</p>}
        </div>
        <div className="d-flex flex-wrap gap-2">
          {v.phone && <a href={`https://wa.me/${waNumber(v.phone)}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-success"><i className="bi bi-whatsapp me-1" />WhatsApp</a>}
          {v.website && <a href={v.website} target="_blank" rel="noreferrer nofollow" className="btn btn-sm btn-outline-secondary"><i className="bi bi-globe me-1" />{t('Website')}</a>}
        </div>
      </div>
      {products.length === 0 && <Empty icon="bi-bag" title="No products yet" />}
      <div className="row g-3">{products.map((p) => <div className="col-6 col-md-4 col-lg-3 col-xl-2" key={p.id}><ProductCard p={p} /></div>)}</div>
    </>
  );
}

// ---- Vendor Panel ----
const STATUS = { published: ['Published', 'success'], draft: ['Draft', 'secondary'], hidden: ['Hidden by admin', 'danger'] };

export function VendorPanel() {
  const me = useApi('/vendor/me');
  const products = useApi(me.data?.vendor?.status === 'approved' ? '/vendor/products' : null, [me.data?.vendor?.status]);
  const [editing, setEditing] = useState(null);
  const [profile, setProfile] = useState(false);
  if (me.loading && !me.data) return <Loader />;
  if (me.error) return <ErrorBox error={me.error} onRetry={me.reload} />;
  const { vendor: v, stats } = me.data;
  const reload = () => { me.reload(); products.reload(); };

  if (!v || v.status === 'rejected') {
    return (
      <>
        <PageHeader title="Sell with us" sanskrit="विक्रेता" icon="bi-shop" subtitle="List your books, prints and courses. They appear in the shop on the website and in the mobile app." />
        {v?.status === 'rejected' && <div className="alert alert-warning"><strong>{t('Your application was not approved.')}</strong> {v.admin_note} {t('You can correct your details and apply again.')}</div>}
        <div className="row g-3">
          <div className="col-lg-7"><VendorForm vendor={v} apply onSaved={me.reload} /></div>
          <div className="col-lg-5">
            <div className="ng-card">
              <h6 className="text-navy">{t('How it works')}</h6>
              <ol className="small mb-0 ps-3">
                <li>{t('Apply with your shop details.')}</li>
                <li>{t('Our team reviews and approves your shop.')}</li>
                <li>{t('Add products with photos, price and stock.')}</li>
                <li>{t('Buyers contact you on WhatsApp, phone or email, or buy through your own link.')}</li>
              </ol>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Vendor Panel" sanskrit="विक्रेतृपीठम्" icon="bi-shop" subtitle="Manage your shop and products.">
        <div className="d-flex gap-2 align-self-center">
          {v.status === 'approved' && <Link to={`/shop/vendor/${v.id}`} className="btn btn-sm btn-outline-secondary text-nowrap"><i className="bi bi-eye" /> {t('View shop')}</Link>}
          <button className="btn btn-sm btn-outline-secondary text-nowrap" onClick={() => setProfile(true)}><i className="bi bi-gear" /> {t('Shop profile')}</button>
        </div>
      </PageHeader>
      {v.status === 'pending' && <div className="alert alert-info"><i className="bi bi-hourglass-split me-1" />{t('Your application for {shop} is being reviewed. You can add products once it is approved; we will notify you.', { shop: v.name })}</div>}
      {v.status === 'suspended' && <div className="alert alert-danger"><i className="bi bi-slash-circle me-1" />{t('Your shop is suspended and your products are hidden.')} {v.admin_note}</div>}
      {v.status === 'approved' && (
        <>
          <div className="row g-2 mb-3">
            {[['Products', stats.products, 'bi-bag'], ['Published', stats.published, 'bi-check2-circle'], ['Views', stats.views, 'bi-eye'], ['Buyer contacts', stats.contacts, 'bi-whatsapp']].map(([l, n, i]) => (
              <div className="col-6 col-lg-3" key={l}><div className="ng-kpi"><i className={`bi ${i} text-saffron`} /><b>{n}</b><small>{t(l)}</small></div></div>
            ))}
          </div>
          <div className="ng-section-title"><h2>{t('My products')}</h2><button className="btn btn-sm btn-saffron" onClick={() => setEditing({})}><i className="bi bi-plus-lg" /> {t('Add product')}</button></div>
          {products.loading && !products.data && <Loader />}
          {products.data?.length === 0 && <Empty icon="bi-bag-plus" title="No products yet">{t('Add your first product.')}</Empty>}
          <div className="ng-card p-0">
            {products.data?.map((p) => {
              const [label, color] = STATUS[p.status] || [p.status, 'secondary'];
              return (
                <div key={p.id} className="d-flex flex-wrap gap-3 align-items-center p-2 border-bottom">
                  <div style={{ width: 48 }} className="rounded overflow-hidden"><ProductCover p={p} compact /></div>
                  <div className="flex-grow-1 min-w-0">
                    <Link to={`/shop/${p.id}`} className="fw-semibold text-navy">{p.title}</Link>
                    <div className="small text-muted">{money(p.price)}{p.stock !== null && p.stock !== undefined ? ` · ${t('Stock')} ${p.stock}` : ''} · <span title={t('Views')}><i className="bi bi-eye" /> {p.views || 0}</span> · <span title={t('Buyer contacts')}><i className="bi bi-whatsapp" /> {p.contacts || 0}</span></div>
                    {p.status === 'hidden' && p.moderation_note && <div className="small text-danger">{p.moderation_note}</div>}
                  </div>
                  <span className={`badge text-bg-${color}`}>{t(label)}</span>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(p)} aria-label={t('Edit')}><i className="bi bi-pencil" /></button>
                </div>
              );
            })}
          </div>
        </>
      )}
      <ProductForm value={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <Modal show={profile} title={t('Shop profile')} onClose={() => setProfile(false)}>
        <VendorForm vendor={v} onSaved={() => { setProfile(false); me.reload(); }} />
      </Modal>
    </>
  );
}

function VendorForm({ vendor, apply = false, onSaved }) {
  const { user } = useAuth();
  const [f, setF] = useState({ name: '', phone: user?.phone || '', email: user?.email || '', city: '', website: '', address: '', gstin: '', description: '', ...Object.fromEntries(Object.entries(vendor || {}).filter(([k, x]) => x !== null && ['name', 'phone', 'email', 'city', 'website', 'address', 'gstin', 'description'].includes(k))) });
  const [logo, setLogo] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const form = new FormData();
    Object.entries(f).forEach(([k, x]) => form.append(k, x ?? ''));
    if (logo) form.append('logo', logo);
    try {
      await api(apply ? '/vendor/apply' : '/vendor/me', { method: apply ? 'POST' : 'PUT', form });
      toast(t(apply ? 'Application sent. We will notify you when it is approved.' : 'Shop profile saved'));
      onSaved();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <form className={apply ? 'ng-card' : ''} onSubmit={save}>
      <div className="row g-2">
        <div className="col-12"><label className="form-label small">{t('Shop name')} *</label><input className="form-control" value={f.name} onChange={set('name')} required /></div>
        <div className="col-sm-6"><label className="form-label small">{t('Phone / WhatsApp')} *</label><input className="form-control" value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" required /></div>
        <div className="col-sm-6"><label className="form-label small">{t('Email')}</label><input className="form-control" type="email" value={f.email} onChange={set('email')} /></div>
        <div className="col-sm-6"><label className="form-label small">{t('City')}</label><input className="form-control" value={f.city} onChange={set('city')} /></div>
        <div className="col-sm-6"><label className="form-label small">{t('Website')}</label><input className="form-control" value={f.website} onChange={set('website')} placeholder="https://" /></div>
        <div className="col-sm-6"><label className="form-label small">{t('GSTIN (optional, not shown publicly)')}</label><input className="form-control text-uppercase" value={f.gstin} onChange={set('gstin')} maxLength={15} /></div>
        <div className="col-sm-6"><label className="form-label small">{t('Logo')}</label><input className="form-control" type="file" accept="image/*" onChange={(e) => setLogo(e.target.files[0])} /></div>
        <div className="col-12"><label className="form-label small">{t('Address (not shown publicly)')}</label><textarea className="form-control" rows={2} value={f.address} onChange={set('address')} /></div>
        <div className="col-12"><label className="form-label small">{t('About your shop')}</label><textarea className="form-control" rows={3} value={f.description} onChange={set('description')} /></div>
      </div>
      <button className="btn btn-navy mt-3" disabled={busy}>{t(busy ? 'Saving…' : apply ? 'Apply' : 'Save')}</button>
    </form>
  );
}

const CATEGORIES = [['books', 'Books'], ['ebooks', 'E-books & PDFs'], ['manuscripts', 'Manuscripts & prints'], ['courses', 'Courses & classes'], ['audio', 'Audio & recordings'], ['study-aids', 'Stationery & study aids'], ['other', 'Other']];

function ProductForm({ value, onClose, onSaved }) {
  const blank = { title: '', category: 'books', price: '', mrp: '', stock: '', author: '', publisher: '', language: '', isbn: '', pages: '', buy_link: '', description: '', status: 'published' };
  const [f, setF] = useState(blank);
  const [kept, setKept] = useState([]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const show = value !== null;
  useEffect(() => {
    if (!show) return;
    setF(value.id ? Object.fromEntries(Object.keys(blank).map((k) => [k, value[k] ?? (k === 'status' ? 'published' : '')])) : blank);
    setKept(value.images || []);
    setFiles([]);
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const room = 6 - kept.length;
  const save = async () => {
    setBusy(true);
    const form = new FormData();
    Object.entries(f).forEach(([k, x]) => form.append(k, x ?? ''));
    form.append('keep_images', JSON.stringify(kept));
    files.slice(0, room).forEach((file) => form.append('images', file));
    try {
      await api(value.id ? `/vendor/products/${value.id}` : '/vendor/products', { method: value.id ? 'PUT' : 'POST', form });
      toast(t(value.id ? 'Product updated' : 'Product added'));
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(t('Delete this product?'))) return;
    try { await del(`/vendor/products/${value.id}`); onSaved(); onClose(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal show={show} size="lg" title={t(value?.id ? 'Edit product' : 'Add product')} onClose={onClose}
      footer={<>{value?.id && <button className="btn btn-outline-danger me-auto" onClick={remove}>{t('Delete')}</button>}<button className="btn btn-navy" onClick={save} disabled={busy || !f.title.trim() || f.price === ''}>{t(busy ? 'Saving…' : 'Save')}</button></>}>
      {value?.status === 'hidden' && <div className="alert alert-danger small">{t('An admin hid this product.')} {value.moderation_note} {t('It stays hidden until an admin publishes it again.')}</div>}
      <div className="row g-2">
        <div className="col-12"><label className="form-label small">{t('Title')} *</label><input className="form-control" value={f.title} onChange={set('title')} /></div>
        <div className="col-sm-4"><label className="form-label small">{t('Category')} *</label><select className="form-select" value={f.category} onChange={set('category')}>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></div>
        <div className="col-4 col-sm-3"><label className="form-label small">{t('Price (₹)')} *</label><input className="form-control" type="number" min={0} step="0.01" value={f.price} onChange={set('price')} /></div>
        <div className="col-4 col-sm-3"><label className="form-label small">{t('MRP (₹)')}</label><input className="form-control" type="number" min={0} step="0.01" value={f.mrp} onChange={set('mrp')} /></div>
        <div className="col-4 col-sm-2"><label className="form-label small">{t('Stock')}</label><input className="form-control" type="number" min={0} value={f.stock} onChange={set('stock')} placeholder="—" /></div>
        <div className="col-sm-6"><label className="form-label small">{t('Author')}</label><input className="form-control" value={f.author} onChange={set('author')} /></div>
        <div className="col-sm-6"><label className="form-label small">{t('Publisher')}</label><input className="form-control" value={f.publisher} onChange={set('publisher')} /></div>
        <div className="col-sm-4"><label className="form-label small">{t('Language')}</label><input className="form-control" value={f.language} onChange={set('language')} /></div>
        <div className="col-6 col-sm-4"><label className="form-label small">ISBN</label><input className="form-control" value={f.isbn} onChange={set('isbn')} /></div>
        <div className="col-6 col-sm-4"><label className="form-label small">{t('Pages')}</label><input className="form-control" type="number" min={1} value={f.pages} onChange={set('pages')} /></div>
        <div className="col-12"><label className="form-label small">{t('Buy link (your own website or Amazon/Flipkart page, optional)')}</label><input className="form-control" value={f.buy_link} onChange={set('buy_link')} placeholder="https://" /></div>
        <div className="col-12"><label className="form-label small">{t('Description')}</label><textarea className="form-control" rows={4} value={f.description} onChange={set('description')} /></div>
        <div className="col-12">
          <label className="form-label small">{t('Photos (up to 6; the first is the cover)')}</label>
          <div className="d-flex flex-wrap gap-2 mb-2">
            {kept.map((src, i) => (
              <div key={src} className="ng-thumb active position-relative">
                <img src={src} alt="" />
                <button type="button" className="ng-thumb-x" onClick={() => setKept(kept.filter((x) => x !== src))} aria-label={t('Remove')}><i className="bi bi-x" /></button>
                {i > 0 && <button type="button" className="ng-thumb-first" onClick={() => setKept([src, ...kept.filter((x) => x !== src)])} title={t('Make cover')}><i className="bi bi-star" /></button>}
              </div>
            ))}
          </div>
          {room > 0 && <input className="form-control" type="file" accept="image/*" multiple onChange={(e) => setFiles([...e.target.files].slice(0, room))} />}
          {files.length > 0 && <div className="small text-muted mt-1">{t('{n} new photo(s) will be uploaded.', { n: files.length })}</div>}
        </div>
        <div className="col-12">
          <div className="form-check form-switch">
            <input id="pub" className="form-check-input" type="checkbox" checked={f.status !== 'draft'} disabled={value?.status === 'hidden'} onChange={(e) => setF({ ...f, status: e.target.checked ? 'published' : 'draft' })} />
            <label htmlFor="pub" className="form-check-label small">{t('Published (visible in the shop and apps)')}</label>
          </div>
        </div>
      </div>
    </Modal>
  );
}
