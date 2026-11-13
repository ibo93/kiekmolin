import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorker } from './werkzeug/sw-plugin.ts';

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { fs: { allow: ['.'] } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
} as never);
