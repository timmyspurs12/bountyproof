import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api to the FastAPI backend so the browser only ever uses
// relative URLs (works behind the preview host and in production behind one origin).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The sandboxed preview proxies the dev server through a host such as
    // https://{port}-{sandboxId}.e2b.app; allow those hosts so the preview loads.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
