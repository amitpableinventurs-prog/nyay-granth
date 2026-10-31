import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, del, get, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, Loader, ErrorBox, Empty, Toaster, toast, money, fmtDate, fmtDateTime, timeAgo, usePageTitle, Avatar, Modal } from '../components/ui.jsx';
import { ColumnChart, BarList, Sparkline } from '../components/charts.jsx';
import { Logo } from '../components/Layout.jsx';
import { fmtSize } from '../pages/Pdfs.jsx';

const PdfViewer = lazy(() => import('../components/PdfViewer.jsx'));

const GROUP_ORDER = ['Content', 'Media', 'Community', 'Members', 'System', 'Other'];

export default function Admin() {
  const { user, logout } = useAuth();
  const ents = useApi('/admin/entities');
  const [nav, setNav] = useState(false);
  const location = useLocation();
  useEffect(() => { setNav(false); }, [location.pathname]);

  const groups = useMemo(() => {
    const g = {};
    for (const [k, e] of Object.entries(ents.data || {})) if (!e.hidden) (g[e.group] ||= []).push([k, e]);
    return GROUP_ORDER.filter((name) => g[name]).map((name) => [name, g[name]]);
  }, [ents.data]);

  const current = location.pathname.split('/')[2];
  const currentLabel = current ? ents.data?.[current]?.label : 'Dashboard';

  return (
    <div className={`ng-admin ${nav ? 'nav-open' : ''}`}>
      <aside className="ng-admin-side" aria-label="Admin navigation">
        <div className="ng-admin-brand">
          <Logo size={36} />
          <div className="flex-grow-1"><strong>Nyāya Grantha</strong><small>Admin console</small></div>
          <button className="ng-admin-icon d-lg-none" onClick={() => setNav(false)} aria-label="Close menu"><i className="bi bi-x-lg" /></button>
        </div>
        <nav className="ng-admin-nav">
          <NavLink to="/admin" end><i className="bi bi-grid-1x2" />Dashboard</NavLink>
          {groups.map(([name, items]) => (
            <div key={name}>
              <div className="ng-admin-group">{name}</div>
              {items.map(([k, e]) => <NavLink key={k} to={`/admin/${k}`}><i className={`bi ${e.icon}`} />{e.label}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="ng-admin-side-foot">
          <Link to="/"><i className="bi bi-box-arrow-up-left" />Back to app</Link>
        </div>
      </aside>
      <div className="ng-admin-backdrop" onClick={() => setNav(false)} />

      <div className="ng-admin-body">
        <header className="ng-admin-top">
          <button className="ng-admin-icon d-lg-none" onClick={() => setNav(true)} aria-label="Open menu"><i className="bi bi-list" /></button>
          <div className="ng-admin-crumb">
            <Link to="/admin">Admin</Link>
            {currentLabel && <><i className="bi bi-chevron-right" /><span>{currentLabel}</span></>}
          </div>
          <div className="ms-auto d-flex align-items-center gap-2">
            <Link to="/" className="btn btn-sm btn-light d-none d-sm-inline-flex align-items-center gap-1"><i className="bi bi-globe2" />View site</Link>
            <div className="ng-admin-user">
              <Avatar user={user} size={34} />
              <div className="d-none d-md-block"><div className="fw-semibold small lh-sm">{user.name}</div><small className="text-muted text-capitalize">{user.role}</small></div>
            </div>
            <Link to="/" onClick={logout} className="ng-admin-icon" aria-label="Logout" title="Logout"><i className="bi bi-box-arrow-right" /></Link>
          </div>
        </header>
        <main className="ng-admin-main">
          {ents.loading && <Loader />}
          <ErrorBox error={ents.error} />
          {ents.data && (
            <Routes>
              <Route index element={<Dashboard entities={ents.data} />} />
              <Route path=":entity" element={<EntityList entities={ents.data} />} />
              <Route path=":entity/new" element={<EntityForm entities={ents.data} />} />
              <Route path=":entity/:id" element={<EntityForm entities={ents.data} />} />
            </Routes>
          )}
        </main>
      </div>
      <Toaster />
    </div>
  );
}

// ---------------- Dashboard & analytics ----------------
const sum = (rows) => rows.reduce((s, r) => s + Number(r.count ?? r.value ?? 0), 0);
/** Last 14 days and the 14 before them, from the dashboard's 28-day series. */
const split14 = (rows) => ({ prev: rows.slice(0, -14), cur: rows.slice(-14) });

function Delta({ cur, prev }) {
  if (!cur && !prev) return <span className="ng-delta flat"><i className="bi bi-dash" />No change vs previous 14 days</span>;
  const diff = cur - prev;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const pct = prev ? `${Math.abs(Math.round((diff / prev) * 100))}%` : null;
  return (
    <span className={`ng-delta ${dir}`}>
      <i className={`bi ${dir === 'up' ? 'bi-arrow-up-right' : dir === 'down' ? 'bi-arrow-down-right' : 'bi-dash'}`} />
      {pct ?? (diff > 0 ? `+${diff}` : diff)} <span>vs previous 14 days</span>
    </span>
  );
}

function StatTile({ icon, tone, label, value, foot, trend, trendLabel }) {
  return (
    <div className="ng-stat-tile">
      <div className="d-flex align-items-start gap-3">
        <span className={`ng-stat-icon ${tone}`}><i className={`bi ${icon}`} /></span>
        <div className="min-w-0 flex-grow-1">
          <div className="ng-stat-label">{label}</div>
          <div className="ng-stat-value">{value}</div>
        </div>
      </div>
      {trend && <Sparkline data={trend} label={trendLabel} />}
      <div className="ng-stat-foot">{foot}</div>
    </div>
  );
}

const SERIES = [
  ['signups', 'Sign-ups', 'sign-ups'],
  ['reading', 'Sections read', 'sections'],
  ['aiUsage', 'AI requests', 'requests'],
  ['payments', 'Payments', 'payments'],
];

const STATUS_TONE = {
  published: 'good', active: 'good', paid: 'good', open: 'warn', in_progress: 'info', pending: 'warn', created: 'warn',
  draft: 'muted', closed: 'muted', cancelled: 'muted', expired: 'muted', suspended: 'bad', failed: 'bad',
  ready: 'good', queued: 'warn', processing: 'info', no_text: 'warn',
};
const STATUS_ICON = { good: 'bi-check-circle-fill', warn: 'bi-clock-fill', info: 'bi-arrow-repeat', bad: 'bi-x-circle-fill', muted: 'bi-dash-circle' };
export function StatusBadge({ value, label }) {
  const tone = STATUS_TONE[value] || 'muted';
  return <span className={`ng-status ${tone}`}><i className={`bi ${STATUS_ICON[tone]}`} />{label ?? String(value).replace(/_/g, ' ')}</span>;
}

function Dashboard({ entities }) {
  usePageTitle('Admin Dashboard');
  const { user } = useAuth();
  const { data, error, loading } = useApi('/admin/dashboard');
  const [series, setSeries] = useState('signups');
  const [asTable, setAsTable] = useState(false);
  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;

  const tot = data.totals;
  const lib = data.library;
  const signups = split14(data.signups);
  const reading = split14(data.reading);
  const [, seriesLabel, seriesUnit] = SERIES.find(([k]) => k === series);
  const active = split14(data[series]).cur;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const can = (k) => !!entities[k];

  const quick = [
    ['pdfs', 'bi-cloud-arrow-up', 'Upload PDF'],
    ['texts', 'bi-journal-plus', 'Add text'],
    ['events', 'bi-camera-video', 'Schedule class'],
    ['notifications', 'bi-megaphone', 'Send notification'],
  ].filter(([k]) => can(k));

  const inventory = [
    ['texts', 'bi-book', 'Texts', lib.texts, `${lib.sections} sections`],
    ['pdfs', 'bi-file-earmark-pdf', 'PDFs', lib.pdfs],
    ['audio', 'bi-music-note-beamed', 'Audio', lib.audio],
    ['presentations', 'bi-easel', 'Presentations', lib.presentations],
    ['glossary', 'bi-translate', 'Dictionary terms', lib.glossary],
    ['categories', 'bi-tags', 'Categories', lib.categories],
    ['events', 'bi-calendar-event', 'Upcoming classes', lib.events],
  ];

  const integ = data.integrations;
  const systems = [
    ['Database', 'bi-database', true, integ.database === 'mongodb' ? 'MongoDB connected' : integ.database],
    ['AI assistance', 'bi-robot', integ.ai, integ.ai ? 'API key set' : 'Offline answers only'],
    ['Razorpay', 'bi-credit-card', integ.razorpay],
    ['Stripe', 'bi-stripe', integ.stripe],
    ['WhatsApp API', 'bi-whatsapp', integ.whatsapp],
    ['Google login', 'bi-google', integ.google],
  ];

  return (
    <div className="ng-dash">
      <section className="ng-welcome">
        <div>
          <div className="ng-welcome-date">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <h1>{greeting}, {user.name.split(' ')[0]}</h1>
          <p>{tot.openTickets ? `${tot.openTickets} open ticket${tot.openTickets > 1 ? 's' : ''} in the inbox · ` : 'Inbox is clear · '}{sum(signups.cur)} new users in the last 14 days</p>
        </div>
        <div className="ng-welcome-actions">
          {quick.map(([k, icon, label]) => <Link key={k} to={`/admin/${k}/new`} className="ng-quick"><i className={`bi ${icon}`} />{label}</Link>)}
        </div>
      </section>

      <div className="row g-3 mb-3">
        <div className="col-sm-6 col-xl-3">
          <StatTile icon="bi-people" tone="blue" label="Users" value={tot.users.toLocaleString('en-IN')} trend={signups.cur} trendLabel="Sign-ups per day, last 14 days"
            foot={<Delta cur={sum(signups.cur)} prev={sum(signups.prev)} />} />
        </div>
        <div className="col-sm-6 col-xl-3">
          <StatTile icon="bi-gem" tone="violet" label="Active members" value={tot.activeSubscriptions.toLocaleString('en-IN')}
            foot={<span className="text-muted">{tot.users ? Math.round((tot.activeSubscriptions / tot.users) * 100) : 0}% of all users</span>} />
        </div>
        <div className="col-sm-6 col-xl-3">
          <StatTile icon="bi-currency-rupee" tone="green" label="Revenue" value={money(tot.revenue)}
            foot={<span className="text-muted">{tot.demoRevenue ? `${money(tot.demoRevenue)} in demo payments` : 'Paid through gateways'}</span>} />
        </div>
        <div className="col-sm-6 col-xl-3">
          <StatTile icon="bi-book-half" tone="saffron" label="Sections read · 14 days" value={sum(reading.cur).toLocaleString('en-IN')} trend={reading.cur} trendLabel="Sections read per day, last 14 days"
            foot={<Delta cur={sum(reading.cur)} prev={sum(reading.prev)} />} />
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-xl-8">
          <div className="ng-panel h-100">
            <div className="ng-panel-head">
              <div>
                <h2>Activity</h2>
                <p><strong>{sum(active).toLocaleString('en-IN')}</strong> {seriesLabel.toLowerCase()} in the last 14 days</p>
              </div>
              <div className="d-flex gap-2 align-items-center flex-wrap">
                <div className="ng-seg" role="tablist" aria-label="Activity series">
                  {SERIES.map(([k, l]) => <button key={k} role="tab" aria-selected={series === k} className={series === k ? 'on' : ''} onClick={() => setSeries(k)}>{l}</button>)}
                </div>
                <button className={`ng-admin-icon sm ${asTable ? 'on' : ''}`} onClick={() => setAsTable(!asTable)} aria-pressed={asTable} title={asTable ? 'Show chart' : 'Show table'} aria-label={asTable ? 'Show chart' : 'Show table'}>
                  <i className={`bi ${asTable ? 'bi-bar-chart' : 'bi-table'}`} />
                </button>
              </div>
            </div>
            {asTable ? (
              <div className="ng-dash-table">
                <table className="table table-sm small mb-0">
                  <thead><tr><th>Day</th><th className="text-end">{seriesLabel}</th></tr></thead>
                  <tbody>{[...active].reverse().map((d) => <tr key={d.day}><td>{fmtDate(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td className="text-end num">{d.count}</td></tr>)}</tbody>
                </table>
              </div>
            ) : (
              <ColumnChart data={active} unit={seriesUnit} height={290} axis />
            )}
          </div>
        </div>
        <div className="col-xl-4">
          <div className="ng-panel h-100">
            <div className="ng-panel-head"><div><h2>Library</h2><p>Everything readers can open</p></div></div>
            <div className="ng-inventory">
              {inventory.filter(([k]) => can(k)).map(([k, icon, label, n, sub]) => (
                <Link key={k} to={`/admin/${k}`}>
                  <span className="ng-inv-icon"><i className={`bi ${icon}`} /></span>
                  <span className="flex-grow-1">{label}{sub && <small>{sub}</small>}</span>
                  <b>{Number(n).toLocaleString('en-IN')}</b>
                  <i className="bi bi-chevron-right text-muted" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-4">
          <div className="ng-panel h-100">
            <div className="ng-panel-head"><div><h2>Most read texts</h2><p>All-time views</p></div>{can('texts') && <Link to="/admin/texts" className="ng-panel-link">Texts</Link>}</div>
            <BarList items={data.topTexts.map((x) => ({ label: x.title, value: Number(x.views || 0) }))} color="var(--ng-navy-2)" />
          </div>
        </div>
        <div className="col-lg-4">
          <div className="ng-panel h-100">
            <div className="ng-panel-head"><div><h2>Most viewed PDFs</h2><p>All-time views</p></div>{can('pdfs') && <Link to="/admin/pdfs" className="ng-panel-link">PDFs</Link>}</div>
            <BarList items={data.topPdfs.map((x) => ({ label: x.title, value: Number(x.views || 0) }))} color="var(--ng-navy-2)" empty="No PDF has been opened yet." />
          </div>
        </div>
        <div className="col-lg-4">
          <div className="ng-panel h-100">
            <div className="ng-panel-head"><div><h2>Research trends</h2><p>Top searches · 30 days</p></div></div>
            <BarList items={data.trends.map((x) => ({ label: x.query, value: Number(x.hits) }))} color="var(--ng-navy-2)" empty="No searches in the last 30 days." />
          </div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-xl-7">
          <div className="ng-panel h-100">
            <div className="ng-panel-head"><div><h2>Recent PDF uploads</h2><p>Newest first</p></div>{can('pdfs') && <Link to="/admin/pdfs/new" className="btn btn-sm btn-saffron"><i className="bi bi-cloud-arrow-up me-1" />Upload</Link>}</div>
            {data.recentPdfs.length === 0 ? (
              <div className="ng-dash-empty"><i className="bi bi-file-earmark-pdf" /><div>No PDFs yet. Upload books, manuscripts or papers for readers.</div></div>
            ) : (
              <div className="ng-rows">
                {data.recentPdfs.map((p) => (
                  <Link key={p.id} to={`/admin/pdfs/${p.id}`} className="ng-row">
                    {p.cover ? <img src={p.cover} alt="" className="ng-row-thumb" /> : <span className="ng-row-thumb gen"><i className="bi bi-file-earmark-pdf" /></span>}
                    <span className="flex-grow-1 min-w-0">
                      <span className="d-block fw-semibold text-truncate">{p.title}</span>
                      <small className="text-muted">{[p.author, p.pages && `${p.pages} pages`, fmtSize(p.size)].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="text-end">
                      <StatusBadge value={p.status} />
                      <small className="d-block text-muted mt-1">{timeAgo(p.created_at)}</small>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="col-xl-5">
          <div className="ng-panel h-100">
            <div className="ng-panel-head"><div><h2>Open tickets</h2><p>Feedback, contact and help desk</p></div><Link to="/admin/feedback" className="ng-panel-link">Inbox</Link></div>
            {data.recentTickets.length === 0 ? (
              <div className="ng-dash-empty"><i className="bi bi-inbox" /><div>Inbox zero.</div></div>
            ) : (
              <div className="ng-rows">
                {data.recentTickets.map((f) => (
                  <Link key={f.id} to={`/admin/feedback/${f.id}`} className="ng-row">
                    <Avatar user={{ name: f.name }} size={34} />
                    <span className="flex-grow-1 min-w-0">
                      <span className="d-block fw-semibold text-truncate">{f.subject || '(no subject)'}</span>
                      <small className="text-muted">{f.name} · {timeAgo(f.created_at)}</small>
                    </span>
                    <span className="ng-kind">{f.kind}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-xl-6">
          <div className="ng-panel h-100">
            <div className="ng-panel-head"><div><h2>Recent payments</h2><p>Last 6 transactions</p></div>{can('payments') && <Link to="/admin/payments" className="ng-panel-link">All payments</Link>}</div>
            {data.recentPayments.length === 0 ? (
              <div className="ng-dash-empty"><i className="bi bi-credit-card" /><div>No payments yet.</div></div>
            ) : (
              <div className="ng-rows">
                {data.recentPayments.map((p) => (
                  <div key={p.id} className="ng-row">
                    <Avatar user={{ name: p.name }} size={34} />
                    <span className="flex-grow-1 min-w-0">
                      <span className="d-block fw-semibold text-truncate">{p.name}</span>
                      <small className="text-muted">{p.plan_name} · {fmtDateTime(p.created_at)}</small>
                    </span>
                    <span className="text-end">
                      <span className="d-block fw-semibold num">{money(p.amount)}</span>
                      <StatusBadge value={p.status} />{p.gateway === 'demo' && <span className="ng-kind ms-1">demo</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="col-md-6 col-xl-3">
          <div className="ng-panel h-100">
            <div className="ng-panel-head"><div><h2>Members by plan</h2><p>Active subscriptions</p></div></div>
            <BarList items={data.subsByPlan.map((x) => ({ label: x.name, value: Number(x.n) }))} color="var(--ng-navy-2)" />
            <div className="ng-mini-stats">
              <div><b>{tot.aiRequests.toLocaleString('en-IN')}</b><span>AI requests</span></div>
              <div><b>{tot.openTickets}</b><span>Open tickets</span></div>
            </div>
          </div>
        </div>
        <div className="col-md-6 col-xl-3">
          <div className="ng-panel h-100">
            <div className="ng-panel-head"><div><h2>System status</h2><p>Integrations in server/.env</p></div></div>
            <ul className="ng-systems">
              {systems.map(([label, icon, on, note]) => (
                <li key={label}>
                  <i className={`bi ${icon} ng-sys-icon`} />
                  <span className="flex-grow-1">{label}<small>{note || (on ? 'Configured' : 'Not configured')}</small></span>
                  <StatusBadge value={on ? 'active' : 'draft'} label={on ? 'On' : 'Off'} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Generic list ----------------
const display = (v, f, row, ent) => {
  if (v === null || v === undefined || v === '') return <span className="text-muted">—</span>;
  if (f?.type === 'checkbox') return Number(v) ? <i className="bi bi-check-circle-fill text-success" aria-label="Yes" /> : <i className="bi bi-circle text-muted" aria-label="No" />;
  if (f?.name === 'index_status') return <StatusBadge value={v} label={f.options?.find(([o]) => String(o) === String(v))?.[1]} />;
  if (f?.name === 'status') {
    // A subscription past its end date is shown as expired, whatever its stored status.
    if (v === 'active' && row.ends_at && row.ends_at < new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19)) return <StatusBadge value="expired" />;
    return <StatusBadge value={v} label={f.options?.find(([o]) => String(o) === String(v))?.[1]} />;
  }
  if (f?.name === 'amount') return <span className="num">{money(v)}</span>;
  if (f?.options) return f.options.find(([o]) => String(o) === String(v))?.[1] ?? v;
  if (f?.name === 'size') return fmtSize(v);
  if (/_at$/.test(f?.name || '')) return fmtDateTime(v);
  if (f?.name === 'title' && ent.fields.some((x) => x.name === 'cover')) {
    return <span className="d-inline-flex align-items-center gap-2">{row.cover ? <img src={row.cover} alt="" className="ng-cell-thumb" /> : <span className="ng-cell-thumb gen"><i className={`bi ${ent.icon}`} /></span>}<span className="text-truncate fw-semibold">{String(v)}</span></span>;
  }
  return String(v);
};

function EntityList({ entities }) {
  const { entity } = useParams();
  const ent = entities[entity];
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries(params);
  const { data, error, loading, reload } = useApi(ent ? `/admin/${entity}` + qs(query) : null);
  usePageTitle(ent?.label);
  // While PDFs are being indexed, refresh the list so their status updates by itself.
  const busyRows = data?.rows?.some((r) => ['queued', 'processing'].includes(r.index_status));
  useEffect(() => {
    if (!busyRows) return undefined;
    const timer = setTimeout(reload, 2000);
    return () => clearTimeout(timer);
  }, [busyRows, data, reload]);
  if (!ent) return <Empty title="Unknown section" />;
  const fieldOf = (name) => ent.fields.find((f) => f.name === name) || { name };
  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); p.delete('page'); setParams(p); };
  const parentFilter = ent.filters.find((f) => f.endsWith('_id') && query[f]);
  const labelOf = (c) => fieldOf(c).label?.replace(/\s*\(.*\)$/, '') || c.replace(/_/g, ' ');

  const remove = async (id) => {
    if (!window.confirm('Delete this record permanently?')) return;
    try { await del(`/admin/${entity}/${id}`); toast('Deleted'); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="ng-page-head">
        <span className="ng-page-head-icon"><i className={`bi ${ent.icon}`} /></span>
        <div className="flex-grow-1 min-w-0">
          <h1>{ent.label}</h1>
          <p>{data ? `${data.total.toLocaleString('en-IN')} record${data.total === 1 ? '' : 's'}` : ' '}{ent.readonly ? ' · read-only' : ''}</p>
        </div>
        {!ent.readonly && !ent.noCreate && (
          <Link to={`/admin/${entity}/new${parentFilter ? `?${parentFilter}=${query[parentFilter]}` : ''}`} className="btn btn-saffron">
            <i className={`bi ${entity === 'pdfs' ? 'bi-cloud-arrow-up' : 'bi-plus-lg'} me-1`} />{entity === 'pdfs' ? 'Upload PDF' : 'Add'}
          </Link>
        )}
      </div>
      <div className="ng-panel p-0">
        <div className="ng-list-tools">
          <div className="input-group input-group-sm" style={{ maxWidth: 300 }}>
            <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
            <input className="form-control" placeholder="Search… (press Enter)" defaultValue={query.q || ''} onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value)} aria-label="Search" />
          </div>
          {ent.filters.map((fname) => {
            const f = fieldOf(fname);
            if (!f.options) return null;
            return (
              <select key={fname} className="form-select form-select-sm" style={{ maxWidth: 220 }} value={query[fname] || ''} onChange={(e) => set(fname, e.target.value)} aria-label={f.label}>
                <option value="">All {labelOf(fname).toLowerCase().replace(/([^aeiou])y$/, '$1ie').replace(/s$/, 'se')}s</option>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            );
          })}
          {Object.keys(query).some((k) => k !== 'page') && <button className="btn btn-sm btn-link text-decoration-none" onClick={() => setParams({})}>Clear filters</button>}
        </div>
        {loading && !data && <Loader />}
        <div className="px-3"><ErrorBox error={error} onRetry={reload} /></div>
        {data && (
          <div className="overflow-auto" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="table table-hover ng-table mb-0">
              <thead><tr>{ent.list.map((c) => <th key={c} className={c === 'id' ? 'ng-col-id' : ''}>{labelOf(c)}</th>)}<th /></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    {ent.list.map((c) => <td key={c} className={c === 'id' ? 'ng-col-id' : 'ng-truncate'}>{c === 'id' ? `#${r.id}` : display(r[c], fieldOf(c), r, ent)}</td>)}
                    <td className="text-end text-nowrap">
                      {ent.child && <Link to={`/admin/${ent.child.entity}?${ent.child.key}=${r.id}`} className="btn btn-sm btn-light me-1">{ent.child.label}</Link>}
                      {entity === 'pdfs' && r.status === 'published' && <Link to={`/pdfs/${r.id}`} className="btn btn-sm btn-light me-1" aria-label="Open in app" title="Open in app"><i className="bi bi-eye" /></Link>}
                      {!ent.readonly && <Link to={`/admin/${entity}/${r.id}`} className="btn btn-sm btn-light me-1" aria-label="Edit" title="Edit"><i className="bi bi-pencil" /></Link>}
                      {!ent.readonly && <button className="btn btn-sm btn-light text-danger" onClick={() => remove(r.id)} aria-label="Delete" title="Delete"><i className="bi bi-trash" /></button>}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={ent.list.length + 1}><div className="ng-dash-empty"><i className={`bi ${ent.icon}`} /><div>No records{query.q ? ` match “${query.q}”` : ' yet'}.</div></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.perPage && (
          <div className="ng-list-foot">
            <span className="text-muted">Showing {(data.page - 1) * data.perPage + 1}–{Math.min(data.total, data.page * data.perPage)} of {data.total}</span>
            <div className="btn-group">
              <button className="btn btn-sm btn-light" disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))}><i className="bi bi-chevron-left" /> Prev</button>
              <span className="btn btn-sm btn-light disabled">Page {data.page} / {Math.ceil(data.total / data.perPage)}</span>
              <button className="btn btn-sm btn-light" disabled={data.page * data.perPage >= data.total} onClick={() => set('page', String(data.page + 1))}>Next <i className="bi bi-chevron-right" /></button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------- Generic form ----------------
const isPdfName = (s) => /\.pdf([?#]|$)/i.test(String(s || ''));
const titleFromFile = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const SIDE = (f) => f.type === 'file' || f.type === 'image' || f.type === 'checkbox' || f.name === 'status';

function EntityForm({ entities }) {
  const { entity, id } = useParams();
  const [params] = useSearchParams();
  const ent = entities[entity];
  const navigate = useNavigate();
  const isNew = !id;
  const [values, setValues] = useState(null);
  const [files, setFiles] = useState({});
  const [auto, setAuto] = useState({}); // fields filled in from the chosen PDF
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  usePageTitle(ent ? `${isNew ? 'Add' : 'Edit'} ${ent.label}` : 'Admin');

  useEffect(() => {
    if (!ent) return;
    setFiles({}); setAuto({});
    if (isNew) {
      const init = {};
      for (const f of ent.fields) init[f.name] = params.get(f.name) ?? f.default ?? (f.type === 'checkbox' ? (f.name === 'is_active' ? 1 : 0) : f.options && f.required ? f.options[0]?.[0] ?? '' : '');
      setValues(init);
    } else {
      get(`/admin/${entity}/${id}`).then(setValues).catch((e) => toast(e.message, 'error'));
    }
  }, [entity, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ent) return <Empty title="Unknown section" />;
  if (!values) return <Loader />;
  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  const has = (name) => ent.fields.some((f) => f.name === name);

  // A PDF chosen for upload fills in the title, page count and a cover rendered from page 1.
  const onPdfChosen = async (file) => {
    if (has('title') && !values.title) { set('title', titleFromFile(file.name)); setAuto((a) => ({ ...a, title: true })); }
    setReading(true);
    try {
      const { inspectPdf } = await import('../components/pdfjs.js');
      const info = await inspectPdf(file);
      if (has('pages')) { set('pages', info.pages); setAuto((a) => ({ ...a, pages: true })); }
      if (has('cover') && !values.cover && info.cover) {
        setFiles((fs) => (fs.cover && !fs.cover.generated ? fs : { ...fs, cover: Object.assign(new File([info.cover], 'cover.jpg', { type: 'image/jpeg' }), { generated: true }) }));
        setAuto((a) => ({ ...a, cover: true }));
      }
    } catch (e) {
      toast(`This PDF could not be read: ${e.message}`, 'error');
    } finally {
      setReading(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const form = new FormData();
    let uploading = false;
    for (const f of ent.fields) {
      if (f.readonly || (f.createOnly && !isNew)) continue;
      if ((f.type === 'image' || f.type === 'file') && files[f.name]) { form.append(f.name, files[f.name]); uploading = true; continue; }
      let v = values[f.name];
      if (f.type === 'checkbox') v = Number(v) || v === true ? '1' : '0';
      form.append(f.name, v ?? '');
    }
    try {
      if (uploading) setProgress(0);
      const r = await api(isNew ? `/admin/${entity}` : `/admin/${entity}/${id}`, { method: isNew ? 'POST' : 'PUT', form, onProgress: uploading ? setProgress : undefined });
      toast(r.message || 'Saved');
      const parent = ent.filters.find((f) => f.endsWith('_id') && values[f] && ent.fields.find((x) => x.name === f)?.required);
      navigate(`/admin/${entity}${parent ? `?${parent}=${values[parent]}` : ''}`);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); setProgress(null); }
  };

  const input = (f) => {
    const v = values[f.name] ?? '';
    const common = { id: `f-${f.name}`, disabled: f.readonly, required: f.required };
    switch (f.type) {
      case 'textarea': return <textarea className={`form-control ${f.className === 'sanskrit' ? 'sanskrit fs-5' : ''}`} rows={f.rows || 4} value={v} onChange={(e) => set(f.name, e.target.value)} {...common} />;
      case 'select': return (
        <select className="form-select" value={v ?? ''} onChange={(e) => set(f.name, e.target.value)} {...common}>
          {!f.required && <option value="">{f.emptyLabel || '— none —'}</option>}
          {f.options.map(([o, l]) => <option key={o} value={o}>{l}</option>)}
        </select>
      );
      case 'checkbox': return <div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={!!Number(v) || v === true} onChange={(e) => set(f.name, e.target.checked ? 1 : 0)} id={common.id} /><label className="form-check-label" htmlFor={common.id}>{f.label}</label></div>;
      case 'datetime': return <input className="form-control" type="datetime-local" value={String(v).replace(' ', 'T').slice(0, 16)} onChange={(e) => set(f.name, e.target.value)} {...common} />;
      case 'number': return <input className="form-control" type="number" step={f.step || '1'} value={v} onChange={(e) => { set(f.name, e.target.value); setAuto((a) => ({ ...a, [f.name]: false })); }} {...common} />;
      case 'color': return <input className="form-control form-control-color" type="color" value={v || '#7a2e12'} onChange={(e) => set(f.name, e.target.value)} {...common} />;
      case 'password': return <input className="form-control" type="password" autoComplete="new-password" value={v} onChange={(e) => set(f.name, e.target.value)} id={common.id} />;
      case 'image':
      case 'file': return (
        <FileDrop
          field={f} value={v} file={files[f.name]} generated={auto[f.name]}
          onFile={(file) => {
            setFiles((fs) => ({ ...fs, [f.name]: file }));
            setAuto((a) => ({ ...a, [f.name]: false }));
            if (file && f.type === 'file' && isPdfName(file.name)) onPdfChosen(file);
            else if (file && f.type === 'file' && has('title') && !values.title) { set('title', titleFromFile(file.name)); setAuto((a) => ({ ...a, title: true })); }
          }}
          onValue={(url) => set(f.name, url)}
        />
      );
      default: return <input className="form-control" type={f.type === 'email' ? 'email' : 'text'} value={v} onChange={(e) => { set(f.name, e.target.value); setAuto((a) => ({ ...a, [f.name]: false })); }} {...common} />;
    }
  };

  const fields = ent.fields.filter((f) => !(f.createOnly && !isNew) && !(f.readonly && f.name === 'index_status'));
  const main = fields.filter((f) => !SIDE(f));
  const side = fields.filter(SIDE);
  const row = (f) => (
    <div className="mb-3" key={f.name}>
      {f.type !== 'checkbox' && (
        <label className="form-label small fw-semibold" htmlFor={`f-${f.name}`}>
          {f.label}{f.required && <span className="text-danger"> *</span>}
          {auto[f.name] && f.type !== 'image' && <span className="ng-auto"><i className="bi bi-magic" /> from PDF</span>}
        </label>
      )}
      {input(f)}
      {reading && f.type === 'file' && <div className="form-text text-navy"><span className="spinner-border spinner-border-sm me-1" />Reading page count and cover…</div>}
      {f.help && <div className="form-text" style={{ whiteSpace: 'pre-line' }}>{f.help}</div>}
    </div>
  );

  return (
    <>
      <div className="ng-page-head">
        <button className="ng-admin-icon" onClick={() => navigate(-1)} aria-label="Back"><i className="bi bi-arrow-left" /></button>
        <div className="flex-grow-1 min-w-0">
          <h1>{isNew ? (entity === 'pdfs' ? 'Upload PDF' : `Add · ${ent.label}`) : `Edit · ${ent.label}`}{!isNew && <span className="text-muted fw-normal"> #{id}</span>}</h1>
          <p>{isNew ? 'Fields marked * are required.' : values.title || values.name || ''}</p>
        </div>
      </div>
      <form onSubmit={save} className="row g-3">
        <div className={side.length && main.length ? 'col-lg-8' : 'col-12'} style={{ maxWidth: side.length ? undefined : 900 }}>
          {main.length > 0 && <div className="ng-panel">{main.map(row)}</div>}
          {!main.length && <div className="ng-panel">{side.map(row)}</div>}
        </div>
        {side.length > 0 && main.length > 0 && (
          <div className="col-lg-4">
            <div className="ng-panel ng-form-side">{side.map(row)}</div>
          </div>
        )}
        <div className="col-12">
          <div className="ng-savebar">
            {progress !== null && (
              <div className="flex-grow-1 d-flex align-items-center gap-2 small">
                <div className="progress flex-grow-1" style={{ height: 8 }} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="progress-bar progress-bar-striped progress-bar-animated" style={{ width: `${progress * 100}%` }} />
                </div>
                <span className="num">{progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : 'Processing…'}</span>
              </div>
            )}
            <div className="ms-auto d-flex gap-2">
              <button type="button" className="btn btn-light" onClick={() => navigate(-1)} disabled={busy}>Cancel</button>
              <button className="btn btn-navy px-4" disabled={busy}>{busy ? 'Saving…' : <><i className="bi bi-check2 me-1" />Save</>}</button>
            </div>
          </div>
        </div>
      </form>
      {entity === 'pdfs' && !isNew && <PdfIndexPanel id={id} />}
    </>
  );
}

const INDEX_METHOD = {
  outline: "From the PDF's bookmarks",
  headings: 'Detected from headings (font size, numbering and words like Chapter / Lesson / अध्याय / पाठ)',
  manual: 'From the index typed in above',
  verses: 'From verse numbers (e.g. ॥ १.००१.०१ ॥): first number = chapter, first two = lesson',
  pages: 'No headings found — split into page ranges',
  styles: "From the document's heading styles (Heading 1 = chapter, Heading 2 = lesson)",
  parts: 'No headings found — split into parts of about 1,200 words',
  none: 'No text and no bookmarks',
};

/** The chapters and lessons found in an uploaded PDF, with re-indexing. */
function PdfIndexPanel({ id }) {
  const { data, error, reload, setData } = useApi(`/admin/pdfs/${id}/index`);
  const working = ['queued', 'processing'].includes(data?.index_status);
  useEffect(() => {
    if (!working) return undefined;
    const timer = setTimeout(reload, 1500);
    return () => clearTimeout(timer);
  }, [working, data, reload]);
  const reindex = async () => {
    try { await api(`/admin/pdfs/${id}/reindex`, { method: 'POST' }); setData((d) => ({ ...d, index_status: 'queued' })); } catch (e) { toast(e.message, 'error'); }
  };
  if (error) return <div className="mt-3"><ErrorBox error={error} /></div>;
  if (!data) return null;
  const st = data.index_stats || {};
  const chapters = data.sections.filter((s) => !s.parent_id);
  return (
    <section className="ng-panel mt-3" aria-label="PDF index">
      <div className="ng-panel-head">
        <div>
          <h2>Index · chapters &amp; lessons</h2>
          <p>{working ? 'Reading the PDF and building its index…' : INDEX_METHOD[data.index_method] || 'Not indexed yet'}{data.indexed_at && !working ? ` · ${fmtDateTime(data.indexed_at)}` : ''}</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          {data.index_status && <StatusBadge value={data.index_status} label={{ ready: 'Indexed', queued: 'Queued', processing: 'Processing', no_text: 'No text', failed: 'Failed' }[data.index_status]} />}
          <button className="btn btn-sm btn-outline-secondary" onClick={reindex} disabled={working}><i className="bi bi-arrow-repeat me-1" />Re-index</button>
        </div>
      </div>
      {working && <div className="progress mb-3" style={{ height: 4 }}><div className="progress-bar progress-bar-striped progress-bar-animated" style={{ width: '100%' }} /></div>}
      {data.index_status === 'failed' && <div className="alert alert-danger small">{data.index_error || 'Indexing failed.'}</div>}
      {data.index_stats?.text_quality === 'partial' && !working && (
        <div className="alert alert-warning small mb-3">
          {Number(data.index_stats.unreadable_chars).toLocaleString('en-IN')} characters in this PDF use a font that does not map its letters (often conjuncts) to Unicode, so the text view and search miss them. The chapters, pages and verse numbers are still correct. For a complete text, upload a Unicode PDF of the same work.
        </div>
      )}
      {data.index_status === 'no_text' && (
        <div className="alert alert-warning small mb-3">This PDF has no text layer (it is probably a scan), so its text cannot be read. Readers can still view it page by page. To give it chapters and lessons, type the index in the field above and save.</div>
      )}
      {!working && data.index_stats && (
        <div className="ng-index-stats">
          {[['Pages', st.pages], ['Pages with text', st.text_pages], ['Chapters', st.chapters], ['Lessons', st.lessons], ['Words', st.words], ['Header/footer lines removed', st.removed_lines], ['Unreadable characters', st.unreadable_chars]].filter(([, v]) => v !== null && v !== undefined).map(([l, v]) => (
            <div key={l}><b>{Number(v || 0).toLocaleString('en-IN')}</b><span>{l}</span></div>
          ))}
        </div>
      )}
      {!working && chapters.length > 0 && (
        <ol className="ng-index-tree">
          {chapters.map((c) => (
            <li key={c.id}>
              <IndexRow s={c} />
              {data.sections.some((l) => l.parent_id === c.id) && (
                <ol>{data.sections.filter((l) => l.parent_id === c.id).map((l) => <li key={l.id}><IndexRow s={l} /></li>)}</ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function IndexRow({ s }) {
  return (
    <details className="ng-index-row">
      <summary>
        <span className="ng-kind">{s.kind === 'front' ? 'front matter' : s.kind}</span>
        <span className="flex-grow-1 min-w-0 text-truncate fw-semibold">{s.title}</span>
        <small className="text-muted text-nowrap">{s.page_start ? `p. ${s.page_start}${s.page_end !== s.page_start ? `–${s.page_end}` : ''} · ` : ''}{s.word_count} words</small>
      </summary>
      <p>{s.preview || <em className="text-muted">No text in this part.</em>}{s.preview?.length >= 220 ? '…' : ''}</p>
    </details>
  );
}

/** Drag-and-drop file picker with a preview (image thumbnail, or PDF details with an in-app preview). */
function FileDrop({ field, value, file, generated, onFile, onValue }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [preview, setPreview] = useState(false);
  const exts = (field.accept || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x.startsWith('.'));
  const isImage = field.type === 'image';
  const blobUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => blobUrl && URL.revokeObjectURL(blobUrl), [blobUrl]);
  const src = blobUrl || value;
  const name = file?.name || (value ? decodeURIComponent(String(value).split('/').pop()) : '');
  const pdf = !isImage && isPdfName(file?.name || value);
  const ext = String(file?.name || value || '').split(/[?#]/)[0].split('.').pop().toLowerCase();
  const docIcon = pdf ? 'bi-file-earmark-pdf-fill' : ['doc', 'docx'].includes(ext) ? 'bi-file-earmark-word-fill' : ['txt', 'md', 'rtf', 'odt'].includes(ext) ? 'bi-file-earmark-text-fill' : 'bi-file-earmark';

  const pick = (f) => {
    if (!f) return;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (exts.length && !exts.includes(ext)) return toast(`Please choose a ${exts.join(' / ')} file.`, 'error');
    if (isImage && !f.type.startsWith('image/')) return toast('Please choose an image.', 'error');
    if (f.size > 100 * 1024 * 1024) return toast('The file is too large (100 MB maximum).', 'error');
    onFile(f);
  };

  const what = isImage ? 'an image' : exts.length === 1 ? `a ${exts[0].slice(1).toUpperCase()}` : 'a file';
  return (
    <div>
      {src ? (
        <div className="ng-file-card">
          {isImage
            ? <img src={src} alt="" className="ng-file-img" />
            : <span className={`ng-file-icon ${pdf ? 'pdf' : ['doc', 'docx'].includes(ext) ? 'word' : ''}`}><i className={`bi ${docIcon}`} /></span>}
          <div className="min-w-0 flex-grow-1">
            <div className="small fw-semibold text-truncate" title={name}>{generated ? 'Cover from page 1' : name}</div>
            <small className="text-muted">{file ? `${fmtSize(file.size)} · ready to upload` : 'Current file'}</small>
            <div className="d-flex gap-1 mt-1 flex-wrap">
              {pdf && <button type="button" className="btn btn-xs btn-light" onClick={() => setPreview(true)}><i className="bi bi-eye" /> Preview</button>}
              {!pdf && !isImage && value && <a href={value} target="_blank" rel="noreferrer" className="btn btn-xs btn-light"><i className="bi bi-box-arrow-up-right" /> Open</a>}
              <button type="button" className="btn btn-xs btn-light" onClick={() => input.current?.click()}><i className="bi bi-arrow-repeat" /> Replace</button>
              <button type="button" className="btn btn-xs btn-light text-danger" onClick={() => { onFile(null); onValue(''); }}><i className="bi bi-x-lg" /> Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`ng-drop ${over ? 'over' : ''}`} role="button" tabIndex={0}
          onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
        >
          <i className={`bi ${isImage ? 'bi-image' : 'bi-cloud-arrow-up'}`} />
          <div><strong>Drop {what} here</strong> or <span className="text-navy text-decoration-underline">browse</span></div>
          <small>{exts.length ? exts.join(', ').toUpperCase() : isImage ? 'JPG, PNG, WebP' : ''}{!isImage ? ' · up to 100 MB' : ''}</small>
        </div>
      )}
      <input ref={input} type="file" className="d-none" accept={field.accept || (isImage ? 'image/*' : undefined)} id={`f-${field.name}`} onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      {showUrl || (value && !file && /^https?:/.test(value))
        ? <input className="form-control form-control-sm mt-2" placeholder="https://…" value={value || ''} onChange={(e) => { onFile(null); onValue(e.target.value); }} aria-label={`${field.label} URL`} />
        : !file && <button type="button" className="btn btn-link btn-sm px-0 text-decoration-none" onClick={() => setShowUrl(true)}>…or use a URL</button>}
      <Modal show={preview} title={name} onClose={() => setPreview(false)} size="lg">
        {preview && <Suspense fallback={<Loader />}><PdfViewer url={src} title={name} height="65vh" download={false} /></Suspense>}
      </Modal>
    </div>
  );
}
