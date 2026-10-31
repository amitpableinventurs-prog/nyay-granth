import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, PageHeader, Loader, Modal, money, fmtDate, toast } from '../components/ui.jsx';

const GATEWAYS = {
  razorpay: { label: 'Razorpay', icon: 'bi-phone', hint: 'UPI, cards, net banking and wallets — best for India' },
  stripe: { label: 'Stripe', icon: 'bi-credit-card-2-front', hint: 'Debit and credit cards, including international cards' },
};

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection.'));
    document.body.appendChild(s);
  });
}

export default function Plans() {
  const { user, refresh } = useAuth();
  const { data, loading, reload } = useApi('/payments/plans', [user?.id]);
  const [busy, setBusy] = useState(null);
  const [demo, setDemo] = useState(null);
  const [choose, setChoose] = useState(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const handled = useRef(false);

  const done = async () => {
    toast('Membership activated — welcome, Scholar!');
    await refresh();
    reload();
    navigate('/profile');
  };

  // Back from Stripe Checkout: /plans?stripe=success&session_id=… or ?stripe=cancel
  useEffect(() => {
    const result = params.get('stripe');
    if (!result || !user || handled.current) return;
    handled.current = true;
    const sessionId = params.get('session_id');
    setParams({}, { replace: true });
    if (result !== 'success' || !sessionId) { toast('Payment cancelled — you have not been charged.', 'error'); return; }
    post('/payments/stripe/verify', { session_id: sessionId })
      .then((r) => (r.paid ? done() : toast('Payment is still processing. Your membership activates as soon as Stripe confirms it.')))
      .catch((e) => toast(e.message, 'error'));
  }, [params, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = async (plan, gateway) => {
    if (!user) return navigate('/login', { state: { from: '/plans' } });
    const gateways = data.gateways || [data.gateway];
    if (!gateway && gateways.length > 1) { setChoose(plan); return; }
    setChoose(null);
    setBusy(plan.id);
    try {
      const order = await post('/payments/checkout', { plan_id: plan.id, gateway: gateway || gateways[0] });
      if (order.mode === 'demo') { setDemo(order); return; }
      if (order.mode === 'stripe') { window.location.assign(order.url); return; }
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency,
        name: 'Nyāya Grantha Sarvasvam', description: `${plan.name} membership`, prefill: order.prefill, theme: { color: '#14245c' },
        handler: async (resp) => {
          try { await post('/payments/verify', { payment_id: order.payment_id, ...resp }); await done(); } catch (e) { toast(e.message, 'error'); }
        },
      });
      rzp.on('payment.failed', (r) => toast(r.error?.description || 'Payment failed', 'error'));
      rzp.open();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const confirmDemo = async () => {
    try { await post('/payments/demo-confirm', { payment_id: demo.payment_id }); setDemo(null); await done(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="Membership Plans" sanskrit="सदस्यता" icon="bi-gem" subtitle="Unlock premium texts, audio, presentations, live classes and extended AI assistance." />
      {loading && <Loader />}
      {data?.current && (
        <div className="alert alert-success d-flex align-items-center gap-2"><i className="bi bi-patch-check-fill" />You are a <strong>{data.current.plan_name}</strong> member until {fmtDate(data.current.ends_at)}. Renewing the same plan extends it.</div>
      )}
      <div className="row g-3">
        {data?.plans.map((p) => {
          const isFree = Number(p.price) === 0;
          const isCurrent = data.current ? Number(data.current.plan_id) === Number(p.id) : isFree;
          const highlight = p.slug === 'scholar-annual';
          return (
            <div className="col-md-6 col-xl-3" key={p.id}>
              <div className={`ng-card h-100 d-flex flex-column ${highlight ? 'border-2' : ''}`} style={highlight ? { borderColor: 'var(--ng-saffron)' } : undefined}>
                {highlight && <span className="badge text-bg-warning align-self-start mb-2">Best value</span>}
                <h5 className="text-navy mb-0">{p.name}</h5>
                <div className="my-2"><span className="fs-2 fw-bold serif">{money(p.price, data.currency)}</span>{!isFree && <span className="text-muted small"> / {p.duration_days >= 365 ? 'year' : `${p.duration_days} days`}</span>}</div>
                <ul className="list-unstyled small flex-grow-1">
                  {p.features.map((f) => <li key={f} className="mb-1"><i className="bi bi-check2 text-success me-1" />{f}</li>)}
                </ul>
                {isFree ? (
                  <button className="btn btn-light" disabled>{isCurrent ? 'Your current plan' : 'Included'}</button>
                ) : (
                  <button className={`btn ${highlight ? 'btn-saffron' : 'btn-navy'}`} disabled={busy === p.id} onClick={() => subscribe(p)}>
                    {busy === p.id ? 'Please wait…' : isCurrent ? 'Renew' : user ? 'Subscribe' : 'Log in to subscribe'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="small text-muted mt-3"><i className="bi bi-shield-lock" /> Payments are processed securely by {data?.gateways?.some((g) => GATEWAYS[g]) ? data.gateways.filter((g) => GATEWAYS[g]).map((g) => GATEWAYS[g].label).join(' and ') : 'the payment gateway'}. Questions? <Link to="/helpdesk">Help Desk</Link>.</p>

      <Modal show={!!choose} title="Choose how to pay" onClose={() => setChoose(null)}>
        {choose && <p className="small text-muted">{choose.name} — {money(choose.price, data.currency)}</p>}
        <div className="d-grid gap-2">
          {(data?.gateways || []).filter((g) => GATEWAYS[g]).map((g) => (
            <button key={g} className="btn btn-outline-secondary text-start d-flex align-items-center gap-3 py-2" onClick={() => subscribe(choose, g)}>
              <i className={`bi ${GATEWAYS[g].icon} fs-4 text-navy`} />
              <span><strong>{GATEWAYS[g].label}</strong><br /><small className="text-muted">{GATEWAYS[g].hint}</small></span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal show={!!demo} title="Demo checkout" onClose={() => setDemo(null)}
        footer={<><button className="btn btn-light" onClick={() => setDemo(null)}>Cancel</button><button className="btn btn-saffron" onClick={confirmDemo}>Simulate successful payment</button></>}>
        <div className="alert alert-warning small"><i className="bi bi-cone-striped me-1" />The payment gateway is not configured, so this is a <strong>demo</strong> — no money is charged. Add Razorpay or Stripe keys in <code>server/.env</code> to accept real payments.</div>
        {demo && <p className="mb-0">Plan: <strong>{demo.plan.name}</strong> — {money(demo.plan.price)}</p>}
      </Modal>
    </>
  );
}
