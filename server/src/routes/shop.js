// Marketplace: approved vendors list products (books, courses, prints…) that the website and mobile apps show.
// Public catalogue: GET /products, /products/:id, /vendors/:id. Vendor panel: /vendor/* (login required).
// There is no checkout: buyers contact the seller or follow the seller's own buy link; those clicks count as leads.
import { Router } from 'express';
import { attach, count, find, findOne, inc, insert, remove, update, now, aggregate, like } from '../db.js';
import { HttpError, fields, requireAuth, upload, uploadedPath, removeUpload } from '../middleware.js';
import { PRODUCT_CATEGORIES, isStaff, notify, notifyAdmins, productNorm } from '../services.js';
import { searchNorm } from '../../../shared/translit.js';

const PER_PAGE = 24;
const MAX_IMAGES = 6;
const CARD_FIELDS = ['id', 'vendor_id', 'title', 'category', 'author', 'language', 'price', 'mrp', 'images', 'cover_color', 'stock', 'is_featured', 'views', 'created_at'];
const VENDOR_PUBLIC = ['id', 'name', 'description', 'city', 'logo', 'website', 'phone', 'email', 'created_at'];
const COLORS = ['#7a2e12', '#1e3a8a', '#0f766e', '#9a3412', '#6d28d9', '#b45309', '#be123c', '#365314'];

const approvedVendorIds = async () => (await find('vendors', { status: 'approved' }, { fields: ['id'] })).map((v) => v.id);
const withVendor = (rows) => attach(rows, 'vendors', 'vendor_id', { name: 'vendor_name', city: 'vendor_city' });
const httpUrl = (v, label) => {
  if (v && !/^https?:\/\/\S+$/i.test(v)) throw new HttpError(422, `${label} must start with http:// or https://`);
  return v || null;
};
const num = (v, label, { min = 0, int = false, optional = true } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (optional) return null;
    throw new HttpError(422, `${label} is required.`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || (int && !Number.isInteger(n))) throw new HttpError(422, `${label} must be ${int ? 'a whole number' : 'a number'} of at least ${min}.`);
  return n;
};
/** Rejects a request whose uploads are not images, deleting what multer already stored. */
function onlyImages(req) {
  const files = [...(req.files || []), ...(req.file ? [req.file] : [])];
  if (files.some((f) => !/^image\//.test(f.mimetype))) {
    files.forEach((f) => removeUpload(uploadedPath(f)));
    throw new HttpError(422, 'Please upload images only (JPG, PNG, WebP or GIF).');
  }
}
/** Runs a handler and deletes the request's uploads if it fails. */
const cleanUploadsOnError = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (e) {
    for (const f of [...(req.files || []), ...(req.file ? [req.file] : [])]) removeUpload(uploadedPath(f));
    throw e;
  }
};

/** Featured, then newest, published products of approved vendors (home feed). */
export async function shopHighlights(limit) {
  const rows = await find('products', { status: 'published', vendor_id: { $in: await approvedVendorIds() } }, { sort: { is_featured: -1, id: -1 }, limit, fields: CARD_FIELDS });
  return withVendor(rows);
}

// ---- Public catalogue ----
export const shopRoutes = Router();

shopRoutes.get('/products', async (req, res) => {
  const filter = { status: 'published', vendor_id: { $in: await approvedVendorIds() } };
  if (req.query.vendor) filter.vendor_id = filter.vendor_id.$in.includes(Number(req.query.vendor)) ? Number(req.query.vendor) : -1;
  if (PRODUCT_CATEGORIES.some(([k]) => k === req.query.category)) filter.category = req.query.category;
  if (req.query.q) filter.search_norm = like(searchNorm(req.query.q));
  const sort = { newest: { id: -1 }, price_low: { price: 1, id: -1 }, price_high: { price: -1, id: -1 }, popular: { views: -1, id: -1 } }[req.query.sort] || { is_featured: -1, id: -1 };
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(60, Math.max(1, Number(req.query.limit) || PER_PAGE));
  const total = await count('products', filter);
  const products = await withVendor(await find('products', filter, { sort, skip: (page - 1) * perPage, limit: perPage, fields: CARD_FIELDS }));
  res.json({ products, total, page, perPage, categories: PRODUCT_CATEGORIES.map(([slug, name]) => ({ slug, name })) });
});

shopRoutes.get('/products/:id', async (req, res) => {
  const p = await findOne('products', { id: Number(req.params.id) }, { exclude: ['search_norm', 'moderation_note'] });
  const vendor = p && (await findOne('vendors', { id: p.vendor_id }, { fields: [...VENDOR_PUBLIC, 'user_id', 'status'] }));
  // Unpublished products stay visible to their own vendor (preview) and to staff.
  const owner = req.user && (vendor?.user_id === req.user.id || isStaff(req.user));
  if (!p || !vendor || ((p.status !== 'published' || vendor.status !== 'approved') && !owner)) throw new HttpError(404, 'Product not found.');
  if (p.status === 'published') await inc('products', { id: p.id }, { views: 1 });
  const { user_id, status, ...seller } = vendor;
  const more = await find('products', { vendor_id: p.vendor_id, status: 'published', id: { $ne: p.id } }, { sort: { is_featured: -1, id: -1 }, limit: 6, fields: CARD_FIELDS });
  res.json({ product: p, vendor: seller, more: await withVendor(more), preview: p.status !== 'published' || status !== 'approved' });
});

/** A buyer clicked WhatsApp / call / email / buy link: counted as a lead for the vendor. */
shopRoutes.post('/products/:id/contact', async (req, res) => {
  await inc('products', { id: Number(req.params.id), status: 'published' }, { contacts: 1 });
  res.json({ ok: true });
});

shopRoutes.get('/vendors/:id', async (req, res) => {
  const vendor = await findOne('vendors', { id: Number(req.params.id), status: 'approved' }, { fields: VENDOR_PUBLIC });
  if (!vendor) throw new HttpError(404, 'Shop not found.');
  const products = await find('products', { vendor_id: vendor.id, status: 'published' }, { sort: { is_featured: -1, id: -1 }, fields: CARD_FIELDS });
  res.json({ vendor, products: await withVendor(products) });
});

// ---- Vendor panel ----
export const vendorRoutes = Router();
vendorRoutes.use(requireAuth);

const myVendor = (req) => findOne('vendors', { user_id: req.user.id });
async function approvedVendor(req) {
  const v = await myVendor(req);
  if (!v) throw new HttpError(403, 'Apply to become a vendor first.');
  if (v.status !== 'approved') throw new HttpError(403, v.status === 'pending' ? 'Your vendor application is still being reviewed.' : 'Your shop is not active. Please contact support.');
  return v;
}

function vendorData(req) {
  const d = fields(req.body, ['name', 'phone'], ['description', 'email', 'city', 'website', 'address', 'gstin']);
  if (!/^\+?[\d\s-]{10,16}$/.test(d.phone)) throw new HttpError(422, 'Please enter a valid phone / WhatsApp number.');
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new HttpError(422, 'Please enter a valid email address.');
  const data = {
    name: d.name.slice(0, 120), phone: d.phone, email: (d.email || req.user.email).toLowerCase(), description: d.description || null,
    city: (d.city || '').slice(0, 80) || null, website: httpUrl(d.website, 'Website'), address: d.address || null, gstin: (d.gstin || '').toUpperCase().slice(0, 15) || null,
  };
  if (req.file) data.logo = uploadedPath(req.file);
  return data;
}

vendorRoutes.get('/me', async (req, res) => {
  const vendor = await myVendor(req);
  if (!vendor) return res.json({ vendor: null });
  const [stats] = await aggregate('products', [{ $match: { vendor_id: vendor.id } }, { $group: {
    _id: null, products: { $sum: 1 }, published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
    hidden: { $sum: { $cond: [{ $eq: ['$status', 'hidden'] }, 1, 0] } }, views: { $sum: { $ifNull: ['$views', 0] } }, contacts: { $sum: { $ifNull: ['$contacts', 0] } },
  } }]);
  res.json({ vendor, stats: { products: 0, published: 0, hidden: 0, views: 0, contacts: 0, ...stats, _id: undefined } });
});

vendorRoutes.post('/apply', upload.single('logo'), cleanUploadsOnError(async (req, res) => {
  onlyImages(req);
  const existing = await myVendor(req);
  if (existing && existing.status !== 'rejected') throw new HttpError(409, 'You have already applied.');
  const data = { ...vendorData(req), status: 'pending', admin_note: null };
  if (existing) await update('vendors', { ...data, applied_at: now() }, { id: existing.id });
  else await insert('vendors', { ...data, user_id: req.user.id, applied_at: now(), created_at: now() });
  await notifyAdmins('New vendor application', `${data.name} (${req.user.name}) wants to sell on the marketplace.`, '/admin/vendors');
  res.status(201).json({ vendor: await myVendor(req) });
}));

vendorRoutes.put('/me', upload.single('logo'), cleanUploadsOnError(async (req, res) => {
  onlyImages(req);
  const v = await myVendor(req);
  if (!v) throw new HttpError(404, 'Apply to become a vendor first.');
  const data = vendorData(req);
  await update('vendors', data, { id: v.id });
  if (data.logo && v.logo !== data.logo) removeUpload(v.logo);
  res.json({ vendor: await myVendor(req) });
}));

vendorRoutes.get('/products', async (req, res) => {
  const v = await myVendor(req);
  res.json(v ? await find('products', { vendor_id: v.id }, { sort: { id: -1 }, exclude: ['search_norm'] }) : []);
});

function productData(req, old) {
  const d = fields(req.body, ['title', 'category', 'price'], ['description', 'mrp', 'stock', 'author', 'publisher', 'language', 'isbn', 'pages', 'buy_link', 'status', 'keep_images']);
  if (!PRODUCT_CATEGORIES.some(([k]) => k === d.category)) throw new HttpError(422, 'Please choose a category.');
  const price = num(d.price, 'Price', { optional: false });
  const mrp = num(d.mrp, 'MRP');
  if (mrp !== null && mrp < price) throw new HttpError(422, 'MRP cannot be lower than the selling price.');
  // Images the vendor kept (in their chosen order), then the new uploads.
  let kept = [];
  if (old) {
    try { kept = JSON.parse(d.keep_images || '[]'); } catch { kept = []; }
    kept = kept.filter((x) => (old.images || []).includes(x));
  }
  const images = [...kept, ...(req.files || []).map(uploadedPath)];
  if (images.length > MAX_IMAGES) throw new HttpError(422, `Up to ${MAX_IMAGES} images per product.`);
  const data = {
    title: d.title.slice(0, 190), category: d.category, description: d.description || null, price, mrp,
    stock: num(d.stock, 'Stock', { int: true }), author: (d.author || '').slice(0, 160) || null, publisher: (d.publisher || '').slice(0, 160) || null,
    language: (d.language || '').slice(0, 60) || null, isbn: (d.isbn || '').replace(/[^\dXx-]/g, '').slice(0, 20) || null, pages: num(d.pages, 'Pages', { min: 1, int: true }),
    buy_link: httpUrl(d.buy_link, 'Buy link'), images,
    // A product an admin has hidden stays hidden until an admin publishes it again.
    status: old?.status === 'hidden' ? 'hidden' : d.status === 'draft' ? 'draft' : 'published',
  };
  return { ...data, search_norm: productNorm(data) };
}

vendorRoutes.post('/products', upload.array('images', MAX_IMAGES), cleanUploadsOnError(async (req, res) => {
  onlyImages(req);
  const v = await approvedVendor(req);
  const data = productData(req, null);
  const id = await insert('products', { ...data, vendor_id: v.id, cover_color: COLORS[Math.floor(Math.random() * COLORS.length)], is_featured: 0, views: 0, contacts: 0, created_at: now(), updated_at: now() });
  res.status(201).json({ id });
}));

vendorRoutes.put('/products/:id', upload.array('images', MAX_IMAGES), cleanUploadsOnError(async (req, res) => {
  onlyImages(req);
  const v = await approvedVendor(req);
  const old = await findOne('products', { id: Number(req.params.id), vendor_id: v.id });
  if (!old) throw new HttpError(404, 'Product not found.');
  const data = productData(req, old);
  await update('products', { ...data, updated_at: now() }, { id: old.id });
  for (const img of old.images || []) if (!data.images.includes(img)) removeUpload(img);
  res.json({ ok: true });
}));

vendorRoutes.delete('/products/:id', async (req, res) => {
  const v = await myVendor(req);
  const old = v && (await findOne('products', { id: Number(req.params.id), vendor_id: v.id }));
  if (!old) throw new HttpError(404, 'Product not found.');
  await remove('products', { id: old.id });
  (old.images || []).forEach(removeUpload);
  res.json({ ok: true });
});

/** Called from the admin panel when a vendor's status changes. */
export async function notifyVendorStatus(vendor, status, note) {
  const msg = {
    approved: ['Your shop is approved', `${vendor.name} is live. Add your products from the Vendor Panel.`],
    rejected: ['Vendor application not approved', `${note || 'Please check your details and apply again.'}`],
    suspended: ['Your shop has been suspended', `${note || 'Your products are hidden. Please contact support.'}`],
  }[status];
  if (msg) await notify(vendor.user_id, msg[0], msg[1], '/vendor');
}
