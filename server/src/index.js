import express from 'express';
import cors from 'cors';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { count, getDb } from './db.js';
import { authOptional, errorHandler, HttpError } from './middleware.js';
import { aiConfigured } from './ai.js';
import { USER_TYPES, USER_TYPE_LABELS, emailConfigured, whatsappConfigured } from './services.js';
import { openapiSpec, swaggerHtml } from './openapi.js';
import authRoutes from './routes/auth.js';
import libraryRoutes from './routes/library.js';
import searchRoutes from './routes/search.js';
import userRoutes from './routes/user.js';
import aiRoutes from './routes/ai.js';
import mediaRoutes from './routes/media.js';
import pdfRoutes from './routes/pdfs.js';
import { resumePdfIndexing } from './pdf-index.js';
import communityRoutes from './routes/community.js';
import classRoutes from './routes/classes.js';
import articleRoutes from './routes/articles.js';
import { shopRoutes, vendorRoutes } from './routes/shop.js';
import paymentRoutes, { stripeWebhook } from './routes/payments.js';
import membershipRoutes from './routes/membership.js';
import appInfoRoutes from './routes/app.js';
import toolRoutes from './routes/tools.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.disable('x-powered-by');
app.use(cors());
// gzip for JSON and the built app (its JS and CSS shrink to about a quarter).
app.use(compression());
// Stripe signs the exact request bytes, so its webhook needs the raw body (registered before express.json).
app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhook);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d', fallthrough: false }));

const api = express.Router();
api.use(authOptional);

// Public runtime configuration for the web and mobile clients (no secrets).
api.get('/config', (_req, res) => {
  res.json({
    appName: config.appName,
    currency: config.currency,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@nyayagrantha.org',
    address: process.env.CONTACT_ADDRESS || 'Varanasi, Uttar Pradesh, India',
    whatsappNumber: config.whatsapp.supportNumber,
    googleClientId: config.google.clientId || null,
    razorpay: !!(config.razorpay.keyId && config.razorpay.keySecret),
    stripe: !!config.stripe.secretKey,
    aiConfigured: aiConfigured(),
    userTypes: USER_TYPES.map((value) => ({ value, label: USER_TYPE_LABELS[value] })),
    // Where OTP and password-reset codes can be delivered.
    otp: { whatsapp: whatsappConfigured(), email: emailConfigured() },
  });
});
api.get('/', (_req, res) => {
  res.json({
    name: config.appName,
    message: 'API is running.',
    docs: '/api/docs',
    health: '/api/health',
  });
});
// API documentation: Swagger UI and the OpenAPI document it reads.
api.get('/openapi.json', (_req, res) => res.json(openapiSpec));
api.get('/docs', (_req, res) => res.type('html').send(swaggerHtml));
api.get('/health', async (_req, res) => res.json({ ok: true, db: config.db.driver, users: await count('users') }));

api.use('/auth', authRoutes);
api.use('/', libraryRoutes);
api.use('/search', searchRoutes);
api.use('/me', userRoutes);
api.use('/ai', aiRoutes);
api.use('/', mediaRoutes);
api.use('/', pdfRoutes);
api.use('/', communityRoutes);
api.use('/classes', classRoutes);
api.use('/articles', articleRoutes);
api.use('/', shopRoutes);
api.use('/vendor', vendorRoutes);
api.use('/payments', paymentRoutes);
api.use('/membership', membershipRoutes);
api.use('/app', appInfoRoutes);
api.use('/tools', toolRoutes);
api.use('/admin', adminRoutes);
api.use(() => { throw new HttpError(404, 'API endpoint not found.'); });
app.use('/api', api);

// Serve the built React app (client/dist) with SPA fallback.
const dist = path.resolve(ROOT, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('API is running. Build the client (cd client && npm run build) or run the Vite dev server on port 5185.'));
}

app.use(errorHandler);

// Connect before listening so a missing database fails at startup with a clear message.
try {
  await getDb();
} catch (e) {
  console.error(`Cannot connect to MongoDB at ${config.db.uri}: ${e.message}\nStart MongoDB, or set MONGODB_URI in server/.env.`);
  process.exit(1);
}
const server = app.listen(config.port, () => {
  console.log(`${config.appName} API listening on http://localhost:${config.port} (database: ${config.db.driver})`);
  resumePdfIndexing().catch((e) => console.error('Could not resume PDF indexing:', e.message));
});
// Exit code 75 tells the dev runner (server/dev.js) to retry until the port is free.
server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`Port ${config.port} is already in use, probably by another copy of this API. Stop it, or set PORT in server/.env.`);
  process.exit(75);
});
