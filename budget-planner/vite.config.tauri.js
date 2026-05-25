import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), VitePWA({ disable: true })],
  build: {
    rollupOptions: {
      input: 'index.html',
    },
  },
});
