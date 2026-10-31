// App information for the profile menu: About Us · Contact Us, Share App and the help desk topics.
// The messages themselves are sent with POST /feedback (kind: feedback | contact | helpdesk).
import { Router } from 'express';
import { config } from '../config.js';
import { findOne } from '../db.js';

const r = Router();

const setting = async (skey, fallback) => (await findOne('settings', { skey }))?.svalue || fallback;

const contact = () => {
  const whatsapp = config.whatsapp.supportNumber;
  return {
    email: process.env.SUPPORT_EMAIL || 'support@nyayagrantha.org',
    whatsapp: whatsapp ? '+' + whatsapp : null,
    whatsapp_link: whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Namaste! I have a question about ${config.appName}.`)}` : null,
    address: process.env.CONTACT_ADDRESS || 'Varanasi, Uttar Pradesh, India',
    hours: 'Mon–Sat, 10:00–18:00 IST',
  };
};

r.get('/about', async (_req, res) => {
  res.json({
    app_name: config.appName,
    tagline: 'न्यायः परमं बलम्',
    about: await setting('about', `${config.appName} is a complete digital ecosystem for Nyāya knowledge, research and AI-assisted learning.`),
    website: config.appUrl,
    contact: contact(),
  });
});

r.get('/contact', (_req, res) => res.json(contact()));

// Share App: text and links for the phone's share sheet. Store links come from ANDROID_APP_URL / IOS_APP_URL.
r.get('/share', async (_req, res) => {
  const url = process.env.APP_SHARE_URL || config.appUrl;
  const android = process.env.ANDROID_APP_URL || null;
  const ios = process.env.IOS_APP_URL || null;
  const title = config.appName;
  const message = await setting('share_message', `Read and study Nyāya texts with Sanskrit, translations, audio and an AI tutor on ${title}.`);
  res.json({
    title, message, url, android_url: android, ios_url: ios,
    text: [message, android && `Android: ${android}`, ios && `iPhone: ${ios}`, !android && !ios && url].filter(Boolean).join('\n'),
  });
});

// Subject choices for the Feedback, Contact and Publication Help Desk forms.
r.get('/help-topics', (_req, res) => {
  res.json({
    feedback: ['General feedback', 'Error in a text or translation', 'Feature request', 'Bug report', 'Content request'],
    helpdesk: ['Publishing guidance', 'Editing & proofreading', 'Manuscript digitisation', 'ISBN / copyright', 'Account or payment', 'Other'],
    contact: [],
  });
});

export default r;
