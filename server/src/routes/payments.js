// Subscription Management, Membership Plans and the payment gateways: Razorpay and Stripe (demo mode when neither is configured).
import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { attach, col, find, findOne, insert, update, now } from '../db.js';
import { HttpError, requireAuth } from '../middleware.js';
import { activateSubscription, activeSubscription, planCard } from '../services.js';

const r = Router();
const PLAN_NAME = { name: 'plan_name' };
const razorpayOn = () => !!(config.razorpay.keyId && config.razorpay.keySecret);
const stripeOn = () => !!config.stripe.secretKey;
export const enabledGateways = () => [razorpayOn() && 'razorpay', stripeOn() && 'stripe'].filter(Boolean);
const minorUnits = (amount) => Math.round(Number(amount) * 100);

/**
 * Marks a payment paid and activates its plan exactly once, even when the browser redirect
 * and the gateway webhook both report the same payment.
 */
async function markPaid(payment, gatewayPaymentId) {
  const res = await (await col('payments')).updateOne(
    { id: payment.id, status: { $ne: 'paid' } },
    { $set: { status: 'paid', gateway_payment_id: gatewayPaymentId, paid_at: now() } },
  );
  if (res.modifiedCount === 1) await activateSubscription(payment.user_id, payment.plan_id, payment.id);
}

/** Calls the Stripe REST API with form-encoded parameters (no SDK needed). */
async function stripeApi(method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, 'Stripe: ' + (data?.error?.message || `HTTP ${res.status}`));
  return data;
}

/** Fulfils a Stripe Checkout Session once Stripe reports it paid and it matches our payment record. */
async function fulfilStripeSession(session) {
  const p = await findOne('payments', { gateway: 'stripe', order_id: session.id });
  if (!p) throw new HttpError(404, 'Payment not found.');
  if (session.payment_status !== 'paid') return { paid: false, payment: p };
  if (Number(session.amount_total) !== minorUnits(p.amount) || String(session.currency).toUpperCase() !== String(p.currency).toUpperCase()) {
    throw new HttpError(400, 'Payment amount does not match the plan.');
  }
  await markPaid(p, session.payment_intent || session.id);
  return { paid: true, payment: p };
}

/** Where Stripe sends the browser back: the page's own origin when it is one of ours, else APP_URL. */
function returnBase(req) {
  const origin = req.get('origin');
  const allowed = [config.appUrl, ...config.clientUrls].map((u) => u.replace(/\/$/, ''));
  return origin && allowed.includes(origin) ? origin : config.appUrl.replace(/\/$/, '');
}

r.get('/plans', async (req, res) => {
  const plans = await find('plans', { is_active: 1 }, { sort: { sort_order: 1, price: 1 } });
  const gateways = enabledGateways();
  const current = req.user ? await activeSubscription(req.user.id) : null;
  res.json({
    plans: plans.map((p) => ({ ...p, ...planCard(p, current?.plan_id) })),
    current,
    gateways: gateways.length ? gateways : ['demo'],
    gateway: gateways[0] || 'demo',
    currency: config.currency,
  });
});

r.post('/checkout', requireAuth, async (req, res) => {
  const plan = await findOne('plans', { id: Number(req.body.plan_id), is_active: 1 });
  if (!plan) throw new HttpError(404, 'Plan not found.');
  if (Number(plan.price) <= 0) throw new HttpError(422, 'The free plan is already available to every account.');
  res.json(await startCheckout(req, plan, req.body.gateway));
});

/**
 * Creates a payment for a paid plan and returns what the app needs to collect it:
 * { mode: 'razorpay', order_id, key_id, … } | { mode: 'stripe', url } | { mode: 'demo', payment_id }.
 */
export async function startCheckout(req, plan, requestedGateway) {
  const gateways = enabledGateways();
  const gateway = gateways.includes(requestedGateway) ? requestedGateway : gateways[0];
  const base = { user_id: req.user.id, plan_id: plan.id, amount: plan.price, currency: config.currency, status: 'created', created_at: now() };

  if (!gateway) {
    const paymentId = await insert('payments', { ...base, gateway: 'demo' });
    return { mode: 'demo', payment_id: paymentId, plan };
  }

  if (gateway === 'stripe') {
    const paymentId = await insert('payments', { ...base, gateway: 'stripe' });
    const back = returnBase(req);
    try {
      const session = await stripeApi('POST', 'checkout/sessions', {
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': config.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(minorUnits(plan.price)),
        'line_items[0][price_data][product_data][name]': `${plan.name} membership`,
        client_reference_id: String(paymentId),
        customer_email: req.user.email,
        'metadata[payment_id]': String(paymentId),
        'metadata[user_id]': String(req.user.id),
        success_url: `${back}/plans?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${back}/plans?stripe=cancel`,
      });
      await update('payments', { order_id: session.id }, { id: paymentId });
      return { mode: 'stripe', payment_id: paymentId, url: session.url, plan };
    } catch (e) {
      await update('payments', { status: 'failed' }, { id: paymentId });
      throw e;
    }
  }

  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const rp = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: minorUnits(plan.price), currency: config.currency, receipt: `ng_${req.user.id}_${Date.now()}`, notes: { plan: plan.slug } }),
  });
  const order = await rp.json().catch(() => ({}));
  if (!rp.ok || !order.id) throw new HttpError(502, 'Could not start the payment: ' + (order?.error?.description || `HTTP ${rp.status}`));
  const paymentId = await insert('payments', { ...base, gateway: 'razorpay', order_id: order.id });
  return {
    mode: 'razorpay', payment_id: paymentId, key_id: config.razorpay.keyId, order_id: order.id, amount: order.amount, currency: order.currency,
    plan, prefill: { name: req.user.name, email: req.user.email, contact: req.user.phone || '' },
  };
}

// Razorpay Checkout returns these three values to the browser; the signature proves they came from Razorpay.
r.post('/verify', requireAuth, async (req, res) => {
  const { payment_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const p = await findOne('payments', { id: Number(payment_id), user_id: req.user.id });
  if (!p || p.gateway !== 'razorpay' || p.order_id !== razorpay_order_id) throw new HttpError(404, 'Payment not found.');
  if (p.status === 'paid') return res.json({ ok: true });
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  const valid = typeof razorpay_signature === 'string' && razorpay_signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
  if (!valid) {
    await update('payments', { status: 'failed', gateway_payment_id: razorpay_payment_id || null }, { id: p.id });
    throw new HttpError(400, 'Payment signature verification failed.');
  }
  await markPaid(p, razorpay_payment_id);
  res.json({ ok: true });
});

// Stripe sends the browser back with ?session_id=…; confirm it with Stripe before activating.
r.post('/stripe/verify', requireAuth, async (req, res) => {
  if (!stripeOn()) throw new HttpError(400, 'Stripe is not configured.');
  const sessionId = String(req.body.session_id || '');
  const p = await findOne('payments', { gateway: 'stripe', order_id: sessionId, user_id: req.user.id });
  if (!p) throw new HttpError(404, 'Payment not found.');
  if (p.status === 'paid') return res.json({ ok: true, paid: true });
  const { paid } = await fulfilStripeSession(await stripeApi('GET', `checkout/sessions/${encodeURIComponent(sessionId)}`));
  res.json({ ok: true, paid });
});

// Demo mode only: simulate a successful payment so the full flow can be tried without gateway keys.
r.post('/demo-confirm', requireAuth, async (req, res) => {
  if (enabledGateways().length) throw new HttpError(400, 'Demo payments are disabled when a payment gateway is configured.');
  const p = await findOne('payments', { id: Number(req.body.payment_id), user_id: req.user.id, gateway: 'demo' });
  if (!p) throw new HttpError(404, 'Payment not found.');
  await markPaid(p, 'demo_' + crypto.randomBytes(6).toString('hex'));
  res.json({ ok: true });
});

r.get('/mine', requireAuth, async (req, res) => {
  res.json({
    payments: await attach(await find('payments', { user_id: req.user.id }, { sort: { id: -1 } }), 'plans', 'plan_id', PLAN_NAME, { inner: true }),
    subscriptions: await attach(await find('subscriptions', { user_id: req.user.id }, { sort: { id: -1 } }), 'plans', 'plan_id', PLAN_NAME, { inner: true }),
  });
});

/**
 * Stripe webhook (mounted in index.js with a raw body parser, before express.json).
 * Activates the plan even if the user closes the tab before returning from Stripe Checkout.
 */
export async function stripeWebhook(req, res) {
  const secret = config.stripe.webhookSecret;
  if (!secret) return res.status(400).json({ error: 'Stripe webhook secret is not configured.' });
  const header = String(req.get('stripe-signature') || '');
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k, v]));
  const signatures = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;
  const valid = fresh && signatures.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!valid) return res.status(400).json({ error: 'Invalid Stripe signature.' });

  const event = JSON.parse(payload);
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    try {
      await fulfilStripeSession(event.data.object);
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 404)) throw e; // a session from another app on the same account
    }
  } else if (event.type === 'checkout.session.async_payment_failed') {
    await update('payments', { status: 'failed' }, { gateway: 'stripe', order_id: event.data.object.id, status: { $ne: 'paid' } });
  }
  res.json({ received: true });
}

export default r;
