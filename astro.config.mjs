import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import migrateDatabaseIntegration from './src/hooks/migrateDatabase';
export default defineConfig({
  site: 'https://play.saltouruguayserver.com', output: 'server', adapter: vercel(),
  integrations: [migrateDatabaseIntegration()],
  vite: { plugins: [tailwindcss()] }, devToolbar: { enabled: false },
});
