import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const API = process.env.VITE_API_PROXY || 'http://localhost:5070';

// While the API restarts, answer with a clear 503 the app can retry, instead of Vite's empty 500.
const apiProxy = {
  target: API,
  configure(proxy) {
    proxy.on('error', (_err, _req, res) => {
      if (!res || res.headersSent || res.writableEnded || typeof res.writeHead !== 'function') return;
      res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '2' });
      res.end(JSON.stringify({ error: 'The server is restarting. Please try again in a moment.' }));
    });
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } },
  server: {
    host: '0.0.0.0',
    port: 5185,
    strictPort: true,
    fs: { allow: ['..'] },
    proxy: { '/api': apiProxy, '/uploads': apiProxy },
  },
  build: { chunkSizeWarningLimit: 900 },
});
