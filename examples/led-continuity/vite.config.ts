import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const certPath = process.env.HTTPS_CERT;
const keyPath = process.env.HTTPS_KEY;
if (Boolean(certPath) !== Boolean(keyPath)) {
  throw new Error('Set both HTTPS_CERT and HTTPS_KEY to enable HTTPS.');
}

export default defineConfig({
  // Keep assets relative so the same build works at the Pages project path
  // and at the root of a local HTTPS development proxy.
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    ...(certPath && keyPath ? {
      https: { cert: readFileSync(certPath), key: readFileSync(keyPath) }
    } : {}),
    ...(process.env.APP_ALLOWED_HOST ? { allowedHosts: [process.env.APP_ALLOWED_HOST] } : {})
  }
});
