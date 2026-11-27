import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localPwa } from './build/pwa';
import metadata from './package.json';
const buildId = process.env.LOG_BUILD_ID ?? `${metadata.version}-${Date.now().toString(36)}`;
const base = process.env.LOG_BASE_PATH ?? './';
if (base !== './' && (!/^\/(?:[a-zA-Z0-9_.-]+\/)*$/.test(base) || base.split('/').some(part => part === '.' || part === '..'))) throw new Error('LOG_BASE_PATH должен быть ./ либо путём вида /LogApp/.');

export default defineConfig({
  plugins: [react(), localPwa(buildId, metadata.version)],
  base,
  define: { __LOG_BUILD_ID__: JSON.stringify(buildId) },
  build: { target: 'safari16', cssTarget: 'safari16' },
});
