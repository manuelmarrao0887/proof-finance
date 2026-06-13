import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' so the built app works from any sub-path (GitHub Pages, file preview, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
});
