import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' so the built app works from any sub-path (GitHub Pages, file preview, etc.)
export default defineConfig({
  base: './',
  plugins: [react(), VitePWA({ registerType: 'prompt', injectRegister: false, manifest: false, workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], navigateFallback: '/index.html' }, devOptions: { enabled: false } })],
  build: {
    rollupOptions: {
      output: {
        // Split heavy third-party deps into their own cacheable chunks so they
        // are not in the initial app bundle. xlsx (~400kB) only loads when the
        // AI/import features that use it open (those views/modals are lazy).
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
});
