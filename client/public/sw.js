// Offline reading: app shell + previously opened texts stay available without a connection.
const VERSION = 'ng-v1';
// Base path the worker is served from: '/' locally, '/<repo>/' on GitHub Pages.
const BASE = self.location.pathname.replace(/sw\.js$/, '');
const SHELL = ['', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'].map((p) => BASE + p);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // PDFs can be large and pdf.js reads them with range requests, whose partial responses cannot be cached.
  if (req.headers.has('range') || url.pathname.endsWith('.pdf')) return;

  // Never cache personal or admin data.
  if (url.pathname.startsWith('/api/me') || url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/api/payments')) return;

  // Content API: network first, fall back to the last copy (so opened texts can be read offline).
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req).then((r) => r || new Response(JSON.stringify({ error: 'You are offline and this content has not been saved yet.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }

  // SPA navigations: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(BASE)));
    return;
  }

  // Static assets (hashed by Vite): cache first.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
    return res;
  })));
});
