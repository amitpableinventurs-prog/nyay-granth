// Membership for the apps: plan cards, my membership, and choosing a plan.
// Paying for a plan reuses the /payments checkout; Razorpay, Stripe and demo payments are confirmed through
// /payments/verify, /payments/stripe/verify and /payments/demo-confirm, which activate the subscription.
import { Router } from 'express';
import { config } from '../config.js';
import { find, findOne } from '../db.js';
import { HttpError, requireAuth } from '../middleware.js';
import { activeSubscription, aiQuota, hasPremium, planCard } from '../services.js';
import { enabledGateways, startCheckout } from './payments.js';

const r = Router();

const activePlans = () => find('plans', { is_active: 1 }, { sort: { sort_order: 1, price: 1 } });
const daysLeft = (endsAt) => Math.max(0, Math.ceil((new Date(endsAt.replace(' ', 'T')) - Date.now()) / 86400000));

/** The user's membership: their active plan, or the free plan when nothing is active. */
export async function membershipOf(user) {
  const sub = await activeSubscription(user.id);
  const plan = sub ? await findOne('plans', { id: sub.plan_id }) : await findOne('plans', { slug: 'free' });
  const paid = !!sub && Number(plan?.price) > 0;
  return {
    plan: plan ? planCard(plan, plan.id) : null,
    status: paid ? 'active' : 'free',
    subscription: sub && paid ? { id: sub.id, starts_at: sub.starts_at, ends_at: sub.ends_at, days_left: daysLeft(sub.ends_at) } : null,
    is_premium: await hasPremium(user),
    ai: await aiQuota(user),
  };
}

r.get('/plans', async (req, res) => {
  const current = req.user ? (await activeSubscription(req.user.id))?.plan_id ?? (await findOne('plans', { slug: 'free' }))?.id : null;
  const gateways = enabledGateways();
  res.json({
    plans: (await activePlans()).map((p) => planCard(p, current ?? null)),
    gateways: gateways.length ? gateways : ['demo'],
    currency: config.currency,
  });
});

r.get('/me', requireAuth, async (req, res) => {
  res.json(await membershipOf(req.user));
});

// "Choose <plan>". The free plan needs no payment; a paid plan returns the checkout to open in the app.
// Choosing the plan you already have extends it from its current end date once paid.
r.post('/subscribe', requireAuth, async (req, res) => {
  const plan = await findOne('plans', { id: Number(req.body?.plan_id), is_active: 1 });
  if (!plan) throw new HttpError(404, 'Plan not found.');
  if (Number(plan.price) > 0) return res.json({ ...(await startCheckout(req, plan, req.body?.gateway)), plan: planCard(plan) });

  const current = await membershipOf(req.user);
  if (current.subscription) {
    throw new HttpError(409, `Your ${current.plan.name} membership is active until ${current.subscription.ends_at.slice(0, 10)}. You will move to the Free plan when it ends.`);
  }
  res.json({ mode: 'free', membership: current });
});

export default r;
