import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = (k, d = '') => process.env[k] ?? d;

if (env('MONGODB_URI', '').startsWith('mongodb+srv://')) {
  try {
    dns.setServers(env('MONGODB_DNS_SERVERS', '1.1.1.1,8.8.8.8').split(',').map((server) => server.trim()).filter(Boolean));
  } catch (e) {
    console.error(`Could not configure Atlas DNS servers: ${e.message}`);
  }
}

export const config = {
  port: Number(env('PORT', 5070)),
  appName: env('APP_NAME', 'Nyāya Grantha Sarvasvam'),
  appUrl: env('APP_URL', 'http://localhost:5070'),
  // Other origins the web app may run on (e.g. the Vite dev server); Stripe may redirect back to these.
  clientUrls: env('CLIENT_URLS', 'http://localhost:5185').split(',').map((s) => s.trim()).filter(Boolean),
  jwtSecret: env('JWT_SECRET', 'dev-secret-change-me'),
  currency: env('CURRENCY', 'INR'),
  uploadsDir: path.join(ROOT, 'uploads'),
  db: {
    driver: 'mongodb',
    uri: env('MONGODB_URI', 'mongodb://127.0.0.1:27017/nayagranth'),
  },
  ai: {
    apiKey: env('OPENAI_API_KEY'),
    baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    model: env('OPENAI_MODEL', 'gpt-4o-mini'),
    freeDailyQuota: Number(env('AI_FREE_DAILY_QUOTA', 5)),
  },
  razorpay: { keyId: env('RAZORPAY_KEY_ID'), keySecret: env('RAZORPAY_KEY_SECRET') },
  stripe: { secretKey: env('STRIPE_SECRET_KEY'), webhookSecret: env('STRIPE_WEBHOOK_SECRET') },
  whatsapp: {
    supportNumber: env('WHATSAPP_SUPPORT_NUMBER', '919000000000'),
    token: env('WHATSAPP_CLOUD_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
  },
  google: { clientId: env('GOOGLE_CLIENT_ID') },
  // SMTP for password-reset codes and other mail; leave SMTP_HOST blank to disable email.
  mail: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', 587)),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM'),
  },
};

if (config.jwtSecret === 'dev-secret-change-me' && process.env.NODE_ENV === 'production') {
  throw new Error('Set JWT_SECRET in server/.env before running in production.');
}
