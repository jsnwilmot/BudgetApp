import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const githubPagesBase = '/BudgetApp/';

export default defineConfig({
  base: githubPagesBase,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['brand/finpath-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'FinPath',
        short_name: 'FinPath',
        description:
          'A local-first personal finance planner for pay periods, bills, savings, and budgets.',
        theme_color: '#071B2D',
        background_color: '#071B2D',
        display: 'standalone',
        start_url: githubPagesBase,
        scope: githubPagesBase,
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/maskable-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallbackDenylist: [/^\/.*\.(?:json|csv)$/],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: 'index.html',
    },
  },
});
