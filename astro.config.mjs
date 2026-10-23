import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import migrateDatabaseIntegration from './src/hooks/migrateDatabase';
export default defineConfig({
  site: 'https://play.saltouruguayserver.com', output: 'server', adapter: vercel(),
  integrations: [migrateDatabaseIntegration()],
  // middleware.ts protects portal mutations; OAuth and the game API validate
  // external origins against each client's registered redirect URIs.
  security: { checkOrigin: false },
  vite: { plugins: [tailwindcss()] }, devToolbar: { enabled: false },
});
