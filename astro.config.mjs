import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  site: 'https://play.saltouruguayserver.com', output: 'server', adapter: node({ mode: 'standalone' }),
  vite: { plugins: [tailwindcss()] }, devToolbar: { enabled: false },
});
